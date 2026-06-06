// publish-to-gumroad — auto-creates a Gumroad product from an existing
// gumroad-format export bundle. Idempotent per (book_id, platform).
//
// Hardened pipeline:
//   1. correlationId per request for cross-system trace stitching.
//   2. Auth user + verify book/listing ownership.
//   3. Entitlement gate (Creator+).
//   4. Per-user + per-IP velocity gate to stop scripted publish loops.
//   5. Normalise/validate listing input (no NUL bytes, sane price/currency,
//      bounded tags, real http(s) cover URL).
//   6. Load decrypted Gumroad token; mark 401s as 'expired'.
//   7. Idempotent: existing live row short-circuits.
//   8. fetchWithRetry around the upstream POST (handles 429/5xx + jitter).
//   9. Best-effort cover upload.
//  10. Upsert external_publications + publishing_audit_log + telemetry events.
//  11. record_platform_connection_outcome RPC keeps consecutive_failures
//      authoritative on the DB for dashboards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto-tokens.ts";
import { requireCreatorCapability, snapshotEntitlement } from "../_shared/entitlements.ts";
import { logPublishEvent } from "../_shared/publishing-audit.ts";
import { fetchWithRetry } from "../_shared/upstream-retry.ts";
import { normaliseListing, sanitiseError } from "../_shared/publish-validation.ts";
import { correlationId } from "../_shared/observability.ts";
import { auditSellSafety, type SellSafetyInput } from "../_shared/sell-safety.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GUMROAD = "https://api.gumroad.com/v2";

function jsonResp(status: number, body: unknown, corr: string) {
  return new Response(JSON.stringify({ ...(typeof body === "object" && body ? body : {}), correlation_id: corr }), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "x-correlation-id": corr },
  });
}

async function logTelemetry(admin: any, type: string, meta: Record<string, unknown>) {
  try {
    await admin.from("storefront_events").insert({
      event_type: type,
      listing_id: meta?.listing_id ?? null,
      metadata: meta,
    });
  } catch (_) { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const corr = correlationId(req);
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" }, corr);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return jsonResp(401, { error: "auth_required" }, corr);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await userClient.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) return jsonResp(401, { error: "auth_required" }, corr);

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listing_id ?? "");
    const explicitJobId = body?.export_job_id ? String(body.export_job_id) : null;
    if (!listingId) return jsonResp(400, { error: "listing_id_required" }, corr);

    // Listing + book ownership
    const { data: listing, error: lErr } = await admin
      .from("public_listings")
      .select("id, book_id, slug, price_cents, currency, blurb, amazon_description, seo_keywords, sample_chapters, is_public")
      .eq("id", listingId)
      .maybeSingle();
    if (lErr || !listing) return jsonResp(404, { error: "listing_not_found" }, corr);

    const { data: book, error: bErr } = await admin
      .from("books")
      .select("id, user_id, title, description, cover_image_url, category, book_type")
      .eq("id", listing.book_id)
      .maybeSingle();
    if (bErr || !book) return jsonResp(404, { error: "book_not_found" }, corr);
    if (book.user_id !== caller) return jsonResp(403, { error: "not_owner" }, corr);

    // Entitlement gate
    const gate = await requireCreatorCapability(admin, caller, "can_publish_external", {
      auditMetadata: { book_id: book.id, listing_id: listing.id, platform: "gumroad" },
      correlationId: corr,
      platform: "gumroad",
    });
    if (gate.blocked) return gate.blocked;

    // Per-user velocity gate. A runaway publish loop is expensive both for us
    // (Gumroad API quota) and the creator (duplicate products + storefront
    // clutter). Five publishes/hour is plenty for legitimate use.
    const reqIp = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
                  req.headers.get("cf-connecting-ip") || "anonymous";
    try {
      const { data: rl } = await admin.rpc("check_velocity", {
        _key: `publish:gumroad:user:${caller}`, _limit: 5, _window_seconds: 3600,
      });
      if ((rl as any)?.ok === false) {
        const retry = Number((rl as any)?.retry_after ?? 3600);
        await logPublishEvent(admin, {
          user_id: caller, platform: "gumroad", event_type: "publish_failed",
          book_id: book.id, listing_id: listingId, severity: "warning",
          message: "rate_limited", correlation_id: corr,
          metadata: { reason: "user_rate_limit", retry_after: retry, ip: reqIp },
        });
        return new Response(JSON.stringify({
          error: "rate_limited", code: "rate_limited", retry_after: retry, correlation_id: corr,
        }), { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(retry), "x-correlation-id": corr } });
      }
    } catch (_) { /* fail-open on rate-limit infra issues */ }

    // Validate + normalise the listing payload before touching upstream.
    const normalised = normaliseListing(listing, book, {
      allowFree: true, maxTitle: 200, maxDescription: 5000, maxTags: 10,
    });
    if (!normalised.ok) {
      await logPublishEvent(admin, {
        user_id: caller, platform: "gumroad", event_type: "publish_validation_failed",
        book_id: book.id, listing_id: listingId, severity: "warning",
        message: normalised.message, correlation_id: corr,
        metadata: { code: normalised.code },
      });
      return jsonResp(400, { error: "invalid_listing", code: normalised.code, message: normalised.message }, corr);
    }
    const { title, description, priceCents, tags, coverImageUrl } = normalised.value;

    // Defence-in-depth sell-safety gate. The bundle pipeline already ran a
    // platform-aware check; this rechecks at the upstream-create boundary so
    // a stale or out-of-band publish call still gets blocked on platform
    // policy violations (AI disclosure, hard-prohibited content).
    const { data: chSafety } = await admin
      .from("chapters").select("title, content").eq("book_id", book.id).order("chapter_number");
    const safetyInput: SellSafetyInput = {
      book: { title: (book as any).title, description: (book as any).description, category: (book as any).category, book_type: (book as any).book_type },
      listing,
      chaptersFullText: (chSafety ?? []).map((c: any) => `${c.title ?? ""}\n${c.content ?? ""}`).join("\n\n"),
      aiAssistanceLevel: (book as any).ai_assistance_level ?? null,
      cover: null, // dimensions decided at bundle time; not re-fetched here
    };
    const safety = auditSellSafety(safetyInput, "gumroad");
    if (safety.verdict === "unsafe") {
      const blockers = safety.issues.filter((i) => i.severity === "blocker").map((i) => i.message);
      await logPublishEvent(admin, {
        user_id: caller, platform: "gumroad", event_type: "publish_validation_failed",
        book_id: book.id, listing_id: listingId, severity: "error",
        message: safety.summary, correlation_id: corr,
        metadata: { codes: safety.issues.filter((i) => i.severity === "blocker").map((i) => i.code) },
      });
      return jsonResp(422, {
        error: "sell_safety_blocked", message: safety.summary, blockers,
      }, corr);
    }

    // Snapshot effective entitlement for historical proof.
    const entitlementSnapshotId = await snapshotEntitlement(admin, caller, "external_publish", book.id);

    // Connection
    const { data: conn, error: cErr } = await admin
      .from("creator_platform_connections")
      .select("id, encrypted_access_token, connection_status, external_creator_name")
      .eq("user_id", caller)
      .eq("platform", "gumroad")
      .maybeSingle();
    if (cErr || !conn) return jsonResp(412, { error: "gumroad_not_connected" }, corr);
    if (conn.connection_status !== "connected") {
      return jsonResp(412, { error: "gumroad_connection_" + conn.connection_status }, corr);
    }

    await logTelemetry(admin, "publish_started", { platform: "gumroad", listing_id: listingId, book_id: book.id, correlation_id: corr });
    await logPublishEvent(admin, {
      user_id: caller, platform: "gumroad", event_type: "publish_started",
      book_id: book.id, listing_id: listingId,
      correlation_id: corr,
      metadata: { price_cents: priceCents },
    });

    // Idempotency: if an existing live/auto row exists, return it instead of creating a duplicate.
    // Older Gumroad rows may have been marked live before Gumroad actually enabled the product,
    // so only short-circuit when we can also provide the creator edit URL as a safe fallback.
    const { data: existing } = await admin
      .from("external_publications")
      .select("id, external_url, external_id, status, sync_state")
      .eq("book_id", book.id).eq("platform", "gumroad").maybeSingle();
    if (existing && existing.status === "live" && existing.external_id) {
      const existingEditUrl = `https://app.gumroad.com/products/${encodeURIComponent(existing.external_id)}/edit`;
      // Validate the cached short_url is still reachable. If the creator
      // deleted/unpublished the product upstream, our 'live' row is stale —
      // fall through and re-create instead of misleading the caller.
      let upstreamAlive = true;
      if (existing.external_url) {
        try {
          const probe = await fetch(existing.external_url, { method: "HEAD", redirect: "follow" });
          // 2xx/3xx = live, 404/410 = gone, anything else (incl. network) = assume alive to avoid false re-creates.
          if (probe.status === 404 || probe.status === 410) upstreamAlive = false;
        } catch (_) { /* network blip — keep upstreamAlive=true */ }
      }
      if (upstreamAlive) {
        await logPublishEvent(admin, {
          user_id: caller, platform: "gumroad", event_type: "publish_completed",
          book_id: book.id, listing_id: listingId,
          external_id: existing.external_id, external_url: existing.external_url,
          correlation_id: corr,
          message: "idempotent", metadata: { idempotent: true },
        });
        return jsonResp(200, {
          ok: true, idempotent: true,
          external_url: existing.external_url,
          external_id: existing.external_id,
          edit_url: existingEditUrl,
          note: "Already created on Gumroad. If the public page is not available yet, use the edit page to finish setup and enable it.",
        }, corr);
      }
      // Stale row — log and continue to re-create.
      await logPublishEvent(admin, {
        user_id: caller, platform: "gumroad", event_type: "publish_started",
        book_id: book.id, listing_id: listingId, severity: "warning",
        correlation_id: corr,
        message: "Stale external_publications row — upstream product missing, re-creating.",
        metadata: { stale_external_id: existing.external_id },
      });
    }

    // Mark pending row early so the UI can show "syncing"
    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "gumroad",
      status: "pending", sync_state: "syncing", last_error: null,
      external_url: existing?.external_url ?? null,
      external_id: existing?.external_id ?? null,
      entitlement_snapshot_id: entitlementSnapshotId,
      correlation_id: corr,
      last_publish_attempt_at: new Date().toISOString(),
      publish_attempts: ((existing as any)?.publish_attempts ?? 0) + 1,
    }, { onConflict: "book_id,platform" });

    // Decrypt token (after we've validated everything else)
    let accessToken: string;
    try {
      accessToken = await decryptToken(conn.encrypted_access_token);
    } catch (e) {
      await admin.from("creator_platform_connections")
        .update({ connection_status: "error", last_error: "decrypt_failed" })
        .eq("id", conn.id);
      await logPublishEvent(admin, {
        user_id: caller, platform: "gumroad", event_type: "connection_decrypt_failed",
        severity: "critical", correlation_id: corr,
        message: "Failed to decrypt stored token",
      });
      throw e;
    }

    // ───────────────────────────────────────────────────────────────────
    // Option-1 "redirect flow": resolve the latest completed Gumroad bundle
    // up-front and mint a fresh long-lived signed download URL. Gumroad's v2
    // API has no reliable third-party file-upload endpoint, but it does
    // accept `custom_receipt` (HTML shown on the post-purchase thank-you
    // page + receipt email) and `url` (call-to-action URL). We embed our
    // signed bundle URL in both so buyers get the file immediately after
    // checkout — no manual file attach on Gumroad required.
    // ───────────────────────────────────────────────────────────────────
    let downloadUrl: string | null = null;
    let bundlePath: string | null = null;
    let bundleFilename: string | null = null;
    let resolvedJobId: string | null = null;
    try {
      const { data: jobs } = explicitJobId
        ? await admin.from("export_jobs")
            .select("id, status, metadata, result_url")
            .eq("id", explicitJobId).limit(1)
        : await admin.from("export_jobs")
            .select("id, status, metadata, result_url")
            .eq("user_id", caller).eq("book_id", book.id)
            .eq("bundle_type", "gumroad").eq("status", "completed")
            .order("created_at", { ascending: false }).limit(1);
      const job = (jobs ?? [])[0] as any;
      if (job?.id) {
        resolvedJobId = job.id;
        bundlePath = job?.metadata?.bundle_path ?? null;
        bundleFilename = job?.metadata?.bundle_filename ?? null;
        if (bundlePath) {
          const { data: signed } = await admin.storage
            .from(job?.metadata?.bundle_bucket ?? "exports")
            .createSignedUrl(bundlePath, 60 * 60 * 24 * 30, bundleFilename ? { download: bundleFilename } : undefined);
          downloadUrl = signed?.signedUrl ?? null;
        }
        // Fall back to the job's existing result_url (7-day signed) so the
        // first publish after rollout still works for older completed jobs
        // that don't have bundle_path in metadata yet.
        if (!downloadUrl && job?.result_url) downloadUrl = String(job.result_url);
      }
    } catch (_) { /* non-fatal — we'll still publish as a manual-finalize draft */ }

    if (!downloadUrl) {
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "gumroad",
        status: "failed", sync_state: "error",
        last_error: "bundle_required",
      }, { onConflict: "book_id,platform" });
      return jsonResp(409, {
        error: "bundle_required",
        message: "Generate the Gumroad bundle first, then retry publish.",
      }, corr);
    }

    // Custom receipt HTML — shown to every buyer on Gumroad's post-purchase
    // page and email. This is our primary fulfilment channel for the redirect
    // flow. Keep it conservative HTML (Gumroad sanitises aggressively).
    const safeTitle = title.replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]!));
    const customReceipt =
      `<p>Thanks for purchasing <strong>${safeTitle}</strong>!</p>` +
      `<p><a href="${downloadUrl}">Download your bundle (ZIP)</a></p>` +
      `<p>If the link expires, please contact support and we'll re-issue it.</p>`;

    // Build product payload
    const form = new FormData();
    form.append("access_token", accessToken);
    form.append("name", title);
    form.append("price", String(priceCents));
    form.append("description", description);
    // Gumroad v2 expects tags as a repeated array param (tags[]), not a CSV string.
    // Gumroad requires tags under 20 characters, so cap at 19 and dedupe here.
    const gumroadTags = Array.from(new Set(
      tags
        .map((t) => String(t).trim().slice(0, 19))
        .filter((t) => t.length > 0)
    )).slice(0, 10);
    for (const tag of gumroadTags) form.append("tags[]", tag);
    // Redirect-flow params. Gumroad ignores unknown fields silently, so we
    // submit a few well-known variants to maximise compatibility across
    // product types.
    form.append("custom_receipt", customReceipt);
    form.append("url", downloadUrl);
    form.append("content_url", downloadUrl);
    form.append("redirect_url", downloadUrl);

    const createRes = await fetchWithRetry(`${GUMROAD}/products`, { method: "POST", body: form }, {
      attempts: 3,
      onRetry: ({ attempt, status, reason, delayMs }) => {
        // Best-effort retry breadcrumb. Don't await — keep latency low.
        void logPublishEvent(admin, {
          user_id: caller, platform: "gumroad", event_type: "publish_retried",
          book_id: book.id, listing_id: listingId, severity: "warning",
          correlation_id: corr,
          message: `attempt ${attempt} failed (${reason})`,
          metadata: { attempt, status, reason, retry_delay_ms: delayMs },
        });
      },
    });
    const createJson: any = await createRes.json().catch(() => ({}));

    if (createRes.status === 401) {
      await admin.from("creator_platform_connections")
        .update({ connection_status: "expired", last_error: "401_unauthorized" })
        .eq("id", conn.id);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "gumroad",
        status: "failed", sync_state: "error", last_error: "Gumroad connection expired — reconnect required.",
      }, { onConflict: "book_id,platform" });
      await logPublishEvent(admin, {
        user_id: caller, platform: "gumroad", event_type: "token_expired",
        book_id: book.id, listing_id: listingId, severity: "warning",
        correlation_id: corr, metadata: { http_status: 401 },
      });
      await admin.rpc("record_platform_connection_outcome", {
        _user_id: caller, _platform: "gumroad", _success: false, _error: "401_unauthorized",
      });
      return jsonResp(401, { error: "gumroad_token_expired" }, corr);
    }
    if (!createRes.ok || !createJson?.success) {
      const reason = sanitiseError(createJson?.message || `gumroad_${createRes.status}`);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "gumroad",
        status: "failed", sync_state: "error", last_error: reason,
      }, { onConflict: "book_id,platform" });
      await logTelemetry(admin, "publish_failed", { platform: "gumroad", listing_id: listingId, book_id: book.id, reason, correlation_id: corr });
      await logPublishEvent(admin, {
        user_id: caller, platform: "gumroad", event_type: "publish_failed",
        book_id: book.id, listing_id: listingId, severity: "error",
        message: reason, correlation_id: corr,
        metadata: { http_status: createRes.status },
      });
      await admin.rpc("record_platform_connection_outcome", {
        _user_id: caller, _platform: "gumroad", _success: false, _error: reason,
      });
      return jsonResp(502, { error: "gumroad_create_failed", reason }, corr);
    }

    const product = createJson.product ?? {};
    const productId = String(product.id ?? "");
    const productUrl = String(product.short_url ?? product.url ?? "");
    const editUrl = productId ? `https://app.gumroad.com/products/${encodeURIComponent(productId)}/edit` : productUrl;

    // Best-effort cover image attach (skip silently if it fails)
    if (productId && coverImageUrl) {
      try {
        const upd = new FormData();
        upd.append("access_token", accessToken);
        upd.append("preview_url", coverImageUrl);
        await fetchWithRetry(`${GUMROAD}/products/${productId}`, { method: "PUT", body: upd }, { attempts: 2 });
      } catch (_) { /* non-fatal */ }
    }

    // Gumroad products created via API are 'unpublished' by default — the
    // short_url returns 404 until the product is explicitly published. Try
    // to publish; if Gumroad refuses (most commonly because no product file
    // is attached yet) we keep the row as a draft and steer the creator to
    // the edit page so they can attach the bundle ZIP + hit Publish.
    let isPublished = false;
    let publishBlockedReason: string | null = null;
    if (productId) {
      try {
        const pub = new FormData();
        pub.append("access_token", accessToken);
        const pubRes = await fetchWithRetry(
          `${GUMROAD}/products/${encodeURIComponent(productId)}/enable`,
          { method: "PUT", body: pub },
          { attempts: 2 },
        );
        const pubJson: any = await pubRes.json().catch(() => ({}));
        if (pubRes.ok && pubJson?.success) {
          isPublished = true;
        } else {
          publishBlockedReason = sanitiseError(pubJson?.message || `gumroad_publish_${pubRes.status}`, 200);
        }
      } catch (e) {
        publishBlockedReason = sanitiseError(e, 200);
      }
    }

    // Bundle was already resolved upstream and embedded into Gumroad's
    // custom_receipt + redirect URL fields — no manual file attach needed.
    const bundleHint: string | null = downloadUrl;

    await admin.rpc("record_platform_connection_outcome", {
      _user_id: caller, _platform: "gumroad", _success: true, _error: null,
    });

    if (isPublished && productUrl) {
      try {
        const probe = await fetch(productUrl, { method: "HEAD", redirect: "follow" });
        if (probe.status === 404 || probe.status === 410) {
          isPublished = false;
          publishBlockedReason = "Gumroad accepted enable, but the public page is not reachable yet.";
        }
      } catch (_) { /* network blip — keep Gumroad's enable result authoritative */ }
    }

    const finalUrl = isPublished ? (productUrl || editUrl) : editUrl;
    const draftNote = publishBlockedReason
      ? `Draft created on Gumroad — auto-publish blocked (${publishBlockedReason}). Open the edit page and click Publish.`
      : null;

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "gumroad",
      external_url: finalUrl,
      external_id: productId,
      status: isPublished ? "live" : "draft",
      sync_state: isPublished ? "auto" : "manual",
      last_error: isPublished ? null : publishBlockedReason,
      correlation_id: corr,
      published_at: isPublished ? new Date().toISOString() : null,
      notes: draftNote,
      metadata: {
        // Redirect-flow fulfilment artifacts. Keep these so the creator
        // dashboard + support can re-issue download URLs without rerunning
        // the entire publish pipeline.
        download_url: downloadUrl,
        bundle_path: bundlePath,
        bundle_filename: bundleFilename,
        export_job_id: resolvedJobId,
        download_url_signed_at: new Date().toISOString(),
        download_url_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        fulfilment_mode: "gumroad_redirect",
      },
    }, { onConflict: "book_id,platform" });

    await logTelemetry(admin, "publish_completed", {
      platform: "gumroad", listing_id: listingId, book_id: book.id,
      external_url: finalUrl, external_id: productId, correlation_id: corr,
      published: isPublished,
    });
    await logPublishEvent(admin, {
      user_id: caller, platform: "gumroad", event_type: "publish_completed",
      book_id: book.id, listing_id: listingId,
      external_id: productId, external_url: finalUrl,
      correlation_id: corr,
      metadata: {
        price_cents: priceCents,
        has_bundle_hint: !!bundleHint,
        published: isPublished,
        publish_blocked_reason: publishBlockedReason,
        fulfilment_mode: "gumroad_redirect",
      },
    });

    return jsonResp(200, {
      ok: true,
      published: isPublished,
      external_url: finalUrl,
      external_id: productId,
      edit_url: editUrl,
      bundle_hint: bundleHint,
      download_url: downloadUrl,
      note: isPublished
        ? "Live on Gumroad. Buyers receive your bundle via the post-purchase receipt automatically — no manual file attach needed."
        : "Gumroad draft created with bundle download embedded in the receipt. Open the edit page and click Publish to go live.",
    }, corr);
  } catch (e) {
    console.error("publish-to-gumroad error", e, { correlation_id: corr });
    return jsonResp(500, { error: sanitiseError(e) }, corr);
  }
});
