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
    const now = new Date().toISOString();

    const { data: pendingLaunch, error: lookupError } = await sc
      .from("university_lti_launches")
      .select("id,connection_id,organization_id,subject,roles,context_claim,resource_link_claim,custom_claim,expires_at,claimed_at")
      .eq("launch_token_hash", launchTokenHash)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!pendingLaunch || pendingLaunch.claimed_at || pendingLaunch.expires_at <= now) {
      return badRequest("LTI launch token is invalid, expired, or already claimed.");
    }

    const { data: membership, error: membershipError } = await sc
      .from("organization_members")
      .select("role")
      .eq("organization_id", pendingLaunch.organization_id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      return forbidden("Your ScrollUniversity account must be provisioned by this institution before LTI launch.");
    }

    const { data: universityPerson, error: personLookupError } = await sc
      .from("university_people")
      .select("id,status,university_role")
      .eq("organization_id", pendingLaunch.organization_id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (personLookupError) throw personLookupError;
    if (!universityPerson || !["invited", "active"].includes(universityPerson.status)) {
      return forbidden("Your university identity is not active for LTI access.");
    }

    // External LMS subjects are durable identity bindings. Never let possession
    // of a launch token reassign an existing subject to another ScrollLibrary
    // account, and never let one local account silently replace a different
    // subject for the same LTI connection.
    const { data: subjectIdentity, error: subjectIdentityError } = await sc
      .from("university_external_identities")
      .select("id,user_id,external_subject")
      .eq("connection_id", pendingLaunch.connection_id)
      .eq("external_subject", pendingLaunch.subject)
      .maybeSingle();
    if (subjectIdentityError) throw subjectIdentityError;
    if (subjectIdentity && subjectIdentity.user_id !== auth.userId) {
      return forbidden("This LMS identity is already linked to another ScrollUniversity account.");
    }

    const { data: userIdentity, error: userIdentityError } = await sc
      .from("university_external_identities")
      .select("id,user_id,external_subject")
      .eq("connection_id", pendingLaunch.connection_id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (userIdentityError) throw userIdentityError;
    if (userIdentity && userIdentity.external_subject !== pendingLaunch.subject) {
      return forbidden("Your ScrollUniversity account is already linked to a different LMS identity for this connection.");
    }

    const { data: claimedLaunch, error: claimError } = await sc
      .from("university_lti_launches")
      .update({ claimed_by: auth.userId, claimed_at: now })
      .eq("id", pendingLaunch.id)
      .is("claimed_at", null)
      .gt("expires_at", now)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedLaunch) return badRequest("LTI launch was already claimed.");

    if (subjectIdentity) {
      const { error: identityError } = await sc
        .from("university_external_identities")
        .update({ roles: pendingLaunch.roles, last_launch_at: now })
        .eq("id", subjectIdentity.id)
        .eq("user_id", auth.userId);
      if (identityError) throw identityError;
    } else {
      const { error: identityError } = await sc
        .from("university_external_identities")
        .insert({
          organization_id: pendingLaunch.organization_id,
          connection_id: pendingLaunch.connection_id,
          external_subject: pendingLaunch.subject,
          user_id: auth.userId,
          roles: pendingLaunch.roles,
          last_launch_at: now,
        });
      if (identityError) throw identityError;
    }

    if (universityPerson.status === "invited") {
      const { error: activationError } = await sc
        .from("university_people")
        .update({ status: "active" })
        .eq("id", universityPerson.id)
        .eq("status", "invited");
      if (activationError) throw activationError;
    }

    await sc.rpc("log_audit_event", {
      _event_type: "university.lti.launch.claimed",
      _actor_id: auth.userId,
      _organization_id: pendingLaunch.organization_id,
      _resource_type: "lti_launch",
      _resource_id: pendingLaunch.id,
      _severity: "info",
      _metadata: {
        connection_id: pendingLaunch.connection_id,
        university_role: universityPerson.university_role,
      },
    });

    return json({
      ok: true,
      organization_id: pendingLaunch.organization_id,
      roles: pendingLaunch.roles,
      context: pendingLaunch.context_claim,
      resource_link: pendingLaunch.resource_link_claim,
      custom: pendingLaunch.custom_claim,
    });
  } catch (error) {
    return serverError(error, "lti_claim_failed");
  }
});
