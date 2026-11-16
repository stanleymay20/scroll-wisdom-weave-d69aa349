import { describe, expect, it, vi } from 'vitest';
import { withTransientRetry } from '../authResilience';
describe('Supabase resolved error retries', () => {
  it('retries resolved transient errors', async () => {
    const operation = vi.fn().mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') }).mockResolvedValue({ data: 'ok', error: null });
    expect(await withTransientRetry(operation, 2, 0)).toEqual({ data: 'ok', error: null });
    expect(operation).toHaveBeenCalledTimes(2);
  });
  it('does not retry invalid credentials', async () => {
    const result = { data: null, error: new Error('Invalid login credentials') };
    const operation = vi.fn().mockResolvedValue(result);
    expect(await withTransientRetry(operation, 2, 0)).toBe(result);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('bounds retries for persistent failures', async () => {
    const error = new Error('Failed to fetch'); const operation = vi.fn().mockResolvedValue({ error });
    await expect(withTransientRetry(operation, 1, 0)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
