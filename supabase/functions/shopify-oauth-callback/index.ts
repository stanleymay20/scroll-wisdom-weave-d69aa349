// shopify-oauth-callback — exchanges ?code for an admin access token, encrypts and
// stores it on creator_platform_connections, then 302-redirects to the app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/crypto-tokens.ts";

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } });
}
function appBase(): string {
  return Deno.env.get("APP_PUBLIC_URL") ?? "https://scrolllibrary.org";
}
function errorRedirect(reason: string, returnUrl?: string | null): Response {
  const base = returnUrl || `${appBase()}/account/intelligence`;
  const u = new URL(base);
  u.searchParams.set("shopify_connect", "error");
  u.searchParams.set("reason", reason.slice(0, 80));
  return redirect(u.toString());
}

// HMAC verification per Shopify OAuth callback spec
async function verifyHmac(params: URLSearchParams, secret: string): Promise<boolean> {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const pairs: string[] = [];
  const keys = Array.from(params.keys()).filter((k) => k !== "hmac" && k !== "signature").sort();
  for (const k of keys) pairs.push(`${k}=${params.get(k)}`);
  const message = pairs.join("&");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const computed = Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  if (computed.length !== hmac.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hmac.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const shop = reqUrl.searchParams.get("shop");

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  const admin = createClient(url, svc);

  let userId: string | null = null;
  let returnUrl: string | null = null;
  let expectedShop: string | null = null;
  if (state) {
    const { data: st } = await admin.from("oauth_states")
      .select("user_id, return_url, expires_at")
      .eq("state", state).maybeSingle();
    if (st && new Date(st.expires_at).getTime() > Date.now()) {
      userId = st.user_id;
      // return_url encoded as `<url>|<shop>`
      const raw = (st.return_url ?? "") as string;
      const idx = raw.lastIndexOf("|");
      if (idx >= 0) {
        returnUrl = raw.slice(0, idx) || null;
        expectedShop = raw.slice(idx + 1) || null;
      } else {
        returnUrl = raw || null;
      }
    }
    await admin.from("oauth_states").delete().eq("state", state);
  }

  if (!code || !state || !userId) return errorRedirect("invalid_state", returnUrl);
  if (!clientId || !clientSecret) return errorRedirect("not_configured", returnUrl);
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return errorRedirect("invalid_shop", returnUrl);
  }
  if (expectedShop && expectedShop !== shop) return errorRedirect("shop_mismatch", returnUrl);

  // Verify HMAC
  const ok = await verifyHmac(reqUrl.searchParams, clientSecret);
  if (!ok) return errorRedirect("hmac_invalid", returnUrl);

  try {
    const tokRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokJson: any = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tokJson?.access_token) {
      console.error("shopify token exchange failed", tokRes.status, tokJson);
      return errorRedirect("token_exchange_failed", returnUrl);
    }
    const accessToken: string = tokJson.access_token;
    const scopeStr: string = tokJson.scope ?? "";

    // Look up shop display name (best-effort)
    let shopName = shop;
    try {
      const shopRes = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      });
      const j: any = await shopRes.json().catch(() => ({}));
      if (j?.shop?.name) shopName = String(j.shop.name);
    } catch (_) { /* non-fatal */ }

    const encAccess = await encryptToken(accessToken);

    const { error: upErr } = await admin
      .from("creator_platform_connections")
      .upsert({
        user_id: userId,
        platform: "shopify",
        encrypted_access_token: encAccess,
        encrypted_refresh_token: null,
        token_expires_at: null,
        external_creator_id: shop,
        external_creator_name: shopName,
        shop_domain: shop,
        scopes: scopeStr ? scopeStr.split(/[\s,]+/).filter(Boolean) : [],
        connection_status: "connected",
        last_error: null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "user_id,platform" });
    if (upErr) throw upErr;

    const base = returnUrl || `${appBase()}/account/intelligence`;
    const u = new URL(base);
    u.searchParams.set("shopify_connect", "ok");
    u.searchParams.set("shop", shop);
    return redirect(u.toString());
  } catch (e) {
    console.error("shopify-oauth-callback error", e);
    return errorRedirect("server_error", returnUrl);
  }
});
