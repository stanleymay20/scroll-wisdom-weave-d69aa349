// publish-to-shopify — auto-create a Shopify product from an existing listing
// using the connected creator's admin token. Idempotent per (book_id, platform).
//
// Flow:
//   1. Auth user + verify book/listing ownership.
//   2. Load encrypted Shopify token + shop_domain.
//   3. If an existing live external_publications row exists, return it (idempotent).
//   4. Mark pending/syncing.
//   5. POST /admin/api/2024-10/products.json with title, body_html, vendor, tags, variant price, image.
//   6. Upsert external_publications row + audit log + telemetry.
//
// Note: Shopify's REST product API does not host the actual digital download —
// that requires the Digital Downloads app or a 3rd-party fulfillment app. We
// create the product end-to-end and surface a bundle_hint URL so the creator
// can attach the export ZIP in the Shopify admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto-tokens.ts";
import { logPublishEvent } from "../_shared/publishing-audit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_VERSION = "2024-10";

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function sanitizeErr(e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? "unknown");
  return msg.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 400);
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
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return jsonResp(401, { error: "auth_required" });
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await userClient.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) return jsonResp(401, { error: "auth_required" });

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listing_id ?? "");
    const explicitJobId = body?.export_job_id ? String(body.export_job_id) : null;
    if (!listingId) return jsonResp(400, { error: "listing_id_required" });

    // Listing + book ownership
    const { data: listing } = await admin
      .from("public_listings")
      .select("id, book_id, slug, price_cents, currency, blurb, amazon_description, seo_keywords, is_public")
      .eq("id", listingId).maybeSingle();
    if (!listing) return jsonResp(404, { error: "listing_not_found" });

    const { data: book } = await admin
      .from("books")
      .select("id, user_id, title, cover_image_url, category")
      .eq("id", listing.book_id).maybeSingle();
    if (!book) return jsonResp(404, { error: "book_not_found" });
    if (book.user_id !== caller) return jsonResp(403, { error: "not_owner" });

    // Connection
    const { data: conn } = await admin
      .from("creator_platform_connections")
      .select("id, encrypted_access_token, connection_status, shop_domain, external_creator_name")
      .eq("user_id", caller).eq("platform", "shopify").maybeSingle();
    if (!conn) return jsonResp(412, { error: "shopify_not_connected" });
    if (conn.connection_status !== "connected") {
      return jsonResp(412, { error: "shopify_connection_" + conn.connection_status });
    }
    if (!conn.shop_domain) return jsonResp(412, { error: "shopify_shop_missing" });
    const shop = conn.shop_domain as string;

    await logTelemetry(admin, "publish_started", { platform: "shopify", listing_id: listingId, book_id: book.id });
    await logPublishEvent(admin, {
      user_id: caller, platform: "shopify", event_type: "publish_started",
      book_id: book.id, listing_id: listingId,
      metadata: { shop },
    });

    // Idempotency
    const { data: existing } = await admin
      .from("external_publications")
      .select("id, external_url, external_id, status, sync_state")
      .eq("book_id", book.id).eq("platform", "shopify").maybeSingle();
    if (existing && existing.status === "live" && existing.external_id) {
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "publish_completed",
        book_id: book.id, listing_id: listingId,
        external_id: existing.external_id, external_url: existing.external_url,
        message: "idempotent", metadata: { idempotent: true },
      });
      return jsonResp(200, {
        ok: true, idempotent: true,
        external_url: existing.external_url,
        external_id: existing.external_id,
      });
    }

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "shopify",
      status: "pending", sync_state: "syncing", last_error: null,
      external_url: existing?.external_url ?? null,
      external_id: existing?.external_id ?? null,
    }, { onConflict: "book_id,platform" });

    // Decrypt token
    let accessToken: string;
    try {
      accessToken = await decryptToken(conn.encrypted_access_token);
    } catch (e) {
      await admin.from("creator_platform_connections")
        .update({ connection_status: "error", last_error: "decrypt_failed" })
        .eq("id", conn.id);
      throw e;
    }

    // Build product payload
    const title = (book.title ?? "Untitled").slice(0, 250);
    const priceCents = Math.max(0, Number(listing.price_cents ?? 0));
    const priceStr = (priceCents / 100).toFixed(2);
    const bodyHtml = (listing.amazon_description || listing.blurb || `${title} — published via ScrollLibrary.`).slice(0, 65000);
    const tagsArr: string[] = Array.isArray(listing.seo_keywords) ? listing.seo_keywords.slice(0, 20) : [];
    if (book.category) tagsArr.push(String(book.category));
    tagsArr.push("scrolllibrary");

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
    if (book.cover_image_url) {
      productPayload.product.images = [{ src: book.cover_image_url, alt: title }];
    }

    const createRes = await fetch(`https://${shop}/admin/api/${API_VERSION}/products.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productPayload),
    });

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
        metadata: { http_status: createRes.status, shop },
      });
      return jsonResp(401, { error: "shopify_token_expired" });
    }

    const createJson: any = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createJson?.product?.id) {
      const reason = sanitizeErr(JSON.stringify(createJson?.errors ?? createJson) || `shopify_${createRes.status}`);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "shopify",
        status: "failed", sync_state: "error", last_error: reason,
      }, { onConflict: "book_id,platform" });
      await logTelemetry(admin, "publish_failed", { platform: "shopify", listing_id: listingId, book_id: book.id, reason });
      await logPublishEvent(admin, {
        user_id: caller, platform: "shopify", event_type: "publish_failed",
        book_id: book.id, listing_id: listingId, severity: "error",
        message: reason, metadata: { http_status: createRes.status, shop },
      });
      return jsonResp(502, { error: "shopify_create_failed", reason });
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

    await admin.from("creator_platform_connections")
      .update({ last_used_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "shopify",
      external_url: publicUrl,
      external_id: productId,
      status: "live", sync_state: "auto",
      last_error: null,
      published_at: new Date().toISOString(),
      notes: bundleHint
        ? "Auto-created. To deliver the digital file, install the Shopify Digital Downloads app and attach your export ZIP."
        : null,
    }, { onConflict: "book_id,platform" });

    await logTelemetry(admin, "publish_completed", {
      platform: "shopify", listing_id: listingId, book_id: book.id,
      external_url: publicUrl, external_id: productId,
    });
    await logPublishEvent(admin, {
      user_id: caller, platform: "shopify", event_type: "publish_completed",
      book_id: book.id, listing_id: listingId,
      external_id: productId, external_url: publicUrl,
      metadata: { shop, handle, price_cents: priceCents },
    });

    return jsonResp(200, {
      ok: true,
      external_url: publicUrl,
      external_id: productId,
      edit_url: editUrl,
      bundle_hint: bundleHint,
      note: "Shopify product created. To deliver the digital file, install the Shopify Digital Downloads app and attach your export ZIP.",
    });
  } catch (e) {
    console.error("publish-to-shopify error", e);
    return jsonResp(500, { error: sanitizeErr(e) });
  }
});
