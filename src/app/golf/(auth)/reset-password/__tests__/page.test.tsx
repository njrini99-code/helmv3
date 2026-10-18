import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import ResetPasswordPage from '../page';
import { requestPasswordResetAction } from '@/app/golf/actions/auth';

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { verifyOtp, exchangeCodeForSession, updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/app/golf/actions/auth', () => ({
  requestPasswordResetAction: vi.fn(),
}));

const mockedResend = vi.mocked(requestPasswordResetAction);
const GOOD = 'Fairway#2026';

function openWith(search: string) {
  window.history.replaceState({}, '', `/golf/reset-password${search}`);
}

beforeEach(() => {
  verifyOtp.mockResolvedValue({ data: { user: { email: 'coach@example.edu' }, session: {} }, error: null });
  exchangeCodeForSession.mockResolvedValue({ data: { session: { user: { email: 'coach@example.edu' } } }, error: null });
  updateUser.mockResolvedValue({ data: {}, error: null });
  signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function readyForm() {
  openWith('?token_hash=hash123&type=recovery');
  const view = render(<ResetPasswordPage />);
  await screen.findByRole('heading', { name: 'Choose a new password' });
  return view;
}

describe('golf reset password page', () => {
  it('verifies a token_hash link, names the account and strips the token from the URL', async () => {
    await readyForm();
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'hash123' });
    expect(screen.getByText('coach@example.edu')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('exchanges a PKCE code link', async () => {
    openWith('?code=abc');
    render(<ResetPasswordPage />);
    await screen.findByRole('heading', { name: 'Choose a new password' });
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('shows the expired state for a link with no token, or one Supabase rejects', async () => {
    openWith('');
    const { unmount } = render(<ResetPasswordPage />);
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument();
    unmount();

    verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: 'Token has expired or is invalid', code: 'otp_expired' } });
    openWith('?token_hash=old&type=recovery');
    render(<ResetPasswordPage />);
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument();
  });

  it('ticks off the sign-up rules as the password is typed', async () => {
    const { user } = await readyForm();
    const rule = (name: RegExp) => screen.getByText(name).closest('li');

    await user.type(screen.getByLabelText('New password'), 'fairway');
    expect(rule(/8 or more characters/)).toHaveAttribute('data-met', 'false');
    expect(rule(/Upper and lower case/)).toHaveAttribute('data-met', 'false');

    await user.type(screen.getByLabelText('New password'), 'X1');
    expect(rule(/8 or more characters/)).toHaveAttribute('data-met', 'true');
    expect(rule(/Upper and lower case/)).toHaveAttribute('data-met', 'true');
    expect(rule(/A number/)).toHaveAttribute('data-met', 'true');
    expect(rule(/A symbol/)).toHaveAttribute('data-met', 'false');
  });

  it('keeps Save enabled and says what is missing instead of submitting', async () => {
    const { user } = await readyForm();
    const save = screen.getByRole('button', { name: 'Save password' });
    expect(save).toBeEnabled();

    await user.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a new password.');

    await user.type(screen.getByLabelText('New password'), 'Fairway2026');
    await user.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your password needs a symbol.');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('flags a mismatched confirmation', async () => {
    const { user } = await readyForm();
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm new password'), `${GOOD}x`);
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('These passwords don’t match.');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('saves, signs out other devices and offers to continue', async () => {
    const { user } = await readyForm();
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm new password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({ password: GOOD });
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(screen.getByText(/other devices were signed out/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue to GolfHelm' }));
    expect(push).toHaveBeenCalledWith('/golf/dashboard');
  });

  it('maps Supabase errors to plain sentences', async () => {
    updateUser.mockResolvedValueOnce({
      data: {},
      error: { code: 'same_password', message: 'New password should be different from the old password.' },
    });
    const { user } = await readyForm();
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm new password'), GOOD);
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a password you haven’t used here before.');
    expect(screen.queryByText(/different from the old password/)).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('sends a new link from the expired state', async () => {
    mockedResend.mockResolvedValue({ success: true, message: 'ok' });
    openWith('');
    const { user } = render(<ResetPasswordPage />);
    await screen.findByRole('heading', { name: 'This link has expired' });

    await user.type(screen.getByLabelText('Email'), '  Coach@Example.EDU ');
    await user.click(screen.getByRole('button', { name: 'Send a new link' }));

    await waitFor(() => expect(mockedResend).toHaveBeenCalledWith('coach@example.edu'));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('coach@example.edu')).toBeInTheDocument();
  });
});
