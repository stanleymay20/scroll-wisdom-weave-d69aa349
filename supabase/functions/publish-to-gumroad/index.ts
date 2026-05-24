// publish-to-gumroad — auto-creates a Gumroad product from an existing
// gumroad-format export bundle. Idempotent per (book_id, platform).
//
// Flow:
//   1. Auth user.
//   2. Load listing + verify ownership.
//   3. Load decrypted Gumroad token; mark 401s as 'expired'.
//   4. Find most-recent completed gumroad export job (or accept an explicit id).
//   5. POST /v2/products with name, price_cents, description, tags.
//      (Gumroad's public v2 API has limited support for ZIP upload via API;
//       product is created with metadata and the creator's bundle file is
//       attached either via direct upload — best-effort — or by the creator
//       dragging the ZIP into the Gumroad edit page. We always return the
//       product edit URL.)
//   6. Best-effort cover upload (PUT /v2/products/:id with preview_url).
//   7. Upsert external_publications row + telemetry events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto-tokens.ts";
import { requireCreatorCapability } from "../_shared/entitlements.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GUMROAD = "https://api.gumroad.com/v2";

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

function sanitizeErr(e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? "unknown");
  // Strip anything that looks like a token.
  return msg.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 400);
}

async function logEvent(admin: any, type: string, meta: Record<string, unknown>) {
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
    const { data: listing, error: lErr } = await admin
      .from("public_listings")
      .select("id, book_id, slug, price_cents, currency, blurb, amazon_description, seo_keywords, sample_chapters, is_public")
      .eq("id", listingId)
      .maybeSingle();
    if (lErr || !listing) return jsonResp(404, { error: "listing_not_found" });

    const { data: book, error: bErr } = await admin
      .from("books")
      .select("id, user_id, title, cover_image_url")
      .eq("id", listing.book_id)
      .maybeSingle();
    if (bErr || !book) return jsonResp(404, { error: "book_not_found" });
    if (book.user_id !== caller) return jsonResp(403, { error: "not_owner" });

    // Phase 4.0 — gate on Creator entitlement
    const gate = await requireCreatorCapability(admin, caller, "can_publish_external", {
      auditMetadata: { book_id: book.id, listing_id: listing.id, platform: "gumroad" },
    });
    if (gate.blocked) return gate.blocked;

    // Phase 4.1 — snapshot effective entitlement for historical proof.
    const { snapshotEntitlement } = await import("../_shared/entitlements.ts");
    const entitlementSnapshotId = await snapshotEntitlement(admin, caller, "external_publish", book.id);

    // Connection
    const { data: conn, error: cErr } = await admin
      .from("creator_platform_connections")
      .select("id, encrypted_access_token, connection_status, external_creator_name")
      .eq("user_id", caller)
      .eq("platform", "gumroad")
      .maybeSingle();
    if (cErr || !conn) return jsonResp(412, { error: "gumroad_not_connected" });
    if (conn.connection_status !== "connected") {
      return jsonResp(412, { error: "gumroad_connection_" + conn.connection_status });
    }

    await logEvent(admin, "publish_started", { platform: "gumroad", listing_id: listingId, book_id: book.id });

    // Idempotency: if an existing live/auto row exists, return it instead of creating a duplicate.
    const { data: existing } = await admin
      .from("external_publications")
      .select("id, external_url, external_id, status, sync_state")
      .eq("book_id", book.id).eq("platform", "gumroad").maybeSingle();
    if (existing && existing.status === "live" && existing.external_id) {
      await logEvent(admin, "publish_completed", {
        platform: "gumroad", listing_id: listingId, book_id: book.id,
        external_url: existing.external_url, idempotent: true,
      });
      return jsonResp(200, {
        ok: true, idempotent: true,
        external_url: existing.external_url,
        external_id: existing.external_id,
      });
    }

    // Mark pending row early so the UI can show "syncing"
    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "gumroad",
      status: "pending", sync_state: "syncing", last_error: null,
      external_url: existing?.external_url ?? null,
      external_id: existing?.external_id ?? null,
    }, { onConflict: "book_id,platform" });

    // Decrypt token (after we've validated everything else)
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
    const name = (book.title ?? "Untitled").slice(0, 200);
    const priceCents = Math.max(0, Number(listing.price_cents ?? 0));
    const description = (listing.amazon_description || listing.blurb || `${name} — published via ScrollLibrary.`).slice(0, 5000);
    const tags = Array.isArray(listing.seo_keywords) ? listing.seo_keywords.slice(0, 10).join(",") : "";

    const form = new FormData();
    form.append("access_token", accessToken);
    form.append("name", name);
    form.append("price", String(priceCents));
    form.append("description", description);
    if (tags) form.append("tags", tags);

    const createRes = await fetch(`${GUMROAD}/products`, { method: "POST", body: form });
    const createJson: any = await createRes.json().catch(() => ({}));

    if (createRes.status === 401) {
      await admin.from("creator_platform_connections")
        .update({ connection_status: "expired", last_error: "401_unauthorized" })
        .eq("id", conn.id);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "gumroad",
        status: "failed", sync_state: "error", last_error: "Gumroad connection expired — reconnect required.",
      }, { onConflict: "book_id,platform" });
      await logEvent(admin, "publish_failed", { platform: "gumroad", listing_id: listingId, book_id: book.id, reason: "expired" });
      return jsonResp(401, { error: "gumroad_token_expired" });
    }
    if (!createRes.ok || !createJson?.success) {
      const reason = sanitizeErr(createJson?.message || `gumroad_${createRes.status}`);
      await admin.from("external_publications").upsert({
        user_id: caller, book_id: book.id, platform: "gumroad",
        status: "failed", sync_state: "error", last_error: reason,
      }, { onConflict: "book_id,platform" });
      await logEvent(admin, "publish_failed", { platform: "gumroad", listing_id: listingId, book_id: book.id, reason });
      return jsonResp(502, { error: "gumroad_create_failed", reason });
    }

    const product = createJson.product ?? {};
    const productId = String(product.id ?? "");
    const productUrl = String(product.short_url ?? product.url ?? "");
    const editUrl = productId ? `https://app.gumroad.com/products/${productId}/edit` : productUrl;

    // Best-effort cover image attach (skip silently if it fails)
    if (productId && book.cover_image_url) {
      try {
        const upd = new FormData();
        upd.append("access_token", accessToken);
        upd.append("preview_url", book.cover_image_url);
        await fetch(`${GUMROAD}/products/${productId}`, { method: "PUT", body: upd });
      } catch (_) { /* non-fatal */ }
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

    await admin.from("creator_platform_connections")
      .update({ last_used_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);

    await admin.from("external_publications").upsert({
      user_id: caller, book_id: book.id, platform: "gumroad",
      external_url: productUrl || editUrl,
      external_id: productId,
      status: "live", sync_state: "auto",
      last_error: null,
      published_at: new Date().toISOString(),
      notes: bundleHint ? "Auto-created. Attach the gumroad bundle ZIP in the Gumroad edit page." : null,
    }, { onConflict: "book_id,platform" });

    await logEvent(admin, "publish_completed", {
      platform: "gumroad", listing_id: listingId, book_id: book.id,
      external_url: productUrl, external_id: productId,
    });

    return jsonResp(200, {
      ok: true,
      external_url: productUrl || editUrl,
      external_id: productId,
      edit_url: editUrl,
      bundle_hint: bundleHint,
      note: "Gumroad product created. Drop your gumroad export ZIP into the Gumroad edit page to make it downloadable.",
    });
  } catch (e) {
    console.error("publish-to-gumroad error", e);
    return jsonResp(500, { error: sanitizeErr(e) });
  }
});
