// shopify-oauth-callback — exchanges ?code for an admin access token, encrypts and
// stores it on creator_platform_connections, then 302-redirects to the app.
//
// Enterprise hardening: connection lifecycle events are audit-logged so SecOps
// can investigate failed/abused callbacks (e.g. HMAC mismatches, replayed
// states) without needing edge-function log access.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/crypto-tokens.ts";
import { logPublishEvent } from "../_shared/publishing-audit.ts";
import { fetchWithRetry } from "../_shared/upstream-retry.ts";
import { sanitiseError } from "../_shared/publish-validation.ts";
import { safeReturnUrl } from "../_shared/oauth-return-url.ts";

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
  let stateFound = false;
  let stateExpired = false;
  if (state) {
    const { data: st } = await admin.from("oauth_states")
      .select("user_id, return_url, expires_at, metadata")
      .eq("state", state).maybeSingle();
    if (st) {
      stateFound = true;
      if (new Date(st.expires_at).getTime() > Date.now()) {
        userId = st.user_id;
        // Preferred path: shop_domain lives in oauth_states.metadata.shop
        // (migrated). Legacy fallback: states created before the migration
        // packed "<url>|<shop>" into return_url. Read both shapes for the
        // 15-minute window during which old states might still be in flight.
        const metaShop = (st.metadata && typeof (st.metadata as any).shop === "string")
          ? (st.metadata as any).shop as string
          : null;
        if (metaShop) {
          expectedShop = metaShop;
          // re-validate the stored return_url defensively
          returnUrl = safeReturnUrl(st.return_url);
        } else {
          const raw = (st.return_url ?? "") as string;
          const idx = raw.lastIndexOf("|");
          if (idx >= 0) {
            returnUrl = safeReturnUrl(raw.slice(0, idx));
            expectedShop = raw.slice(idx + 1) || null;
          } else {
            returnUrl = safeReturnUrl(raw);
          }
        }
      } else {
        stateExpired = true;
      }
    }
    await admin.from("oauth_states").delete().eq("state", state);
  }

  if (state && !stateFound) {
    console.warn("shopify-oauth-callback: unknown state", {
      state_prefix: state.slice(0, 6), shop, ua: req.headers.get("user-agent")?.slice(0, 80) ?? null,
    });
  }
  if (stateExpired) {
    console.warn("shopify-oauth-callback: expired state", { state_prefix: state!.slice(0, 6), shop });
  }

  const logFailure = async (reason: string, sev: "warning" | "error" = "warning") => {
    if (userId) {
      await logPublishEvent(admin, {
        user_id: userId, platform: "shopify", event_type: "connection_failed",
        severity: sev, message: reason,
        metadata: { stage: "oauth_callback", shop: shop ?? null },
      });
    }
  };

  if (!code || !state || !userId) { await logFailure("invalid_state"); return errorRedirect("invalid_state", returnUrl); }
  if (!clientId || !clientSecret) { await logFailure("not_configured", "error"); return errorRedirect("not_configured", returnUrl); }
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    await logFailure("invalid_shop");
    return errorRedirect("invalid_shop", returnUrl);
  }
  if (expectedShop && expectedShop !== shop) {
    await logFailure(`shop_mismatch:${expectedShop}->${shop}`, "error");
    return errorRedirect("shop_mismatch", returnUrl);
  }

  // Verify HMAC
  const ok = await verifyHmac(reqUrl.searchParams, clientSecret);
  if (!ok) {
    await logFailure("hmac_invalid", "error");
    return errorRedirect("hmac_invalid", returnUrl);
  }

  try {
    const tokRes = await fetchWithRetry(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    }, { attempts: 3 });
    const tokJson: any = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tokJson?.access_token) {
      console.error("shopify token exchange failed", tokRes.status, tokJson);
      await logFailure(`token_exchange_failed_${tokRes.status}`, "error");
      return errorRedirect("token_exchange_failed", returnUrl);
    }
    const accessToken: string = tokJson.access_token;
    const scopeStr: string = tokJson.scope ?? "";

    // Look up shop display name (best-effort)
    let shopName = shop;
    try {
      const shopRes = await fetchWithRetry(`https://${shop}/admin/api/2024-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      }, { attempts: 2, timeoutMs: 8000 });
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
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        revoked_at: null,
        disconnected_at: null,
      }, { onConflict: "user_id,platform" });
    if (upErr) throw upErr;

    await logPublishEvent(admin, {
      user_id: userId, platform: "shopify", event_type: "connection_completed",
      metadata: { shop, scopes: scopeStr },
    });

    const base = returnUrl || `${appBase()}/account/intelligence`;
    const u = new URL(base);
    u.searchParams.set("shopify_connect", "ok");
    u.searchParams.set("shop", shop);
    return redirect(u.toString());
  } catch (e) {
    console.error("shopify-oauth-callback error", e);
    await logFailure(sanitiseError(e, 200), "error");
    return errorRedirect("server_error", returnUrl);
  }
});
