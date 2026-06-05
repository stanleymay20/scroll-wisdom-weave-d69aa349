// gumroad-oauth-callback — Gumroad redirects the user's browser here with ?code&state.
// We exchange code -> access_token, encrypt and store it, then redirect the user back
// to the app. This endpoint is browser-facing, so it returns 302s (HTML redirects),
// not JSON.
//
// Enterprise hardening: every connection lifecycle event is recorded in
// publishing_audit_log so operators can reconstruct who connected when, and
// debug failed token exchanges without spelunking edge function logs.
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
  let stateFound = false;
  let stateExpired = false;
  if (state) {
    const { data: st } = await admin.from("oauth_states")
      .select("user_id, return_url, expires_at")
      .eq("state", state).maybeSingle();
    if (st) {
      stateFound = true;
      if (new Date(st.expires_at).getTime() > Date.now()) {
        userId = st.user_id;
        // Defence-in-depth: re-validate the stored return_url against the
        // app-origin allow list. oauth_states is service-role only, but a
        // pre-validation-fix row could still be in flight, and free
        // checks are free.
        returnUrl = safeReturnUrl(st.return_url);
      } else {
        stateExpired = true;
      }
    }
    // Single-use: delete regardless
    await admin.from("oauth_states").delete().eq("state", state);
  }

  // Forensic logging: a callback hit with a state we never issued (or with
  // no state at all) is interesting — it's an attacker probing the OAuth
  // surface. We log it without exposing the state value itself.
  if (state && !stateFound) {
    console.warn("gumroad-oauth-callback: unknown state", {
      state_prefix: state.slice(0, 6), ua: req.headers.get("user-agent")?.slice(0, 80) ?? null,
    });
  }
  if (stateExpired) {
    console.warn("gumroad-oauth-callback: expired state", { state_prefix: state!.slice(0, 6) });
  }

  // Best-effort audit logging for failed callbacks. We don't have a userId for
  // truly bogus states, so we only log when we know who the request claims to be.
  const logFailure = async (reason: string, sev: "warning" | "error" = "warning") => {
    if (userId) {
      await logPublishEvent(admin, {
        user_id: userId, platform: "gumroad", event_type: "connection_failed",
        severity: sev, message: reason,
        metadata: { stage: "oauth_callback" },
      });
    }
  };

  if (oauthError) {
    await logFailure(`oauth_error:${oauthError}`);
    return errorRedirect(oauthError, returnUrl);
  }
  if (!code || !state || !userId) {
    await logFailure("invalid_state");
    return errorRedirect("invalid_state", returnUrl);
  }
  if (!clientId || !clientSecret) {
    await logFailure("not_configured", "error");
    return errorRedirect("not_configured", returnUrl);
  }

  try {
    const redirectUri = `${url}/functions/v1/gumroad-oauth-callback`;
    const tokenForm = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });
    const tokRes = await fetchWithRetry("https://api.gumroad.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenForm.toString(),
    }, { attempts: 3 });
    const tokJson: any = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tokJson?.access_token) {
      console.error("gumroad token exchange failed", tokRes.status, tokJson);
      await logFailure(`token_exchange_failed_${tokRes.status}`, "error");
      return errorRedirect("token_exchange_failed", returnUrl);
    }
    const accessToken: string = tokJson.access_token;
    const refreshToken: string | undefined = tokJson.refresh_token;
    const scopeStr: string = tokJson.scope ?? "";

    // Fetch profile
    const meRes = await fetchWithRetry(
      `https://api.gumroad.com/v2/user?access_token=${encodeURIComponent(accessToken)}`,
      {}, { attempts: 2 },
    );
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
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        revoked_at: null,
        disconnected_at: null,
      }, { onConflict: "user_id,platform" });
    if (upErr) throw upErr;

    await logPublishEvent(admin, {
      user_id: userId, platform: "gumroad", event_type: "connection_completed",
      metadata: { external_creator_id: extId || null, has_refresh_token: !!refreshToken, scopes: scopeStr },
    });

    const base = returnUrl || `${appBase()}/account/intelligence`;
    const u = new URL(base);
    u.searchParams.set("gumroad_connect", "ok");
    return redirect(u.toString());
  } catch (e) {
    console.error("gumroad-oauth-callback error", e);
    await logFailure(sanitiseError(e, 200), "error");
    return errorRedirect("server_error", returnUrl);
  }
});
