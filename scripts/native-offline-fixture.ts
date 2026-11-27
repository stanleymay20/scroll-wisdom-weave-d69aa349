import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import config from '../capacitor.config';
import { assertNativeAppId, nativeAssetDigest } from './native-beta-config.mjs';

assertNativeAppId(config.appId);
if (config.server?.url || config.server?.cleartext !== false || config.android?.allowMixedContent !== false) {
  throw new Error('Offline compile fixtures require packaged assets and secure transport; no remote server override is allowed.');
}
const root = config.webDir;
if (root !== 'dist-native.local') throw new Error('Refusing to write fixture outside the isolated native output directory.');
// Not the ScrollLibrary web app. No client, credentials, scripts or network.
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>ScrollLibrary — OFFLINE COMPILE FIXTURE</title></head><body>
<main><h1>ScrollLibrary beta</h1><h2>OFFLINE COMPILE FIXTURE — NOT DISTRIBUTABLE</h2>
<p>This is a native packaging check, not the ScrollLibrary app.</p>
<p>No backend connection, sign-in, payments, books or account data are included.</p>
<p>Beta identifier: ${config.appId}</p></main></body></html>\n`;
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
writeFileSync(`${root}/index.html`, html);
writeFileSync(`${root}/native-beta.json`, JSON.stringify({
  schemaVersion: 1, environment: 'offline-compile-fixture', distributable: false,
  appId: config.appId, assetsSha256: nativeAssetDigest([['index.html', Buffer.from(html)]]),
}, null, 2));
console.log('Created OFFLINE COMPILE FIXTURE — NOT DISTRIBUTABLE; no backend configuration used.');