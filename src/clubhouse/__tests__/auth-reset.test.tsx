import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The new-password page in the sign-in room (P015, front-door completion): every number in catalog/auth.md. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/golf/actions/auth', () => ({ loginAction: vi.fn(), requestPasswordResetAction: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: () => null }));

import { describeResetFailure as todays } from '../../app/golf/(auth)/reset-password/reset-errors';
import { ResetPassword } from '../screens/auth/ResetPassword';
import { describeResetFailure, resetFieldProblem, RESET_LINK_EXPIRED, sameAccount } from '../screens/auth/reset-state';
import type { ResetWrites } from '../screens/auth/reset-writes';

const GOOD = 'Birdie#2026';
const SENT = { success: true, message: 'If an account exists with this email, a password reset link will be sent.' };

function writes(over: Partial<ResetWrites> = {}): ResetWrites {
  return {
    verifyLink: vi.fn(async () => ({ ok: true as const, email: 'maya@university.edu', previous: null })),
    savePassword: vi.fn(async () => ({ ok: true as const })),
    revokeOthers: vi.fn(async () => undefined),
    requestReset: vi.fn(async () => SENT),
    ...over,
  };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
  window.history.replaceState(null, '', '/golf/reset-password?token_hash=abc123');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const heading = (name: string | RegExp) => screen.findByRole('heading', { name });
const newPw = () => screen.getByLabelText('New password') as HTMLInputElement;
const confirmPw = () => screen.getByLabelText('Confirm new password') as HTMLInputElement;
const save = () => screen.getByRole('button', { name: /^saving|^save password/i });

describe('the link is checked', () => {
  it('CH-15430 the link is verified once, with its token_hash, and the form follows; the one-time token leaves the address bar', async () => {
    const w = writes();
    render(<ResetPassword writes={w} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your link');
    await heading('Choose a new password');
    expect(w.verifyLink).toHaveBeenCalledTimes(1);
    expect(w.verifyLink).toHaveBeenCalledWith('abc123');
    expect(window.location.search).toBe('');
    expect(screen.getByText('maya@university.edu')).toBeInTheDocument();
  });

  it('CH-15930 a spent link lands on "expired" with one way forward, and a link with no token_hash is the same', async () => {
    window.history.replaceState(null, '', '/golf/reset-password');
    const w = writes({ verifyLink: vi.fn(async () => ({ ok: false as const })) });
    render(<ResetPassword writes={w} />);
    await heading('This link has expired');
    expect(w.verifyLink).toHaveBeenCalledWith('');
    expect(screen.getByText(RESET_LINK_EXPIRED)).toBeInTheDocument();
  });

  it('CH-15930 asking for a new link goes through the same action, trimmed and lowercased, and says the same thing whoever it was for', async () => {
    const user = userEvent.setup();
    const w = writes({ verifyLink: vi.fn(async () => ({ ok: false as const })) });
    render(<ResetPassword writes={w} />);
    await heading('This link has expired');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), '  Maya@University.edu ');
    await user.click(screen.getByRole('button', { name: /send a new link/i }));
    await heading('Check your email');
    expect(w.requestReset).toHaveBeenCalledWith('maya@university.edu');
    expect(screen.getByText(/It expires in 1 hour/)).toBeInTheDocument();
  });

  it('CH-15931 the link replaces whoever was signed in on this device, and says so', async () => {
    const w = writes({ verifyLink: vi.fn(async () => ({ ok: true as const, email: 'maya@university.edu', previous: 'theo@university.edu' })) });
    render(<ResetPassword writes={w} />);
    await heading('Choose a new password');
    expect(screen.getByRole('status')).toHaveTextContent('You were signed in as theo@university.edu on this device, and that session has ended.');
  });
});

describe('choosing a password', () => {
  it('CH-15130 CH-15131 CH-15132 CH-15133 the checks, in order: nothing, a rule, no confirmation, two different', async () => {
    const user = userEvent.setup();
    const w = writes();
    render(<ResetPassword writes={w} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    await user.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a new password.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15130');
    await user.type(newPw(), 'short');
    await user.click(save());
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15131');
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.');
    await user.clear(newPw());
    await user.type(newPw(), GOOD);
    await user.click(save());
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15132');
    await user.type(confirmPw(), 'Birdie#2027');
    await user.click(save());
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15133');
    expect(screen.getByRole('alert')).toHaveTextContent('These passwords don’t match.');
    expect(w.savePassword).not.toHaveBeenCalled();
    expect(confirmPw()).toHaveFocus();
    expect(resetFieldProblem(GOOD, GOOD)).toBeNull();
  });

  it('the rules tick off as the password is typed, and are the server’s four', async () => {
    const user = userEvent.setup();
    render(<ResetPassword writes={writes()} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    const rules = screen.getByRole('list', { name: 'Password needs' });
    expect(rules.querySelectorAll('[data-ok]')).toHaveLength(0);
    await user.type(newPw(), GOOD);
    expect(rules.querySelectorAll('[data-ok]')).toHaveLength(4);
    expect(screen.getByText('4 of 4 requirements met')).toBeInTheDocument();
  });

  it('CH-15431 CH-15932 saving: updateUser, then every other session signed out, then "Password updated"; Continue goes to the dashboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const order: string[] = [];
    const w = writes({
      savePassword: vi.fn(async () => (order.push('save'), { ok: true as const })),
      revokeOthers: vi.fn(async () => void order.push('revoke')),
    });
    render(<ResetPassword writes={w} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    await user.type(newPw(), GOOD);
    await user.type(confirmPw(), GOOD);
    await user.click(save());
    await heading('Password updated');
    expect(w.savePassword).toHaveBeenCalledWith(GOOD);
    expect(order).toEqual(['save', 'revoke']);
    expect(screen.getByText('For your security, your other devices were signed out.')).toBeInTheDocument();
    expect(hapticSpy).toHaveBeenCalledWith('press');
    await user.click(screen.getByRole('button', { name: /continue to golfhelm/i }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard');
    vi.useRealTimers();
  });

  it('CH-15030 a password the server refuses is said under the field, in the words of today’s page', async () => {
    const user = userEvent.setup();
    const w = writes({ savePassword: vi.fn(async () => ({ ok: false as const, failure: describeResetFailure({ code: 'weak_password' }) })) });
    render(<ResetPassword writes={w} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    await user.type(newPw(), GOOD);
    await user.type(confirmPw(), GOOD);
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('That password is too easy to guess. Try a longer one.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15030');
    expect(newPw()).toHaveFocus();
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });

  it('CH-15031 a failure that is not about the password is a notice, and Save is on again', async () => {
    const user = userEvent.setup();
    const w = writes({ savePassword: vi.fn(async () => ({ ok: false as const, failure: describeResetFailure({ status: 429 }) })) });
    render(<ResetPassword writes={w} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    await user.type(newPw(), GOOD);
    await user.type(confirmPw(), GOOD);
    await user.click(save());
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Too many tries. Wait a minute, then try again.');
    expect(notice).toHaveAttribute('data-ch-code', 'CH-15031');
    expect(save()).toBeEnabled();
  });

  it('CH-15930 a session that ran out between the check and Save sends them to ask for a new link', async () => {
    const user = userEvent.setup();
    const w = writes({ savePassword: vi.fn(async () => ({ ok: false as const, failure: describeResetFailure({ code: 'session_not_found' }) })) });
    render(<ResetPassword writes={w} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    await user.type(newPw(), GOOD);
    await user.type(confirmPw(), GOOD);
    await user.click(save());
    await heading('This link has expired');
  });

  it('a second press while saving saves nothing twice', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const w = writes({ savePassword: vi.fn(() => new Promise<{ ok: true }>((r) => (release = () => r({ ok: true })))) });
    render(<ResetPassword writes={w} initial={{ stage: 'form', email: 'maya@university.edu' }} />);
    await user.type(newPw(), GOOD);
    await user.type(confirmPw(), GOOD);
    await user.click(save());
    await waitFor(() => expect(save()).toBeDisabled());
    await user.keyboard('{Enter}');
    expect(w.savePassword).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });
});

describe('the words and the calls are today’s', () => {
  it('describeResetFailure answers every case as today’s page does', () => {
    const cases = [{ code: 'same_password' }, { code: 'weak_password' }, { message: 'Password is pwned' }, { code: 'session_not_found' }, { status: 401 }, { message: 'Auth session missing!' }, { status: 429 }, { name: 'AuthRetryableFetchError' }, { message: 'Failed to fetch' }, { message: 'something else' }, {}];
    for (const c of cases) expect(describeResetFailure(c)).toEqual(todays(c));
  });

  it('the expired sentence is today’s', () => {
    const page = readFileSync('src/app/golf/(auth)/reset-password/page.tsx', 'utf8').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    expect(page).toContain(RESET_LINK_EXPIRED.replace('we’ll', 'we’ll').slice(0, 40));
    expect(page).toContain('Enter your email and we’ll send a new one.');
  });

  it('the page calls the same three Supabase auth methods in today’s order', () => {
    const mine = readFileSync('src/clubhouse/screens/auth/reset-writes.ts', 'utf8');
    const today = readFileSync('src/app/golf/(auth)/reset-password/page.tsx', 'utf8');
    for (const call of ['verifyOtp(', "type: 'recovery'", 'updateUser({ password })', "scope: 'others'"]) {
      expect(mine).toContain(call);
      expect(today).toContain(call);
    }
    expect(sameAccount(' Maya@x.edu', 'maya@x.edu')).toBe(true);
  });
});
