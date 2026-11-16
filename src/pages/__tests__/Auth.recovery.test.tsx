import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Auth from '../Auth';
type Session = { user: { id: string } } | null;
type AuthListener = (event: string, session: Session) => void;
const mock = vi.hoisted(() => ({ listener: undefined as AuthListener | undefined, navigate: vi.fn(), session: null as Session, updateUser: vi.fn(), signOut: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => mock.navigate }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  onAuthStateChange: (fn: AuthListener) => { mock.listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
  getSession: async () => ({ data: { session: mock.session }, error: null }),
  updateUser: mock.updateUser, signOut: mock.signOut,
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mock.session = null; window.history.replaceState(null, '', '/'); });
describe('recovery lifecycle', () => {
  it('blocks recovery redirects and allows a new sign-in after password reset', async () => {
    mock.updateUser.mockResolvedValue({ error: null }); mock.signOut.mockResolvedValue({ error: null });
    render(<MemoryRouter><Auth /></MemoryRouter>);
    await act(async () => {});
    mock.session = { user: { id: 'a' } };
    await act(async () => { mock.listener!('PASSWORD_RECOVERY', mock.session); mock.listener!('SIGNED_IN', mock.session); });
    expect(mock.navigate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPassword123!' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update Password' }).closest('form')!);
    await waitFor(() => expect(mock.signOut).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'auth.signin' })).toBeInTheDocument());
    await act(async () => { mock.listener!('SIGNED_IN', mock.session); });
    await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith('/'));
  });
});
