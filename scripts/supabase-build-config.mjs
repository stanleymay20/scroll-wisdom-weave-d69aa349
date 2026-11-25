/** Public build configuration only. Never read service-role keys here. */

// Publishable (anon) key of the committed backend project. It is public by
// design (it ships in every browser bundle; RLS protects data). Hosted builds
// have been observed to omit VITE_SUPABASE_* entirely, which produced a blank
// site ("supabaseUrl/supabaseKey is required"), so the build falls back to it.
const COMMITTED_PUBLISHABLE_KEYS = {
  lrricdforqfkaaciammv:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycmljZGZvcnFma2FhY2lhbW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNDQ0MzMsImV4cCI6MjA4MDkyMDQzM30.6BISyNwRSVTryYDrriI1by6lddyNm1UYBKBhQgqXrGg',
};

function committedProjectRef(configText) {
  return /^project_id\s*=\s*"([a-z0-9]{20})"\s*$/m.exec(configText)?.[1];
}

export function resolveSupabaseBuildUrl(envUrl, configText) {
  if (envUrl?.trim()) return envUrl.trim();
  const projectRef = committedProjectRef(configText);
  if (!projectRef) throw new Error('Set VITE_SUPABASE_URL or a valid project_id in supabase/config.toml before building.');
  return `https://${projectRef}.supabase.co`;
}

export function resolveSupabaseBuildPublishableKey(envKey, configText) {
  if (envKey?.trim()) return envKey.trim();
  const projectRef = committedProjectRef(configText);
  const key = projectRef ? COMMITTED_PUBLISHABLE_KEYS[projectRef] : undefined;
  if (!key) throw new Error('Set VITE_SUPABASE_PUBLISHABLE_KEY or a known project_id in supabase/config.toml before building.');
  return key;
}
