// gumroad-oauth-callback — Gumroad redirects the user's browser here with ?code&state.
// We exchange code -> access_token, encrypt and store it, then redirect the user back
// to the app. This endpoint is browser-facing, so it returns 302s (HTML redirects),
// not JSON.
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
  u.searchParams.set("gumroad_connect", "error");
  u.searchParams.set("reason", reason.slice(0, 80));
  return redirect(u.toString());
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const oauthError = reqUrl.searchParams.get("error");

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("GUMROAD_CLIENT_ID");
  const clientSecret = Deno.env.get("GUMROAD_CLIENT_SECRET");
  const admin = createClient(url, svc);

  // Look up state -> user/return_url (may be null if state is bogus)
  let userId: string | null = null;
  let returnUrl: string | null = null;
  if (state) {
    const { data: st } = await admin.from("oauth_states")
      .select("user_id, return_url, expires_at")
      .eq("state", state).maybeSingle();
    if (st && new Date(st.expires_at).getTime() > Date.now()) {
      userId = st.user_id;
      returnUrl = st.return_url;
    }
    // Single-use: delete regardless
    await admin.from("oauth_states").delete().eq("state", state);
  }

  if (oauthError) return errorRedirect(oauthError, returnUrl);
  if (!code || !state || !userId) return errorRedirect("invalid_state", returnUrl);
  if (!clientId || !clientSecret) return errorRedirect("not_configured", returnUrl);

  try {
    const redirectUri = `${url}/functions/v1/gumroad-oauth-callback`;
    const tokenForm = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });
    const tokRes = await fetch("https://api.gumroad.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenForm.toString(),
    });
    const tokJson: any = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tokJson?.access_token) {
      console.error("gumroad token exchange failed", tokRes.status, tokJson);
      return errorRedirect("token_exchange_failed", returnUrl);
    }
    const accessToken: string = tokJson.access_token;
    const refreshToken: string | undefined = tokJson.refresh_token;
    const scopeStr: string = tokJson.scope ?? "";

    // Fetch profile
    const meRes = await fetch(`https://api.gumroad.com/v2/user?access_token=${encodeURIComponent(accessToken)}`);
    const meJson: any = await meRes.json().catch(() => ({}));
    const extId = String(meJson?.user?.user_id ?? meJson?.user?.id ?? "");
    const extName = String(meJson?.user?.name ?? meJson?.user?.email ?? "Gumroad creator");

    const encAccess = await encryptToken(accessToken);
    const encRefresh = refreshToken ? await encryptToken(refreshToken) : null;

    const { error: upErr } = await admin
      .from("creator_platform_connections")
      .upsert({
        user_id: userId,
        platform: "gumroad",
        encrypted_access_token: encAccess,
        encrypted_refresh_token: encRefresh,
        token_expires_at: null,
        external_creator_id: extId || null,
        external_creator_name: extName,
        scopes: scopeStr ? scopeStr.split(/[\s,]+/).filter(Boolean) : [],
        connection_status: "connected",
        last_error: null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "user_id,platform" });
    if (upErr) throw upErr;

    const base = returnUrl || `${appBase()}/account/intelligence`;
    const u = new URL(base);
    u.searchParams.set("gumroad_connect", "ok");
    return redirect(u.toString());
  } catch (e) {
    console.error("gumroad-oauth-callback error", e);
    return errorRedirect("server_error", returnUrl);
  }
});
