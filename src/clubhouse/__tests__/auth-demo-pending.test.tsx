import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The demo entry, and waiting for approval (P015, front-door completion): every number in catalog/auth.md. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/golf/actions/demo-access', () => ({ enterDemo: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('../lib/sign-out', () => ({ chSignOut: vi.fn(), chEndSession: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: () => null }));

import { CoachPending, PENDING_MIN_GAP_MS, PENDING_RECHECK_MS } from '../screens/auth/CoachPending';
import { DemoEntry } from '../screens/auth/DemoEntry';
import { demoProblem, refEmail, validateEmail, validateName, validateSchool } from '../screens/auth/demo-state';

const at = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
  Element.prototype.scrollIntoView = vi.fn();
  at('/golf/demo');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const demoWrites = (over: { enter?: ReturnType<typeof vi.fn>; signedIn?: boolean } = {}) => ({
  enter: (over.enter ?? vi.fn(async () => ({ success: false as const, error: 'preview' }))) as never,
  signedIn: vi.fn(async () => over.signedIn ?? false),
});

describe('the demo entry', () => {
  it('CH-15435 checks whether someone is signed in first, then shows the three questions', async () => {
    render(<DemoEntry writes={demoWrites()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your sign-in');
    expect(await screen.findByRole('button', { name: /enter the live demo/i })).toBeInTheDocument();
    expect(document.querySelector('[data-ch-code="CH-15970"]')).not.toBeNull();
  });

  it('CH-15971 someone already signed in goes straight on, to where the demo lands', async () => {
    const user = userEvent.setup();
    render(<DemoEntry writes={demoWrites({ signedIn: true })} />);
    await user.click(await screen.findByRole('button', { name: 'Continue to dashboard' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard');
  });

  it('CH-15971 a CoachHelm invitation lands on CoachHelm', async () => {
    at('/golf/demo?destination=coachhelm');
    const user = userEvent.setup();
    render(<DemoEntry writes={demoWrites({ signedIn: true })} />);
    await user.click(await screen.findByRole('button', { name: 'Continue to dashboard' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/intelligence');
  });

  it('CH-15143 the three checks are today’s, in the order the boxes are drawn, and nothing is sent until they pass', async () => {
    const user = userEvent.setup();
    const w = demoWrites();
    render(<DemoEntry writes={w} />);
    const go = await screen.findByRole('button', { name: /enter the live demo/i });
    await user.click(go);
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15143');
    await user.type(screen.getByLabelText('Your name'), 'Coach Rivera');
    await user.click(go);
    expect(screen.getByRole('alert')).toHaveTextContent('Email is required.');
    await user.type(screen.getByLabelText('Work email'), 'nope');
    await user.click(go);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    await user.clear(screen.getByLabelText('Work email'));
    await user.type(screen.getByLabelText('Work email'), 'rivera@university.edu');
    await user.click(go);
    expect(screen.getByRole('alert')).toHaveTextContent('School / Program is required.');
    expect(w.enter).not.toHaveBeenCalled();
    expect(validateName('x'.repeat(121))).toBe('Must be 120 characters or fewer.');
    expect(validateEmail(' a@b.co ')).toBeUndefined();
    expect(validateSchool('')).toBe('School / Program is required.');
    expect(demoProblem({ name: 'a', email: 'a@b.co', school: 's' })).toBeNull();
  });

  it('enterDemo is called with the trimmed-by-the-server fields and the destination, and a second press adds nothing', async () => {
    at('/golf/demo?destination=coachhelm');
    const user = userEvent.setup();
    const enter = vi.fn(() => new Promise<never>(() => {}));
    render(<DemoEntry writes={demoWrites({ enter })} />);
    await screen.findByRole('button', { name: /enter the live demo/i });
    await user.type(screen.getByLabelText('Your name'), 'Coach Rivera');
    await user.type(screen.getByLabelText('Work email'), 'rivera@university.edu');
    await user.type(screen.getByLabelText('School / Program'), 'State University Golf{Enter}');
    await waitFor(() => expect(enter).toHaveBeenCalledTimes(1));
    expect(enter).toHaveBeenCalledWith({ name: 'Coach Rivera', email: 'rivera@university.edu', school: 'State University Golf', destination: 'coachhelm' });
    await user.keyboard('{Enter}');
    expect(enter).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /setting up your demo/i })).toHaveAttribute('aria-busy', 'true');
  });

  it('CH-15036 a refusal from the server is said in its words and the form is on again', async () => {
    const user = userEvent.setup();
    const enter = vi.fn(async () => ({ success: false as const, error: 'Too many demo requests from this network.' }));
    render(<DemoEntry writes={demoWrites({ enter })} />);
    await screen.findByRole('button', { name: /enter the live demo/i });
    await user.type(screen.getByLabelText('Your name'), 'Coach Rivera');
    await user.type(screen.getByLabelText('Work email'), 'rivera@university.edu');
    await user.type(screen.getByLabelText('School / Program'), 'State University Golf');
    await user.click(screen.getByRole('button', { name: /enter the live demo/i }));
    const note = await screen.findByRole('alert');
    expect(note).toHaveTextContent('Too many demo requests from this network.');
    expect(note).toHaveAttribute('data-ch-code', 'CH-15036');
    expect(screen.getByRole('button', { name: /enter the live demo/i })).toBeEnabled();
  });

  it('CH-15972 a timed-out demo session explains itself, and an invite’s address fills the email only when it is one', async () => {
    at('/golf/demo?message=demo_session_expired&ref=Coach%40University.edu');
    render(<DemoEntry writes={demoWrites()} />);
    expect(await screen.findByText('Your demo session timed out. Enter your info again to jump right back in.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Work email')).toHaveValue('coach@university.edu'));
    expect(refEmail('not an address')).toBe('');
  });
});

describe('waiting for approval', () => {
  const pending = (over: { refresh?: () => void; signOut?: () => Promise<void> } = {}) => <CoachPending programName="Pine Needles University" refresh={over.refresh ?? vi.fn()} signOut={over.signOut ?? vi.fn(async () => undefined)} />;

  it('CH-15960 says who must approve, and that the account and request are in', () => {
    render(pending());
    expect(screen.getByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument();
    expect(screen.getByText('Your head coach')).toBeInTheDocument();
    expect(screen.getByText('Pine Needles University')).toBeInTheDocument();
    expect(document.querySelector('[data-ch-code="CH-15960"]')).not.toBeNull();
  });

  it('without a program name it still reads true', () => {
    render(<CoachPending programName={null} refresh={vi.fn()} signOut={vi.fn()} />);
    expect(screen.getByText('Your account is created and your request has been sent.')).toBeInTheDocument();
  });

  it('CH-15961 Check again runs the page’s own read again, and says it is still waiting', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    render(pending({ refresh }));
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Checked just now. Nothing yet.')).toBeInTheDocument();
  });

  it('it looks again by itself once a minute, and when the person comes back to the tab, never faster than the minimum gap', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    render(pending({ refresh }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(PENDING_RECHECK_MS)));
    expect(refresh).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(PENDING_MIN_GAP_MS)));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('CH-15962 Sign out really signs out, and a failure to is said with the button on again', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    render(pending({ signOut }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    const note = await screen.findByRole('alert');
    expect(note).toHaveAttribute('data-ch-code', 'CH-15962');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
