// Public configuration only. Never read or accept service-role credentials.
import { createHash } from 'node:crypto';

export function assertNativeAppId(appId) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(appId)) {
    throw new Error('Existing app ID is not Android-compatible. Owner must confirm a valid identity before generating targets; do not silently replace it.');
  }
}

export function resolveNativeBetaEnvironment(env, webProjectId) {
  if (env.MOBILE_TEST_BACKEND_CONFIRMED !== 'true') {
    throw new Error('Native beta requires explicit confirmation of an isolated Test backend.');
  }
  const projectId = env.MOBILE_TEST_PROJECT_ID?.trim();
  const endpoint = env.MOBILE_TEST_BACKEND_URL?.trim();
  const key = env.MOBILE_TEST_PUBLISHABLE_KEY?.trim();
  if (!projectId || !/^[a-z0-9]{20}$/.test(projectId) || projectId === webProjectId) {
    throw new Error('Native beta needs a distinct, verified Test project; the normal web backend is forbidden.');
  }
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Native beta needs a valid Test HTTPS endpoint.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      ![`${projectId}.supabase.co`, `${projectId}.lovable.cloud`].includes(url.hostname)) {
    throw new Error('Native beta endpoint must be HTTPS and match the verified Test project.');
  }
  if (!key) throw new Error('Native beta needs a Test publishable key.');
  if (!key.startsWith('sb_publishable_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()); } catch {
      throw new Error('Native beta accepts only a publishable key.');
    }
    if (claims.role !== 'anon' || claims.ref !== projectId) {
      throw new Error('Native beta key must be anon and match the Test project.');
    }
  }
  return { projectId, url: url.origin, key };
}

export function nativeAssetDigest(assets) {
  const hash = createHash('sha256');
  for (const [name, bytes] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name).update('\0').update(bytes).update('\0');
  }
  return hash.digest('hex');
}