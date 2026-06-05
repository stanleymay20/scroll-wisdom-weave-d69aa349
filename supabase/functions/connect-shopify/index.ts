// connect-shopify — generate OAuth authorize URL for a creator's Shopify store.
// Caller must be authenticated and provide their *.myshopify.com shop domain.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeReturnUrl } from "../_shared/oauth-return-url.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function randomState(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Accept "mystore", "mystore.myshopify.com", "https://mystore.myshopify.com"
function normalizeShop(input: string): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  // Strict shop hostname: ^[a-z0-9][a-z0-9-]*\.myshopify\.com$
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return null;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
    if (!clientId) return jsonResp(500, { error: "shopify_not_configured" });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return jsonResp(401, { error: "auth_required" });

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await userClient.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) return jsonResp(401, { error: "auth_required" });

    const body = await req.json().catch(() => ({}));
    const shop = normalizeShop(String(body?.shop ?? ""));
    if (!shop) return jsonResp(400, { error: "invalid_shop_domain" });
    const returnUrl = safeReturnUrl(body?.return_url);

    const admin = createClient(url, svc);
    const state = randomState();
    // shop_domain lives in the typed metadata column now — the previous
    // "<url>|<shop>" packing into return_url broke whenever a legitimate
    // returnUrl contained a "|" character.
    const { error: insErr } = await admin.from("oauth_states").insert({
      state, user_id: caller, platform: "shopify",
      return_url: returnUrl,
      metadata: { shop },
    });
    if (insErr) throw insErr;

    // Scopes for publishing products with images
    const scopes = [
      "write_products", "read_products",
      "write_product_listings", "read_product_listings",
      "write_files", "read_files",
    ].join(",");
    const redirectUri = `${url}/functions/v1/shopify-oauth-callback`;
    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("grant_options[]", "");

    return jsonResp(200, { url: authUrl.toString(), shop });
  } catch (e) {
    console.error("connect-shopify error", e);
    return jsonResp(500, { error: String((e as Error)?.message ?? e) });
  }
});
