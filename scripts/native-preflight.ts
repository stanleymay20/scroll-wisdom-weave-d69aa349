import config from '../capacitor.config';
import { readFileSync } from 'node:fs';
import { assertNativeAppId, resolveNativeBetaEnvironment } from './native-beta-config.mjs';

try {
  assertNativeAppId(config.appId);
  if (config.server?.url || config.server?.cleartext !== false || config.android?.allowMixedContent !== false) {
    throw new Error('Native beta must use packaged assets with secure transport.');
  }
  const webProjectId = /^project_id\s*=\s*"([a-z0-9]{20})"/m.exec(readFileSync('supabase/config.toml', 'utf8'))?.[1];
  resolveNativeBetaEnvironment(process.env, webProjectId);
  console.log('Native app identity and Test-only configuration passed preflight.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Native preflight failed.');
  process.exitCode = 1;
}