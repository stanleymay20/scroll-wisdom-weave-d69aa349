// publish-to-shopify — auto-create a Shopify product from an existing listing
// using the connected creator's admin token. Idempotent per (book_id, platform).
//
// Hardened pipeline mirrors publish-to-gumroad:
//   1. correlationId per request.
//   2. Auth user + ownership.
//   3. Entitlement gate.
//   4. Per-user velocity gate.
//   5. Normalise/validate listing.
//   6. Decrypt token + idempotency check.
//   7. fetchWithRetry around the Shopify Admin REST call.
//   8. Full audit + connection outcome bookkeeping.
//
// Note: Shopify's REST product API does not host the actual digital download —
// that requires the Digital Downloads app or a 3rd-party fulfillment app. We
// create the product end-to-end and surface a bundle_hint URL so the creator
// can attach the export ZIP in the Shopify admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto-tokens.ts";
import { logPublishEvent } from "../_shared/publishing-audit.ts";
import { requireCreatorCapability, snapshotEntitlement } from "../_shared/entitlements.ts";
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

const API_VERSION = "2024-10";

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
    const { data: listing } = await admin
      .from("public_listings")
      .select("id, book_id, slug, price_cents, currency, blurb, amazon_description, seo_keywords, is_public")
      .eq("id", listingId).maybeSingle();
    if (!listing) return jsonResp(404, { error: "listing_not_found" }, corr);

    const { data: book } = await admin
      .from("books")
      .select("id, user_id, title, description, cover_image_url, category, book_type")
      .eq("id", listing.book_id).maybeSingle();
    if (!book) return jsonResp(404, { error: "book_not_found" }, corr);
    if (book.user_id !== caller) return jsonResp(403, { error: "not_owner" }, corr);

    // Entitlement gate
    const gate = await requireCreatorCapability(admin, caller, "can_publish_external", {
      auditMetadata: { book_id: book.id, listing_id: listing.id, platform: "shopify" },
      correlationId: corr,
      platform: "shopify",
    });
    if (gate.blocked) return gate.blocked;

    // Per-user velocity gate. Shopify rate limits are tight; we also guard
    // against duplicated product creation from runaway client retries.
    const reqIp = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
                  req.headers.get("cf-connecting-ip") || "anonymous";
    try {
      const { data: rl } = await admin.rpc("check_velocity", {
        _key: `publish:shopify:user:${caller}`, _limit: 5, _window_seconds: 3600,
      });
      if ((rl as any)?.ok === false) {
        const retry = Number((rl as any)?.retry_after ?? 3600);
        await logPublishEvent(admin, {
          user_id: caller, platform: "shopify", event_type: "publish_failed",
          book_id: book.id, listing_id: listingId, severity: "warning",
          message: "rate_limited", correlation_id: corr,
          metadata: { reason: "user_rate_limit", retry_after: retry, ip: reqIp },
        });
        return new Response(JSON.stringify({
          error: "rate_limited", code: "rate_limited", retry_after: retry, correlation_id: corr,
        }), { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(retry), "x-correlation-id": corr } });
      }
    } catch (_) { /* fail-open */ }

    // Validate + normalise listing inputs.
    const normalised = normaliseListing(listing, book, {
      allowFree: true, maxTitle: 250, maxDescription: 65_000, maxTags: 20,
    });
    if (!normalised.ok) {
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "publish_validation_failed",
        book_id: book.id, listing_id: listingId, severity: "warning",
        message: normalised.message, correlation_id: corr,
        metadata: { code: normalised.code },
      });
      return jsonResp(400, { error: "invalid_listing", code: normalised.code, message: normalised.message }, corr);
    }
    const { title, description: bodyHtml, priceCents, tags: tagsArr, coverImageUrl } = normalised.value;
    tagsArr.push("scrolllibrary");

    // Defence-in-depth sell-safety gate.
    const { data: chSafety } = await admin
      .from("chapters").select("title, content").eq("book_id", book.id).order("chapter_number");
    const safetyInput: SellSafetyInput = {
      book: { title: (book as any).title, description: (book as any).description, category: (book as any).category, book_type: (book as any).book_type },
      listing,
      chaptersFullText: (chSafety ?? []).map((c: any) => `${c.title ?? ""}\n${c.content ?? ""}`).join("\n\n"),
      aiAssistanceLevel: (book as any).ai_assistance_level ?? null,
      cover: null,
    };
    const safety = auditSellSafety(safetyInput, "shopify");
    if (safety.verdict === "unsafe") {
      const blockers = safety.issues.filter((i) => i.severity === "blocker").map((i) => i.message);
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "publish_validation_failed",
        book_id: book.id, listing_id: listingId, severity: "error",
        message: safety.summary, correlation_id: corr,
        metadata: { codes: safety.issues.filter((i) => i.severity === "blocker").map((i) => i.code) },
      });
      return jsonResp(422, {
        error: "sell_safety_blocked", message: safety.summary, blockers,
      }, corr);
    }

    const entitlementSnapshotId = await snapshotEntitlement(admin, caller, "external_publish", book.id);

    // Connection
    const { data: conn } = await admin
      .from("creator_platform_connections")
      .select("id, encrypted_access_token, connection_status, shop_domain, external_creator_name")
      .eq("user_id", caller).eq("platform", "shopify").maybeSingle();
    if (!conn) return jsonResp(412, { error: "shopify_not_connected" }, corr);
    if (conn.connection_status !== "connected") {
      return jsonResp(412, { error: "shopify_connection_" + conn.connection_status }, corr);
    }
    if (!conn.shop_domain) return jsonResp(412, { error: "shopify_shop_missing" }, corr);
    const shop = conn.shop_domain as string;
    // Defence-in-depth: validate shop domain shape even though OAuth callback
    // already checked it. Prevents a corrupted row from being weaponised into
    // a request against an attacker-controlled host.
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return jsonResp(412, { error: "shopify_shop_invalid" }, corr);
    }

    await logTelemetry(admin, "publish_started", { platform: "shopify", listing_id: listingId, book_id: book.id, correlation_id: corr });
    await logPublishEvent(admin, {
      user_id: caller, platform: "shopify", event_type: "publish_started",
      book_id: book.id, listing_id: listingId,
      correlation_id: corr,
      metadata: { shop, price_cents: priceCents },
    });

    // Idempotency
    const { data: existing } = await admin
      .from("external_publications")
      .select("id, external_url, external_id, status, sync_state, publish_attempts")
      .eq("book_id", book.id).eq("platform", "shopify").maybeSingle();
    if (existing && existing.status === "live" && existing.external_id) {
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "publish_completed",
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

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "shopify",
      status: "pending", sync_state: "syncing", last_error: null,
      external_url: existing?.external_url ?? null,
      external_id: existing?.external_id ?? null,
      entitlement_snapshot_id: entitlementSnapshotId,
      correlation_id: corr,
      last_publish_attempt_at: new Date().toISOString(),
      publish_attempts: ((existing as any)?.publish_attempts ?? 0) + 1,
    }, { onConflict: "book_id,platform" });

    // Decrypt token
    let accessToken: string;
    try {
      accessToken = await decryptToken(conn.encrypted_access_token);
    } catch (e) {
      await admin.from("creator_platform_connections")
        .update({ connection_status: "error", last_error: "decrypt_failed" })
        .eq("id", conn.id);
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "connection_decrypt_failed",
        severity: "critical", correlation_id: corr,
        message: "Failed to decrypt stored token",
      });
      throw e;
    }

    // Build product payload from normalised values
    const priceStr = (priceCents / 100).toFixed(2);
    const productPayload: any = {
      product: {
        title,
        body_html: bodyHtml,
        vendor: conn.external_creator_name || "ScrollLibrary",
        product_type: "Digital book",
        status: "active",
        tags: tagsArr.join(", "),
        variants: [{
          price: priceStr,
          requires_shipping: false,
          taxable: false,
          inventory_management: null,
          fulfillment_service: "manual",
        }],
      },
    };
    if (coverImageUrl) {
      productPayload.product.images = [{ src: coverImageUrl, alt: title }];
    }

    const createRes = await fetchWithRetry(
      `https://${shop}/admin/api/${API_VERSION}/products.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productPayload),
      },
      {
        attempts: 3,
        onRetry: ({ attempt, status, reason, delayMs }) => {
          void logPublishEvent(admin, {
            user_id: caller, platform: "shopify", event_type: "publish_retried",
            book_id: book.id, listing_id: listingId, severity: "warning",
            correlation_id: corr,
            message: `attempt ${attempt} failed (${reason})`,
            metadata: { attempt, status, reason, retry_delay_ms: delayMs, shop },
          });
        },
      },
    );

    if (createRes.status === 401 || createRes.status === 403) {
      await admin.from("creator_platform_connections")
        .update({ connection_status: "expired", last_error: `${createRes.status}_unauthorized` })
        .eq("id", conn.id);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "shopify",
        status: "failed", sync_state: "error",
        last_error: "Shopify connection expired or revoked — reconnect required.",
      }, { onConflict: "book_id,platform" });
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "token_expired",
        book_id: book.id, listing_id: listingId, severity: "warning",
        correlation_id: corr,
        metadata: { http_status: createRes.status, shop },
      });
      await admin.rpc("record_platform_connection_outcome", {
        _user_id: caller, _platform: "shopify", _success: false, _error: `${createRes.status}_unauthorized`,
      });
      return jsonResp(401, { error: "shopify_token_expired" }, corr);
    }

    const createJson: any = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createJson?.product?.id) {
      const reason = sanitiseError(JSON.stringify(createJson?.errors ?? createJson) || `shopify_${createRes.status}`);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "shopify",
        status: "failed", sync_state: "error", last_error: reason,
      }, { onConflict: "book_id,platform" });
      await logTelemetry(admin, "publish_failed", { platform: "shopify", listing_id: listingId, book_id: book.id, reason, correlation_id: corr });
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "publish_failed",
        book_id: book.id, listing_id: listingId, severity: "error",
        message: reason, correlation_id: corr,
        metadata: { http_status: createRes.status, shop },
      });
      await admin.rpc("record_platform_connection_outcome", {
        _user_id: caller, _platform: "shopify", _success: false, _error: reason,
      });
      return jsonResp(502, { error: "shopify_create_failed", reason }, corr);
    }

    const product = createJson.product;
    const productId = String(product.id);
    const handle = String(product.handle ?? "");
    const publicUrl = `https://${shop.replace(".myshopify.com", "")}.myshopify.com/products/${handle}`;
    const editUrl = `https://${shop}/admin/products/${productId}`;

    // Find bundle hint (most recent export bundle for this book, any format)
    let bundleHint: string | null = null;
    try {
      const { data: jobs } = explicitJobId
        ? await admin.from("export_jobs").select("id, result_url, status").eq("id", explicitJobId).limit(1)
        : await admin.from("export_jobs")
            .select("id, result_url, status, created_at")
            .eq("user_id", caller).eq("book_id", book.id)
            .eq("status", "completed")
            .order("created_at", { ascending: false }).limit(1);
      if (jobs?.[0]?.result_url) bundleHint = jobs[0].result_url;
    } catch (_) { /* non-fatal */ }

    await admin.rpc("record_platform_connection_outcome", {
      _user_id: caller, _platform: "shopify", _success: true, _error: null,
    });

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "shopify",
      external_url: publicUrl,
      external_id: productId,
      status: "live", sync_state: "auto",
      last_error: null,
      correlation_id: corr,
      published_at: new Date().toISOString(),
      notes: bundleHint
        ? "Auto-created. To deliver the digital file, install the Shopify Digital Downloads app and attach your export ZIP."
        : null,
    }, { onConflict: "book_id,platform" });

    await logTelemetry(admin, "publish_completed", {
      platform: "shopify", listing_id: listingId, book_id: book.id,
      external_url: publicUrl, external_id: productId, correlation_id: corr,
    });
    await logPublishEvent(admin, {
      user_id: caller, platform: "shopify", event_type: "publish_completed",
      book_id: book.id, listing_id: listingId,
      external_id: productId, external_url: publicUrl,
      correlation_id: corr,
      metadata: { shop, handle, price_cents: priceCents },
    });

    return jsonResp(200, {
      ok: true,
      external_url: publicUrl,
      external_id: productId,
      edit_url: editUrl,
      bundle_hint: bundleHint,
      note: "Shopify product created. To deliver the digital file, install the Shopify Digital Downloads app and attach your export ZIP.",
    }, corr);
  } catch (e) {
    console.error("publish-to-shopify error", e, { correlation_id: corr });
    return jsonResp(500, { error: sanitiseError(e) }, corr);
  }
});
