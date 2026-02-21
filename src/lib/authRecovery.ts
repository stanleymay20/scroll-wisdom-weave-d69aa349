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

/**
 * Returns true only when the hash contains recovery-specific tokens.
 * Normal OAuth callbacks also carry access_token+refresh_token but lack type=recovery.
 */
export function hasRecoveryTokens(hash: string): boolean {
  const tokens = parseHashTokens(hash);
  if (!tokens?.access_token || !tokens?.refresh_token) return false;
  return tokens.type === "recovery";
}

/**
 * Detects whether a URL represents a PKCE recovery flow.
 * Recovery emails include both ?code= AND a mode/type hint.
 */
export function isRecoveryCode(url: URL): boolean {
  const code = url.searchParams.get("code");
  if (!code) return false;
  // Supabase recovery emails set ?type=recovery or the redirect includes mode=reset-password
  const type = url.searchParams.get("type");
  const mode = url.searchParams.get("mode");
  return type === "recovery" || mode === "reset-password";
}
