import { describe, expect, it } from 'vitest';
import config from '../../../capacitor.config';
import { assertNativeAppId, assertNativeAssetIdentity, nativeAssetDigest, resolveNativeBetaEnvironment } from '../../../scripts/native-beta-config.mjs';

const projectId = 'abcdefghijklmnopqrst';
const webProjectId = 'zyxwvutsrqponmlkjihg';
const key = `e30.${Buffer.from(JSON.stringify({ role: 'anon', ref: projectId })).toString('base64url')}.test`;
const env = { MOBILE_TEST_BACKEND_CONFIRMED: 'true', MOBILE_TEST_PROJECT_ID: projectId, MOBILE_TEST_BACKEND_URL: `https://${projectId}.supabase.co`, MOBILE_TEST_PUBLISHABLE_KEY: key };

describe('native beta boundaries', () => {
  it('uses the owner-approved reversible beta-only identity', () => {
    expect(config.appId).toBe('org.scrolllibrary.beta');
    expect(() => assertNativeAppId(config.appId)).not.toThrow();
    expect(() => assertNativeAppId('app.lovable.8a3582c02c2b49a9957f5eb218b15058')).toThrow();
  });
  it('packages local assets without preview server or insecure transport', () => {
    expect(config.webDir).toBe('dist-native.local');
    expect(config.server?.url).toBeUndefined();
    expect(config.server?.cleartext).toBe(false);
    expect(config.android?.allowMixedContent).toBe(false);
  });
  it('requires explicit isolated Test confirmation', () => {
    expect(() => resolveNativeBetaEnvironment({ ...env, MOBILE_TEST_BACKEND_CONFIRMED: undefined }, webProjectId)).toThrow();
    expect(() => resolveNativeBetaEnvironment(env, projectId)).toThrow();
    expect(resolveNativeBetaEnvironment(env, webProjectId).projectId).toBe(projectId);
  });
  it('rejects HTTP and a mismatched endpoint', () => {
    expect(() => resolveNativeBetaEnvironment({ ...env, MOBILE_TEST_BACKEND_URL: `http://${projectId}.supabase.co` }, webProjectId)).toThrow();
    expect(() => resolveNativeBetaEnvironment({ ...env, MOBILE_TEST_BACKEND_URL: `https://${webProjectId}.supabase.co` }, webProjectId)).toThrow();
  });
  it('rejects private or mismatched keys', () => {
    for (const claims of [{ role: 'service_role', ref: projectId }, { role: 'anon', ref: webProjectId }]) {
      const invalidKey = `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`;
      expect(() => resolveNativeBetaEnvironment({ ...env, MOBILE_TEST_PUBLISHABLE_KEY: invalidKey }, webProjectId)).toThrow();
    }
  });
  it('binds sync to exact file content and names', () => {
    const original = nativeAssetDigest([['index.html', Buffer.from('app')]]);
    expect(nativeAssetDigest([['index.html', Buffer.from('changed')]])).not.toBe(original);
    expect(nativeAssetDigest([['other.html', Buffer.from('app')]])).not.toBe(original);
  });
  it('accepts offline compile fixtures only with explicit non-distributable fixture sync', () => {
    const fixture = { environment: 'offline-compile-fixture', distributable: false, appId: 'org.scrolllibrary.beta' };
    expect(() => assertNativeAssetIdentity(fixture, { compileFixture: true, appId: config.appId })).not.toThrow();
    expect(() => assertNativeAssetIdentity(fixture, { compileFixture: false, appId: config.appId, beta: { projectId } })).toThrow();
    expect(() => assertNativeAssetIdentity({ ...fixture, distributable: true }, { compileFixture: true, appId: config.appId })).toThrow();
    expect(() => assertNativeAssetIdentity({ ...fixture, appId: 'org.example.other' }, { compileFixture: true, appId: config.appId })).toThrow();
    expect(() => assertNativeAssetIdentity({ environment: 'test', projectId }, { compileFixture: true, appId: config.appId })).toThrow();
  });
});