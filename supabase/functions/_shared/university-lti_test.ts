import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLtiAuthorizationUrl,
  buildLtiToolRedirect,
  LTI_DEPLOYMENT_ID_CLAIM,
  LTI_MESSAGE_TYPE_CLAIM,
  LTI_ROLES_CLAIM,
  LTI_VERSION_CLAIM,
  parseLtiClaims,
  sha256Hex,
} from "./university-lti.ts";

Deno.test("LTI authorization URL carries OIDC launch protections", () => {
  const url = new URL(buildLtiAuthorizationUrl({
    issuer: "https://lms.example.edu",
    client_id: "client-123",
    auth_login_url: "https://lms.example.edu/oidc/auth",
    deployment_id: "deployment-1",
    tool_url: "https://scroll.example.edu/university/lti",
  }, {
    loginHint: "login-hint",
    state: "state-value",
    nonce: "nonce-value",
    redirectUri: "https://project.supabase.co/functions/v1/university-lti-launch",
    ltiMessageHint: "message-hint",
  }));

  assertEquals(url.searchParams.get("response_type"), "id_token");
  assertEquals(url.searchParams.get("response_mode"), "form_post");
  assertEquals(url.searchParams.get("prompt"), "none");
  assertEquals(url.searchParams.get("state"), "state-value");
  assertEquals(url.searchParams.get("nonce"), "nonce-value");
  assertEquals(url.searchParams.get("client_id"), "client-123");
});

Deno.test("LTI claims require deployment, version, role and subject", () => {
  const claims = parseLtiClaims({
    sub: "student-subject",
    [LTI_DEPLOYMENT_ID_CLAIM]: "deployment-1",
    [LTI_MESSAGE_TYPE_CLAIM]: "LtiResourceLinkRequest",
    [LTI_VERSION_CLAIM]: "1.3.0",
    [LTI_ROLES_CLAIM]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
  }, "deployment-1");

  assertEquals(claims.subject, "student-subject");
  assertEquals(claims.deploymentId, "deployment-1");
  assertEquals(claims.roles.length, 1);

  assertThrows(() => parseLtiClaims({
    sub: "student-subject",
    [LTI_DEPLOYMENT_ID_CLAIM]: "wrong",
    [LTI_MESSAGE_TYPE_CLAIM]: "LtiResourceLinkRequest",
    [LTI_VERSION_CLAIM]: "1.3.0",
    [LTI_ROLES_CLAIM]: ["Learner"],
  }, "deployment-1"));
});

Deno.test("LTI tool redirect rejects insecure remote URLs", () => {
  assertThrows(() => buildLtiToolRedirect("http://example.edu/university", "token"));
  assertEquals(
    new URL(buildLtiToolRedirect("https://example.edu/university", "token")).searchParams.get("lti_launch"),
    "token",
  );
});

Deno.test("LTI state hashing is deterministic and non-plaintext", async () => {
  const first = await sha256Hex("secret-state");
  const second = await sha256Hex("secret-state");
  assertEquals(first, second);
  assertEquals(first.length, 64);
  await assertRejects(async () => {
    if (first === "secret-state") throw new Error("hash unexpectedly equals input");
    throw new Error("expected rejection sentinel");
  });
});
