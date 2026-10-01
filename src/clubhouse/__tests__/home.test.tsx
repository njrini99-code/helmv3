import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Home: every numbered state in docs/clubhouse/catalog/home.md, found by its number,
 * and the page's own contracts (docs/clubhouse/pages/P002-home/CONTRACT.md), found by
 * their five-digit Bridge ID. Player Home's states are in player-home.test.tsx.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const redirectSpy = vi.hoisted(() =>
  vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: redirectSpy }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

// The dashboard page (src/app/golf/(dashboard)/dashboard/page.tsx) is the route: its session, flag and team
// resolvers are the only things faked. The loaders and screens under it are the real ones.
const session = vi.hoisted(() => ({ current: null as unknown }));
const flag = vi.hoisted(() => ({ coach: true, player: true }));
const requestCache = vi.hoisted(() => ({ coachTeam: vi.fn(), playerTeam: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: (role: 'coach' | 'player') => flag[role] }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({ resolveCoachActiveTeamIdForRequest: requestCache.coachTeam, getActivePlayerTeamMembership: requestCache.playerTeam }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: (c: string) => c }));
// The existing dashboards are stubs named for what they stand in for; the test only asks which one the page chose.
vi.mock('@/components/fairway/pages/dashboard/FairwayCoachDashboard', () => ({ FairwayCoachDashboard: Object.assign(() => null, { displayName: 'ExistingCoachDashboard' }) }));
vi.mock('@/components/fairway/pages/dashboard/FairwayPlayerDashboard', () => ({ FairwayPlayerDashboard: Object.assign(() => null, { displayName: 'ExistingPlayerDashboard' }) }));
vi.mock('@/app/golf/actions/dashboard-data', () => ({
  getCachedCoachDashboardData: async () => ({ teamName: 'Varsity', joinCode: 'ABC', stats: {}, recentRounds: [], topPlayers: [], calendarEvents: [], teamScoringTrend: [], timezone: 'America/New_York' }),
  getCachedPlayerDashboardData: async () => ({ teamName: 'Varsity', stats: { handicap: null }, recentRounds: [], timezone: 'America/New_York' }),
}));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: async () => ({ success: false }) }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: async () => null }));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: async () => ({ success: true, data: [] }) }));

import GolfDashboardPage from '@/app/golf/(dashboard)/dashboard/page';
import { loadCoachHome, teamForm, type ChCoachHome } from '../data/home';
import { groupByPlayer, seasonStartDate, type ChRound } from '../data/season';
import { previousInFilter, roundsInFilter } from '../data/stats-common';
import { filterFor } from '../data/stats-filter';
import { weightedMean } from '../data/stats-weight';
import { formBasis } from '../screens/home/HomePhone';
import { CoachHome, CoachHomeNoTeam, isFirstRun } from '../screens/home/CoachHome';
import { HomeActions } from '../screens/home/HomeActions';
import { HomeSkeleton } from '../screens/home/HomeSkeleton';
import { LatestRound } from '../screens/home/LatestRound';
import { Leaderboard } from '../screens/home/Leaderboard';
import { Week, dayLabel } from '../screens/home/Week';
import { PlayerHome, PlayerHomeNoTeam } from '../screens/home/PlayerHome';
import { chReport, chTrail } from '../lib/track';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME, PREVIEW_HOME_NOW, PREVIEW_HOME_NO_EVENTS } from '../preview/fixtures';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const home = (over: Partial<ChCoachHome> = {}): ChCoachHome => ({ ...PREVIEW_HOME, ...over });
const load = () => loadCoachHome({ teamId: 't1', coachName: 'Maya Reyes' });
const logged = (read: string) => expect(logServer).toHaveBeenCalledWith('home', read, expect.anything());

/** An event today at 3pm Eastern, inside the loader's week window. */
function todayEvent() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { id: 'e1', title: 'Short-game block', event_type: 'practice', start_time: `${d}T19:00:00Z`, end_time: `${d}T21:00:00Z`, all_day: false, location: 'Practice green' };
}

beforeEach(() => {
  hapticSpy.mockClear();
  logServer.mockClear();
  router.push.mockClear();
  router.refresh.mockClear();
  vi.mocked(chReport).mockClear();
  vi.mocked(chTrail).mockClear();
  tables.current = {};
});

describe('Home · reads that fail', () => {
  it('CH-2201 21402 the week does not load: a notice with Try again, never an empty week', async () => {
    tables.current = { golf_events: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.week.error).toBe(true);
    logged('events');
    wrap(<Week week={data.week} />);
    await expectCode('CH-2201', /schedule didn't load/);
    expect(code('CH-2301')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-2202 CH-2204 the roster does not load: rounds and the leaderboard both say so', async () => {
    tables.current = { golf_team_members: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.latestRounds.error).toBe(true);
    expect(data.leaderboard.error).toBe(true);
    logged('roster');
    wrap(
      <>
        <LatestRound data={data.latestRounds} />
        <Leaderboard data={data.leaderboard} />
      </>,
    );
    await expectCode('CH-2202', /Recent rounds didn't load/);
    await expectCode('CH-2204', /leaderboard didn't load/);
  });

  it('CH-2203 hole-by-hole does not load: the total stays, and the card says why', () => {
    const r = { ...PREVIEW_HOME.latestRounds.rounds[0]!, holes: null };
    wrap(<LatestRound data={{ rounds: [r], error: false, holesError: true }} />);
    expect(code('CH-2203')!.textContent).toMatch(/didn’t load for this round\. The total above is correct/);
  });

  it('CH-2205 CH-2206 CH-2207 a section that crashes is contained; the rest of Home stays', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = home({
      week: { ...PREVIEW_HOME.week, days: null as never },
      latestRounds: { ...PREVIEW_HOME.latestRounds, rounds: null as never },
      leaderboard: { ...PREVIEW_HOME.leaderboard, rows: null as never },
    });
    wrap(<CoachHome data={broken} />);
    expect(code('CH-2205')!.textContent).toMatch(/This week couldn’t be shown/);
    expect(code('CH-2206')!.textContent).toMatch(/The latest round couldn’t be shown/);
    expect(code('CH-2207')!.textContent).toMatch(/The leaderboard couldn’t be shown/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(PREVIEW_HOME.greeting);
    quiet.mockRestore();
  });

  it('CH-2208 20103 the team chat does not load: Message team opens Messages instead', async () => {
    tables.current = { golf_conversations: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.teamChatId).toBeNull();
    logged('team chat');
    wrap(<HomeActions teamChatId={data.teamChatId} />);
    expect(screen.getByRole('link', { name: /Message team/ }).getAttribute('href')).toBe('/golf/dashboard/messages');
  });

  it('CH-2209 replies do not load: the agenda drops who is invited instead of saying 0 players', async () => {
    tables.current = { golf_events: { data: [todayEvent()] }, golf_event_attendance: { error: { message: 'boom' } } };
    const data = await load();
    logged('attendance');
    const row = data.week.agenda.find((r) => r.id === 'e1')!;
    expect(row.detail).toBe('Practice green');
  });

  it('CH-2210 the timezone does not load: Home reads the week in Eastern time', async () => {
    tables.current = { golf_team_settings: { error: { message: 'boom' } } };
    const data = await load();
    logged('timezone');
    const et = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    expect(data.todayLabel).toBe(et);
  });
});

describe('Home · empty', () => {
  it('CH-2301 nothing today', () => {
    wrap(<Week week={{ ...PREVIEW_HOME.week, agenda: [] }} />);
    expect(code('CH-2301')!.textContent).toMatch(/Nothing on the calendar today/);
  });

  it('CH-2302 no rounds posted yet', () => {
    wrap(<LatestRound data={{ rounds: [], error: false, holesError: false }} />);
    expect(code('CH-2302')!.textContent).toMatch(/No rounds posted yet this season/);
  });

  it('CH-2303 a round posted as a total', () => {
    const r = { ...PREVIEW_HOME.latestRounds.rounds[0]!, holes: null };
    wrap(<LatestRound data={{ rounds: [r], error: false, holesError: false }} />);
    expect(code('CH-2303')!.textContent).toMatch(/Posted as a total/);
  });

  it('CH-2304 no players on the roster', () => {
    wrap(<Leaderboard data={{ rows: [], scorecards: 0, rosterSize: 0, error: false }} />);
    expect(code('CH-2304')!.textContent).toMatch(/No players on the roster yet/);
  });

  it('CH-2305 players but no 18-hole rounds', () => {
    wrap(<Leaderboard data={{ rows: [], scorecards: 0, rosterSize: 6, error: false }} />);
    expect(code('CH-2305')!.textContent).toMatch(/6 players are on the roster/);
  });

  it('CH-2306 strokes gained is an early read until three rounds', () => {
    wrap(<Leaderboard data={PREVIEW_HOME.leaderboard} />);
    expect(code('CH-2306')!.textContent).toBe('Early read');
    expect(code('CH-2306')!.getAttribute('title')).toMatch(/after three rounds/);
  });

  it('CH-2307 a coach with no team', () => {
    wrap(<CoachHomeNoTeam />);
    expect(code('CH-2307')!.textContent).toMatch(/You aren't on a team yet/);
  });
});

describe('Home · loading, motion, haptics, accessibility', () => {
  afterEach(() => vi.restoreAllMocks());

  it('CH-2401 the route skeleton is busy and shaped like the page', () => {
    wrap(<HomeSkeleton />);
    expect(code('CH-2401')!.getAttribute('aria-busy')).toBe('true');
    expect(code('CH-2401')!.querySelectorAll('.ch-h-lb__row')).toHaveLength(5);
  });

  it('CH-2701 paging the latest round ticks and announces the position', async () => {
    const user = userEvent.setup();
    wrap(<LatestRound data={PREVIEW_HOME.latestRounds} />);
    expect(screen.getByText('1 of 3').getAttribute('aria-live')).toBe('polite');
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('CH-2702 CH-2801 21703 N opens a new event with the light tap, but not while typing', async () => {
    const user = userEvent.setup();
    wrap(
      <>
        <input aria-label="Somewhere to type" />
        <HomeActions teamChatId="c1" />
      </>,
    );
    await user.click(screen.getByRole('textbox', { name: 'Somewhere to type' }));
    await user.keyboard('n');
    expect(router.push).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('n');
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/calendar?new=1');
    expect(hapticSpy).toHaveBeenCalledWith('press');
  });

  it('CH-2802 each day says how many events it has, in words', () => {
    expect(dayLabel(0, false)).toBe('no events');
    expect(dayLabel(1, false)).toBe('1 event');
    expect(dayLabel(2, true)).toBe('competition, 2 events');
    wrap(<Week week={PREVIEW_HOME.week} />);
    expect(screen.getByRole('list', { name: 'Days this week' }).querySelector('[aria-current="date"]')!.textContent).toMatch(/4 events/);
  });

  it('CH-2803 the leaderboard and scorecard are tables: every cell sits in a row with headers', () => {
    wrap(
      <>
        <LatestRound data={PREVIEW_HOME.latestRounds} />
        <Leaderboard data={PREVIEW_HOME.leaderboard} />
      </>,
    );
    const rows = document.querySelectorAll('[role="row"]');
    expect(rows.length).toBeGreaterThan(6);
    for (const row of rows) for (const child of row.children) expect(['cell', 'columnheader', 'rowheader']).toContain(child.getAttribute('role'));
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
  });
});

describe('Home · phone (v2, Coach - Home - Mobile.html)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('20101 20103 21901 the hero: date, greeting, brief, and Up next with its countdown and replies, opening the event in Calendar', () => {
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Good morning, Maya.' })).toBeTruthy();
    const next = document.querySelector('a.ch-hm-next') as HTMLAnchorElement;
    expect(next.getAttribute('href')).toBe('/golf/dashboard/calendar?date=2026-10-14&event=a1');
    // 2:40 PM against a 3:30 PM start.
    expect(next.textContent).toMatch(/In 50 min/);
    expect(next.textContent).toMatch(/5 of 6 going/);
    expect(next.querySelector('.is-soon')).not.toBeNull();
  });

  it('20103 Today: a timeline, with overlaps marked and each row opening its event', () => {
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    const rows = document.querySelectorAll('.ch-hm-tl__r');
    expect(rows).toHaveLength(4);
    expect(screen.getAllByText('Overlaps another event').length).toBe(2);
    expect(screen.getByRole('link', { name: /1:1 with Jonah/ }).getAttribute('href')).toBe('/golf/dashboard/calendar?date=2026-10-14&event=a2');
  });

  it('the team form: gains green, losses amber (D-42), and a text equivalent for the line', () => {
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    const form = document.querySelector('.ch-hm-form')!;
    expect(form.textContent).toMatch(/73\.4/);
    expect(form.querySelector('.ch-hm-delta')!.className).toMatch(/is-gain/);
    // Putts up 0.3 is worse.
    expect([...form.querySelectorAll('dd.is-loss')].map((d) => d.textContent)).toEqual(['+0.3']);
    expect(screen.getByRole('img', { name: /Team scoring, the team's average on each of its last \d+ round days/ })).toBeTruthy();
  });

  it('CH-2701 20103 21703 a latest round opens its card in a sheet: the figures, both nines, Message and the player’s stats', async () => {
    const user = userEvent.setup();
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    await user.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    const sheet = await screen.findByRole('dialog', { name: 'Theo Marchetti' });
    expect(sheet.querySelectorAll('table.ch-nine')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Message' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=theo');
    expect(screen.getByRole('link', { name: 'Player stats' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=theo');
  });

  it('CH-2303 a round posted as a total says so in its sheet', async () => {
    const user = userEvent.setup();
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    await user.click(screen.getByRole('button', { name: /Jonah Okafor/ }));
    await expectCode('CH-2303', /Posted as a total/);
  });

  it('CH-2309 20103 nothing ahead: Up next says so, with quick types that open the editor on that type', () => {
    const base = PREVIEW_HOME;
    wrap(
      <CoachHome
        data={{ ...base, week: { ...base.week, agenda: [], days: base.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) }, phone: { ...base.phone, next: null, today: [], weekNote: null } }}
        now={PREVIEW_HOME_NOW}
      />,
    );
    expect(code('CH-2309')!.textContent).toMatch(/No events scheduled/);
    expect(screen.getByRole('link', { name: 'Qualifier' }).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1&type=qualifier');
    expect(screen.getByRole('link', { name: 'Add event' }).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1');
    // With nothing ahead, the week strip steps aside.
    expect(screen.queryByRole('heading', { name: 'This week' })).toBeNull();
  });

  it('CH-2212 CH-2213 CH-2214 a phone section that crashes is contained; the hero stays', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = PREVIEW_HOME.phone;
    wrap(
      <CoachHome
        data={{ ...PREVIEW_HOME, phone: { ...p, next: { ...p.next!, type: "nope" as never }, today: null as never, form: { ...p.form!, line: null as never } } }}
        now={PREVIEW_HOME_NOW}
      />,
    );
    expect(code('CH-2213')).not.toBeNull();
    expect(code('CH-2214')).not.toBeNull();
    expect(code('CH-2212')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(PREVIEW_HOME.greeting);
    quiet.mockRestore();
  });

  it('CH-2201 CH-2202 CH-2211 failed reads show notices on the phone, never empty states', () => {
    wrap(<CoachHome data={{ ...PREVIEW_HOME, week: { ...PREVIEW_HOME.week, error: true }, latestRounds: { rounds: [], error: true, holesError: false }, phone: { ...PREVIEW_HOME.phone, next: null, today: [], form: null } }} now={PREVIEW_HOME_NOW} />);
    expect(code('CH-2201')).not.toBeNull();
    expect(code('CH-2202')).not.toBeNull();
    expect(code('CH-2211')).not.toBeNull();
    expect(code('CH-2302')).toBeNull();
    expect(code('CH-2309')).toBeNull();
  });
});

describe('Home · first run (v2 page empty state, D-71)', () => {
  it('CH-2308 a team with nothing yet gets the first steps; the header’s actions step aside', () => {
    const empty: ChCoachHome = {
      ...PREVIEW_HOME,
      week: { ...PREVIEW_HOME.week, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
      latestRounds: { rounds: [], error: false, holesError: false },
      leaderboard: { rows: [], scorecards: 0, rosterSize: 0, error: false },
      phone: { next: null, today: [], form: null, weekNote: null },
    };
    wrap(<CoachHome data={empty} />);
    expect(code('CH-2308')!.textContent).toMatch(/Your season starts here/);
    expect(screen.getByRole('link', { name: 'Invite players' }).getAttribute('href')).toBe('/golf/dashboard/roster');
    expect(screen.getByRole('link', { name: 'Add an event' }).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1');
    expect(screen.queryByRole('link', { name: /New event/ })).toBeNull();
  });

  it('a failed read is never taken for a first run', () => {
    const nothing: ChCoachHome = {
      ...PREVIEW_HOME,
      week: { ...PREVIEW_HOME.week, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
      latestRounds: { rounds: [], error: false, holesError: false },
      leaderboard: { rows: [], scorecards: 0, rosterSize: 0, error: false },
      phone: { next: null, today: [], form: null, weekNote: null },
    };
    expect(isFirstRun(nothing)).toBe(true);
    expect(isFirstRun({ ...nothing, leaderboard: { ...nothing.leaderboard, error: true } })).toBe(false);
    expect(isFirstRun({ ...nothing, latestRounds: { ...nothing.latestRounds, error: true } })).toBe(false);
    expect(isFirstRun({ ...nothing, week: { ...nothing.week, error: true } })).toBe(false);
  });
});

describe('Home · the team’s form (teamForm)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });
  // Newest first, as loadSeasonRounds returns them: round i of a player is i days before the newest, all this season.
  let seq = 0;
  const day = (back: number) => {
    const d = new Date(`${seasonStartDate()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 40 - back);
    return d.toISOString().slice(0, 10);
  };
  const r = (score: number, gir: number | null = 10, putts: number | null = 30, o: { player?: string; back?: number; date?: string } = {}): ChRound => ({
    id: `r${String(++seq).padStart(4, '0')}`,
    player_id: o.player ?? 'p1',
    course_name: 'Home',
    tees_played: null,
    round_date: o.date ?? day(o.back ?? seq),
    round_type: 'practice',
    total_score: score,
    score_to_par: score - 72,
    front_nine: null,
    back_nine: null,
    holes_played: 18,
    total_putts: putts,
    total_gir: gir,
    total_gir_possible: gir == null ? null : 18,
    total_fairways_hit: null,
    total_fairways: null,
    strokes_gained_total: null,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: null,
  });
  const newestFirst = (n: number, make: (i: number) => ChRound) => Array.from({ length: n }, (_, i) => make(i));
  it('averages the last ten against the ten before, and compares greens and putts the same way', () => {
    const f = teamForm(newestFirst(20, (i) => (i < 10 ? r(72, 12, 29, { back: i }) : r(74, 9, 31, { back: i }))), 3)!;
    expect(f.avg).toBe(72);
    expect(f.delta).toBe(-2);
    expect(Math.round(f.gir.pct!)).toBe(67);
    expect(Math.round(f.gir.delta!)).toBe(17);
    expect(f.putts.delta).toBe(-2);
    expect(f.roundsThisWeek).toBe(3);
    // One point a day: the team's average on each of the last ten round days the average rests on, oldest to newest.
    expect(f.line).toEqual(Array(10).fill(72));
  });
  it('draws the line as the team’s average on each round day, the last ten days, not a point a round', () => {
    // Three players on each of twelve days: thirty-six rounds, but one point a day, and each player's newest ten reach back to day 2.
    const rounds: ChRound[] = [];
    for (let d = 0; d < 12; d++) ['a', 'b', 'c'].forEach((p, i) => rounds.push(r(70 + d + i, 10, 30, { player: p, back: 11 - d })));
    const full = rounds.sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id < b.id ? 1 : -1));
    const f = teamForm(full, 0)!;
    expect(f.line).toHaveLength(10);
    // Day d's three scores are 70+d, 71+d and 72+d: a mean of 71+d. Days 2 to 11.
    expect(f.line).toEqual([73, 74, 75, 76, 77, 78, 79, 80, 81, 82]);
    // Rounds on one day average into one point.
    expect(teamForm([r(70, 10, 30, { player: 'a', date: day(0) }), r(74, 10, 30, { player: 'b', date: day(0) }), r(71, 10, 30, { player: 'a', date: day(1) })].sort((a, b) => (a.round_date < b.round_date ? 1 : -1)), 0)!.line).toEqual([71, 72]);
  });
  it('colours a change that rounds to zero as shown plain: "0.0" is neither a gain nor a loss (F-54)', () => {
    const p = PREVIEW_HOME.phone;
    wrap(<CoachHome data={{ ...PREVIEW_HOME, phone: { ...p, form: { ...p.form!, delta: 0.03, gir: { pct: 61, delta: 0.4 }, putts: { avg: 30.4, delta: -0.04 } } } }} now={PREVIEW_HOME_NOW} />);
    const form = document.querySelector('.ch-hm-form')!;
    expect(form.querySelector('.ch-hm-delta')!.className).not.toMatch(/is-gain|is-loss/);
    expect(form.querySelectorAll('dd.is-gain, dd.is-loss')).toHaveLength(0);
  });
  it('makes no comparison with fewer than three rounds before (the Stats rule), and nothing with no rounds', () => {
    expect(teamForm(newestFirst(12, (i) => r(73, 10, 30, { back: i })), 0)!.delta).toBeNull();
    expect(teamForm(newestFirst(13, (i) => r(73, 10, 30, { back: i })), 0)!.delta).toBe(0);
    expect(teamForm([], 0)).toBeNull();
  });

  // Swap audit §10-1: Home's "last 10" was the team's newest ten rounds pooled, while Stats (Last 10, Team) pools each
  // player's newest ten. One player posting fifteen rounds pushed everyone else out of Home's average.
  it('§10-1 reads each player’s newest ten, as Stats does, not the team’s newest ten', () => {
    const busy = newestFirst(15, (i) => r(70, 10, 30, { player: 'busy', back: i }));
    const quiet = newestFirst(5, (i) => r(80, 10, 30, { player: 'quiet', back: 20 + i }));
    const full = [...busy, ...quiet].sort((a, b) => (a.round_date < b.round_date ? 1 : -1));
    const f = teamForm(full, 0)!;
    // Hand count: busy's newest ten at 70 and quiet's five at 80 → (700 + 400) / 15.
    expect(f.avg).toBeCloseTo(1100 / 15, 10);
    expect(f.basis.rounds).toBe(15);
    // The same rounds Stats' team loader reads (roundsInFilter per player, Last 10).
    const stats = [...groupByPlayer(full).values()].flatMap((list) => roundsInFilter(list, filterFor('last10')));
    expect(f.avg).toBe(weightedMean(stats, (x) => x.total_score));
    // busy's five before their newest ten are the previous window (quiet has none), as Stats' "vs. previous 10" reads it.
    const statsPrev = [...groupByPlayer(full).values()].flatMap((list) => previousInFilter(list, filterFor('last10')) ?? []);
    expect(statsPrev).toHaveLength(5);
    // Q-112 (owner, 2026-10-01): the change compares the same players. busy shot 70 in both windows, so the team is
    // unchanged; quiet's 80s have no previous ten and no longer fake a +3.3 trend.
    expect(f.delta).toBe(0);
  });

  // Swap audit §10-1, reproduced on production (Demo University Golf, 2026-09-30): three 18-hole rounds on Aug 2 (69, 70, 71,
  // 54 of 54 greens, 37/38/39 putts) were the team's only countable rounds, and the strip read "70.0 · Rounds 0 this week · GIR 100%
  // · Putts 38.0" with nothing saying the figures were three August rounds.
  it('§10-1 says what the average, greens and putts rest on, apart from the week’s count', () => {
    const aug2 = [r(69, 18, 37, { player: 'a', date: day(0) }), r(70, 18, 38, { player: 'b', date: day(0) }), r(71, 18, 39, { player: 'c', date: day(0) })];
    const f = teamForm(aug2, 0)!;
    expect(f.avg).toBe(70);
    expect(f.gir.pct).toBe(100);
    expect(f.putts.avg).toBe(38);
    expect(f.basis).toEqual({ rounds: 3, from: day(0), to: day(0), girRounds: 3, puttsRounds: 3 });
    expect(formBasis(f.basis)).toMatch(/^3 rounds · [A-Z][a-z]{2} \d{1,2}$/);
    wrap(<CoachHome data={{ ...PREVIEW_HOME, phone: { ...PREVIEW_HOME.phone, form: f } }} now={PREVIEW_HOME_NOW} />);
    const form = document.querySelector('.ch-hm-form')!;
    expect(form.querySelector('.ch-hm-form__basis')!.textContent).toBe(formBasis(f.basis));
    expect(form.textContent).not.toMatch(/vs previous 10/);
  });

  it('§10-1 a figure resting on fewer rounds than the average says how many', () => {
    const f = teamForm([r(72, 12, 30, { back: 0 }), r(74, null, null, { back: 1 }), r(73, null, 31, { back: 2 })], 0)!;
    expect(f.basis).toMatchObject({ rounds: 3, girRounds: 1, puttsRounds: 2 });
    // Greens pool the holes of the one round that has them; putts average the two that do.
    expect(f.gir.pct).toBeCloseTo((12 / 18) * 100, 10);
    expect(f.putts.avg).toBe(30.5);
    wrap(<CoachHome data={{ ...PREVIEW_HOME, phone: { ...PREVIEW_HOME.phone, form: f } }} now={PREVIEW_HOME_NOW} />);
    const figs = [...document.querySelectorAll('.ch-hm-form__figs > div')].map((d) => d.textContent);
    expect(figs[1]).toMatch(/1 of 3 rounds/);
    expect(figs[2]).toMatch(/2 of 3 rounds/);
  });
});

describe('Home · the loader', () => {
  const boom = { error: { message: 'boom' } };
  const roundRow = (i: number) => ({
    id: `r${i}`,
    player_id: 'p1',
    course_name: 'Finley GC',
    tees_played: null,
    round_date: `2026-09-${String(28 - i).padStart(2, '0')}`,
    round_type: 'practice',
    total_score: 72,
    score_to_par: 0,
    front_nine: 36,
    back_nine: 36,
    holes_played: 18,
    total_putts: 30,
    total_gir: 11,
    total_gir_possible: 18,
    total_fairways_hit: 9,
    total_fairways: 14,
    strokes_gained_total: 0.5,
    strokes_gained_tee: 0,
    strokes_gained_approach: 0,
    strokes_gained_around_green: 0,
    strokes_gained_putting: 0,
  });
  const onePlayer = { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti', graduation_year: 2027 } }] };

  // Swap audit C-24(d): one 68 put a player above teammates with a season behind them, and equal averages fell in read order.
  it('C-24 the leaderboard: an early read sits below every player with three rounds, and a tie goes to more rounds, then the name', async () => {
    const at = (id: string, player: string, i: number, score: number) => ({ ...roundRow(i), id, player_id: player, total_score: score, score_to_par: score - 72, front_nine: Math.floor(score / 2), back_nine: Math.ceil(score / 2) });
    tables.current = {
      golf_team_members: {
        data: [
          { player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti', graduation_year: 2027 } },
          { player: { id: 'p2', first_name: 'Ben', last_name: 'Ames', graduation_year: 2027 } },
          { player: { id: 'p3', first_name: 'Ava', last_name: 'Ames', graduation_year: 2027 } },
        ],
      },
      golf_rounds: {
        data: [
          at('t1', 'p1', 1, 68),
          ...[2, 3, 4].map((i) => at(`b${i}`, 'p2', i, 72)),
          ...[5, 6, 7].map((i) => at(`a${i}`, 'p3', i, 72)),
        ],
      },
    };
    const home = await load();
    expect(home.leaderboard.rows.map((r) => r.name)).toEqual(['Ava Ames', 'Ben Ames', 'Theo Marchetti']);
  });

  it('22101 a failed read never throws: the page still loads, each section says it failed, and every read is logged', async () => {
    // The roster, the week and the team chat fail together.
    tables.current = { golf_team_settings: boom, golf_team_members: boom, golf_conversations: boom, golf_events: boom };
    const gone = await load();
    expect(gone.week.error).toBe(true);
    expect(gone.latestRounds.error).toBe(true);
    expect(gone.leaderboard.error).toBe(true);
    expect(gone.teamChatId).toBeNull();
    expect(gone.subline).toBeNull();
    expect(gone.phone.form).toBeNull();
    for (const read of ['timezone', 'roster', 'team chat', 'events']) logged(read);

    // The season's rounds fail: the roster stays, and so does the count that says how many players there are.
    logServer.mockClear();
    tables.current = { golf_team_members: onePlayer, golf_rounds: boom };
    const noRounds = await load();
    logged('rounds');
    expect(noRounds.leaderboard).toMatchObject({ error: true, rosterSize: 1, rows: [] });
    expect(noRounds.latestRounds.error).toBe(true);
    expect(noRounds.week.error).toBe(false);

    // The rounds load and their hole-by-hole scores do not: the totals stay.
    logServer.mockClear();
    tables.current = { golf_team_members: onePlayer, golf_rounds: { data: [roundRow(0), roundRow(1)] }, golf_holes: boom };
    const noHoles = await load();
    logged('holes');
    expect(noHoles.latestRounds).toMatchObject({ error: false, holesError: true });
    expect(noHoles.latestRounds.rounds.map((x) => x.score)).toEqual([72, 72]);
    expect(noHoles.leaderboard.rows).toHaveLength(1);
  });

  it('20618 a stored timezone that is not a real zone reads like a missing one: Eastern, logged, and Home still opens', async () => {
    tables.current = { golf_team_settings: { data: { timezone: 'Mars/Olympus' } } };
    const data = await load();
    logged('timezone');
    const et = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    expect(data.todayLabel).toBe(et);
    expect(data.week.days.some((d) => d.isToday)).toBe(true);
  });
});

// ── The route: /golf/dashboard hands each role its Home ──
// The page is the real one; only the session, the flag and the request-scoped team resolvers are faked.

type PageEl = ReactElement<{ data: { greeting: string }; children: ReactElement }>;
/** Which existing dashboard a page element wraps (the stubs above carry a displayName). */
const existing = (el: PageEl) => (el.props.children.type as { displayName?: string }).displayName;
const visit = async (params: { range?: string } = {}) => (await GolfDashboardPage({ searchParams: Promise.resolve(params) })) as PageEl;
const coachSession = (over: Record<string, unknown> = {}) => ({ userId: 'u-coach', coach: { id: 'c1', organization_id: 'o1', full_name: 'Maya Reyes', avatar_url: null, ...over }, player: null });
const playerSession = { userId: 'u-player', coach: null, player: { id: 'p-1', first_name: 'Theo', last_name: 'Marchetti', avatar_url: null } };
type Reads = Array<{ table: string; filters: Array<[string, unknown[]]> }>;
/** Every table answers empty, and every read is written down, with its filters. */
function recordReads(): Reads {
  const reads: Reads = [];
  tables.current = new Proxy({} as import('./supabase-fake').ChFakeTables, {
    get: (_t, table: string) => (filters: Array<[string, unknown[]]>) => {
      reads.push({ table, filters: [...filters] });
      return { data: null };
    },
  });
  return reads;
}
const eqValues = (reads: Reads, column: string) => new Set(reads.flatMap((r) => r.filters).filter(([k, a]) => k === 'eq' && a[0] === column).map(([, a]) => a[1]));

describe('Home · which Home a viewer gets', () => {
  beforeEach(() => {
    flag.coach = true;
    flag.player = true;
    session.current = null;
    requestCache.coachTeam.mockReset();
    requestCache.playerTeam.mockReset();
    redirectSpy.mockClear();
  });

  it('20801 a coach with the Clubhouse flag on gets Coach Home, and the existing dashboard with it off', async () => {
    session.current = coachSession();
    requestCache.coachTeam.mockResolvedValue('t-coach');
    const el = await visit();
    expect(el.type).toBe(CoachHome);
    expect(el.props.data.greeting).toMatch(/, Maya\.$/);
    flag.coach = false;
    const old = await visit();
    expect(old.type).not.toBe(CoachHome);
    expect(existing(old)).toBe('ExistingCoachDashboard');
  });

  it('20801 a player with the Clubhouse flag on gets Player Home, and the existing dashboard with it off', async () => {
    session.current = playerSession;
    requestCache.playerTeam.mockResolvedValue({ data: { team_id: 't-player' }, error: null });
    const el = await visit();
    expect(el.type).toBe(PlayerHome);
    expect(el.props.data.greeting).toMatch(/, Theo\.$/);
    flag.player = false;
    const old = await visit();
    expect(old.type).not.toBe(PlayerHome);
    expect(existing(old)).toBe('ExistingPlayerDashboard');
  });

  it('20801 a session holding both profiles gets the coach’s Home and never Player Home, even with the coach flag off', async () => {
    session.current = { ...coachSession(), player: playerSession.player };
    requestCache.coachTeam.mockResolvedValue('t-coach');
    expect((await visit()).type).toBe(CoachHome);
    flag.coach = false;
    const old = await visit();
    expect(existing(old)).toBe('ExistingCoachDashboard');
    expect(requestCache.playerTeam).not.toHaveBeenCalled();
  });

  it('20801 no session is sent to sign in, and a session with neither profile to sign up', async () => {
    await expect(visit()).rejects.toThrow('NEXT_REDIRECT /golf/login');
    session.current = { userId: 'u-none', coach: null, player: null };
    await expect(visit()).rejects.toThrow('NEXT_REDIRECT /golf/signup');
  });

  it('20802 Coach Home reads the team the session resolves to; nothing in the address can point it at another team', async () => {
    session.current = coachSession();
    requestCache.coachTeam.mockResolvedValue('t-coach');
    const reads = recordReads();
    await visit({ team: 't-other', range: '7d' } as { range?: string });
    expect(requestCache.coachTeam).toHaveBeenCalledWith('o1', 'c1');
    expect(reads.length).toBeGreaterThan(0);
    expect(eqValues(reads, 'team_id')).toEqual(new Set(['t-coach']));
  });

  it('20802 Player Home reads the team of the player’s own active membership, and only that player', async () => {
    session.current = playerSession;
    requestCache.playerTeam.mockResolvedValue({ data: { team_id: 't-player' }, error: null });
    const reads = recordReads();
    await visit({ team: 't-other' } as { range?: string });
    expect(requestCache.playerTeam).toHaveBeenCalledWith('p-1');
    expect(eqValues(reads, 'team_id')).toEqual(new Set(['t-player']));
    expect(eqValues(reads, 'id')).toEqual(new Set(['p-1', 't-player']));
  });

  it('20802 CH-2307 CH-2313 with no team, a coach and a player get the no-team page and nothing is read', async () => {
    const reads = recordReads();
    session.current = coachSession({ organization_id: null });
    expect((await visit()).type).toBe(CoachHomeNoTeam);
    expect(requestCache.coachTeam).not.toHaveBeenCalled();
    session.current = coachSession();
    requestCache.coachTeam.mockResolvedValue(null);
    expect((await visit()).type).toBe(CoachHomeNoTeam);
    session.current = playerSession;
    requestCache.playerTeam.mockResolvedValue({ data: null, error: null });
    expect((await visit()).type).toBe(PlayerHomeNoTeam);
    expect(reads).toEqual([]);
  });

  it('20802 a player’s membership read that fails is the error page, never "You aren’t on a team yet"', async () => {
    session.current = playerSession;
    requestCache.playerTeam.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(visit()).rejects.toThrow(/membership read failed/);
    expect(logServer).toHaveBeenCalledWith('route', 'playerTeam', expect.anything(), 'teams');
  });
});

/** Links are followed by the browser; a test only reads where they point. */
const stopNavigation = (e: Event) => e.preventDefault();

describe('Home · Coach Home’s own contracts', () => {
  beforeEach(() => {
    document.addEventListener('click', stopNavigation, true);
  });
  afterEach(() => {
    document.removeEventListener('click', stopNavigation, true);
    vi.restoreAllMocks();
  });

  it('20101 Coach Home opens with its header, the week beside the latest round, and the leaderboard', () => {
    wrap(<CoachHome data={PREVIEW_HOME} />);
    expect(screen.getByRole('heading', { level: 1, name: PREVIEW_HOME.greeting })).toBeTruthy();
    expect(document.body.textContent).toContain(PREVIEW_HOME.todayLabel);
    expect(screen.getByText(PREVIEW_HOME.subline!)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Message team/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /New event/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'This week' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Latest round' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Leaderboard' })).toBeTruthy();
    // The phone Home is not drawn on a wide canvas.
    expect(document.querySelector('.ch-hm')).toBeNull();
  });

  it('20103 Open recap opens the round\'s review once the round has a real id (the fixtures\' short ids keep the Stats link)', () => {
    const [first, ...others] = PREVIEW_HOME.latestRounds.rounds;
    wrap(<CoachHome data={{ ...PREVIEW_HOME, latestRounds: { ...PREVIEW_HOME.latestRounds, rounds: [{ ...first!, id: '5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c' }, ...others] } }} />);
    expect(screen.getByRole('link', { name: 'Open recap' }).getAttribute('href')).toBe('/golf/dashboard/rounds/5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c');
    expect(screen.queryByRole('link', { name: "Theo's stats" })).toBeNull();
  });

  it('20103 links out of Coach Home open what they name', () => {
    wrap(<CoachHome data={PREVIEW_HOME} />);
    const href = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href(/Message team/)).toBe('/golf/dashboard/messages?conversation=c-team');
    expect(href(/New event/)).toBe('/golf/dashboard/calendar?new=1');
    expect(href('Full roster')).toBe('/golf/dashboard/roster');
    expect(href("Theo's stats")).toBe('/golf/dashboard/stats?player=theo');
    // A leaderboard row is a link (its role is row, for the table), to that player's stats.
    expect(document.querySelector('a.ch-h-lb__row')!.getAttribute('href')).toBe('/golf/dashboard/stats?player=theo');
  });

  it('20806 Coach Home draws no player control: no Message coach, no Post a round, no countdown', () => {
    wrap(<CoachHome data={PREVIEW_HOME} />);
    expect(screen.queryByRole('link', { name: 'Message coach' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Post a round' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Scoring' })).toBeNull();
    expect(document.querySelector('.ch-cd')).toBeNull();
  });

  it('21402 Try again on a failed read asks the server for the whole page again; a crashed section only draws itself again', async () => {
    const user = userEvent.setup();
    const failed = wrap(<CoachHome data={home({ leaderboard: { ...PREVIEW_HOME.leaderboard, error: true } })} />);
    await user.click(within(code('CH-2204') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    failed.unmount();

    router.refresh.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    wrap(<CoachHome data={home({ leaderboard: { ...PREVIEW_HOME.leaderboard, rows: null as never } })} />);
    const crashes = vi.mocked(chReport).mock.calls.length;
    expect(crashes).toBeGreaterThan(0);
    await user.click(within(code('CH-2207') as HTMLElement).getByRole('button', { name: 'Try again' }));
    // The section drew again (and crashed again, reported again); the server was not asked.
    expect(vi.mocked(chReport).mock.calls.length).toBeGreaterThan(crashes);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('21402 CH-1905 Try again while offline says so and asks nothing', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      wrap(<CoachHome data={home({ leaderboard: { ...PREVIEW_HOME.leaderboard, error: true } })} />);
      await user.click(within(code('CH-2204') as HTMLElement).getByRole('button', { name: 'Try again' }));
      expect(code('CH-1905')!.textContent).toMatch(/You're offline/);
      expect(router.refresh).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    }
  });

  it('21703 on the desktop, New event gives the light tap, paging gives a tick, and Message team is silent', async () => {
    const user = userEvent.setup();
    wrap(<CoachHome data={PREVIEW_HOME} />);
    await user.click(screen.getByRole('link', { name: /Message team/ }));
    expect(hapticSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: /New event/ }));
    expect(hapticSpy.mock.calls).toEqual([['press']]);
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    expect(hapticSpy.mock.calls).toEqual([['select']]);
  });

  it('22301 a section that crashes is reported at high severity under its own surface, and N leaves a breadcrumb', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = home({
      week: { ...PREVIEW_HOME.week, days: null as never },
      latestRounds: { ...PREVIEW_HOME.latestRounds, rounds: null as never },
      leaderboard: { ...PREVIEW_HOME.leaderboard, rows: null as never },
    });
    const view = wrap(<CoachHome data={broken} />);
    for (const surface of ['home.week', 'home.latestRound', 'home.leaderboard']) {
      expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface, severity: 'high' }));
    }
    view.unmount();
    wrap(<HomeActions teamChatId="c1" />);
    await user.keyboard('n');
    expect(chTrail).toHaveBeenCalledWith('home new event (keyboard)');
  });
});

describe('Home · the phone, the page’s own contracts', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    document.addEventListener('click', stopNavigation, true);
  });
  afterEach(() => {
    window.matchMedia = real;
    document.removeEventListener('click', stopNavigation, true);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('21901 at 820px and below Home is the phone Home, in its own order, and none of the desktop page', () => {
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    const main = document.querySelector('main.ch-hm')!;
    expect(main.getAttribute('aria-label')).toBe('Home');
    const headings = [...main.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.filter((h) => ['Today', 'This week', 'Latest rounds'].includes(h!))).toEqual(['Today', 'This week', 'Latest rounds']);
    expect(main.querySelector('.ch-hm-form')).not.toBeNull();
    expect(document.querySelector('.ch-h-main')).toBeNull();
    expect(screen.queryByRole('table', { name: 'Leaderboard' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Message team/ })).toBeNull();
  });

  it('20103 links out of the phone Home open what they name', async () => {
    const user = userEvent.setup();
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    // A week day opens Calendar's day view.
    const day = document.querySelector('.ch-hm-week li.is-today a')!;
    expect(day.getAttribute('href')).toBe('/golf/dashboard/calendar?view=day&date=2026-10-14');
    // A round opens its card, which links to Messages and to the player's stats (CH-2701).
    await user.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Theo Marchetti' });
    expect(within(sheet).getByRole('link', { name: 'Message' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=theo');
    expect(within(sheet).getByRole('link', { name: 'Player stats' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=theo');
  });

  it("20103 on the phone the Latest rounds header opens Team stats (the board's All, Q-79), and only when there are rounds", () => {
    const { unmount } = wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    const header = document.getElementById('ch-hm-rounds')!.parentElement!;
    expect(within(header).getByRole('link', { name: 'Team stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    unmount();
    wrap(<CoachHome data={{ ...PREVIEW_HOME, latestRounds: { ...PREVIEW_HOME.latestRounds, rounds: [] } }} now={PREVIEW_HOME_NOW} />);
    expect(within(document.getElementById('ch-hm-rounds')!.parentElement!).queryByRole('link')).toBeNull();
  });

  it('20103 on the phone a round with a real id opens its review from the card (Round recap)', async () => {
    const user = userEvent.setup();
    const [first, ...others] = PREVIEW_HOME.latestRounds.rounds;
    wrap(<CoachHome data={{ ...PREVIEW_HOME, latestRounds: { ...PREVIEW_HOME.latestRounds, rounds: [{ ...first!, id: '5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c' }, ...others] } }} now={PREVIEW_HOME_NOW} />);
    await user.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Theo Marchetti' });
    expect(within(sheet).getByRole('link', { name: 'Round recap' }).getAttribute('href')).toBe('/golf/dashboard/rounds/5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c');
    expect(within(sheet).queryByRole('link', { name: 'Player stats' })).toBeNull();
  });

  it('20103 an empty day offers Plan, which opens the editor', () => {
    const quietDay = { ...PREVIEW_HOME, phone: { ...PREVIEW_HOME.phone, today: [] } };
    wrap(<CoachHome data={quietDay} now={PREVIEW_HOME_NOW} />);
    expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1');
  });

  it('20301 the phone’s Up next line keeps time without a reload', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(PREVIEW_HOME_NOW));
    wrap(<CoachHome data={PREVIEW_HOME} />);
    const when = () => document.querySelector('a.ch-hm-next .ch-hm-next__when')!.textContent;
    expect(when()).toBe('In 50 min');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(when()).toBe('In 49 min');
    // The tee time (3:30 PM) arrives.
    act(() => {
      vi.advanceTimersByTime(49 * 60_000);
    });
    expect(when()).toBe('Happening now');
  });

  it('21703 on the phone a quick event type ticks, Add event gives the light tap, and a round opens with a tick', async () => {
    const user = userEvent.setup();
    const none = wrap(<CoachHome data={PREVIEW_HOME_NO_EVENTS} now={PREVIEW_HOME_NOW} />);
    await user.click(screen.getByRole('link', { name: 'Qualifier' }));
    expect(hapticSpy.mock.calls).toEqual([['select']]);
    hapticSpy.mockClear();
    await user.click(screen.getByRole('link', { name: 'Add event' }));
    expect(hapticSpy.mock.calls).toEqual([['press']]);
    none.unmount();
    hapticSpy.mockClear();
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    await user.click(screen.getByRole('button', { name: /Sofia Alvarez/ }));
    expect(hapticSpy.mock.calls).toEqual([['select']]);
  });

  it('22301 a phone section that crashes is reported under its own surface; opening Up next or a round leaves a breadcrumb', async () => {
    const user = userEvent.setup();
    const view = wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    await user.click(document.querySelector('a.ch-hm-next')!);
    expect(chTrail).toHaveBeenCalledWith('home open next event');
    await user.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    expect(chTrail).toHaveBeenCalledWith('home open round');
    view.unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = PREVIEW_HOME.phone;
    wrap(<CoachHome data={{ ...PREVIEW_HOME, phone: { ...p, next: { ...p.next!, type: 'nope' as never }, today: null as never, form: { ...p.form!, line: null as never } } }} now={PREVIEW_HOME_NOW} />);
    for (const surface of ['home.upNext', 'home.today', 'home.form']) {
      expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface, severity: 'high' }));
    }
  });
});

describe('Home · this file', () => {
  it('22401 the tests name every Home catalog code of kinds 0 to 5 that is not preview, and every Bridge ID this page proves', () => {
    const root = process.cwd();
    const all = ['home.test.tsx', 'player-home.test.tsx'].map((f) => readFileSync(join(root, 'src/clubhouse/__tests__', f), 'utf8')).join('\n');
    const titles = all.split('\n').filter((l) => /^\s*(it|describe)(\.each\(.*\))?\(/.test(l));
    const catalog = readFileSync(join(root, 'docs/clubhouse/catalog/home.md'), 'utf8');
    const forced = [...catalog.matchAll(/^\|\s*(CH-2[0-5]\d\d)\s*\|.*$/gm)].filter((m) => !/\|\s*preview\s*\|\s*$/.test(m[0].trim())).map((m) => m[1]!);
    // A floor, so an unreadable catalog can't pass by finding nothing (2201 to 2217, 2301 to 2313 and 2401).
    expect(forced.length).toBeGreaterThanOrEqual(31);
    expect(forced.filter((c) => !titles.some((l) => l.includes(c)))).toEqual([]);
    const bridge = JSON.parse(readFileSync(join(root, 'config/clubhouse/bridge-contracts.json'), 'utf8')) as Array<{ id: number; page: string; chCode?: string; status: string }>;
    const unnamed = bridge.filter((r) => r.page === 'P002' && !r.chCode && r.status === 'implemented').filter((r) => !titles.some((l) => l.includes(String(r.id))));
    expect(unnamed.map((r) => r.id)).toEqual([]);
  });
});
