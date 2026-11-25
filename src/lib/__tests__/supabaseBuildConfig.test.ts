import { describe, expect, it } from 'vitest';
import { resolveSupabaseBuildUrl, resolveSupabaseBuildPublishableKey } from '../../../scripts/supabase-build-config.mjs';
describe('public Supabase build URL', () => {
  it('preserves explicitly configured endpoints, including local tests', () => {
    expect(resolveSupabaseBuildUrl('http://127.0.0.1:54321', 'project_id = "lrricdforqfkaaciammv"')).toBe('http://127.0.0.1:54321');
  });
  it('resolves the committed project when hosted builds omit the URL', () => {
    expect(resolveSupabaseBuildUrl(undefined, 'project_id = "lrricdforqfkaaciammv"')).toBe('https://lrricdforqfkaaciammv.supabase.co');
  });
  it('fails clearly for missing or invalid project configuration', () => {
    expect(() => resolveSupabaseBuildUrl('', 'project_id = "local-project"')).toThrow('Set VITE_SUPABASE_URL');
  });
});

describe('public Supabase build publishable key', () => {
  const config = 'project_id = "lrricdforqfkaaciammv"';
  it('preserves an explicitly configured key', () => {
    expect(resolveSupabaseBuildPublishableKey('explicit-key', config)).toBe('explicit-key');
  });
  it('falls back to the committed project anon key when hosted builds omit it', () => {
    const key = resolveSupabaseBuildPublishableKey(undefined, config);
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ ref: 'lrricdforqfkaaciammv', role: 'anon' });
  });
  it('fails clearly for an unknown project', () => {
    expect(() => resolveSupabaseBuildPublishableKey('', 'project_id = "abcdefghijklmnopqrst"')).toThrow('Set VITE_SUPABASE_PUBLISHABLE_KEY');
  });
});
