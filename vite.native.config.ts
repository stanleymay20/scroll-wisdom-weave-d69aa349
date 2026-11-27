import { defineConfig, loadConfigFromFile, type Plugin } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { resolveNativeBetaEnvironment, nativeAssetDigest } from './scripts/native-beta-config.mjs';

export default defineConfig(async () => {
  const webProjectId = /^project_id\s*=\s*"([a-z0-9]{20})"/m.exec(readFileSync('supabase/config.toml', 'utf8'))?.[1];
  const beta = resolveNativeBetaEnvironment(process.env, webProjectId);
  // Override all public values before loading the unchanged web build config.
  process.env.VITE_SUPABASE_URL = beta.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = beta.key;
  process.env.VITE_SUPABASE_PROJECT_ID = beta.projectId;
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'native-beta' }, path.resolve('vite.config.ts'));
  if (!loaded) throw new Error('Cannot load the existing web build configuration.');
  const outDir = 'dist-native.local';
  return {
    ...loaded.config,
    build: { ...loaded.config.build, outDir, emptyOutDir: true },
    plugins: [
      ...(loaded.config.plugins ?? []).flat().filter((plugin) => !(plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'scrolllibrary-release-identity')),
      {
        name: 'native-beta-identity',
        closeBundle() {
          const walk = (dir: string): Array<[string, Buffer]> => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const target = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(target) : [[path.relative(outDir, target), readFileSync(target)] as [string, Buffer]];
          });
          writeFileSync(path.join(outDir, 'native-beta.json'), JSON.stringify({
            schemaVersion: 1, environment: 'test', projectId: beta.projectId,
            commit: process.env.GITHUB_SHA ?? null, assetsSha256: nativeAssetDigest(walk(outDir)),
          }, null, 2));
        },
      } satisfies Plugin,
    ],
  };
});