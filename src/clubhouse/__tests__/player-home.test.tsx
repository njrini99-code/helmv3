import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Player Home: the player's numbered states in docs/clubhouse/catalog/home.md, found by their number,
 * and the page's own contracts (docs/clubhouse/pages/P002-home/CONTRACT.md), found by their five-digit Bridge ID.
 * Coach Home's are in home.test.tsx, which also tests the route that hands each role its Home.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { briefFor, legRows, loadPlayerHome, type ChPlayerHome } from '../data/player-home';
import type { ChRound } from '../data/season';
import { PlayerHome, PlayerHomeNoTeam, isPlayerFirstRun } from '../screens/home/PlayerHome';
import { scoringNote } from '../screens/home/PlayerGame';
import { Countdown } from '../screens/home/Countdown';
import { chReport, chTrail } from '../lib/track';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME_NOW } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME, PREVIEW_PLAYER_HOME_EMPTY, PREVIEW_PLAYER_HOME_FAILED } from '../preview/fixtures-player-home';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            {node}
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
const home = (over: Partial<ChPlayerHome> = {}): ChPlayerHome => ({ ...PREVIEW_PLAYER_HOME, ...over });
const show = (data: ChPlayerHome = home()) => wrap(<PlayerHome data={data} now={PREVIEW_HOME_NOW} />);

function round(i: number, over: Partial<ChRound> = {}): ChRound {
  const day = String(28 - i).padStart(2, '0');
  return {
    id: `r${i}`,
    player_id: 'p1',
    course_name: 'Finley GC',
    tees_played: null,
    round_date: `2026-09-${day}`,
    round_type: 'practice',
    total_score: 72 - (i % 3),
    score_to_par: -(i % 3),
    front_nine: 36,
    back_nine: 36,
    holes_played: 18,
    total_putts: 30,
    total_gir: 11,
    total_gir_possible: 18,
    total_fairways_hit: 9,
    total_fairways: 14,
    strokes_gained_total: 0.5,
    strokes_gained_tee: 0.8,
    strokes_gained_approach: -0.4,
    strokes_gained_around_green: 0.1,
    strokes_gained_putting: 0,
    ...over,
  };
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

/** Links are followed by the browser; a test only reads where they point. */
const stopNavigation = (e: Event) => e.preventDefault();

describe('Player Home · desktop (Player - Home.html)', () => {
  it('20102 20103 the day, the brief, Message coach to the coach’s thread; Post a round waits for round entry', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Good afternoon, Theo.' })).toBeTruthy();
    expect(screen.getByText(/Off the tee is gaining you 0\.8 strokes a round/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=coach-maya');
    // Round entry isn't rebuilt for players yet (Q-69), so the button isn't drawn rather than leading nowhere.
    expect(screen.queryByRole('link', { name: 'Post a round' })).toBeNull();
  });

  it('20103 21807 Up next sits in the week with a countdown to the tee time', () => {
    show();
    const next = screen.getByRole('link', { name: /Up next · Qualifier/ });
    expect(next.getAttribute('href')).toBe('/golf/dashboard/calendar?date=2026-10-16&event=q1');
    // 14 Oct 18:40Z to 16 Oct 12:42Z: 1 day, 18 hours, 2 minutes.
    const timer = within(next).getByRole('timer', { name: 'Starts in 1 day, 18 hours and 2 minutes' });
    // The digits, the ticking seconds included, are hidden from a screen reader: it hears the timer's name once.
    expect(timer.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    expect([...timer.children].every((c) => c.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('20103 My latest round: the course, a flag not an avatar, and My stats', async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getByRole('heading', { level: 2, name: 'My latest round' })).toBeTruthy();
    expect(document.querySelector('.ch-h-round__name')!.textContent).toBe('Oakmont CC');
    expect(document.querySelector('.ch-h-round .ch-h-flag')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'My stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    // The outgoing card leaves over the swap animation; the new one is there at once.
    expect(await screen.findByText('Pine Needles')).toBeTruthy();
  });

  it('21703 Scoring: last 10 by default, the figures follow the window with a tick, the note reads the rounds', async () => {
    const user = userEvent.setup();
    show();
    const figs = () => [...document.querySelectorAll('.ch-ph-figs dd:not(.ch-ph-figs__m)')].map((d) => d.textContent);
    expect(screen.getByRole('img', { name: /Your scores over the last 10 rounds/ })).toBeTruthy();
    expect(figs()).toEqual(['70.1', '+1.8', '+0.8', '10 of 10']);
    await user.click(screen.getByRole('radio', { name: 'Last 5' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.getByRole('img', { name: /Your scores over the last 5 rounds/ })).toBeTruthy();
    expect(figs()[0]).toBe('69.8');
    expect(figs()[3]).toBe('5 of 5');
  });

  it('the parts of the game: strokes gained, a D1 mark only where a benchmark exists', () => {
    show();
    const legs = [...document.querySelectorAll('.ch-ph-leg')];
    expect(legs.map((l) => l.querySelector('b')!.textContent)).toEqual(['Off the tee', 'Approach', 'Short game', 'Putting']);
    expect(legs[1]!.querySelector('.ch-ph-bench')!.textContent).toMatch(/You 74%D1 60%/);
    expect(legs[0]!.querySelector('.ch-ph-bench')).toBeNull();
    expect(legs[3]!.querySelector('.ch-ph-leg__sg')!.textContent).toMatch(/^\+0\.1/);
  });

  it('CH-2201 CH-2202 CH-2215 reads that fail say so, never zeros or an empty week', () => {
    show(PREVIEW_PLAYER_HOME_FAILED);
    for (const c of ['CH-2201', 'CH-2202', 'CH-2215']) expect(code(c)).not.toBeNull();
    expect(code('CH-2301')).toBeNull();
    expect(code('CH-2310')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'By part of the game' })).toBeNull();
  });

  it('CH-2216 scrambling didn’t load: the notice, the other parts stay', () => {
    show(home({ legs: { ...PREVIEW_PLAYER_HOME.legs!, cacheError: true } }));
    expect(code('CH-2216')!.textContent).toMatch(/scrambling is missing/);
    expect(document.querySelectorAll('.ch-ph-leg')).toHaveLength(4);
  });

  it('CH-2310 CH-2311 one round: the line waits for the second; nothing to break down says so', () => {
    show(home({ scoring: { points: PREVIEW_PLAYER_HOME.scoring.points.slice(-1), error: false }, legs: PREVIEW_PLAYER_HOME_EMPTY.legs }));
    expect(code('CH-2310')!.textContent).toMatch(/One round so far/);
    expect(code('CH-2311')).not.toBeNull();
  });

  it('CH-2217 the scoring section crashing stays inside it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    show(home({ scoring: { points: null as never, error: false } }));
    expect(code('CH-2217')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Good afternoon, Theo.' })).toBeTruthy();
    spy.mockRestore();
  });

  it('CH-2312 a new player gets the first-run page; a failed read is never taken for new', () => {
    expect(isPlayerFirstRun(PREVIEW_PLAYER_HOME_EMPTY)).toBe(true);
    expect(isPlayerFirstRun(PREVIEW_PLAYER_HOME_FAILED)).toBe(false);
    show(PREVIEW_PLAYER_HOME_EMPTY);
    expect(code('CH-2312')!.textContent).toMatch(/Welcome to the team/);
  });

  it('CH-2313 a player on no team', () => {
    wrap(<PlayerHomeNoTeam />);
    expect(code('CH-2313')!.textContent).toMatch(/aren't on a team yet/);
  });
});

describe('Player Home · phone (Player - Home - Mobile.html)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('20102 20103 21901 the hero: Up next with its countdown, and Message coach', () => {
    show();
    const next = screen.getByRole('link', { name: /Pinehurst No\. 2/ });
    expect(within(next).getByRole('timer')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=coach-maya');
  });

  it('CH-2309 nothing ahead: the empty card, with no Add event (a player can’t add team events)', () => {
    show(home({ next: null }));
    expect(code('CH-2309')!.textContent).toMatch(/Your coach's practices and events will show here/);
    expect(screen.queryByRole('link', { name: /Add event/ })).toBeNull();
  });

  it('CH-2301 an empty day has no Plan button for a player', () => {
    show(home({ today: [] }));
    expect(code('CH-2301')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Plan' })).toBeNull();
  });

  it('21703 My latest round pages inline, with a selection tick', async () => {
    const user = userEvent.setup();
    show();
    const sec = screen.getByRole('heading', { level: 2, name: 'My latest round' }).closest('section')!;
    expect(within(sec).getByText('Oakmont CC')).toBeTruthy();
    expect(within(sec).getAllByRole('table')).toHaveLength(2);
    await user.click(within(sec).getByRole('button', { name: 'Next round' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(within(sec).getByText('Pine Needles')).toBeTruthy();
    await user.click(within(sec).getByRole('button', { name: 'Next round' }));
    expect(code('CH-2303')).not.toBeNull();
  });
});

describe('Player Home · the loader', () => {
  it('20803 20805 reads only the player’s own rounds, names no other invitee, and finds the coach', async () => {
    const roundsQueries: Array<Array<[string, unknown[]]>> = [];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: (f) => {
        roundsQueries.push(f);
        return { data: [round(0), round(1), round(2), round(3)] };
      },
      golf_players: { data: { handicap_index: 2.1, handicap: null } },
      // created_by is a golf_coaches.id (not a user id), as on every live team.
      golf_teams: { data: { gender: 'men', created_by: 'c-head', organization_id: 'o1' } },
      golf_coaches: { data: [{ id: 'c-asst', user_id: 'u-asst' }, { id: 'c-head', user_id: 'u-head' }] },
      golf_holes: { data: [] },
      golf_round_stats_cache: { data: [] },
      golf_pga_standards: { data: [{ metric_id: 'gir_pct', div1_avg_value: 60, tour: 'pga' }] },
    };
    const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo' });
    expect(roundsQueries[0]).toContainEqual(['in', ['player_id', ['p1']]]);
    expect(data.coachUserId).toBe('u-head');
    expect(data.handicap).toBe(2.1);
    expect(data.greeting).toMatch(/, Theo\.$/);
    // Oldest first: r3 (72), r2 (70), r1 (71), r0 (72).
    expect(data.scoring.points.map((p) => p.score)).toEqual([72, 70, 71, 72]);
    expect(data.latest.rounds).toHaveLength(3);
    expect(data.legs!.rows.find((l) => l.key === 'approach')!.d1).toBe(60);
    expect(data.legs!.rows.find((l) => l.key === 'tee')!.d1).toBeNull();
  });

  it('20804 a player’s week names no one: today’s event reads a count, never teammates’ names', async () => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [{ id: 'e1', title: 'Putting ladder', event_type: 'practice', start_time: `${d}T21:30:00Z`, end_time: `${d}T22:30:00Z`, all_day: false, location: 'Green 2' }] },
      golf_event_attendance: { data: [{ id: 'x1', event_id: 'e1', player_id: 'p-priya', status: 'accepted' }, { id: 'x2', event_id: 'e1', player_id: 'p-ava', status: 'pending' }] },
      golf_rounds: { data: [] },
      golf_team_members: { data: [{ player: { id: 'p-priya', first_name: 'Priya', last_name: 'Natarajan', graduation_year: 2027 } }] },
    };
    const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo' });
    const row = data.week.agenda.find((r) => r.id === 'e1')!;
    expect(row.detail).toBe('Green 2 · 2 players');
    expect(data.today[0]!.invitees).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/Priya|undefined/);
  });

  it('CH-2215 rounds that fail: no brief, no legs, the scoring notice', async () => {
    tables.current = { golf_rounds: { error: { message: 'boom' } }, golf_events: { data: [] } };
    const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo' });
    expect(data.scoring.error).toBe(true);
    expect(data.latest.error).toBe(true);
    expect(data.brief).toBeNull();
    expect(data.legs).toBeNull();
  });

  it('legRows weights by attempts (never a mean of percentages) and trends oldest first', () => {
    const rows = legRows([round(0, { total_gir: 18, total_gir_possible: 18 }), round(1, { total_gir: 0, total_gir_possible: 2 })], new Map(), null, {
      tee: null,
      approach: null,
      around: null,
      putting: null,
    });
    const approach = rows.find((r) => r.key === 'approach')!;
    expect(approach.value).toBe(90);
    expect(approach.trend).toEqual([0, 100]);
    expect(approach.note).toBe('18 of 20 greens in the last 2 rounds');
  });

  it('briefFor names the best leg gaining, or the leg costing most', () => {
    const legs = legRows([], new Map(), null, { tee: 0.8, approach: -0.4, around: 0.1, putting: 0 });
    expect(briefFor([round(0), round(1), round(2)], legs)).toBe('Your last three rounds average 71.0. Off the tee is gaining you 0.8 strokes a round.');
    const losing = legRows([], new Map(), null, { tee: -0.2, approach: -0.9, around: null, putting: null });
    expect(briefFor([round(0)], losing)).toBe('Your last round was 72. Approach is costing the most, 0.9 strokes a round.');
    expect(briefFor([], legs)).toBeNull();
  });

  it('scoringNote: the score four in five rounds meet', () => {
    const pts = [70, 71, 72, 69, 75].map((score, i) => ({ id: `${i}`, label: '', score, par: 72 }));
    expect(scoringNote(pts)).toBe('Four of your last five are 72 or better.');
  });
});

type Filters = Array<[string, unknown[]]>;
const player = { teamId: 't1', playerId: 'p1', firstName: 'Theo' };

describe('Player Home · what the loader reads and whom it names', () => {
  afterEach(() => vi.useRealTimers());

  it('20803 the tables read are exactly the player’s own and the team’s calendar: no roster, and every round id is theirs', async () => {
    const seen: Array<{ table: string; filters: Filters }> = [];
    const answers: Record<string, object> = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: { data: [round(0), round(1)] },
      golf_players: { data: { handicap_index: 2.1, handicap: null } },
      golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
      golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
    };
    // Any table not listed still answers (empty) and is written down, so a new read cannot slip by.
    tables.current = new Proxy({} as import('./supabase-fake').ChFakeTables, {
      get: (_t, table: string) => (filters: Filters) => {
        seen.push({ table, filters: [...filters] });
        return answers[table] ?? { data: [] };
      },
    });
    await loadPlayerHome(player);
    expect([...new Set(seen.map((s) => s.table))].sort()).toEqual(
      ['golf_coaches', 'golf_events', 'golf_holes', 'golf_pga_standards', 'golf_players', 'golf_round_stats_cache', 'golf_rounds', 'golf_team_settings', 'golf_teams'].sort(),
    );
    const filtersOf = (table: string) => seen.filter((s) => s.table === table).flatMap((s) => s.filters);
    expect(filtersOf('golf_rounds')).toContainEqual(['in', ['player_id', ['p1']]]);
    expect(filtersOf('golf_players')).toContainEqual(['eq', ['id', 'p1']]);
    expect(filtersOf('golf_holes')).toContainEqual(['in', ['round_id', ['r0', 'r1']]]);
    expect(filtersOf('golf_round_stats_cache')).toContainEqual(['in', ['round_id', ['r0', 'r1']]]);
    expect(filtersOf('golf_coaches')).toContainEqual(['eq', ['organization_id', 'o1']]);
  });

  it('20804 a player’s payload holds no teammate’s name or id, and a competition later in the week reads a count', async () => {
    // Monday 12 October, noon in New York.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T16:00:00Z'));
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: {
        data: [
          { id: 'e1', title: 'Putting ladder', event_type: 'practice', start_time: '2026-10-12T21:30:00Z', end_time: '2026-10-12T22:30:00Z', all_day: false, location: 'Green 2' },
          { id: 'e2', title: 'Pinehurst qualifier', event_type: 'qualifier', start_time: '2026-10-15T12:42:00Z', end_time: null, all_day: false, location: null },
        ],
      },
      golf_event_attendance: {
        data: [
          { id: 'x1', event_id: 'e1', player_id: 'p-priya', status: 'accepted' },
          { id: 'x2', event_id: 'e1', player_id: 'p-ava', status: 'pending' },
          { id: 'x3', event_id: 'e2', player_id: 'p-priya', status: 'accepted' },
          { id: 'x4', event_id: 'e2', player_id: 'p-ava', status: 'pending' },
        ],
      },
      golf_team_members: { data: [{ player: { id: 'p-priya', first_name: 'Priya', last_name: 'Natarajan', graduation_year: 2027 } }] },
      golf_rounds: { data: [] },
    };
    const data = await loadPlayerHome(player);
    expect(data.week.agenda.map((r) => r.detail)).toEqual(['Green 2 · 2 players', 'First tee 8:42 · 1 of 2 confirmed']);
    expect(data.today[0]!.invitees).toEqual([]);
    expect(data.next!.invitees).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/p-priya|p-ava|priya|natarajan/i);
  });

  it('20805 Message coach goes to the coach who created the team, else a coach with an account, else plain Messages', async () => {
    const coachesRead: Filters[] = [];
    const run = async (team: object, coaches: { data?: unknown; error?: unknown }) => {
      tables.current = {
        golf_team_settings: { data: { timezone: 'America/New_York' } },
        golf_events: { data: [] },
        golf_rounds: { data: [] },
        golf_teams: { data: team },
        golf_coaches: (filters) => {
          coachesRead.push(filters);
          return coaches;
        },
      };
      return loadPlayerHome(player);
    };
    const two = { data: [{ id: 'c-a', user_id: 'u-a' }, { id: 'c-b', user_id: 'u-b' }] };
    const team = { gender: 'men', created_by: 'c-b', organization_id: 'o1' };
    expect((await run(team, two)).coachUserId).toBe('u-b');
    // Only the team's own organisation's coaches, and only ones with an account.
    expect(coachesRead[0]).toContainEqual(['eq', ['organization_id', 'o1']]);
    expect(coachesRead[0]).toContainEqual(['not', ['user_id', 'is', null]]);
    // The creating coach has no account (or has left): the organisation's first.
    expect((await run({ ...team, created_by: 'c-gone' }, two)).coachUserId).toBe('u-a');
    // No organisation, no coach with an account, or coaches that don't load: nobody is named.
    expect((await run({ ...team, organization_id: null }, two)).coachUserId).toBeNull();
    expect((await run(team, { data: [] })).coachUserId).toBeNull();
    logServer.mockClear();
    expect((await run(team, { error: { message: 'boom' } })).coachUserId).toBeNull();
    expect(logServer).toHaveBeenCalledWith('home', 'coaches', expect.anything());
  });

  it('20805 Message coach opens the coach’s thread (?user=), or Messages itself when no coach is known', () => {
    const view = show();
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=coach-maya');
    view.unmount();
    show(home({ coachUserId: null }));
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages');
  });

  it('22101 a failed read never throws: the page loads, each section says it failed, and every read is logged', async () => {
    const boom = { error: { message: 'boom' } };
    tables.current = { golf_team_settings: boom, golf_events: boom, golf_rounds: boom, golf_players: boom, golf_teams: boom };
    const gone = await loadPlayerHome(player);
    expect(gone.week.error).toBe(true);
    expect(gone.latest.error).toBe(true);
    expect(gone.scoring.error).toBe(true);
    expect(gone.legs).toBeNull();
    expect(gone.brief).toBeNull();
    expect(gone.coachUserId).toBeNull();
    expect(gone.handicap).toBeNull();
    for (const read of ['timezone', 'events', 'rounds', 'player', 'team']) expect(logServer).toHaveBeenCalledWith('home', read, expect.anything());

    // The rounds load; the hole-by-hole scores, the round cache, the D1 benchmarks and the coaches do not.
    logServer.mockClear();
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: { data: [round(0), round(1), round(2)] },
      golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
      golf_holes: boom,
      golf_round_stats_cache: boom,
      golf_pga_standards: boom,
      golf_coaches: boom,
    };
    const part = await loadPlayerHome(player);
    expect(part.latest).toMatchObject({ error: false, holesError: true });
    expect(part.legs).toMatchObject({ cacheError: true, d1Error: true });
    expect(part.legs!.rows).toHaveLength(4);
    expect(part.scoring.points).toHaveLength(3);
    expect(part.coachUserId).toBeNull();
    for (const read of ['holes', 'roundCache', 'd1Benchmarks', 'coaches']) expect(logServer).toHaveBeenCalledWith('home', read, expect.anything());
  });
});

describe('Player Home · the page’s own contracts (desktop)', () => {
  beforeEach(() => {
    document.addEventListener('click', stopNavigation, true);
  });
  afterEach(() => {
    document.removeEventListener('click', stopNavigation, true);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('20102 Player Home opens with its header, the week beside My latest round, and Scoring and the parts of the game', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: PREVIEW_PLAYER_HOME.greeting })).toBeTruthy();
    expect(document.body.textContent).toContain(PREVIEW_PLAYER_HOME.todayLabel);
    expect(screen.getByText(PREVIEW_PLAYER_HOME.brief!)).toBeTruthy();
    const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings).toEqual(['This week', 'My latest round', 'Scoring', 'By part of the game']);
    // The phone Home is not drawn on a wide canvas.
    expect(document.querySelector('.ch-hm')).toBeNull();
  });

  it('20806 Player Home draws none of the coach’s controls or figures, and N does nothing', async () => {
    const user = userEvent.setup();
    show();
    for (const name of [/Message team/, /New event/, 'Plan', 'Add event', 'Full roster', 'Player stats']) expect(screen.queryByRole('link', { name })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Leaderboard' })).toBeNull();
    // No link to another player's stats or thread.
    expect(document.querySelector('a[href*="player="]')).toBeNull();
    await user.keyboard('n');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('21807 the timer’s name says one day, hour or minute in the singular', () => {
    wrap(<Countdown to="2026-10-14T19:41:30Z" frozen="2026-10-14T18:40:00Z" />);
    expect(screen.getByRole('timer', { name: 'Starts in 0 days, 1 hour and 1 minute' })).toBeTruthy();
  });

  it('20301 the countdown ticks every second and is gone once the event has started', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
    wrap(<Countdown to="2026-10-14T18:41:30Z" />);
    const digits = () => [...screen.getByRole('timer').querySelectorAll('b')].map((b) => b.textContent).join(':');
    expect(digits()).toBe('00:00:01:30');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(digits()).toBe('00:00:01:29');
    act(() => {
      vi.advanceTimersByTime(89_000);
    });
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('22301 the player’s sections are reported under their own surface, and Coach Home’s controls are not here', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    show(home({ scoring: { points: null as never, error: false }, latest: { ...PREVIEW_PLAYER_HOME.latest, rounds: null as never } }));
    for (const surface of ['home.game', 'home.latestRound']) {
      expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface, severity: 'high' }));
    }
  });
});

describe('Player Home · the phone, the page’s own contracts', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    document.addEventListener('click', stopNavigation, true);
  });
  afterEach(() => {
    window.matchMedia = real;
    document.removeEventListener('click', stopNavigation, true);
    vi.restoreAllMocks();
  });

  it('21901 at 820px and below Player Home is the phone Home, in its own order, and none of the desktop page', () => {
    show();
    const main = document.querySelector('main.ch-hm')!;
    expect(main.getAttribute('aria-label')).toBe('Home');
    const headings = [...main.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.filter((h) => ['This week', 'Today', 'My latest round', 'Scoring', 'By part of the game'].includes(h!))).toEqual(['This week', 'Today', 'My latest round', 'Scoring', 'By part of the game']);
    expect(document.querySelector('.ch-h-main')).toBeNull();
  });

  it('20103 a week day opens Calendar’s day view, and My stats opens the player’s stats', () => {
    show();
    expect(document.querySelector('.ch-hm-week li.is-today a')!.getAttribute('href')).toBe('/golf/dashboard/calendar?view=day&date=2026-10-14');
    expect(screen.getByRole('link', { name: /My stats/ }).getAttribute('href')).toBe('/golf/dashboard/stats');
  });

  it('20806 the phone draws none of the coach’s controls either: no Plan, no Add event, no quick event types', () => {
    show(home({ next: null, today: [] }));
    for (const name of ['Plan', 'Add event', 'Practice', 'Qualifier', 'Tournament', 'Meeting']) expect(screen.queryByRole('link', { name })).toBeNull();
    expect(code('CH-2309')).not.toBeNull();
  });

  it('21703 on the phone, Message coach gives the light tap', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('link', { name: 'Message coach' }));
    expect(hapticSpy.mock.calls).toEqual([['press']]);
  });
});

void waitFor;
