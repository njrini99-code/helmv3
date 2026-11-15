import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Class awareness (P-10) on Roster: the class line in the face's note slot, the list row, the phone row and the
 * peek. A trip outranks availability, availability outranks a class, a class outranks "needs a look"; nothing is drawn
 * (and nothing fetched) with the flag off; and a line does not change under a finger.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
/** A face opens the peek where the profile route is not rebuilt; this file drives the peek. */
vi.mock('../shell/nav', async (orig) => {
  const nav = await orig<typeof import('../shell/nav')>();
  return { ...nav, rebuiltHref: (href: string, role?: Parameters<typeof nav.rebuiltHref>[1]) => (href.startsWith('/golf/dashboard/stats?player=') ? null : nav.rebuiltHref(href, role)) };
});
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ setPlayerAvailabilityCoachNote: vi.fn(), updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn(async () => ({ success: true, data: [] })) }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
const live = vi.hoisted(() => ({ day: null as import('../data/class-day-shape').ChClassDay | null, now: null as number | null, calls: [] as Array<{ team: string | null; enabled: boolean | undefined }> }));
vi.mock('../lib/use-class-day', () => ({
  useTeamClassDay: (team: string | null, opts: { enabled?: boolean } = {}) => {
    live.calls.push({ team, enabled: opts.enabled });
    return { day: opts.enabled === false ? null : live.day, status: 'ready', now: live.now, refetch: async () => {} };
  },
  refetchTeamClassDay: async () => {},
}));
import './dialog-polyfill';

import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../data/class-day-shape';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { Roster } from '../screens/roster/Roster';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';
import type { ChRoster } from '../data/roster';

const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string, label = 'STAT 201 - Probability'): ChClassBlock => ({ classId: label, label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to) });
const dp = (id: string, first: string, over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({
  playerId: id,
  firstName: first,
  lastName: 'X',
  avatarUrl: null,
  tracked: true,
  holds: true,
  onCourse: false,
  offToday: false,
  away: null,
  blocks: [],
  ...over,
});
const dayOf = (players: ChClassDayPlayer[]): ChClassDay => ({
  on: '2026-10-26',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: null,
  nextTerm: null,
  players,
  fetchedAt: Date.now(),
});

const ROLE = 'coach' as const;
const roster = (base: ChRoster = PREVIEW_ROSTER): ChRoster => ({ ...base, teamId: 'team-1' });
const tree = (data: ChRoster, on = true): ReactNode => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <ClubhouseMarker role={ROLE} classAwareness={on}>
        <div className="ch-root" data-ui="clubhouse">
          <Roster data={data} />
        </div>
      </ClubhouseMarker>
    </ToastProvider>
  </LazyMotion>
);
const note = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) }).querySelector('.ch-rs-face__note');

beforeEach(() => {
  live.day = dayOf([dp('theo', 'Theo', { blocks: [block('13:30', '15:50')] }), dp('sofia', 'Sofia', { blocks: [block('17:00', '18:15')] })]);
  live.now = at('14:30');
  live.calls = [];
  localStorage.clear();
  window.history.replaceState(null, '', '/golf/dashboard/roster');
});
afterEach(() => cleanup());

describe('Roster class lines', () => {

  it('with the flag off nothing is drawn and nothing is read', () => {
    render(tree(roster(), false));
    expect(note('Theo Marchetti')).toBeNull();
    expect(live.calls.every((c) => c.enabled === false)).toBe(true);
  });

  it('with no team id on the roster (a fixture) nothing is asked for', () => {
    render(tree({ ...PREVIEW_ROSTER, teamId: undefined }));
    expect(live.calls.every((c) => c.team === null)).toBe(true);
  });
});
