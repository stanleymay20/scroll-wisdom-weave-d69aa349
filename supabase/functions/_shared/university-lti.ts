export const LTI_MESSAGE_TYPE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/message_type";
export const LTI_VERSION_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/version";
export const LTI_DEPLOYMENT_ID_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
export const LTI_ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles";
export const LTI_CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context";
export const LTI_RESOURCE_LINK_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/resource_link";
export const LTI_CUSTOM_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/custom";

export interface LtiConnectionMetadata {
  issuer: string;
  client_id: string;
  auth_login_url: string;
  deployment_id: string | null;
  tool_url: string;
}

export interface ParsedLtiClaims {
  subject: string;
  deploymentId: string;
  messageType: string;
  version: string;
  roles: string[];
  context: Record<string, unknown>;
  resourceLink: Record<string, unknown>;
  custom: Record<string, unknown>;
}

export function randomUrlSafe(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildLtiAuthorizationUrl(
  connection: LtiConnectionMetadata,
  params: {
    loginHint: string;
    state: string;
    nonce: string;
    redirectUri: string;
    ltiMessageHint?: string | null;
  },
): string {
  const url = new URL(connection.auth_login_url);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("prompt", "none");
  url.searchParams.set("client_id", connection.client_id);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("login_hint", params.loginHint);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  if (params.ltiMessageHint) url.searchParams.set("lti_message_hint", params.ltiMessageHint);
  return url.toString();
}

function objectClaim(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseLtiClaims(
  payload: Record<string, unknown>,
  expectedDeploymentId?: string | null,
): ParsedLtiClaims {
  const subject = typeof payload.sub === "string" ? payload.sub : "";
  const deploymentId = typeof payload[LTI_DEPLOYMENT_ID_CLAIM] === "string"
    ? payload[LTI_DEPLOYMENT_ID_CLAIM] as string
    : "";
  const messageType = typeof payload[LTI_MESSAGE_TYPE_CLAIM] === "string"
    ? payload[LTI_MESSAGE_TYPE_CLAIM] as string
    : "";
  const version = typeof payload[LTI_VERSION_CLAIM] === "string"
    ? payload[LTI_VERSION_CLAIM] as string
    : "";
  const rolesValue = payload[LTI_ROLES_CLAIM];
  const roles = Array.isArray(rolesValue)
    ? rolesValue.filter((role): role is string => typeof role === "string")
    : [];

  if (!subject) throw new Error("LTI launch is missing subject.");
  if (!deploymentId) throw new Error("LTI launch is missing deployment_id.");
  if (expectedDeploymentId && deploymentId !== expectedDeploymentId) {
    throw new Error("LTI deployment_id does not match the registered deployment.");
  }
  if (!messageType) throw new Error("LTI launch is missing message_type.");
  if (version !== "1.3.0") throw new Error("Unsupported LTI version.");
  if (roles.length === 0) throw new Error("LTI launch is missing roles.");

  return {
    subject,
    deploymentId,
    messageType,
    version,
    roles,
    context: objectClaim(payload[LTI_CONTEXT_CLAIM]),
    resourceLink: objectClaim(payload[LTI_RESOURCE_LINK_CLAIM]),
    custom: objectClaim(payload[LTI_CUSTOM_CLAIM]),
  };
}

export function buildLtiToolRedirect(toolUrl: string, launchToken: string): string {
  const url = new URL(toolUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("LTI tool URL must use HTTPS.");
  }
  url.searchParams.set("lti_launch", launchToken);
  return url.toString();
}
