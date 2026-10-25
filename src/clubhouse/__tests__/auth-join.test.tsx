import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The team code, the confirm screen and a code that matches nothing (P015, front-door completion): every number in catalog/auth.md. */

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

import { CodeField } from '../screens/auth/CodeField';
import type { GateWrites } from '../screens/auth/gate-writes';
import { JoinCode } from '../screens/auth/JoinCode';
import { codeFromEntry, joinCodeProblem } from '../screens/auth/join-state';
import { classLabel, joinFailure, teamPlace } from '../screens/auth/join-team-state';
import { JoinInvalid, JoinTeam, type JoinTeamData } from '../screens/auth/JoinTeam';

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

function Harness({ start = '' }: { start?: string }) {
  const [v, setV] = useState(start);
  return <CodeField id="c" value={v} onChange={setV} />;
}
const field = () => screen.getByRole('textbox', { name: 'Team code' }) as HTMLInputElement;
const filled = () => [...document.querySelectorAll('.ch-au-slot[data-filled]')].map((e) => e.textContent).join('');
const cur = () => [...document.querySelectorAll('.ch-au-slot')].findIndex((e) => e.hasAttribute('data-cur'));

describe('the team code field', () => {
  it('is one real field named "Team code", for the keyboard’s one-time-code suggestion, upper case', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field()).toHaveAttribute('autocapitalize', 'characters');
    expect(field()).toHaveAttribute('inputmode', 'text');
    expect(field()).toHaveAttribute('enterkeyhint', 'go');
  });

  it('typing fills a box a character, in upper case, and the cursor moves on a box', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(cur()).toBe(0);
    await user.type(field(), 'k7');
    expect(filled()).toBe('K7');
    expect(cur()).toBe(2);
    await user.type(field(), 'pq');
    // The dash after the fourth box is not a box: the fifth box is the next slot.
    expect(filled()).toBe('K7PQ');
    expect(cur()).toBe(4);
  });

  it('a paste fills every box at once and strips what is not a letter or number', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.paste(' k7pq-x4mn ');
    expect(filled()).toBe('K7PQX4MN');
    expect(field()).toHaveValue('K7PQX4MN');
  });

  it('a pasted invite link gives up the code it carries', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.paste('https://golfhelm.com/golf/join/k7pqx4mn?utm=x');
    expect(field()).toHaveValue('K7PQX4MN');
    expect(codeFromEntry('/golf/signup?joinCode=ab12cd34')).toBe('AB12CD34');
  });

  it('Backspace takes the last character back out, and the cursor goes with it', async () => {
    const user = userEvent.setup();
    render(<Harness start="K7PQX4MN" />);
    await user.click(field());
    await user.keyboard('{Backspace}');
    expect(filled()).toBe('K7PQX4M');
    await user.keyboard('{Backspace}{Backspace}');
    expect(filled()).toBe('K7PQX');
    expect(cur()).toBe(5);
  });

  it('draws eight boxes and a dash, and grows to ten for an older team’s longer code, never past it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(document.querySelectorAll('.ch-au-slot')).toHaveLength(8);
    await user.click(field());
    await user.paste('ABCDEFGHJKLMNP');
    expect(field()).toHaveValue('ABCDEFGHJK');
    expect(document.querySelectorAll('.ch-au-slot')).toHaveLength(10);
  });
});

describe('/golf/join', () => {
  it('CH-15933 CH-15140 CH-15141 nothing, or too little, is refused in a notice and the field; the code is never judged here', async () => {
    const user = userEvent.setup();
    render(<JoinCode />);
    expect(document.querySelector('[data-ch-code="CH-15933"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your team code.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15140');
    await user.type(field(), 'k7');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15141');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(router.push).not.toHaveBeenCalled();
    expect(joinCodeProblem('K7PQ')).toBeNull();
  });

  it('CH-15436 a code goes to /golf/join/<code>, as today’s page sends it, once', async () => {
    const user = userEvent.setup();
    render(<JoinCode />);
    await user.type(field(), 'k7pqx4mn{Enter}');
    expect(router.push).toHaveBeenCalledWith('/golf/join/K7PQX4MN');
    await user.keyboard('{Enter}');
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /opening/i })).toHaveAttribute('aria-busy', 'true');
  });
});

const DATA: JoinTeamData = {
  code: 'K7PQX4MN',
  team: { id: 't1', name: 'Varsity Golf', season: '2026–27', organization: { name: 'Pine Needles University', city: 'Southern Pines', state: 'NC', logoUrl: null } },
  player: { name: 'Theo Marchetti', year: '2027', email: 'theo@university.edu' },
};
const gate = (over: Partial<GateWrites> = {}): GateWrites => ({
  join: vi.fn(async () => ({ success: true })),
  redeemStaff: vi.fn(),
  signUpStaff: vi.fn(),
  signedIn: vi.fn(async () => null),
  switchAccount: vi.fn(async () => undefined),
  ...over,
});

describe('/golf/join/[code]', () => {
  it('CH-15934 the team and the person are shown before anything is joined', () => {
    render(<JoinTeam data={DATA} playerId="p1" writes={gate()} />);
    expect(screen.getByRole('heading', { name: 'Join Varsity Golf' })).toBeInTheDocument();
    expect(screen.getByText('Pine Needles University · Southern Pines, NC · 2026–27')).toBeInTheDocument();
    expect(screen.getByText('Theo Marchetti')).toBeInTheDocument();
    expect(screen.getByText('Class of 2027 · theo@university.edu')).toBeInTheDocument();
    expect(screen.getByText(/one team at a time/i)).toBeInTheDocument();
    expect(teamPlace({})).toBe('A GolfHelm team');
    expect(classLabel('sophomore')).toBe('Sophomore');
  });

  it('CH-15432 CH-15937 Join calls processGolfTeamInvitation(code, playerId), then says so and goes to the dashboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const w = gate();
    render(<JoinTeam data={DATA} playerId="p1" writes={w} />);
    await user.click(screen.getByRole('button', { name: 'Join Varsity Golf' }));
    expect(await screen.findByRole('heading', { name: 'You’re on Varsity Golf' })).toBeInTheDocument();
    expect(w.join).toHaveBeenCalledWith('K7PQX4MN', 'p1');
    expect(hapticSpy).toHaveBeenCalledWith('success');
    await act(async () => void (await vi.advanceTimersByTimeAsync(2500)));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard');
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('CH-15936 being on the team already is a success, not a failure', async () => {
    const user = userEvent.setup();
    render(<JoinTeam data={DATA} playerId="p1" writes={gate({ join: vi.fn(async () => ({ success: true, alreadyMember: true })) })} />);
    await user.click(screen.getByRole('button', { name: 'Join Varsity Golf' }));
    expect(await screen.findByRole('heading', { name: 'You’re already on Varsity Golf' })).toBeInTheDocument();
  });

  it('CH-15939 being on another team is a warning in the server’s own words, and Join is on again', async () => {
    const user = userEvent.setup();
    const error = 'You are already on Duke Women’s Golf. Golf players can only be on one team at a time.';
    render(<JoinTeam data={DATA} playerId="p1" writes={gate({ join: vi.fn(async () => ({ success: false, error })) })} />);
    await user.click(screen.getByRole('button', { name: 'Join Varsity Golf' }));
    const note = await screen.findByRole('alert');
    expect(note).toHaveTextContent(error);
    expect(note).toHaveAttribute('data-ch-code', 'CH-15939');
    expect(note).toHaveClass('ch-au-notice--warning');
    expect(screen.getByRole('button', { name: 'Join Varsity Golf' })).toBeEnabled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it('CH-15032 CH-15033 a refused join and a lost connection are danger notices; the join is not made twice', async () => {
    const user = userEvent.setup();
    const join = vi.fn().mockResolvedValueOnce({ success: false, error: 'Invalid join code' }).mockRejectedValueOnce(new Error('offline'));
    render(<JoinTeam data={DATA} playerId="p1" writes={gate({ join })} />);
    await user.click(screen.getByRole('button', { name: 'Join Varsity Golf' }));
    expect(await screen.findByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15032');
    await user.click(screen.getByRole('button', { name: 'Join Varsity Golf' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15033'));
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t join the team. Try again.');
    expect(joinFailure(null).message).toBe('Failed to join team. Please try again.');
  });

  it('CH-15938 "Not you?" ends the session and comes back to this link after sign in', async () => {
    const user = userEvent.setup();
    const w = gate();
    render(<JoinTeam data={DATA} playerId="p1" writes={w} />);
    await user.click(screen.getByRole('button', { name: 'Not you?' }));
    expect(w.switchAccount).toHaveBeenCalledWith('/golf/join/K7PQX4MN');
  });

  it('CH-15935 a code that names no team says what happened and the one way forward', async () => {
    const user = userEvent.setup();
    render(<JoinInvalid />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-ch-code', 'CH-15935');
    expect(screen.getByRole('heading', { name: 'That code doesn’t match a team' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try another code' }));
    expect(router.push).toHaveBeenCalledWith('/golf/join');
  });
});
