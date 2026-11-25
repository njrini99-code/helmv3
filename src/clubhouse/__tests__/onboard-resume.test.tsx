import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/** Signing up and joining, hardened: a resumed sign-in is never a dead end, and every failure ends with something to do. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
const native = vi.hoisted(() => ({ is: false }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => native.is }));
// The real server calls are never reached here: every test hands the screens its own through the context.
vi.mock('@/app/golf/actions/access-code', () => ({ validateAccessCode: vi.fn() }));
vi.mock('@/app/golf/actions/auth', () => ({ signupAction: vi.fn() }));
vi.mock('@/app/golf/actions/onboarding', () => ({ completePlayerOnboarding: vi.fn() }));
vi.mock('@/app/actions/demo-request', () => ({ submitDemoRequest: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('../screens/auth/SceneMount', () => ({ SceneMount: ({ camera }: { camera?: unknown }) => <div data-testid="scene" data-camera={String(camera)} /> }));
// AuthFrame loads the animation features after first paint; here they resolve at once, so a test can wait for them deterministically.
vi.mock('@/lib/motion/load-features', async () => {
  const { domAnimation, domMax } = await import('motion/react');
  return { loadFeatures: () => Promise.resolve(domAnimation), loadMaxFeatures: () => Promise.resolve(domMax) };
});

import { Onboard } from '../screens/onboard/Onboard';
import type { Draft } from '../screens/onboard/flow';
import type { OnboardStep } from '../screens/onboard/logic';
import { OnboardWritesContext, type OnboardWrites } from '../screens/onboard/writes-context';

const setMedia = (phone = false, reduce = false) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduce : query.includes('max-width') ? phone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));

function makeWrites(over: Partial<OnboardWrites> = {}): OnboardWrites {
  return {
    checkCode: vi.fn(async (code: string) =>
      code === 'K7PQX4MN' ? { kind: 'ok' as const, code: 'roster' as const, teamName: 'Varsity Golf' } : code === 'S4VN8QRT' ? { kind: 'ok' as const, code: 'staff' as const, teamName: null } : { kind: 'bad' as const },
    ),
    createAccount: vi.fn(async (i) => (i.kind === 'staff' ? { ok: true as const, redirectTo: '/golf/dashboard', staffJoined: true } : { ok: true as const, redirectTo: '/golf/player?joinCode=K7PQX4MN', staffJoined: false })),
    finishPlayer: vi.fn(async () => ({ ok: true as const, joinedTeam: true })),
    finishCoach: vi.fn(async () => ({ ok: true as const, joinCode: 'M4RT2KQ9' })),
    uploadPhoto: vi.fn(async () => ({ ok: true as const, url: 'https://example.test/a.png' })),
    sendRequest: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

function mount(writes: OnboardWrites, start: OnboardStep = 'intro', seed: Partial<Draft> = {}, wrap?: (n: ReactNode) => ReactNode) {
  const node = (
    <OnboardWritesContext.Provider value={writes}>
      <Onboard start={start} seed={seed} fixedHour={9} />
    </OnboardWritesContext.Provider>
  );
  return render(wrap ? wrap(node) : node);
}

const PLAYER: Partial<Draft> = { intent: 'code', code: 'K7PQX4MN', kind: 'roster', teamName: 'Varsity Golf', first: 'Theo', last: 'Marchetti', grad: 2027 };

beforeEach(() => {
  setMedia();
  vi.useRealTimers();
  window.sessionStorage.clear();
  native.is = false;
  Object.values(router).forEach((f) => f.mockClear());
  hapticSpy.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});


const typeCode = (v: string) => fireEvent.change(screen.getByLabelText('Team code'), { target: { value: v } });
const AFTER: Partial<Draft> = { ...PLAYER, accountMade: true, email: 'theo@school.edu' };

describe('a player who signed in on a phone that lost the draft (the dead end that was reproduced)', () => {
  // What the server hands over for an account whose profile holds no name, with the team from the link.
  const RESUMED: Partial<Draft> = { intent: 'code', kind: 'roster', accountMade: true, first: '', last: '', grad: null, code: 'K7PQX4MN', teamName: 'Men’s Golf', email: 'theo@school.edu' };

  it('asks for the name, shows the team from the link, then the class, then the game', async () => {
    mount(makeWrites(), 'name', RESUMED);
    expect(screen.getByText('Player · Men’s Golf')).toBeTruthy();
    expect(screen.queryByText(/Player · GolfHelm/)).toBeNull();
    // Back never returns across the account.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Theo' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Marchetti' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    // Class next (it is not on the account), and never the account question again.
    expect(await screen.findByText('When do you graduate, Theo?')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('a name already on the account is not asked again', async () => {
    mount(makeWrites(), 'game', { ...RESUMED, first: 'Theo', last: 'Marchetti', grad: 2027 });
    expect(screen.getByText('Player · Men’s Golf')).toBeTruthy();
    expect(screen.queryByLabelText('First name')).toBeNull();
  });

  it('Finish setup with no name goes to the name question, and saves nothing', async () => {
    const w = makeWrites();
    mount(w, 'photo', { ...AFTER, first: '', last: '' });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByLabelText('First name')).toBeTruthy();
    expect(w.finishPlayer).not.toHaveBeenCalled();
  });
});

describe('the code, as people paste it', () => {
  it('a pasted invite link becomes the code it carries', async () => {
    const w = makeWrites();
    mount(w, 'code', { intent: 'code' });
    typeCode('Join my team: https://golfhelm.example/golf/join/k7pqx4mn');
    expect((screen.getByLabelText('Team code') as HTMLInputElement).value).toBe('K7PQX4MN');
  });

  it('a code with a space and a dash is the same code', async () => {
    mount(makeWrites(), 'code', { intent: 'code' });
    typeCode('k7pq - x4mn');
    expect((screen.getByLabelText('Team code') as HTMLInputElement).value).toBe('K7PQX4MN');
  });

  it('keeps the phone’s keyboard honest: capitals, no autocorrect, text input', () => {
    mount(makeWrites(), 'code', { intent: 'code' });
    const input = screen.getByLabelText('Team code');
    expect(input.getAttribute('autocapitalize')).toBe('characters');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  it('a code that matches nothing tells the player to use the newest one', async () => {
    mount(makeWrites(), 'code', { intent: 'code' });
    typeCode('ZZZZ9999');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText(/If they made a new code, use the newest one/)).toBeTruthy();
  });
});

describe('the account question', () => {
  const fill = (email: string, pw: string) => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: pw } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
  };

  it('an email field the phone will not "correct"', () => {
    mount(makeWrites(), 'account', PLAYER);
    const email = screen.getByLabelText('Email');
    expect(email.getAttribute('autocapitalize')).toBe('none');
    expect(email.getAttribute('autocorrect')).toBe('off');
    expect(email.getAttribute('inputmode')).toBe('email');
  });

  it('"session could not be established" says the account is ready and offers sign in with the team code', async () => {
    mount(makeWrites({ createAccount: vi.fn(async () => ({ ok: false as const, error: 'Account created but session could not be established. Please try signing in.' })) }), 'account', PLAYER);
    fill('theo@school.edu', 'Fairway#26');
    expect(await screen.findByText('Your account is ready. If we emailed you a link, open it first. Then sign in to finish joining your team.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/golf/login?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
  });

  it('an invite link’s returnTo is the one sign in keeps', async () => {
    window.history.replaceState(null, '', '/golf/signup?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
    mount(makeWrites({ createAccount: vi.fn(async () => ({ ok: false as const, error: 'An account with this email already exists. Please sign in instead.' })) }), 'account', PLAYER);
    fill('theo@school.edu', 'Fairway#26');
    expect(await screen.findByText('This email already has a GolfHelm account.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/golf/login?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
    window.history.replaceState(null, '', '/');
  });

  it('a lost code grant says so, and Check my code goes to the code question without losing the answers', async () => {
    mount(makeWrites({ createAccount: vi.fn(async () => ({ ok: false as const, error: 'Your access code could not be verified. Please reload this page and enter your invite code again.' })) }), 'account', PLAYER);
    fill('theo@school.edu', 'Fairway#26');
    expect(await screen.findByText('We need to check your team code again. Your answers are saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check my code' }));
    expect(await screen.findByLabelText('Team code')).toBeTruthy();
    expect((screen.getByLabelText('Team code') as HTMLInputElement).value).toBe('K7PQX4MN');
  });

  it('a double tap creates the account once', async () => {
    let finish: (v: { ok: true; redirectTo: string; staffJoined: boolean }) => void = () => {};
    const createAccount = vi.fn(() => new Promise<{ ok: true; redirectTo: string; staffJoined: boolean }>((r) => (finish = r)));
    mount(makeWrites({ createAccount }), 'account', PLAYER);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'theo@school.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fairway#26' } });
    const form = screen.getByLabelText('Password').closest('form')!;
    // Both taps land before React commits the busy state: the guard has to be read at once.
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(createAccount).toHaveBeenCalledTimes(1);
    finish({ ok: true, redirectTo: '/golf/player?joinCode=K7PQX4MN', staffJoined: false });
  });
});

describe('finishing', () => {
  it('a double tap on Finish setup saves once', async () => {
    let finish: (v: { ok: true; joinedTeam: boolean }) => void = () => {};
    const finishPlayer = vi.fn(() => new Promise<{ ok: true; joinedTeam: boolean }>((r) => (finish = r)));
    mount(makeWrites({ finishPlayer }), 'photo', AFTER);
    const form = screen.getByRole('button', { name: /Finish setup/ }).closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(finishPlayer).toHaveBeenCalledTimes(1);
    finish({ ok: true, joinedTeam: true });
  });

  it('a player already on another team keeps it, and is told how to move', async () => {
    const finishPlayer = vi.fn(async () => ({ ok: true as const, joinedTeam: false, joinError: 'You are already on Men’s Golf. Golf players can only be on one team at a time.' }));
    mount(makeWrites({ finishPlayer }), 'photo', AFTER);
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByText('Your profile is saved, Theo.')).toBeTruthy();
    expect(screen.getByText(/You are already on Men’s Golf/)).toBeTruthy();
    expect(screen.getByText(/leave your current team in Settings, or ask your coach to move you/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go to your dashboard/ })).toBeTruthy();
  });

  it('a code that no longer matches says to ask for the new one, and offers the code page', async () => {
    const finishPlayer = vi.fn(async () => ({ ok: true as const, joinedTeam: false, joinError: 'Invalid join code' }));
    mount(makeWrites({ finishPlayer }), 'photo', AFTER);
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByText(/made a new one/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Enter a team code/ }).getAttribute('href')).toBe('/golf/join');
  });

  it('finishing with no team code at all is not a dead end: the code is one tap away', async () => {
    mount(makeWrites({ finishPlayer: vi.fn(async () => ({ ok: true as const, joinedTeam: null })) }), 'photo', { ...AFTER, code: '', teamName: null });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByText(/You’re not on a team yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Enter a team code/ }).getAttribute('href')).toBe('/golf/join');
  });
});

describe('a valid older code is never rewritten, refused or doubted (O, I, 0, 1 and any length)', () => {
  const OLD = ['A0B1O7IK', 'K7PQ0N', 'K7PQX4MN9'];

  it.each(OLD)('%s is looked up exactly as typed, and a match shows no hint', async (code) => {
    const w = makeWrites({ checkCode: vi.fn(async () => ({ kind: 'ok' as const, code: 'roster' as const, teamName: 'Old Team' })) });
    mount(w, 'code', { intent: 'code' });
    typeCode(code.toLowerCase());
    expect((screen.getByLabelText('Team code') as HTMLInputElement).value).toBe(code);
    expect(screen.queryByText(/Newer codes don’t use/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('Welcome to Old Team.')).toBeTruthy();
    expect(w.checkCode).toHaveBeenCalledWith(code);
    expect(screen.queryByText(/Newer codes don’t use/)).toBeNull();
  });

  it('the hint appears only after the lookup says no match, and only for an eight-character code', async () => {
    mount(makeWrites(), 'code', { intent: 'code' });
    typeCode('ZZ0ZZZZZ');
    expect(screen.queryByText(/Newer codes don’t use/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText(/Newer codes don’t use the letters O or I/)).toBeTruthy();
    cleanup();
    mount(makeWrites(), 'code', { intent: 'code' });
    typeCode('ZZ0ZZ');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByText('That code didn’t match a team');
    expect(screen.queryByText(/Newer codes don’t use/)).toBeNull();
  });
});
