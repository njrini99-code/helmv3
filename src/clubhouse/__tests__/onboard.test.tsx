import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/** Sign up and onboarding (P015, phase 2): each path of Q-96, each failure the design draws, and the rules the server keeps. */

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

import { Onboard } from '../screens/onboard/Onboard';
import { DRAFT_KEY, type Draft } from '../screens/onboard/flow';
import type { OnboardStep } from '../screens/onboard/logic';
import { OnboardWritesContext, type OnboardWrites } from '../screens/onboard/writes-context';

const setMedia = (phone = false) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') ? phone : false,
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

describe('the code (Q-96: a roster code is a player, a staff code an assistant)', () => {
  it('CH-15110 a code that matches nothing says so, and nothing moves on', async () => {
    const w = makeWrites();
    mount(w, 'code', { intent: 'code' });
    typeCode('abc1-23 45');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('That code didn’t match a team')).toBeTruthy();
    expect(document.querySelector('[data-ch-code="CH-15110"]')).toBeTruthy();
    expect(w.checkCode).toHaveBeenCalledWith('ABC12345');
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });

  it('checks an 8-character code on its own after a pause, once', async () => {
    const w = makeWrites();
    mount(w, 'code', { intent: 'code' });
    typeCode('K7PQX4MN');
    expect(await screen.findByText('Welcome to Varsity Golf.', {}, { timeout: 2500 })).toBeTruthy();
    expect(w.checkCode).toHaveBeenCalledTimes(1);
    // Nothing about the team's people is shown before membership: the name and the kind of code, nothing else.
    expect(screen.getByText('Team code · player')).toBeTruthy();
  });

  it('does not check a 9-character code at 8 while it is still being typed', async () => {
    const w = makeWrites();
    mount(w, 'code', { intent: 'code' });
    typeCode('ABCDEFGH');
    typeCode('ABCDEFGHJ');
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(w.checkCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(w.checkCode).toHaveBeenCalledWith('ABCDEFGHJ'));
  });

  it('CH-15010 a code that cannot be checked offers Try again, which checks the same code', async () => {
    const checkCode = vi.fn().mockResolvedValueOnce({ kind: 'net' }).mockResolvedValueOnce({ kind: 'ok', code: 'roster', teamName: 'Varsity Golf' });
    mount(makeWrites({ checkCode }), 'code', { intent: 'code' });
    typeCode('K7PQX4MN');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('We couldn’t check your code')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Welcome to Varsity Golf.')).toBeTruthy();
    expect(checkCode).toHaveBeenLastCalledWith('K7PQX4MN');
  });

  it('a staff code asks no role and no class year: code, name, account, staff access', async () => {
    const w = makeWrites();
    mount(w, 'code', { intent: 'code' });
    typeCode('S4VN8QRT');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Join the staff/ }));
    fireEvent.change(screen.getByPlaceholderText('First'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByPlaceholderText('Last'), { target: { value: 'Whitfield' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('Create your account, Dana.')).toBeTruthy();
    expect(screen.queryByText(/When do you graduate/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'd@school.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fairway#26' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByText('You’re on staff, Coach Whitfield.')).toBeTruthy();
    expect(w.createAccount).toHaveBeenCalledWith({ kind: 'staff', email: 'd@school.edu', password: 'Fairway#26', first: 'Dana', last: 'Whitfield' });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a staff code that did not grant access follows the server, and never says staff access was granted', async () => {
    const w = makeWrites({ createAccount: vi.fn(async () => ({ ok: true as const, redirectTo: '/golf/staff/join/expired', staffJoined: false })) });
    mount(w, 'account', { intent: 'code', code: 'S4VN8QRT', kind: 'staff', first: 'Dana', last: 'W' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'd@school.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fairway#26' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/staff/join/expired'));
    expect(screen.queryByText(/on staff/)).toBeNull();
  });
});

describe('the account', () => {
  const fill = (email: string, pw: string) => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: pw } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
  };

  it('holds the server’s password rules on the screen, so nothing is sent that the server would refuse', async () => {
    const w = makeWrites();
    mount(w, 'account', PLAYER);
    fill('theo@school.edu', 'fairway#26');
    expect(await screen.findByText('Add upper and lower case letters.')).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
    expect(w.createAccount).not.toHaveBeenCalled();
  });

  it('CH-15011 an email that already has an account offers sign in', async () => {
    mount(makeWrites({ createAccount: vi.fn(async () => ({ ok: false as const, error: 'An account with this email already exists. Please sign in instead.' })) }), 'account', PLAYER);
    fill('theo@school.edu', 'Fairway#26');
    expect(await screen.findByText('This email already has a GolfHelm account.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/golf/login');
  });

  it('CH-15012 the server’s own sentence about a breached password is shown as it arrives', async () => {
    const said = 'Please choose a stronger password — this one is too common or has appeared in a data breach.';
    mount(makeWrites({ createAccount: vi.fn(async () => ({ ok: false as const, error: said })) }), 'account', PLAYER);
    fill('theo@school.edu', 'Fairway#26');
    expect(await screen.findByText(said)).toBeTruthy();
  });

  it('a player’s account made: the answers are saved (never the password) and the server’s redirect is followed', async () => {
    mount(makeWrites(), 'account', PLAYER);
    fill('theo@school.edu', 'Fairway#26');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/player?joinCode=K7PQX4MN'));
    expect(router.refresh).toHaveBeenCalled();
    const saved = window.sessionStorage.getItem(DRAFT_KEY) ?? '';
    expect(JSON.parse(saved).d).toMatchObject({ first: 'Theo', grad: 2027, accountMade: true, email: 'theo@school.edu' });
    expect(saved).not.toContain('Fairway#26');
  });

  it('asks a guardian’s consent in the legal line when the class year puts the player under 18', () => {
    mount(makeWrites(), 'account', PLAYER);
    expect(screen.getByText(/parent or guardian acknowledges/)).toBeTruthy();
  });
});

describe('after the account (/golf/player)', () => {
  const AFTER: Partial<Draft> = { ...PLAYER, accountMade: true };

  it('Back never returns across the account', () => {
    mount(makeWrites(), 'game', AFTER);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('keeps the state to two letters and asks for it when a city is given', async () => {
    mount(makeWrites(), 'game', AFTER);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Austin' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('Add the state.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 't3x' } });
    expect((screen.getByLabelText('State') as HTMLInputElement).value).toBe('TX');
  });

  it('finishes with the same fields today’s onboarding sends, and the join code from the URL', async () => {
    window.history.replaceState(null, '', '/golf/player?joinCode=k7pqx4mn');
    const w = makeWrites();
    mount(w, 'photo', { ...AFTER, code: '', hcp: -1.8, city: 'Austin', state: 'TX' });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByText('You’re on the roster, Theo.')).toBeTruthy();
    expect(w.finishPlayer).toHaveBeenCalledWith({ first: 'Theo', last: 'Marchetti', grad: 2027, hcp: -1.8, city: 'Austin', state: 'TX', avatarUrl: null }, 'K7PQX4MN');
    window.history.replaceState(null, '', '/');
  });

  it('a join that failed saves the profile and offers the code again, with no member card issued', async () => {
    mount(makeWrites({ finishPlayer: vi.fn(async () => ({ ok: true as const, joinedTeam: false })) }), 'photo', AFTER);
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/ }));
    expect(await screen.findByText('Your profile is saved, Theo.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Enter a team code/ }).getAttribute('href')).toBe('/golf/join');
    expect(document.querySelector('.ch-ox-mc__stamp')).toBeNull();
  });

  it('CH-15013 a photo that did not upload says so, and Finish setup stays open', async () => {
    const w = makeWrites({ uploadPhoto: vi.fn(async () => ({ ok: false as const, error: 'That photo didn’t upload. Try again, or skip it for now.' })) });
    mount(w, 'photo', AFTER);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } });
    expect(await screen.findByText('That photo didn’t upload. Try again, or skip it for now.')).toBeTruthy();
    expect(document.querySelector('[data-ch-code="CH-15013"]')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Finish setup/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses a photo the avatars bucket would refuse, before uploading', async () => {
    const w = makeWrites();
    mount(w, 'photo', AFTER);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'me.heic', { type: 'image/heic' })] } });
    expect(await screen.findByText('Choose a JPG, PNG or WebP image.')).toBeTruthy();
    expect(w.uploadPhoto).not.toHaveBeenCalled();
  });
});

describe('request access', () => {
  it('asks who, then the details, and keeps them when sending fails (CH-15014)', async () => {
    const sendRequest = vi.fn().mockResolvedValueOnce({ ok: false, error: 'Unable to reach the server. Your details are still here. Check your connection and try again.' }).mockResolvedValueOnce({ ok: true });
    mount(makeWrites({ sendRequest }), 'intro');
    fireEvent.click(screen.getByRole('button', { name: /I need access/ }));
    fireEvent.click(await screen.findByRole('radio', { name: /Athletic director/ }));
    expect(await screen.findByText('Tell us about your department.', {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
    expect(await screen.findByText('Enter your first name.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Jordan' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Ellis' } });
    fireEvent.change(screen.getByLabelText('School or athletic department'), { target: { value: 'Oakmont' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'j@oakmont.edu' } });
    fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
    expect(await screen.findByText(/Your details are still here/)).toBeTruthy();
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Jordan');
    fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
    expect(await screen.findByText('Thanks, Jordan. We’ve got it.')).toBeTruthy();
    expect(sendRequest).toHaveBeenLastCalledWith(expect.objectContaining({ who: 'ad', first: 'Jordan', school: 'Oakmont', email: 'j@oakmont.edu' }));
  });
});

describe('arriving', () => {
  it('an invite link’s code opens on the invitation and is carried to the code', async () => {
    window.history.replaceState(null, '', '/golf/signup?returnTo=%2Fgolf%2Fjoin%2Fk7pqx4mn');
    mount(makeWrites(), 'intro');
    expect(await screen.findByText('You’ve been invited to a team.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Accept invite/ }));
    expect(((await screen.findByLabelText('Team code')) as HTMLInputElement).value).toBe('K7PQX4MN');
    window.history.replaceState(null, '', '/');
  });

  it('the iOS app sends sign-up to sign in, as today', () => {
    native.is = true;
    mount(makeWrites(), 'intro');
    expect(router.replace).toHaveBeenCalledWith('/golf/login');
  });

  it('the sign-in link keeps the invite', () => {
    window.history.replaceState(null, '', '/golf/signup?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
    mount(makeWrites(), 'intro');
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/golf/login?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
    window.history.replaceState(null, '', '/');
  });
});
