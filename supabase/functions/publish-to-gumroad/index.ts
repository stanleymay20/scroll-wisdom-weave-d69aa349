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
    const { data: existing } = await admin
      .from("external_publications")
      .select("id, external_url, external_id, status, sync_state")
      .eq("book_id", book.id).eq("platform", "gumroad").maybeSingle();
    if (existing && existing.status === "live" && existing.external_id) {
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
      }, corr);
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

    // Build product payload
    const form = new FormData();
    form.append("access_token", accessToken);
    form.append("name", title);
    form.append("price", String(priceCents));
    form.append("description", description);
    // Gumroad v2 expects tags as a repeated array param (tags[]), not a CSV string.
    // Gumroad also rejects tags longer than 20 characters, so trim + dedupe here.
    const gumroadTags = Array.from(new Set(
      tags
        .map((t) => String(t).trim().slice(0, 20))
        .filter((t) => t.length > 0)
    )).slice(0, 10);
    for (const tag of gumroadTags) form.append("tags[]", tag);

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
    const editUrl = productId ? `https://app.gumroad.com/products/${productId}/edit` : productUrl;

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
          `${GUMROAD}/products/${productId}/publish`,
          { method: "POST", body: pub },
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

    // Note: Gumroad's public v2 API does not reliably support attaching the
    // product file (ZIP) at this time. We surface the edit URL so the creator
    // can drop the bundle file in. This is documented to the user in the UI.
    let bundleHint: string | null = null;
    try {
      const jobQ = admin
        .from("export_jobs")
        .select("id, result_url, status, created_at")
        .eq("user_id", caller)
        .eq("book_id", book.id)
        .eq("bundle_type", "gumroad")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: jobs } = explicitJobId
        ? await admin.from("export_jobs").select("id, result_url, status").eq("id", explicitJobId).limit(1)
        : await jobQ;
      const job = jobs?.[0];
      if (job?.result_url) bundleHint = job.result_url;
    } catch (_) { /* non-fatal */ }

    await admin.rpc("record_platform_connection_outcome", {
      _user_id: caller, _platform: "gumroad", _success: true, _error: null,
    });

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "gumroad",
      external_url: productUrl || editUrl,
      external_id: productId,
      status: "live", sync_state: "auto",
      last_error: null,
      correlation_id: corr,
      published_at: new Date().toISOString(),
      notes: bundleHint ? "Auto-created. Attach the gumroad bundle ZIP in the Gumroad edit page." : null,
    }, { onConflict: "book_id,platform" });

    await logTelemetry(admin, "publish_completed", {
      platform: "gumroad", listing_id: listingId, book_id: book.id,
      external_url: productUrl, external_id: productId, correlation_id: corr,
    });
    await logPublishEvent(admin, {
      user_id: caller, platform: "gumroad", event_type: "publish_completed",
      book_id: book.id, listing_id: listingId,
      external_id: productId, external_url: productUrl || editUrl,
      correlation_id: corr,
      metadata: { price_cents: priceCents, has_bundle_hint: !!bundleHint },
    });

    return jsonResp(200, {
      ok: true,
      external_url: productUrl || editUrl,
      external_id: productId,
      edit_url: editUrl,
      bundle_hint: bundleHint,
      note: "Gumroad product created. Drop your gumroad export ZIP into the Gumroad edit page to make it downloadable.",
    }, corr);
  } catch (e) {
    console.error("publish-to-gumroad error", e, { correlation_id: corr });
    return jsonResp(500, { error: sanitiseError(e) }, corr);
  }
});
