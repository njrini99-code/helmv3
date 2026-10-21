import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewStaffInviteResult } from '@/app/golf/actions/teams';

/** A coach's staff invitation (P015, front-door completion): every number in catalog/auth.md. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/golf/actions/teams', () => ({ processGolfTeamInvitation: vi.fn(), redeemStaffInvite: vi.fn() }));
vi.mock('@/app/golf/actions/auth', () => ({ signupWithStaffInviteAction: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('../lib/sign-out', () => ({ chEndSession: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: () => null }));

import type { GateWrites } from '../screens/auth/gate-writes';
import { StaffInvite } from '../screens/auth/StaffInvite';
import { roleLabel, staffProblem, wrongAccount } from '../screens/auth/staff-state';

const VALID: PreviewStaffInviteResult = { valid: true, role: 'coach', teamName: 'Varsity Golf', organizationName: 'Pine Needles University' };
const GOOD = 'Birdie#2026';

function gate(over: Partial<GateWrites> = {}): GateWrites {
  return {
    join: vi.fn(),
    redeemStaff: vi.fn(async () => ({ success: true, teams: [{ id: 't', name: 'Varsity Golf', gender: null }], multiTeam: false })),
    signUpStaff: vi.fn(async () => ({ success: true })),
    signedIn: vi.fn(async () => null),
    switchAccount: vi.fn(async () => undefined),
    ...over,
  };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the invitation', () => {
  it('CH-15940 an invitation that is not valid says why, and offers sign in', () => {
    render(<StaffInvite token="t" preview={{ valid: false, error: 'That invitation has expired. Ask your head coach for a new one.' }} writes={gate()} />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15940');
    expect(screen.getByText('That invitation has expired. Ask your head coach for a new one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/golf/login');
    // Nothing about who is signed in is read for an invitation that cannot be used.
  });

  it('CH-15433 reads the session once, then signed in is one button', async () => {
    const w = gate({ signedIn: vi.fn(async () => ({ email: 'jordan@university.edu' })) });
    render(<StaffInvite token="t" preview={VALID} writes={w} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(await screen.findByRole('button', { name: 'Accept invitation' })).toBeInTheDocument();
    expect(w.signedIn).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Assistant coach')).toBeInTheDocument();
    expect(screen.getByText(/jordan@university.edu/)).toBeInTheDocument();
  });

  it('CH-15941 CH-15946 Accept redeems the token and goes on to the dashboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const w = gate({ signedIn: vi.fn(async () => ({ email: 'jordan@university.edu' })) });
    render(<StaffInvite token="tok-1" preview={VALID} writes={w} />);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByRole('heading', { name: 'You’re on the staff' })).toBeInTheDocument();
    expect(w.redeemStaff).toHaveBeenCalledWith('tok-1');
    expect(router.refresh).toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2500)));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard');
  });

  it('CH-15944 CH-15943 an account that belongs to another program is a warning with the way out: switch account, back to this link', async () => {
    const user = userEvent.setup();
    const error = 'This account already belongs to another program. Use a different email to join this one.';
    const w = gate({ signedIn: vi.fn(async () => ({ email: 'jordan@university.edu' })), redeemStaff: vi.fn(async () => ({ success: false, error })) });
    render(<StaffInvite token="tok-1" preview={VALID} writes={w} />);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    const note = await screen.findByRole('alert');
    expect(note).toHaveAttribute('data-ch-code', 'CH-15944');
    expect(note).toHaveTextContent(error);
    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(w.switchAccount).toHaveBeenCalledWith('/golf/staff/join/tok-1');
    await user.click(screen.getByRole('button', { name: 'Not you?' }));
    expect(w.switchAccount).toHaveBeenCalledTimes(2);
    expect(wrongAccount(error)).toBe(true);
  });

  it('CH-15034 any other refusal is a danger notice and Accept is on again', async () => {
    const user = userEvent.setup();
    const w = gate({ signedIn: vi.fn(async () => ({ email: 'jordan@university.edu' })), redeemStaff: vi.fn(async () => ({ success: false, error: 'Could not add you to the team. Please try again.' })) });
    render(<StaffInvite token="t" preview={VALID} writes={w} />);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15034');
    expect(screen.getByRole('button', { name: 'Accept invitation' })).toBeEnabled();
  });
});

describe('signed out: make the account here', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Full name'), 'Jordan Ellis');
    await user.type(screen.getByLabelText('Email'), 'jordan@university.edu');
    await user.type(screen.getByLabelText('Password'), GOOD);
  };

  it('CH-15945 CH-15142 the form checks name, email and the password’s rules before anything is sent', async () => {
    const user = userEvent.setup();
    const w = gate();
    render(<StaffInvite token="t" preview={VALID} writes={w} />);
    const submit = await screen.findByRole('button', { name: 'Create account and join' });
    await user.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15142');
    await user.type(screen.getByLabelText('Full name'), 'Jordan Ellis');
    await user.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email.');
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'jordan@university.edu');
    await user.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a password.');
    expect(w.signUpStaff).not.toHaveBeenCalled();
    expect(staffProblem({ name: 'a', email: 'a@b.co', password: GOOD })).toBeNull();
  });

  it('CH-15433 creates the account with the token, then redeems it with the name, and lands on the staff', async () => {
    const user = userEvent.setup();
    const w = gate();
    render(<StaffInvite token="tok-9" preview={VALID} writes={w} />);
    await screen.findByRole('button', { name: 'Create account and join' });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account and join' }));
    expect(await screen.findByRole('heading', { name: 'You’re on the staff' })).toBeInTheDocument();
    expect(w.signUpStaff).toHaveBeenCalledWith('tok-9', 'jordan@university.edu', GOOD, 'Jordan Ellis');
    expect(w.redeemStaff).toHaveBeenCalledWith('tok-9', 'Jordan Ellis');
  });

  it('CH-15034 an email that already has an account says so, with sign in carrying this link back', async () => {
    const user = userEvent.setup();
    const w = gate({ signUpStaff: vi.fn(async () => ({ success: false, error: 'User already registered' })) });
    render(<StaffInvite token="tok-9" preview={VALID} writes={w} />);
    await screen.findByRole('button', { name: 'Create account and join' });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account and join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', `/golf/login?returnTo=${encodeURIComponent('/golf/staff/join/tok-9')}`);
    expect(w.redeemStaff).not.toHaveBeenCalled();
  });

  it('an account made but a staff row that did not land goes to the one-button Accept, with the reason', async () => {
    const user = userEvent.setup();
    const w = gate({ redeemStaff: vi.fn(async () => ({ success: false, error: 'Could not add you to the team. Please try again.' })) });
    render(<StaffInvite token="tok-9" preview={VALID} writes={w} />);
    await screen.findByRole('button', { name: 'Create account and join' });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account and join' }));
    expect(await screen.findByRole('button', { name: 'Accept invitation' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not add you to the team. Please try again.');
    expect(w.signUpStaff).toHaveBeenCalledTimes(1);
  });

  it('the role is the token’s: a program admin reads as one', () => {
    expect(roleLabel('admin')).toBe('Program admin');
    expect(roleLabel('coach')).toBe('Assistant coach');
  });

  it('a signed-out visitor can sign in and open the link again', async () => {
    render(<StaffInvite token="tok-9" preview={VALID} writes={gate()} />);
    await screen.findByRole('button', { name: 'Create account and join' });
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('link', { name: 'Sign in' }).some((a) => a.getAttribute('href')?.includes('returnTo'))).toBe(true);
  });
});
