import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

describe('native build configuration', () => {
  it('reuses React while isolating output and removing web release writes', async () => {
    const projectId = 'abcdefghijklmnopqrst';
    // Resolve config in a plain Node process: esbuild cannot run in jsdom's
    // cross-realm typed-array environment. This does not build or use a backend.
    const result = spawnSync('node', ['--input-type=module', '-e', `
      import { resolveConfig } from 'vite';
      const config = await resolveConfig({ configFile: 'vite.native.config.ts', mode: 'native-beta' }, 'build');
      console.log(JSON.stringify({ outDir: config.build.outDir,
        plugins: config.plugins.map(p => p.name),
        project: config.define['import.meta.env.VITE_SUPABASE_PROJECT_ID'],
        endpoint: config.define['import.meta.env.VITE_SUPABASE_URL'] }));
    `], {
      encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, MOBILE_TEST_BACKEND_CONFIRMED: 'true',
        MOBILE_TEST_PROJECT_ID: projectId, MOBILE_TEST_BACKEND_URL: `https://${projectId}.supabase.co`,
        MOBILE_TEST_PUBLISHABLE_KEY: 'sb_publishable_offline_config_test' },
    });
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout.trim());
    expect(config.outDir).toBe('dist-native.local');
    expect(config.plugins.some((name: string) => name.includes('react-swc'))).toBe(true);
    expect(config.plugins).not.toContain('scrolllibrary-release-identity');
    expect(config.plugins).toContain('native-beta-identity');
    expect(config.project).toBe(JSON.stringify(projectId));
    expect(config.endpoint).toBe(JSON.stringify(`https://${projectId}.supabase.co`));
    expect(config.plugins.some((name: string) => name.startsWith('vite-plugin-pwa'))).toBe(false);
  });
});