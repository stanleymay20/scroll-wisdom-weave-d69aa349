import { describe, expect, it } from 'vitest';
import { resolveSupabaseBuildUrl } from '../../../scripts/supabase-build-config.mjs';
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
