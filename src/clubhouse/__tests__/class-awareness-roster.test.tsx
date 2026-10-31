import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { PREVIEW_ROSTER, PREVIEW_ROSTER_AVAILABILITY } from '../preview/fixtures-roster';
import { Roster } from '../screens/roster/Roster';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
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
  it('a player in class reads "In class until" in the note slot, with the source in the peek', async () => {
    render(tree(roster()));
    expect(note('Theo Marchetti')?.textContent).toBe('In class until 11:50 AM');
    expect(note('Sofia Alvarez')?.textContent ?? '').not.toMatch(/class/i);
    await userEvent.click(screen.getByRole('button', { name: /^Theo Marchetti/ }));
    expect(await screen.findByText('From Theo’s class schedule · STAT 201')).toBeTruthy();
  });

  it('the face’s name carries the line for assistive tech', () => {
    render(tree(roster()));
    expect(screen.getByRole('button', { name: /^Theo Marchetti.*In class until 11:50 AM\. Open profile$/ })).toBeTruthy();
  });

  it('a class outranks "needs a look", and an injury outranks a class', () => {
    live.day = dayOf([dp('jonah', 'Jonah', { blocks: [block('13:30', '15:50')] }), dp('ava', 'Ava', { blocks: [block('13:30', '15:50')] })]);
    render(tree(roster(PREVIEW_ROSTER_AVAILABILITY)));
    // Jonah has a "Scoring up" reason; the class takes the slot.
    expect(note('Jonah Okafor')?.textContent).toBe('In class until 11:50 AM');
    // Ava is injured: the word stays, the class waits.
    expect(note('Ava Lindqvist')?.textContent).toBe('Injured');
  });

  it('a confirmed trip outranks an injury', () => {
    live.day = dayOf([dp('ava', 'Ava', { away: { destination: 'Pinehurst', returnDate: '2026-10-29', confirmed: true } })]);
    render(tree(roster(PREVIEW_ROSTER_AVAILABILITY)));
    expect(note('Ava Lindqvist')?.textContent).toBe('Travelling · Pinehurst');
  });

  it('the list row leads with the class line, then the usual class year and hometown', async () => {
    render(tree(roster()));
    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    const row = screen.getByRole('button', { name: 'Theo Marchetti. Open profile' });
    expect(row.textContent).toContain('In class until 11:50 AM');
    expect(row.textContent).toContain('Senior · Asheville, NC');
  });

  it('with the flag off nothing is drawn and nothing is read', () => {
    render(tree(roster(), false));
    expect(note('Theo Marchetti')).toBeNull();
    expect(live.calls.every((c) => c.enabled === false)).toBe(true);
  });

  it('with no team id on the roster (a fixture) nothing is asked for', () => {
    render(tree({ ...PREVIEW_ROSTER, teamId: undefined }));
    expect(live.calls.every((c) => c.team === null)).toBe(true);
  });

  it('holds the lines still while a pointer is down, and catches up when it lifts', async () => {
    const view = render(tree(roster()));
    expect(note('Theo Marchetti')?.textContent).toBe('In class until 11:50 AM');
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Theo Marchetti/ }));
    live.now = at('16:30');
    view.rerender(tree(roster()));
    expect(note('Theo Marchetti')?.textContent).toBe('In class until 11:50 AM');
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(note('Theo Marchetti')?.textContent ?? '').not.toMatch(/In class/);
  });
});

describe('Roster class lines · phone', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: q === '(max-width: 820px)', media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as never;
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }

  it('the row’s second line is the class line, and the row is named by it', () => {
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <ClubhouseMarker role={ROLE} classAwareness>
              <div className="ch-root" data-ui="clubhouse">
                <SlotHost />
                <Roster data={roster()} />
              </div>
            </ClubhouseMarker>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );
    const row = screen.getByRole('button', { name: /^Theo Marchetti.*In class until 11:50 AM/ });
    expect(row.querySelector('.ch-rsm-row__b .ch-ca-line')?.textContent).toBe('In class until 11:50 AM');
    expect(row.querySelector('.ch-rsm-row__b')?.textContent).toContain('Senior');
  });
});
