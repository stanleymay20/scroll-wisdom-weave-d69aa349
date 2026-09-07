import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  badRequest,
  forbidden,
  json,
  preflight,
  requireUser,
  serverError,
  serviceClient,
  validateBody,
  z,
} from "../_shared/http.ts";
import { sha256Hex } from "../_shared/university-lti.ts";

const Body = z.object({
  launch_token: z.string().min(32).max(512),
});

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  const sc = serviceClient();
  try {
    const launchTokenHash = await sha256Hex(parsed.launch_token);
    const { data: claimRows, error: claimError } = await sc.rpc("claim_university_lti_launch", {
      _launch_token_hash: launchTokenHash,
      _user_id: auth.userId,
    });
    if (claimError) throw claimError;

    const claim = claimRows?.[0];
    if (!claim?.ok) {
      switch (claim?.error_code) {
        case "not_member":
          return forbidden("Your ScrollUniversity account must be provisioned by this institution before LTI launch.");
        case "inactive_identity":
          return forbidden("Your university identity is not active for LTI access.");
        case "identity_taken":
          return forbidden("This LMS identity is already linked to another ScrollUniversity account.");
        case "user_already_linked":
          return forbidden("Your ScrollUniversity account is already linked to a different LMS identity for this connection.");
        default:
          return badRequest("LTI launch token is invalid, expired, or already claimed.");
      }
    }

    return json({
      ok: true,
      organization_id: claim.organization_id,
      roles: claim.roles,
      context: claim.context_claim,
      resource_link: claim.resource_link_claim,
      custom: claim.custom_claim,
    });
  } catch (error) {
    return serverError(error, "lti_claim_failed");
  }
});
