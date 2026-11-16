/** Public build configuration only. Never read service-role keys here. */
export function resolveSupabaseBuildUrl(envUrl, configText) {
  if (envUrl?.trim()) return envUrl.trim();
  const projectRef = /^project_id\s*=\s*"([a-z0-9]{20})"\s*$/m.exec(configText)?.[1];
  if (!projectRef) throw new Error('Set VITE_SUPABASE_URL or a valid project_id in supabase/config.toml before building.');
  return `https://${projectRef}.supabase.co`;
}
