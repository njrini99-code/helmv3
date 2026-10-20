import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A new head coach makes the program (/golf/coach): the questions, the same action, the guard and the draft. Every number in catalog/auth.md. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('@/app/golf/actions/access-code', () => ({ validateAccessCode: vi.fn() }));
vi.mock('@/app/golf/actions/auth', () => ({ signupAction: vi.fn() }));
const complete = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/onboarding', () => ({ completePlayerOnboarding: vi.fn(), completeCoachOnboarding: complete }));
vi.mock('@/app/golf/actions/coach-entry', () => ({ getGolfCoachEntry: vi.fn() }));
vi.mock('@/app/actions/demo-request', () => ({ submitDemoRequest: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: () => null }));
vi.mock('@/lib/motion/load-features', async () => {
  const { domAnimation, domMax } = await import('motion/react');
  return { loadFeatures: () => Promise.resolve(domAnimation), loadMaxFeatures: () => Promise.resolve(domMax) };
});

import { CoachOnboard } from '../screens/onboard/CoachOnboard';
import { resolveCoachEntry, type CoachGuardDeps } from '../screens/onboard/coach-guard';
import { COACH_DRAFT_KEY, DRAFT_KEY, canGoBack, isCoachStart, readDraft, reduceFlow, EMPTY_DRAFT, type Draft } from '../screens/onboard/flow';
import { AFTER_ACCOUNT, EMPTY_PROGRAM, FULL_STEPS, PLAN, coachNameProblem, pathOf, programProblem, railOf, teamNameFor } from '../screens/onboard/logic';
import { cardOf } from '../screens/onboard/MemberCard';
import { Onboard } from '../screens/onboard/Onboard';
import { OnboardWritesContext, type OnboardWrites } from '../screens/onboard/writes-context';
import { finishCoach } from '../screens/onboard/writes';

const setMedia = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));

const SEED: Partial<Draft> = { intent: 'program', accountMade: true, first: 'Maya', last: 'Reyes', email: 'maya@university.edu' };

function writes(over: Partial<OnboardWrites> = {}): OnboardWrites {
  return {
    checkCode: vi.fn(),
    createAccount: vi.fn(),
    finishPlayer: vi.fn(),
    finishCoach: vi.fn(async () => ({ ok: true as const, joinCode: 'M4RT2KQ9' })),
    uploadPhoto: vi.fn(async () => ({ ok: true as const, url: 'https://example.test/a.png' })),
    sendRequest: vi.fn(),
    ...over,
  } as OnboardWrites;
}

const mount = (w: OnboardWrites, start: 'cprogram' | 'cprofile' | 'cdone' = 'cprogram', seed: Partial<Draft> = SEED) =>
  render(
    <OnboardWritesContext.Provider value={w}>
      <Onboard start={start} seed={seed} fixedHour={9} />
    </OnboardWritesContext.Provider>,
  );

beforeEach(() => {
  setMedia();
  window.sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const type = (label: string | RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

describe('the path', () => {
  it('is its own: three steps, program then profile then the code, with the account first', () => {
    expect(pathOf('program', null)).toBe('coach');
    expect(PLAN.coach).toEqual(['cprogram', 'cprofile', 'cdone']);
    expect(FULL_STEPS.has('cdone')).toBe(true);
    expect(isCoachStart('cprogram')).toBe(true);
    expect(isCoachStart('intro')).toBe(false);
    expect(railOf('coach', 'cprofile')).toEqual({ sections: ['Program', 'Profile'], current: 1 });
    // Back works across the two questions: the account is behind them, not between them.
    expect(canGoBack({ d: { ...EMPTY_DRAFT, accountMade: true }, hist: ['cprogram', 'cprofile'] })).toBe(true);
    expect(AFTER_ACCOUNT.has('cprogram')).toBe(true);
  });

  it('the program’s one required answer is the school; a city needs its state', () => {
    expect(programProblem(EMPTY_PROGRAM)).toEqual({ field: 'org', message: 'Enter your school or organization.' });
    expect(programProblem({ ...EMPTY_PROGRAM, org: 'A', city: 'Austin' })).toEqual({ field: 'state', message: 'Add the state.' });
    expect(programProblem({ ...EMPTY_PROGRAM, org: 'A' })).toBeNull();
    expect(coachNameProblem('', 'x')?.field).toBe('first');
    expect(coachNameProblem('x', ' ')?.field).toBe('last');
    expect(teamNameFor({ ...EMPTY_PROGRAM, org: 'Pine Needles' })).toBe('Pine Needles Golf');
  });

  it('the draft is the coach’s own: a coach’s is never read as sign up’s, and vice versa', () => {
    expect(COACH_DRAFT_KEY).not.toBe(DRAFT_KEY);
    mount(writes());
    type('School or organization', 'Pine Needles University');
    expect(window.sessionStorage.getItem(COACH_DRAFT_KEY)).toContain('Pine Needles University');
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    const back = readDraft(window.sessionStorage.getItem(COACH_DRAFT_KEY));
    expect(back?.d.prog.org).toBe('Pine Needles University');
  });

  it('a draft resumes where it was, with the account’s own name under it', async () => {
    window.sessionStorage.setItem(COACH_DRAFT_KEY, JSON.stringify({ d: { ...EMPTY_DRAFT, ...SEED, first: '', last: '', prog: { ...EMPTY_PROGRAM, org: 'Pine Needles University' } }, hist: ['cprogram', 'cprofile'] }));
    mount(writes());
    expect(await screen.findByRole('heading', { name: 'How should players know you?' })).toBeTruthy();
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Maya');
    expect(reduceFlow({ d: EMPTY_DRAFT, hist: ['cprogram'], dir: 'fwd', n: 0 }, { t: 'back' }).hist).toEqual(['cprogram']);
  });
});

describe('the questions', () => {
  it('CH-15143 the school is asked for, in the field, before the profile', async () => {
    mount(writes(), 'cprogram', { ...SEED });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('Enter your school or organization.')).toBeTruthy();
    expect(screen.getByLabelText('School or organization')).toHaveAttribute('aria-invalid', 'true');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it('the member card beside them is the coach’s, and fills in with the program as it is typed', () => {
    mount(writes());
    expect(screen.getByRole('img', { name: /member card for Maya Reyes/ })).toBeTruthy();
    type('School or organization', 'Pine Needles University');
    fireEvent.click(screen.getByRole('radio', { name: /D2/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Women’s/ }));
    const card = screen.getByRole('img', { name: /member card/ });
    expect(card.textContent).toContain('Pine Needles University');
    expect(card.textContent).toContain('D2');
    expect(card.textContent).toContain('Women’s golf');
    // The division is optional: choosing the chosen one clears it.
    fireEvent.click(screen.getByRole('radio', { name: /D2/ }));
    expect(screen.getByRole('radio', { name: /D2/ })).toHaveAttribute('aria-checked', 'false');
    expect(cardOf({ ...EMPTY_DRAFT, intent: 'program', prog: { ...EMPTY_PROGRAM, org: 'X' } }, 'coach', 'cprogram', new Date()).tag).toBe('Head coach');
  });

  it('CH-15035 the profile calls the same action with today’s fields, and a refusal keeps the answers', async () => {
    const finish = vi.fn().mockResolvedValueOnce({ ok: false as const, error: 'Couldn’t finish setting up your program. Give it another go.' }).mockResolvedValueOnce({ ok: true as const, joinCode: 'M4RT2KQ9' });
    const w = writes({ finishCoach: finish });
    mount(w, 'cprofile', { ...SEED, prog: { ...EMPTY_PROGRAM, org: 'Pine Needles University', division: 'D2', city: 'Southern Pines', state: 'NC', gender: 'womens' }, title: 'Head coach' });
    fireEvent.click(screen.getByRole('button', { name: /Create program/ }));
    expect(await screen.findByText('Couldn’t finish setting up your program. Give it another go.')).toBeTruthy();
    expect(document.querySelector('[data-ch-code="CH-15035"]')).toBeTruthy();
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Maya');
    fireEvent.click(screen.getByRole('button', { name: /Create program/ }));
    expect(await screen.findByRole('heading', { name: 'Pine Needles University is ready.' })).toBeTruthy();
    expect(finish).toHaveBeenCalledTimes(2);
    expect(finish.mock.calls[0]![0]).toMatchObject({ org: 'Pine Needles University', division: 'D2', state: 'NC', gender: 'womens' });
    expect(finish.mock.calls[0]!.slice(1)).toEqual(['Maya Reyes', 'Head coach', null]);
    // The draft is gone once the program exists.
    expect(window.sessionStorage.getItem(COACH_DRAFT_KEY)).toBeNull();
  });

  it('CH-15143 the profile asks for a first and last name', () => {
    mount(writes(), 'cprofile', { ...SEED, first: '', last: '', prog: { ...EMPTY_PROGRAM, org: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /Create program/ }));
    expect(screen.getByText('Add your first name to continue.')).toBeTruthy();
  });
});

describe('the code to share', () => {
  const done = () => mount(writes(), 'cdone', { ...SEED, title: 'Head coach', teamCode: 'M4RT2KQ9', prog: { ...EMPTY_PROGRAM, org: 'Pine Needles University' } });

  it('CH-15950 shows the code in its boxes, and Invite players (the roster) is the first action', async () => {
    done();
    expect(screen.getByRole('img', { name: 'Team code M 4 R T 2 K Q 9' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Invite players/ }));
    await waitFor(() => expect(router.prefetch).toHaveBeenCalledWith('/golf/dashboard/roster'));
  });

  it('copies the code, and the invite link (which goes through /golf/join), and says so only when it did', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    done();
    fireEvent.click(screen.getByRole('button', { name: /Copy code/ }));
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('M4RT2KQ9');
    fireEvent.click(screen.getByRole('button', { name: /Copy invite link/ }));
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/golf/join/M4RT2KQ9`);
    // The second copy was refused: nothing is shown as copied, and the code is there to select.
    expect(await screen.findByText(/couldn’t copy it from here/i)).toBeTruthy();
    expect(document.querySelector('[data-ch-code="CH-15951"]')).toBeTruthy();
  });

  it('with no code issued it does not invent one', () => {
    mount(writes(), 'cdone', { ...SEED, teamCode: null, prog: { ...EMPTY_PROGRAM, org: 'X' } });
    expect(screen.queryByRole('img', { name: /Team code/ })).toBeNull();
  });
});

describe('the action', () => {
  it('finishCoach sends today’s fields: the trimmed school, no empty optionals, the name, the title, the photo', async () => {
    complete.mockResolvedValue({ success: true, data: { organizationId: 'o', teamId: 't', joinCode: 'M4RT2KQ9' } });
    const r = await finishCoach({ ...EMPTY_PROGRAM, org: ' Pine Needles ', city: ' Southern Pines ', state: 'NC', gender: 'womens' }, 'Maya Reyes', ' Head coach ', null);
    expect(r).toEqual({ ok: true, joinCode: 'M4RT2KQ9' });
    expect(complete).toHaveBeenCalledWith({ orgName: 'Pine Needles', division: undefined, conference: undefined, city: 'Southern Pines', state: 'NC', teamName: undefined, gender: 'womens', fullName: 'Maya Reyes', title: 'Head coach', avatarUrl: undefined });
  });

  it('a refusal is the server’s sentence, and a thrown call is a sentence of ours', async () => {
    complete.mockResolvedValueOnce({ success: false, error: 'Organization name is required' }).mockRejectedValueOnce(new Error('Failed to fetch'));
    expect(await finishCoach(EMPTY_PROGRAM, 'M', '', null)).toEqual({ ok: false, error: 'Organization name is required' });
    expect(await finishCoach(EMPTY_PROGRAM, 'M', '', null)).toEqual({ ok: false, error: 'Unable to reach the server. Please check your internet connection and try again.' });
  });
});

describe('who may see it (today’s checks, in today’s order)', () => {
  const deps = (over: Partial<CoachGuardDeps> = {}): CoachGuardDeps => ({
    getUser: vi.fn(async () => ({ user: { id: 'u1', email: 'maya@university.edu', user_metadata: { first_name: 'Maya', last_name: 'Reyes' } }, failed: false })),
    entry: vi.fn(async () => ({ path: '/golf/coach' })),
    hasCoachRow: vi.fn(async () => false),
    hasPlayerRow: vi.fn(async () => false),
    wait: vi.fn(async () => undefined),
    ...over,
  });

  it('CH-15952 a coach with nowhere else to be is shown the questions, with the account’s name filled in', async () => {
    expect(await resolveCoachEntry(deps())).toEqual({ kind: 'ready', seed: { first: 'Maya', last: 'Reyes', email: 'maya@university.edu' } });
  });

  it('CH-15952 no session is sign in, after the tries a fresh sign-up’s cookie needs', async () => {
    const d = deps({ getUser: vi.fn(async () => ({ user: null, failed: false })) });
    expect(await resolveCoachEntry(d)).toEqual({ kind: 'go', to: '/golf/login' });
    expect(d.getUser).toHaveBeenCalledTimes(5);
    expect(await resolveCoachEntry(deps({ getUser: vi.fn(async () => 'timeout' as const) }))).toEqual({ kind: 'go', to: '/golf/login' });
    expect(await resolveCoachEntry(deps({ getUser: vi.fn(async () => ({ user: null, failed: true })) }))).toEqual({ kind: 'go', to: '/golf/login' });
  });

  it('CH-15952 an assistant (pending or approved) goes where the entry says, never to make a second program', async () => {
    expect(await resolveCoachEntry(deps({ entry: vi.fn(async () => ({ path: '/golf/coach/pending' })) }))).toEqual({ kind: 'go', to: '/golf/coach/pending' });
  });

  it('CH-15952 a player goes to the dashboard, not a coach row', async () => {
    expect(await resolveCoachEntry(deps({ hasPlayerRow: vi.fn(async () => true) }))).toEqual({ kind: 'go', to: '/golf/dashboard' });
    // A coach who is also a player row is still a coach.
    expect((await resolveCoachEntry(deps({ hasCoachRow: vi.fn(async () => true), hasPlayerRow: vi.fn(async () => true) }))).kind).toBe('ready');
  });

  it('CH-15953 the room holds its place until it is known, then redirects or draws the questions', async () => {
    const go = render(<CoachOnboard entry={{ kind: 'go', to: '/golf/coach/pending' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your account');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/golf/coach/pending'));
    go.unmount();
    render(<CoachOnboard deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'Set up your program.' })).toBeTruthy();
    await act(async () => undefined);
  });
});
