// connect-gumroad — generates the OAuth authorization URL and stores a CSRF state.
// Caller must be authenticated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeReturnUrl } from "../_shared/oauth-return-url.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function randomState(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GUMROAD_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "gumroad_not_configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await userClient.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    // Same-origin allow-listing closes the open-redirect primitive: an
    // unvalidated return_url could be abused to phish through our domain.
    const returnUrl = safeReturnUrl(body?.return_url);

    const admin = createClient(url, svc);
    const state = randomState();
    const { error: insErr } = await admin.from("oauth_states").insert({
      state, user_id: caller, platform: "gumroad", return_url: returnUrl,
      metadata: {},
    });
    if (insErr) throw insErr;

    const redirectUri = `${url}/functions/v1/gumroad-oauth-callback`;
    // Gumroad scopes: edit_products covers create + upload + update
    const scopes = "edit_products view_profile";
    const authUrl = new URL("https://gumroad.com/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
