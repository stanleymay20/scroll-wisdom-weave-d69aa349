export type RecoveryTokens = {
  access_token: string;
  refresh_token: string;
  type?: string;
};

/**
 * Parses OAuth/recovery tokens from the URL hash.
 * Supplied by the auth provider as: #access_token=...&refresh_token=...&type=recovery
 */
export function parseHashTokens(hash: string): RecoveryTokens | null {
  const raw = (hash || "").startsWith("#") ? (hash || "").slice(1) : (hash || "");
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  const access_token = params.get("access_token") || "";
  const refresh_token = params.get("refresh_token") || "";
  const type = params.get("type") || undefined;

  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, type };
}

export function hasRecoveryTokens(hash: string): boolean {
  const tokens = parseHashTokens(hash);
  return Boolean(tokens?.access_token && tokens?.refresh_token);
}
