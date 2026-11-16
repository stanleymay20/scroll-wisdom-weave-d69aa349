import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionProvider, useSubscription } from '../SubscriptionContext';

const mock = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: string, session: any) => void),
  getSession: vi.fn(), invoke: vi.fn(), profile: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: mock.getSession,
    onAuthStateChange: vi.fn((listener) => { mock.listener = listener; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; }),
  },
  functions: { invoke: mock.invoke },
  from: () => ({ select: () => ({ or: () => ({ maybeSingle: mock.profile }), eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }) }),
} }));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function Probe() { const s = useSubscription(); return <div data-testid="state">{JSON.stringify({ id: s.user?.id ?? null, loading: s.isLoading, tier: s.tier })}</div>; }
function state() { return JSON.parse(screen.getByTestId('state').textContent!); }
const session = (id: string) => ({ user: { id } });
async function event(name: string, value: any) { await act(async () => { mock.listener!(name, value); }); }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(1); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mock.profile.mockResolvedValue({ data: null, error: null });
  mock.invoke.mockResolvedValue({ data: { subscribed: false }, error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('auth lifecycle', () => {
  it('opens authenticated routes while billing is still pending', async () => {
    mock.invoke.mockReturnValue(new Promise(() => {}));
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await event('SIGNED_IN', session('a')); await tick();
    expect(state()).toEqual({ id: 'a', loading: false, tier: 'free' });
  });
  it('does not resurrect a signed-out user from late bootstrap', async () => {
    const initial = deferred<any>(); mock.getSession.mockReturnValue(initial.promise);
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await event('SIGNED_OUT', null);
    await act(async () => initial.resolve({ data: { session: session('a') }, error: null }));
    expect(state().id).toBeNull();
  });
  it('discards paid entitlements returned after logout', async () => {
    const bill = deferred<any>(); mock.invoke.mockReturnValue(bill.promise);
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await event('SIGNED_IN', session('a')); await tick();
    await event('SIGNED_OUT', null);
    await act(async () => bill.resolve({ data: { subscribed: true, tier: 'pro' }, error: null }));
    expect(state()).toEqual({ id: null, loading: false, tier: 'free' });
  });
  it('discards old-account responses when switching accounts', async () => {
    const bill = deferred<any>(); mock.invoke.mockReturnValueOnce(bill.promise);
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await event('SIGNED_IN', session('a')); await tick();
    await event('SIGNED_IN', session('b')); await tick();
    await act(async () => bill.resolve({ data: { subscribed: true, tier: 'pro' }, error: null }));
    expect(state()).toEqual({ id: 'b', loading: false, tier: 'free' });
  });
  it('keeps identity when billing fails', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: new Error('billing unavailable') });
    render(<SubscriptionProvider><Probe /></SubscriptionProvider>);
    await event('SIGNED_IN', session('a')); await tick();
    expect(state().id).toBe('a'); expect(state().loading).toBe(false);
  });
});
