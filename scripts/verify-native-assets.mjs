import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { resolveNativeBetaEnvironment, nativeAssetDigest } from './native-beta-config.mjs';

const webProjectId = /^project_id\s*=\s*"([a-z0-9]{20})"/m.exec(readFileSync('supabase/config.toml', 'utf8'))?.[1];
const beta = resolveNativeBetaEnvironment(process.env, webProjectId);
const root = 'dist-native.local';
const identity = JSON.parse(readFileSync(path.join(root, 'native-beta.json'), 'utf8'));
if (identity.environment !== 'test' || identity.projectId !== beta.projectId) throw new Error('Native asset Test identity mismatch. Rebuild.');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(target) : [[path.relative(root, target), readFileSync(target)]];
});
const assets = walk(root).filter(([name]) => name !== 'native-beta.json');
if (!assets.some(([name]) => name === 'index.html') || nativeAssetDigest(assets) !== identity.assetsSha256) {
  throw new Error('Native assets are incomplete or changed. Rebuild before syncing.');
}
if (assets.some(([name]) => /(^|\/)(sw\.js|workbox-[^/]+\.js)$/.test(name))) throw new Error('Native beta must not bundle a service worker.');
console.log('Verified complete, unchanged Test-only native assets.');