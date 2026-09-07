import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@6.1.0?target=deno";
import { badRequest, preflight, serverError, serviceClient } from "../_shared/http.ts";
import {
  buildLtiToolRedirect,
  parseLtiClaims,
  randomUrlSafe,
  remoteHttpsUrl,
  sha256Hex,
} from "../_shared/university-lti.ts";

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
      return badRequest("LTI launch must use form_post.");
    }

    const form = await req.formData();
    const idToken = typeof form.get("id_token") === "string" ? String(form.get("id_token")) : "";
    const state = typeof form.get("state") === "string" ? String(form.get("state")) : "";
    if (!idToken || !state) return badRequest("LTI launch requires id_token and state.");

    const sc = serviceClient();
    const stateHash = await sha256Hex(state);
    const { data: consumedStates, error: stateError } = await sc.rpc("consume_university_lti_oidc_state", {
      _state_hash: stateHash,
    });
    if (stateError) throw stateError;
    const consumedState = consumedStates?.[0];
    if (!consumedState) return badRequest("LTI state is invalid, expired, or already used.");

    const { data: connection, error: connectionError } = await sc
      .from("university_lms_connections")
      .select("id,organization_id,issuer,client_id,jwks_url,deployment_id,tool_url,status")
      .eq("id", consumedState.connection_id)
      .in("status", ["configured", "verified"])
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) return badRequest("LTI registration is unavailable.");

    const jwks = createRemoteJWKSet(remoteHttpsUrl(connection.jwks_url, "LTI JWKS URL"));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: connection.issuer,
      audience: connection.client_id,
      clockTolerance: 10,
    });

    if (payload.nonce !== consumedState.nonce) {
      return badRequest("LTI nonce validation failed.");
    }

    const claims = parseLtiClaims(payload as Record<string, unknown>, connection.deployment_id);
    if (claims.messageType !== "LtiResourceLinkRequest") {
      return badRequest(`Unsupported LTI message_type: ${claims.messageType}`);
    }

    const launchToken = randomUrlSafe(32);
    const launchTokenHash = await sha256Hex(launchToken);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: launchError } = await sc.from("university_lti_launches").insert({
      connection_id: connection.id,
      organization_id: connection.organization_id,
      launch_token_hash: launchTokenHash,
      subject: claims.subject,
      deployment_id: claims.deploymentId,
      message_type: claims.messageType,
      lti_version: claims.version,
      roles: claims.roles,
      context_claim: claims.context,
      resource_link_claim: claims.resourceLink,
      custom_claim: claims.custom,
      expires_at: expiresAt,
    });
    if (launchError) throw launchError;

    const { error: statusError } = await sc.from("university_lms_connections")
      .update({
        status: "verified",
        last_verified_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", connection.id);
    if (statusError) throw statusError;

    return Response.redirect(buildLtiToolRedirect(connection.tool_url, launchToken), 303);
  } catch (error) {
    return serverError(error, "lti_launch_failed");
  }
});
