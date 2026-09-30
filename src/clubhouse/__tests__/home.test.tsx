import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Home: every numbered state in docs/clubhouse/catalog/home.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadCoachHome, teamForm, type ChCoachHome } from '../data/home';
import { CoachHome, CoachHomeNoTeam, isFirstRun } from '../screens/home/CoachHome';
import { HomeActions } from '../screens/home/HomeActions';
import { HomeSkeleton } from '../screens/home/HomeSkeleton';
import { LatestRound } from '../screens/home/LatestRound';
import { Leaderboard } from '../screens/home/Leaderboard';
import { Week, dayLabel } from '../screens/home/Week';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME, PREVIEW_HOME_NOW } from '../preview/fixtures';

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
  tables.current = {};
});

describe('Home · reads that fail', () => {
  it('CH-2201 the week does not load: a notice with Try again, never an empty week', async () => {
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

  it('CH-2208 the team chat does not load: Message team opens Messages instead', async () => {
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

  it('CH-2702 CH-2801 N opens a new event, but not while typing', async () => {
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

  it('the hero: date, greeting, brief, and Up next with its countdown and replies, opening the event in Calendar', () => {
    wrap(<CoachHome data={PREVIEW_HOME} now={PREVIEW_HOME_NOW} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Good morning, Maya.' })).toBeTruthy();
    const next = document.querySelector('a.ch-hm-next') as HTMLAnchorElement;
    expect(next.getAttribute('href')).toBe('/golf/dashboard/calendar?date=2026-10-14&event=a1');
    // 2:40 PM against a 3:30 PM start.
    expect(next.textContent).toMatch(/In 50 min/);
    expect(next.textContent).toMatch(/5 of 6 going/);
    expect(next.querySelector('.is-soon')).not.toBeNull();
  });

  it('Today: a timeline, with overlaps marked and each row opening its event', () => {
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
    expect(screen.getByRole('img', { name: /Team scoring, a five-round average/ })).toBeTruthy();
  });

  it('CH-2701 a latest round opens its card in a sheet: the figures, both nines, Message and the player’s stats', async () => {
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

  it('CH-2309 nothing ahead: Up next says so, with quick types that open the editor on that type', () => {
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
  const r = (score: number, gir = 10, putts = 30) => ({ total_score: score, total_gir: gir, total_gir_possible: 18, total_putts: putts });
  it('averages the last ten against the ten before, and compares greens and putts the same way', () => {
    const f = teamForm([...Array.from({ length: 10 }, () => r(72, 12, 29)), ...Array.from({ length: 10 }, () => r(74, 9, 31))], 3)!;
    expect(f.avg).toBe(72);
    expect(f.delta).toBe(-2);
    expect(Math.round(f.gir.pct!)).toBe(67);
    expect(Math.round(f.gir.delta!)).toBe(17);
    expect(f.putts.delta).toBe(-2);
    expect(f.roundsThisWeek).toBe(3);
    // Oldest to newest, a five-round moving average.
    expect(f.line[0]).toBe(74);
    expect(f.line[f.line.length - 1]).toBe(72);
  });
  it('makes no comparison with fewer than five rounds before, and nothing with no rounds', () => {
    expect(teamForm(Array.from({ length: 12 }, () => r(73)), 0)!.delta).toBeNull();
    expect(teamForm([], 0)).toBeNull();
  });
});
