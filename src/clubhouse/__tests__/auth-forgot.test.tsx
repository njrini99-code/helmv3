import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The reset form and check your email in the sign-in panel (P015, owner 2026-10-07): every number in catalog/auth.md. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/error-logging', () => ({ logError }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const login = vi.hoisted(() => vi.fn());
const reset = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/auth', () => ({ loginAction: login, requestPasswordResetAction: reset }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: () => null }));

import { isPlainClick } from '../screens/auth/ForgotPassword';
import { RESET_EMPTY_MESSAGE, RESET_INVALID_MESSAGE, RESET_UNEXPECTED_MESSAGE } from '../screens/auth/forgot-state';
import { SignIn } from '../screens/auth/SignIn';

const at = (path: string) => window.history.replaceState(null, '', path);
const SENT = { success: true, message: 'If an account exists with this email, a password reset link will be sent.' };

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
  sessionStorage.clear();
  at('/golf/login');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// The leaving view of a swap is aria-hidden, so role queries only ever see the live one.
const heading = (name: string) => screen.findByRole('heading', { name });
const email = () => screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement;
const send = () => screen.getByRole('button', { name: /^send(ing)? reset link/i });
const liveFields = () => [...document.querySelectorAll('.ch-au-fields')].find((e) => !e.closest('.ch-swap__body[aria-hidden]'));
const openReset = async (user: ReturnType<typeof userEvent.setup>, typed = 'coach@example.com') => {
  render(<SignIn signIn={login} requestReset={reset} />);
  if (typed) await user.type(email(), typed);
  await user.click(screen.getAllByRole('link', { name: 'Forgot password?' })[0]!);
  await heading('Reset password');
};

describe('the reset form in the sign-in panel', () => {
  it('CH-15920 Forgot password? opens the reset form in place, with the address carried, and keeps today’s page as the href', async () => {
    const user = userEvent.setup();
    await openReset(user);
    expect(email()).toHaveValue('coach@example.com');
    expect(email()).toHaveAttribute('id', 'golf-forgot-email');
    // CH-15820: opened by the person, the field takes focus, as today's page does.
    await waitFor(() => expect(email()).toHaveFocus());
    expect(window.location.search).toBe('?view=forgot');
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('main', { name: 'Reset your password' })).toBeTruthy();
    // A new tab (or no JavaScript) still gets today's page: the links keep their hrefs.
    cleanup();
    at('/golf/login');
    render(<SignIn signIn={login} requestReset={reset} />);
    for (const link of screen.getAllByRole('link', { name: 'Forgot password?' })) expect(link).toHaveAttribute('href', '/golf/forgot-password');
    expect(isPlainClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false } as never)).toBe(true);
    expect(isPlainClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as never)).toBe(false);
    expect(isPlainClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false } as never)).toBe(false);
  });

  it('CH-15920 a link or a reload straight to ?view=forgot opens the reset form; the server markup is always sign in', async () => {
    at('/golf/login?view=forgot');
    render(<SignIn signIn={login} requestReset={reset} />);
    await heading('Reset password');
    expect(email()).toHaveValue('');
  });

  it('CH-15120 CH-15121 CH-15609 refuses an empty or malformed address before anything is sent, marks and shakes the field, and clears on edit', async () => {
    const user = userEvent.setup();
    await openReset(user, '');
    await user.click(send());
    const empty = await screen.findByRole('alert');
    expect(empty).toHaveTextContent(RESET_EMPTY_MESSAGE);
    expect(empty).toHaveAttribute('data-ch-code', 'CH-15120');
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveAttribute('aria-describedby', empty.id);
    expect(hapticSpy).toHaveBeenLastCalledWith('warning');
    expect(liveFields()).toHaveAttribute('data-shake', 'a');
    await user.type(email(), 'not-an-email');
    // Today's page: editing clears the refusal.
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(send());
    const malformed = await screen.findByRole('alert');
    expect(malformed).toHaveTextContent(RESET_INVALID_MESSAGE);
    expect(malformed).toHaveAttribute('data-ch-code', 'CH-15121');
    expect(liveFields()).toHaveAttribute('data-shake', 'b');
    expect(reset).not.toHaveBeenCalled();
  });

  it('CH-15420 CH-15720 CH-15721 CH-15921 sends the trimmed, lowercased address once, then says to check that email', async () => {
    let answer: (v: unknown) => void = () => {};
    reset.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    await openReset(user, '');
    await user.type(email(), '  Coach@Example.COM  ');
    await user.click(send());
    const busy = screen.getByRole('button', { name: /^sending reset link…$/i });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveAttribute('data-ch-code', 'CH-15420');
    expect(busy).toBeDisabled();
    expect(hapticSpy).toHaveBeenCalledWith('press');
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith('coach@example.com');
    await act(async () => answer(SENT));
    const title = await heading('Check your email');
    expect(title.closest('[data-ch-code]')).toHaveAttribute('data-ch-code', 'CH-15921');
    expect(screen.getByText('coach@example.com')).toBeTruthy();
    expect(hapticSpy).toHaveBeenLastCalledWith('success');
    // CH-15820: the heading takes focus, so the change is read out.
    await waitFor(() => expect(title).toHaveFocus());
    expect(window.location.search).toBe('?view=forgot');
  });

  it('CH-15020 CH-15021 a request that fails says so, is logged when it throws, and can be sent again', async () => {
    reset.mockResolvedValueOnce({ success: false, error: 'Too many requests. Please try again later.' }).mockRejectedValueOnce(new Error('fetch failed'));
    const user = userEvent.setup();
    await openReset(user);
    await user.click(send());
    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent('Too many requests. Please try again later.');
    expect(refused).toHaveAttribute('data-ch-code', 'CH-15020');
    expect(hapticSpy).toHaveBeenLastCalledWith('error');
    expect(email()).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(send()).toBeEnabled());
    await user.click(send());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15021'));
    expect(screen.getByRole('alert')).toHaveTextContent(RESET_UNEXPECTED_MESSAGE);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'requestPasswordResetAction' }));
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('CH-15922 Remember it? and Back to sign in return to sign in with the address, and so does the browser’s Back', async () => {
    reset.mockResolvedValue(SENT);
    const user = userEvent.setup();
    await openReset(user, 'first@example.com');
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    const signIn = await heading('Sign in');
    expect(email()).toHaveValue('first@example.com');
    expect(window.location.search).toBe('');
    // CH-15820: back on sign in, its heading takes focus.
    await waitFor(() => expect(signIn).toHaveFocus());

    await user.click(screen.getAllByRole('link', { name: 'Forgot password?' })[0]!);
    await heading('Reset password');
    await user.clear(email());
    await user.type(email(), 'second@example.com');
    await user.click(send());
    await heading('Check your email');
    await user.click(screen.getByRole('link', { name: 'Back to sign in' }));
    await heading('Sign in');
    expect(email()).toHaveValue('second@example.com');

    await user.click(screen.getAllByRole('link', { name: 'Forgot password?' })[0]!);
    await heading('Reset password');
    act(() => {
      at('/golf/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await heading('Sign in');
  });

  it('CH-15612 the views change inside a swap under the lockup, which stays put', () => {
    const { container } = render(<SignIn signIn={login} requestReset={reset} />);
    const stage = container.querySelector('.ch-au-stage') as HTMLElement;
    expect(stage.id).toBe('ch-au-form');
    expect(stage.querySelector(':scope > .ch-au-lock')).not.toBeNull();
    expect(stage.querySelector(':scope > .ch-swap.ch-au-views')).not.toBeNull();
    expect(stage.querySelector('.ch-swap .ch-au-lock')).toBeNull();
  });

  it('keeps today’s rules and words: the reset page and the panel cannot drift', () => {
    // Whitespace folded, so a sentence wrapped over two source lines still matches.
    const today = readFileSync('src/app/golf/(auth)/forgot-password/page.tsx', 'utf8').replace(/\s+/g, ' ');
    const panel = readFileSync('src/clubhouse/screens/auth/ForgotPassword.tsx', 'utf8').replace(/\s+/g, ' ');
    for (const words of [RESET_EMPTY_MESSAGE, RESET_INVALID_MESSAGE, RESET_UNEXPECTED_MESSAGE, String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, 'email.trim().toLowerCase()']) expect(today).toContain(words);
    for (const words of ['Reset password', 'Enter your email and we’ll send you a link.', 'Send reset link', 'Sending reset link…', 'Check your email', 'We sent a reset link to', 'Open the link in the email to choose a new password. It expires in 1 hour. If it doesn’t arrive, check your spam folder or try a different email.', 'Back to sign in', 'Remember it?']) {
      expect(today).toContain(words);
      expect(panel).toContain(words);
    }
  });
});
