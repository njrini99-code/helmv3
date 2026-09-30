import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Player Home: the player's numbered states in docs/clubhouse/catalog/home.md, found by their number. */

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
  tables.current = {};
});

describe('Player Home · desktop (Player - Home.html)', () => {
  it('the day, the brief, Message coach to the coach’s thread; Post a round waits for round entry', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Good afternoon, Theo.' })).toBeTruthy();
    expect(screen.getByText(/Off the tee is gaining you 0\.8 strokes a round/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Message coach' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=coach-maya');
    // Round entry isn't rebuilt for players yet (Q-69), so the button isn't drawn rather than leading nowhere.
    expect(screen.queryByRole('link', { name: 'Post a round' })).toBeNull();
  });

  it('Up next sits in the week with a countdown to the tee time', () => {
    show();
    const next = screen.getByRole('link', { name: /Up next · Qualifier/ });
    expect(next.getAttribute('href')).toBe('/golf/dashboard/calendar?date=2026-10-16&event=q1');
    // 14 Oct 18:40Z to 16 Oct 12:42Z: 1 day, 18 hours, 2 minutes.
    expect(within(next).getByRole('timer', { name: 'Starts in 1 days, 18 hours and 2 minutes' })).toBeTruthy();
  });

  it('My latest round: the course, a flag not an avatar, and My stats', async () => {
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

  it('Scoring: last 10 by default, the figures follow the window, the note reads the rounds', async () => {
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

  it('the hero: Up next with its countdown, and Message coach', () => {
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

  it('My latest round pages inline, with a selection tick', async () => {
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
  it('reads only the player’s own rounds, names no other invitee, and finds the coach', async () => {
    const roundsQueries: Array<Array<[string, unknown[]]>> = [];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
      golf_rounds: (f) => {
        roundsQueries.push(f);
        return { data: [round(0), round(1), round(2), round(3)] };
      },
      golf_players: { data: { handicap_index: 2.1, handicap: null } },
      golf_teams: { data: { gender: 'men', created_by: 'u-head', organization_id: 'o1' } },
      golf_coaches: { data: [{ user_id: 'u-asst' }, { user_id: 'u-head' }] },
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

void waitFor;
