import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { badRequest, preflight, serverError, serviceClient } from "../_shared/http.ts";
import {
  buildLtiAuthorizationUrl,
  randomUrlSafe,
  sha256Hex,
} from "../_shared/university-lti.ts";

async function requestParams(req: Request): Promise<URLSearchParams> {
  if (req.method === "GET") return new URL(req.url).searchParams;
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const params = new URLSearchParams();
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") params.set(key, value);
      }
      return params;
    }
  }
  throw new Error("LTI OIDC login requires GET or form POST parameters.");
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!["GET", "POST"].includes(req.method)) return badRequest("GET or POST only");

  try {
    const params = await requestParams(req);
    const issuer = params.get("iss")?.trim();
    const loginHint = params.get("login_hint")?.trim();
    const targetLinkUri = params.get("target_link_uri")?.trim() || null;
    const ltiMessageHint = params.get("lti_message_hint")?.trim() || null;
    const requestedClientId = params.get("client_id")?.trim() || null;

    if (!issuer || !loginHint) {
      return badRequest("LTI OIDC login requires iss and login_hint.");
    }

    const sc = serviceClient();
    let query = sc
      .from("university_lms_connections")
      .select("id,organization_id,issuer,client_id,auth_login_url,deployment_id,tool_url,status")
      .eq("standard", "lti_1_3")
      .eq("issuer", issuer)
      .in("status", ["configured", "verified"]);

    if (requestedClientId) query = query.eq("client_id", requestedClientId);
    const { data: connections, error: connectionError } = await query.limit(2);
    if (connectionError) throw connectionError;
    if (!connections || connections.length !== 1) {
      return badRequest("No unique active LTI registration matches this issuer/client_id.");
    }

    const connection = connections[0];
    const state = randomUrlSafe(32);
    const nonce = randomUrlSafe(32);
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: stateError } = await sc.from("university_lti_oidc_states").insert({
      connection_id: connection.id,
      state_hash: stateHash,
      nonce,
      login_hint: loginHint,
      lti_message_hint: ltiMessageHint,
      target_link_uri: targetLinkUri,
      expires_at: expiresAt,
    });
    if (stateError) throw stateError;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured.");
    const redirectUri = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/university-lti-launch`;

    const authorizationUrl = buildLtiAuthorizationUrl({
      issuer: connection.issuer,
      client_id: connection.client_id,
      auth_login_url: connection.auth_login_url,
      deployment_id: connection.deployment_id,
      tool_url: connection.tool_url,
    }, {
      loginHint,
      state,
      nonce,
      redirectUri,
      ltiMessageHint,
    });

    return Response.redirect(authorizationUrl, 302);
  } catch (error) {
    return serverError(error, "lti_oidc_login_failed");
  }
});
