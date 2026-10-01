import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateStatsFromShots } from '@/lib/utils/golf-stats-calculator-shots';

/**
 * Parity with the production player stats page (docs/clubhouse/pages/P005-stats-player/PARITY.md): the figures
 * computed from rounds, holes and shots; the reads behind them; Game detail's "More detail"; the Rounds tab's bests
 * and comparison; and the standing table. Each state's number is in docs/clubhouse/catalog/stats-player.md
 * (CH-5209 to CH-5212, CH-5311 to CH-5319).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
const detailed = vi.hoisted(() => vi.fn());
const spray = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed, getSprayChartData: spray }));

import { approachBands } from '../data/stats-detail';
import { bandPutts, PUTT_BANDS, PUTT_BANDS_NINE } from '../data/stats-common';
import type { ChRound } from '../data/season';
import { loadPlayerProfile, type ChPlayerProfile } from '../data/stats-player';
import { openingDelta, perRoundSeries, personalBests, pressureGap, toughestHoles, windowCompare, type ChHoleRow } from '../data/stats-figures';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { FairwayStrip } from '../screens/stats/charts';
import { CrumbProvider } from '../shell/crumbs';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY } from '../preview/fixtures-stats';
import { filterFor } from '../data/stats-filter';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const codes = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)];
function shell(node: React.ReactNode) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              {node}
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>
  );
}
const wrap = (node: React.ReactNode) => render(shell(node));
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
/** At phone width for the length of a describe. */
function phoneWidth() {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });
}

const x = PREVIEW_PLAYER.extra;
// A test that chooses a window chooses it for the filter too (the screens read the filter, whose window is the window).
const player = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER, ...(over.window ? { filter: filterFor(over.window) } : {}), ...over });
const withExtra = (over: Partial<ChPlayerProfile['extra']>, rest: Partial<ChPlayerProfile> = {}) => player({ extra: { ...x, ...over }, ...rest });
const showPlayer = (data: ChPlayerProfile, coachId: string | null = 'c1') => wrap(<StatsPlayer data={data} coachId={coachId} />);
const showPhone = (data: ChPlayerProfile) =>
  wrap(
    <>
      <SlotHost />
      <StatsPlayer data={data} coachId="c1" />
    </>,
  );
async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name }));
}
/** The panel titled `title`, in Game detail. */
const panel = (title: string) => [...document.querySelectorAll('.ch-gm-p')].find((p) => p.querySelector('.ch-gm-p__t')?.textContent === title) as HTMLElement;
const section = (id: string) => document.getElementById(`gm-${id}`) as HTMLElement;
const cells = (el: Element) => [...el.querySelectorAll('td')].map((c) => c.textContent);
const rowOf = (el: Element, head: string) => [...el.querySelectorAll('tbody tr')].find((r) => r.querySelector('th')?.textContent === head) as HTMLElement;
const tile = (el: Element, label: string) => [...el.querySelectorAll('dl.ch-gx-tiles > div')].find((d) => d.querySelector('dt')!.textContent === label) as HTMLElement;

beforeEach(() => {
  logServer.mockClear();
  router.refresh.mockClear();
  detailed.mockReset();
  spray.mockReset();
  tables.current = {};
});
afterEach(() => cleanup());

/* ─── The figures from rounds, holes and shots ─── */

const round = (id: string, date: string, over: Partial<ChRound> = {}): ChRound => ({
  id,
  player_id: 'p1',
  course_name: 'Finley GC',
  tees_played: null,
  round_date: date,
  round_type: 'practice',
  total_score: 74,
  score_to_par: 2,
  front_nine: 37,
  back_nine: 37,
  holes_played: 18,
  total_putts: 30,
  total_gir: 9,
  total_gir_possible: 18,
  total_fairways_hit: 8,
  total_fairways: 14,
  strokes_gained_total: null,
  strokes_gained_tee: null,
  strokes_gained_approach: null,
  strokes_gained_around_green: null,
  strokes_gained_putting: null,
  ...over,
});

describe('personal bests', () => {
  it('the lowest score, the lowest to par, the best GIR and the fewest putts, each with its course and date; a tie goes to the earliest round', () => {
    const rounds = [
      round('c', '2026-09-20', { total_score: 70, score_to_par: -2, total_gir: 14, course_name: 'Late GC', total_putts: 27 }),
      round('b', '2026-09-10', { total_score: 70, score_to_par: -2, total_gir: 16, course_name: 'Early GC', total_putts: 27 }),
      round('a', '2026-09-01', { total_score: 75, score_to_par: 3, total_gir: 9, total_putts: 33 }),
    ];
    const b = personalBests(rounds);
    expect(b.score).toEqual({ value: 70, date: 'Sep 10', course: 'Early GC' });
    expect(b.toPar).toEqual({ value: -2, date: 'Sep 10', course: 'Early GC' });
    expect(b.gir).toEqual({ value: 88.9, date: 'Sep 10', course: 'Early GC' });
    expect(b.putts).toEqual({ value: 27, date: 'Sep 10', course: 'Early GC' });
  });

  it('a round with no value for a figure is not in it: a missing to par is never read as even, a missing putt count never as zero', () => {
    const rounds = [
      round('a', '2026-09-01', { total_score: 80, score_to_par: null, total_putts: null, total_gir: null, total_gir_possible: null }),
      round('z', '2026-09-03', { total_score: 78, score_to_par: 6, total_putts: 0 }),
    ];
    const b = personalBests(rounds);
    expect(b.score!.value).toBe(78);
    expect(b.toPar!.value).toBe(6);
    expect(b.putts).toBeNull();
    expect(b.gir!.value).toBe(50);
    expect(personalBests([])).toEqual({ score: null, toPar: null, gir: null, putts: null });
  });

  it('takes the rounds it is given, whatever their length: a 9-hole score is its own best, listed apart from the 18-hole ones by the loader', () => {
    const nine = round('nine', '2026-09-02', { total_score: 30, score_to_par: -6, holes_played: 9 });
    expect(personalBests([nine]).score).toEqual({ value: 30, date: 'Sep 2', course: 'Finley GC' });
    expect(personalBests([round('a', '2026-09-01', { total_score: 80 }), nine]).score!.value).toBe(30);
  });
});

describe('the score, GIR, fairways and putts of each round', () => {
  it('one point per round, oldest first, and a round with no value has no point', () => {
    const s = perRoundSeries([
      round('c', '2026-09-03', { total_score: 71, total_fairways: null, total_fairways_hit: null }),
      round('b', '2026-09-02', { total_score: 75, total_putts: null }),
      round('a', '2026-09-01', { total_score: 73, total_gir: 18, total_gir_possible: 18 }),
    ]);
    expect(s.score).toEqual([
      { label: 'Sep 1', value: 73 },
      { label: 'Sep 2', value: 75 },
      { label: 'Sep 3', value: 71 },
    ]);
    expect(s.gir.map((p) => p.value)).toEqual([100, 50, 50]);
    expect(s.fairway.map((p) => p.label)).toEqual(['Sep 1', 'Sep 2']);
    expect(s.putts.map((p) => p.label)).toEqual(['Sep 1', 'Sep 3']);
  });
});

describe('this window against the one before', () => {
  it('summed numerators over summed denominators, never a mean of percentages; none without an earlier window', () => {
    expect(windowCompare([round('a', '2026-09-01')], null)).toBeNull();
    const last = [round('a', '2026-09-10', { total_gir: 2, total_gir_possible: 4, total_score: 70, total_putts: 28 }), round('b', '2026-09-09', { total_gir: 9, total_gir_possible: 18, total_score: 74, total_putts: 32 })];
    const before = [round('c', '2026-09-01', { total_gir: 18, total_gir_possible: 18, total_score: 76, total_putts: 30 })];
    const c = windowCompare(last, before)!;
    expect(c.lastRounds).toBe(2);
    expect(c.previousRounds).toBe(1);
    const row = (l: string) => c.rows.find((r) => r.label === l)!;
    // 11 of 22 is 50%, not the mean of 50% and 50% by another weighting: (2 + 9) / (4 + 18).
    expect(row('Greens in regulation')).toMatchObject({ last: 50, previous: 100, lowerIsBetter: false });
    expect(row('Scoring avg')).toMatchObject({ last: 72, previous: 76, lowerIsBetter: true });
    expect(row('Putts per round')).toMatchObject({ last: 30, previous: 30, lowerIsBetter: true });
  });
});

// Swap audit C-16: the strip set the fairway share of all tee shots beside left and right as shares of the misses only
// (63% fairway with 20% left and 17% right of something else). Every zone is now a share of the same tee shots.
describe('where drives finish (C-16)', () => {
  it('C-16 left, fairway, right and the misses with no side, each of the same tee shots, adding up to the whole', () => {
    // 20 tee shots: 10 fairways, 6 left, 2 right, 2 missed with no side logged.
    render(<FairwayStrip opportunities={20} hit={10} left={6} right={2} />);
    const zones = [...document.querySelectorAll('.ch-fws__z')].map((z) => z.textContent);
    expect(zones).toEqual(['30%Left', '50%Fairway', '10%Right', '10%Other']);
    expect(document.querySelector('.ch-fws__cap')!.textContent).toBe('Miss biasLeft by 20 pts');
    cleanup();
    render(<FairwayStrip opportunities={4} hit={2} left={1} right={1} />);
    expect([...document.querySelectorAll('.ch-fws__z')].map((z) => z.textContent)).toEqual(['25%Left', '50%Fairway', '25%Right']);
  });
});

describe('the pressure gap', () => {
  const mk = (type: string, n: number, toPar: number, from: number) => Array.from({ length: n }, (_, i) => round(`${type}${from + i}`, `2026-09-${String(10 + from + i).padStart(2, '0')}`, { round_type: type, score_to_par: toPar }));
  it('tournament and qualifier rounds against practice, in strokes to par; a legacy "qualifying" counts as a qualifier, an unknown type as practice', () => {
    const g = pressureGap([...mk('tournament', 2, 4, 0), ...mk('qualifying', 1, 4, 3), ...mk('practice', 2, 2, 5), ...mk('casual', 1, 2, 8)]);
    expect(g).toEqual({ gap: 2, pressureRounds: 3, practiceRounds: 3 });
  });
  it('needs 3 tournament or qualifier rounds, 3 practice rounds and 5 in all', () => {
    expect(pressureGap([...mk('tournament', 2, 4, 0), ...mk('practice', 6, 2, 2)]).gap).toBeNull();
    expect(pressureGap([...mk('tournament', 6, 4, 0), ...mk('practice', 2, 2, 6)]).gap).toBeNull();
    expect(pressureGap([...mk('tournament', 3, 4, 0), ...mk('practice', 3, 2, 3)]).gap).toBe(2);
    expect(pressureGap([round('n', '2026-09-01', { round_type: null }), ...mk('tournament', 3, 4, 0), ...mk('practice', 3, 2, 3)]).pressureRounds).toBe(3);
  });
});

describe('the opening hole', () => {
  const hole = (r: string, n: number, par: number, score: number): ChHoleRow => ({ round_id: r, hole_number: n, par, score });
  it('hole 1 against holes 2 to 18 in strokes to par, pooled; none under five rounds with both', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].flatMap((r) => [hole(r, 1, 4, 5), hole(r, 2, 4, 4), hole(r, 3, 3, 4)]);
    // Hole 1 is +1 every round; the rest average (0 + 1) / 2 = +0.5.
    expect(openingDelta(five)).toEqual({ delta: 0.5, rounds: 5 });
    expect(openingDelta(five.filter((h) => h.round_id !== 'e')).delta).toBeNull();
    expect(openingDelta(five.filter((h) => h.round_id !== 'e')).rounds).toBe(4);
  });
});

describe('the toughest holes', () => {
  const h = (n: number, par: number, score: number, r: string): ChHoleRow => ({ round_id: r, hole_number: n, par, score });
  it('by hole number with each play graded against its own par; a hole needs three plays; the five worst, worst first', () => {
    const rows: ChHoleRow[] = [
      // Hole 7: a par 4 at one course, a par 5 at another; +2, +2 (on the par 5), +0: average 1.33, two double bogeys or worse, shown as a par 4 (the par it was played at most).
      h(7, 4, 6, 'a'),
      h(7, 5, 7, 'b'),
      h(7, 4, 4, 'c'),
      // Hole 2: +3 once, only one play: under the floor, however bad.
      h(2, 4, 7, 'a'),
      ...[1, 3, 4, 5, 6, 8].flatMap((n, i) => ['a', 'b', 'c'].map((r) => h(n, 4, 4 + (i % 2), r))),
    ];
    const t = toughestHoles(rows);
    expect(t.holes[0]).toEqual({ hole: 7, par: 4, avgToPar: 1.33, plays: 3, doublePlus: 2 });
    expect(t.holes.some((x) => x.hole === 2)).toBe(false);
    expect(t.holes).toHaveLength(5);
    expect(t.holes.map((x) => x.avgToPar)).toEqual([...t.holes.map((x) => x.avgToPar)].sort((a, b) => b - a));
    expect(t.belowFloor).toBe(false);
  });
  it('holes scored but none played three times say so; no holes say nothing is under a floor', () => {
    expect(toughestHoles([h(1, 4, 5, 'a'), h(2, 4, 6, 'a')])).toMatchObject({ holes: [], belowFloor: true, minPlays: 3 });
    expect(toughestHoles([])).toMatchObject({ holes: [], belowFloor: false });
  });
});

describe('putts by distance', () => {
  const put = (feet: number, made: boolean) => ({ roundId: 'r', feet, made });
  it('bands are cut as the calculator cuts them, (3, 5] and so on: a three-footer is in 0–3 and a five-footer in 3–5', () => {
    const bands = bandPutts([put(3, true), put(3.1, true), put(5, false), put(5.1, false), put(25, true), put(25.5, true), put(200, false)], new Map());
    const by = (l: string) => bands.find((b) => b.label === l)!;
    expect(by('0–3 ft')).toMatchObject({ attempts: 1, made: 1 });
    expect(by('3–5 ft')).toMatchObject({ attempts: 2, made: 1 });
    expect(by('5–10 ft')).toMatchObject({ attempts: 1, made: 0 });
    expect(by('15–25 ft')).toMatchObject({ attempts: 1, made: 1 });
    expect(by('25+ ft')).toMatchObject({ attempts: 2, made: 1 });
  });

  it('the nine bands add up to the six, and each carries the Tour value its standard maps to', () => {
    const rows = [0.5, 2, 3, 4, 5, 7, 10, 12, 15, 17, 20, 22, 25, 27, 30, 33, 35, 40, 60].map((f, i) => put(f, i % 3 === 0));
    const bench = new Map([
      ['putts_made_3_5ft_pct', 90.5],
      ['putts_made_15_25ft_pct', 15.4],
      ['putts_made_25_plus_ft_pct', 5.5],
    ]);
    const nine = bandPutts(rows, bench, PUTT_BANDS_NINE);
    const six = bandPutts(rows, bench, PUTT_BANDS);
    expect(nine).toHaveLength(9);
    const sum = (labels: string[], k: 'attempts' | 'made') => nine.filter((b) => labels.includes(b.label)).reduce((a, b) => a + b[k], 0);
    expect(sum(['15–20 ft', '20–25 ft'], 'attempts')).toBe(six.find((b) => b.label === '15–25 ft')!.attempts);
    expect(sum(['25–30 ft', '30–35 ft', '35+ ft'], 'made')).toBe(six.find((b) => b.label === '25+ ft')!.made);
    expect(nine.reduce((a, b) => a + b.attempts, 0)).toBe(rows.length);
    expect(nine.map((b) => b.bench)).toEqual([null, 90.5, null, null, 15.4, 15.4, 5.5, 5.5, 5.5]);
  });
});

describe('approach proximity against the Tour', () => {
  const shot = (beforeYd: number, afterFt: number, result: string) => ({ distance_to_hole_before: beforeYd, distance_unit_before: 'yards', distance_to_hole_after: afterFt, distance_unit_after: 'feet', result, lie_after: result === 'green' ? 'green' : 'rough', par: 4 });
  const bench = new Map([
    ['approach_proximity_50_125ft', 18],
    ['approach_proximity_125_175ft', 30],
    ['approach_proximity_175_plus_ft', 45],
  ]);
  it('every approach counts, hits and misses alike, so a miss is not flattered; a band needs 10 shots', () => {
    const rows = [...Array.from({ length: 6 }, () => shot(100, 10, 'green')), ...Array.from({ length: 4 }, () => shot(100, 50, 'rough')), ...Array.from({ length: 9 }, () => shot(150, 20, 'green'))];
    const [a, b, c] = approachBands(rows, bench);
    // (6 × 10 + 4 × 50) / 10 = 26 feet in the first band: the four misses count.
    expect(a).toMatchObject({ label: '50-125 yd', value: 26, bench: 18, shots: 10, belowFloor: false, greenHitPct: 60 });
    expect(b).toMatchObject({ label: '125-175 yd', value: null, shots: 9, belowFloor: true, floor: 10 });
    expect(c).toMatchObject({ value: null, shots: 0, belowFloor: false });
  });
});

/* ─── The reads behind them ─── */

const OWN = 'p1';
type Filters = Array<[string, unknown[]]>;
const day = (n: number) => `2026-09-${String(28 - n).padStart(2, '0')}`;
const rRow = (id: string, n: number, over: Record<string, unknown> = {}) => ({ id, player_id: OWN, round_date: day(n), total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, status: 'completed', round_type: 'practice', total_putts: 30, total_gir: 9, total_gir_possible: 18, total_fairways_hit: 8, total_fairways: 14, course_name: 'Finley GC', ...over });
const isMembership = (f: Filters) => f.some(([k]) => k === 'in');
function loaderTables(rounds: unknown[], over: import('./supabase-fake').ChFakeTables = {}): import('./supabase-fake').ChFakeTables {
  return {
    golf_teams: { data: { gender: 'men' } },
    golf_players: { data: { id: OWN, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2029, hometown: 'Charlotte', state: 'NC', handicap: 3.9, handicap_index: null } },
    golf_team_members: (f) => (isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: OWN }, { player_id: 'p2' }] }),
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: {
      data: [
        { metric_id: 'scoring_par_3', pga_tour_value: 3 },
        { metric_id: 'big_number_rate', pga_tour_value: 2 },
        { metric_id: 'putts_made_3_5ft_pct', pga_tour_value: 90.5 },
        { metric_id: 'practice_tournament_delta', pga_tour_value: 0.5 },
      ],
    },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    golf_holes: { data: [] },
    golf_shots: { data: [] },
    ...over,
  };
}
const emptyGroup = (family: 'driving' | 'approach') => ({ family, totalShots: 0, plottedShots: 0, averageForwardDistance: null, averageRemainingDistance: null, playableCount: 0, troubleCount: 0, penaltyCount: 0, dominantSector: null, points: [], summaryBands: [] });
const load = (viewer: 'coach' | 'player' = 'coach', window: 'last10' | 'season' | 'qualifiers' = 'last10') => loadPlayerProfile({ viewer, teamId: 't1', playerId: OWN, window });
const ten = Array.from({ length: 10 }, (_, i) => rRow(`r${i + 1}`, i));

describe('the profile’s extra figures', () => {
  beforeEach(() => {
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 10 });
    spray.mockResolvedValue({ driving: emptyGroup('driving'), approach: emptyGroup('approach'), scope: { roundId: 'x', roundsIncluded: 0, filterApplied: false } });
  });

  it('the bests, the series and the comparison come from the window’s own rounds: this window against the 10 before it, and none for the season', async () => {
    // An 80 on its holes too: the season read takes the total from the nines (C-15).
    const older = Array.from({ length: 4 }, (_, i) => rRow(`o${i}`, 10 + i, { total_score: 80, front_nine: 40, back_nine: 40 }));
    tables.current = loaderTables([...ten, ...older]);
    const p = (await load())!;
    expect(p.extra.bests.score!.value).toBe(74);
    expect(p.extra.series.score).toHaveLength(10);
    expect(p.extra.compare).toMatchObject({ lastRounds: 10, previousRounds: 4 });
    expect(p.extra.compare!.rows.find((r) => r.label === 'Scoring avg')).toMatchObject({ last: 74, previous: 80 });
    expect((await load('coach', 'season'))!.extra.compare).toBeNull();
    tables.current = loaderTables(ten);
    expect((await load())!.extra.compare).toBeNull();
    expect(p.extra.truncated).toBe(false);
  });

  it('CH-5209 a hole read that fails is flagged and logged, the toughest holes and the opening hole are not claimed, and nothing else is lost', async () => {
    tables.current = loaderTables(ten, { golf_holes: { error: { message: 'boom' } } });
    const p = (await load())!;
    expect(p.extra.holesError).toBe(true);
    expect(p.extra.toughest).toBeNull();
    expect(p.extra.opening).toBeNull();
    expect(p.comparisons.find((c) => c.label === 'Opening hole')!.you).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'holes', expect.anything(), 'stats_analytics');
    expect(p.statsError).toBe(false);
    expect(p.extra.approachError).toBe(false);
  });

  it('CH-5210 CH-5211 CH-5212 an approach, putt or spray read that fails is flagged on its own and logged; the others are fine', async () => {
    const byKind = (over: { approach?: boolean; putts?: boolean }) => (f: Filters) => (f.some(([k, a]) => k === 'eq' && a[0] === 'shot_type' && a[1] === 'approach') ? (over.approach ? { error: { message: 'boom' } } : { data: [] }) : over.putts ? { error: { message: 'boom' } } : { data: [] });
    tables.current = loaderTables(ten, { golf_shots: byKind({ approach: true }) });
    let p = (await load())!;
    expect([p.extra.approachError, p.extra.puttsError, p.extra.sprayError]).toEqual([true, false, false]);
    expect(p.extra.approach).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'approachShots', expect.anything(), 'stats_analytics');
    tables.current = loaderTables(ten, { golf_shots: byKind({ putts: true }) });
    p = (await load())!;
    expect([p.extra.approachError, p.extra.puttsError, p.extra.sprayError]).toEqual([false, true, false]);
    expect(p.extra.puttBandsNine).toBeNull();
    tables.current = loaderTables(ten);
    spray.mockRejectedValue(new Error('boom'));
    p = (await load())!;
    expect([p.extra.approachError, p.extra.puttsError, p.extra.sprayError]).toEqual([false, false, true]);
    expect(p.extra.spray).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'spray', expect.anything(), 'stats_analytics');
  });

  it('where shots finish is counted, not plotted: the sectors and averages pass on, the dots do not', async () => {
    spray.mockResolvedValue({
      driving: { ...emptyGroup('driving'), plottedShots: 2, averageForwardDistance: 250, playableCount: 1, penaltyCount: 1, dominantSector: 'left', points: [{ id: 'dot' }], summaryBands: [{ sector: 'left', label: 'Left', count: 2, percentage: 100, avgForwardDistance: 250, avgRemainingDistance: 160 }] },
      approach: emptyGroup('approach'),
      scope: { roundId: 'x', roundsIncluded: 1, filterApplied: true },
    });
    tables.current = loaderTables(ten);
    const p = (await load())!;
    expect(p.extra.spray!.driving).toMatchObject({ shots: 2, avgForward: 250, playable: 1, penalty: 1, dominant: 'Left', bands: [{ sector: 'left', count: 2, pct: 100 }] });
    expect(JSON.stringify(p.extra.spray)).not.toContain('dot');
  });

  it('the standing rows: the Tour’s value beside each, a band graded only with 10 putts, big numbers from the round cache; a coach’s team figures pooled, a player’s never', async () => {
    const puttRows = [...Array.from({ length: 10 }, (_, i) => ({ round_id: 'r1', putt_distance_feet: 4, putt_made: i < 7 })), ...Array.from({ length: 9 }, () => ({ round_id: 'r1', putt_distance_feet: 8, putt_made: true }))];
    const cache = ['r1', 'r2'].map((round_id) => ({ round_id, double_bogeys: 1, triple_plus: 1, penalty_strokes: 1, three_putts: 1, sand_attempts: 2, sand_saves: 1, greens_hit: 9, greens_total: 18 }));
    tables.current = loaderTables(ten, { golf_shots: (f) => (f.some(([k, a]) => k === 'eq' && a[0] === 'shot_type') ? { data: [] } : { data: puttRows }), golf_round_stats_cache: { data: cache } });
    const coach = (await load('coach'))!;
    const row = (p: ChPlayerProfile, l: string) => p.comparisons.find((c) => c.label === l)!;
    // 7 of 10 from 3–5 feet against the Tour's 90.5; 5–10 feet has 9 putts, under the floor: no value, never a rate of 9.
    expect(row(coach, 'Make 3–5 ft')).toMatchObject({ you: 70, bench: 90.5, unit: '%' });
    expect(row(coach, 'Make 5–10 ft').you).toBeNull();
    // Two doubles or worse in a round of 18 holes: 11.1%, and the same in the team's rounds.
    expect(row(coach, 'Big numbers')).toMatchObject({ you: (2 / 18) * 100, team: (2 / 18) * 100, bench: 2 });
    expect(row(coach, 'Penalty strokes')).toMatchObject({ you: 1, team: 1 });
    expect(row(coach, 'Sand saves')).toMatchObject({ you: 50, team: 50 });
    expect(row(coach, '3-putts per round').team).toBe(1);
    const player = (await load('player'))!;
    expect(player.comparisons.every((c) => c.team == null)).toBe(true);
    expect(row(player, 'Big numbers').you).toBeCloseTo((2 / 18) * 100);
  });
});

/* ─── Game detail: More detail ─── */

describe('Game detail · More detail', () => {
  it('each section has one, open on the desktop, a native disclosure with its own panels', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const more = [...document.querySelectorAll('details.ch-gx-more')] as HTMLDetailsElement[];
    expect(more).toHaveLength(5);
    expect(more.every((d) => d.open && d.querySelector('summary')!.textContent === 'More detail')).toBe(true);
    expect([...document.querySelectorAll('.ch-gm')].every((s) => s.querySelector('.ch-gx-rule')!.textContent!.includes('18 holes only'))).toBe(true);
  });

  it('every section says which rounds it counts, in the window’s own words', async () => {
    showPlayer(player({ window: 'season' }));
    await openTab(/Game detail/);
    expect(section('scoring').querySelector('.ch-gx-rule')!.textContent).toMatch(/^This season · 10 rounds, 18 holes only \(9-hole rounds are left out\)/);
    cleanup();
    showPlayer(player({ window: 'qualifiers' }));
    await openTab(/Game detail/);
    expect(section('putting').querySelector('.ch-gx-rule')!.textContent).toMatch(/^Qualifier rounds · 10 rounds/);
  });

  it('Scoring: the numbers, outcomes by par, by round type, streaks and the toughest holes', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const s = section('scoring');
    const numbers = panel('Scoring numbers');
    expect(tile(numbers, 'Average to par').querySelector('dd')!.textContent).toBe('+1.60');
    expect(tile(numbers, 'Best round').textContent).toContain('72');
    expect(tile(numbers, 'Best round').textContent).toContain('Pinehurst No. 8 · Sep 9');
    expect(tile(numbers, 'Worst round').querySelector('dd')!.textContent).toBe('75');
    // The mix carries the holes behind it.
    expect(s.querySelector('.ch-mix__k')!.textContent).toContain('19 of 180 holes · 11%');
    const pars = panel('Outcomes by par');
    expect(pars.textContent).toContain('+0.30 / hole · 40 holes');
    expect(pars.querySelectorAll('.ch-gx-pm')).toHaveLength(3);
    const types = panel('By round type');
    expect(tile(types, 'Practice').textContent).toContain('73.4');
    expect(tile(types, 'Practice').textContent).toContain('6 rounds');
    expect(tile(types, 'Tournament').textContent).toContain('1 round');
    const streaks = panel('Streaks and records');
    expect([...streaks.querySelectorAll('dl.ch-gx-tiles > div')].map((d) => d.querySelector('dd')!.textContent)).toEqual(['4', '2', '6', '34', '42 yds']);
    const holes = [...panel('Toughest holes').querySelectorAll('.ch-gx-rank li')];
    expect(holes).toHaveLength(5);
    expect(holes[0]!.textContent).toContain('Hole 7 · Par 4');
    expect(holes[0]!.textContent).toContain('+0.90');
    expect(holes[0]!.querySelector('.ch-loss')).not.toBeNull();
  });

  it('Off the tee: fairways by tee type and club, where tee shots finish, fairways by round, distance for every tee shot', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const t = section('tee');
    expect(t.textContent).toContain('74 of 118 attempts');
    expect(panel('Distance by club').textContent).toContain('All tee shots');
    expect(panel('Distance by club').textContent).toContain('259');
    expect([...panel('Fairways by tee type').querySelectorAll('.ch-cmp__l')].map((l) => l.firstChild!.textContent)).toEqual(['Par 4', 'Par 5', 'Driver', 'Other clubs']);
    expect(cells(rowOf(panel('Tee miss by club'), 'Driver'))).toEqual(['58%', '42%']);
    const grid = panel('Where tee shots finish').querySelector('.ch-gx-sec')!;
    expect(grid.getAttribute('aria-label')).toContain('118 tee shots by sector');
    expect(grid.querySelector('.is-top')!.textContent).toContain('71');
    expect(panel('Where tee shots finish').querySelector('.ch-gm-p__n')!.textContent).toContain('no direction logged count as center');
    expect(panel('Fairways by round').querySelector('svg.ch-gx-line')!.getAttribute('aria-label')).toContain('Aug 30 57%');
  });

  it('Approach: proximity against the Tour on every approach, the green-hit ladder without a Tour tick, and the detail tables', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const vs = panel('Proximity against the Tour');
    expect([...vs.querySelectorAll('.ch-lad__b')].map((b) => b.textContent)).toEqual(['50–125', '125–175', '175+']);
    expect(vs.querySelectorAll('.ch-lad__bench')).toHaveLength(3);
    // The green-hit ladder counts greens found only, which is not the Tour's basis: no tick on it.
    expect(panel('Finish when the green is hit').querySelectorAll('.ch-lad__bench')).toHaveLength(0);
    expect(section('approach').querySelector('.ch-gm__t p')!.textContent).toContain('The biggest gap to the Tour is from 125–175 yards, finishing 40 feet away against 30.');
    const nums = panel('Approach numbers');
    expect(tile(nums, 'GIR per round').querySelector('dd')!.textContent).toBe('8.5');
    expect(tile(nums, 'Proximity · green hit').querySelector('dd')!.textContent).toBe('28.0 ft');
    expect(tile(nums, 'GIR · par 5').querySelector('dd')!.textContent).toBe('50%');
    expect(cells(rowOf(panel('Strokes to hole out'), '50–75'))).toEqual(['2.30', '2.60', '—', '19.0 ft']);
    expect(cells(rowOf(panel('Misses by distance'), '150–175'))).toEqual(['22', '41%', '9%', '27%', '23%']);
    expect(panel('Misses by distance').querySelectorAll('tbody tr')).toHaveLength(4);
    expect(panel('Where approaches finish').querySelector('.ch-gx-sec')!.getAttribute('aria-label')).toContain('164 approaches by sector');
    expect(panel('Greens by round').querySelector('svg.ch-gx-line')).not.toBeNull();
  });

  it('Short game: the numbers, strokes to hole out by distance and lie, up and down by where the green was missed, the finish after the chip', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const nums = panel('Short-game numbers');
    expect(tile(nums, 'Strokes to hole out').querySelector('dd')!.textContent).toBe('2.40');
    expect(tile(nums, 'Sand saves').querySelector('dd')!.textContent).toBe('4 of 11');
    expect(tile(nums, 'Up and downs').querySelector('dd')!.textContent).toBe('33 of 71');
    const t = panel('Strokes to hole out from around the green');
    expect(cells(rowOf(t, '0–10 yds'))).toEqual(['2.20', '2.10', '2.30', '2.60']);
    expect(cells(rowOf(t, 'All distances'))).toEqual(['2.40', '2.30', '2.60', '2.80']);
    expect(cells(rowOf(panel('Up and down by where the green was missed'), 'Short'))).toEqual(['40%', '30', '42%']);
    expect([...panel('Finish after the chip').querySelectorAll('.ch-cmp__l')].map((l) => l.firstChild!.textContent)).toEqual(['Overall', 'Fairway', 'Rough', 'Sand']);
  });

  it('Putting: nine bands with their counts, the break matrix, misses by break, the practice target, the Tour table and putts by round', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const d = panel('Putting by distance');
    expect(d.querySelectorAll('tbody tr')).toHaveLength(9);
    // 57 of 64: from the putts logged with a distance, the count beside it.
    expect(cells(rowOf(d, '0–3 ft')).slice(0, 3)).toEqual(['89%', '64', '10%']);
    expect(cells(rowOf(d, '3–5 ft'))[0]).toBe('63%');
    expect(rowOf(d, '3–5 ft').querySelector('td')!.className).toContain('ch-loss');
    expect(rowOf(d, '0–3 ft').querySelector('td')!.className).not.toMatch(/ch-(gain|loss)/);
    // 35+ ft has 8 putts, under the 10 a band needs to be graded: a rate, but no colour.
    expect(cells(rowOf(d, '35+ ft')).slice(0, 2)).toEqual(['0%', '8']);
    expect(rowOf(d, '35+ ft').querySelector('td')!.className).not.toMatch(/ch-(gain|loss)/);
    const b = panel('Make rate by break and distance');
    expect(b.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(cells(rowOf(b, '0–3 ft'))[0]).toBe('90% · 20');
    expect(panel('Practice target').textContent).toContain('20–25 ft putts breaking left to right are converting at 8% (8 putts)');
    expect(cells(rowOf(panel('Short, low and high misses by break'), 'Straight'))).toEqual(['40%', '40%', '20%']);
    const tour = panel('Against the Tour');
    expect(tour.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(cells(rowOf(tour, '3–5 ft'))).toEqual(['63%', '90.5%', '38', 'Below the Tour']);
    expect(panel('Putts by round').querySelector('svg.ch-gx-line')).not.toBeNull();
  });

  it('every table has a caption and a named scroll region, and every line chart says its values', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    const tbls = [...document.querySelectorAll('table.ch-gx-tbl')];
    expect(tbls).toHaveLength(9);
    expect(tbls.every((t) => !!t.querySelector('caption')!.textContent && t.closest('[role="region"]')!.getAttribute('aria-label')!.endsWith('scrolls sideways'))).toBe(true);
    expect(tbls.every((t) => [...t.querySelectorAll('tbody th')].every((h) => h.getAttribute('scope') === 'row'))).toBe(true);
    expect([...document.querySelectorAll('svg.ch-gx-line')].every((s) => s.getAttribute('role') === 'img' && s.getAttribute('aria-label')!.length > 20)).toBe(true);
  });

});

describe('Game detail · More detail on the phone', () => {
  phoneWidth();
  it('closed, one section at a time, with the same panels when opened', async () => {
    showPhone(player());
    const more = document.querySelector('details.ch-gx-more') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more.querySelector('.ch-gm-p')).not.toBeNull();
    expect(document.querySelectorAll('details.ch-gx-more')).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Putting' }));
    expect(document.querySelectorAll('details.ch-gx-more')).toHaveLength(1);
    expect(document.querySelector('details.ch-gx-more')!.textContent).toContain('Putting by distance');
  });
});

/* ─── A panel with nothing behind it says so ─── */

const zero = () => calculateStatsFromShots([], [], []);
/** A window whose rounds have scores and holes but no shots, no spray, no holes ranked and nothing to compare. */
const bare = (over: Partial<ChPlayerProfile['extra']> = {}) =>
  player({
    stats: { ...zero(), roundsPlayed: 3 },
    puttBands: null,
    extra: { ...x, series: { score: [], gir: [], fairway: [], putts: [] }, compare: null, toughest: { holes: [], belowFloor: false, minPlays: 3 }, approach: null, spray: { driving: { shots: 0, avgForward: null, avgRemaining: null, playable: 0, trouble: 0, penalty: 0, dominant: null, bands: [] }, approach: { shots: 0, avgForward: null, avgRemaining: null, playable: 0, trouble: 0, penalty: 0, dominant: null, bands: [] } }, puttBandsNine: null, ...over },
  });

describe('Game detail · states', () => {
  it('CH-5317 every panel with no data behind it says what is missing, in its own words, and is never a zero', async () => {
    showPlayer(bare());
    await openTab(/Game detail/);
    const nothing = codes('CH-5317');
    // Outcomes by par (3), streak hole-out, toughest holes, tee types, tee miss by club, strokes to hole out (approach), misses by distance, sand saves and up and downs, strokes (short), by miss direction, chip finish, putting by distance, break matrix, misses by break, practice target, the Tour table.
    expect(nothing.length).toBeGreaterThanOrEqual(17);
    const words = nothing.map((n) => n.textContent);
    expect(words).toContain('No hole-by-hole scores in this window.');
    expect(words).toContain('No par 4 or par 5 tee shots are logged in this window.');
    expect(words).toContain('No approaches of 50 yards or more are logged in this window.');
    expect(words).toContain('No putts are logged in this window.');
    expect(words.some((w) => /No distance and break has 8 putts yet/.test(w!))).toBe(true);
    expect(panel('Outcomes by par').textContent).toContain('No par 3 holes scored in this window.');
    // A streak that is a count reads as the count; the hole-out with none reads as a dash.
    expect(tile(panel('Streaks and records'), 'Longest hole-out').querySelector('dd')!.textContent).toBe('—');
  });

  it('CH-5311 holes were scored but none has been played three times: toughest holes says how many plays it needs', async () => {
    showPlayer(withExtra({ toughest: { holes: [], belowFloor: true, minPlays: 3 } }));
    await openTab(/Game detail/);
    expect(code('CH-5311')!.textContent).toContain('Need 3+ plays of a hole before it can be ranked.');
    expect(panel('Toughest holes').querySelector('.ch-gx-rank')).toBeNull();
  });

  it('CH-5312 a round type with no rounds in the window reads "No rounds", not an average of nothing', async () => {
    showPlayer(player({ stats: { ...PREVIEW_PLAYER.stats!, tournamentRounds: 0, tournamentScoringAvg: null, qualifyingRounds: 0, qualifyingScoringAvg: null } }));
    await openTab(/Game detail/);
    const types = panel('By round type');
    expect(types.querySelectorAll('[data-ch-code="CH-5312"]')).toHaveLength(2);
    expect(tile(types, 'Tournament').textContent).toContain('No rounds');
    expect(tile(types, 'Tournament').querySelector('dd')!.textContent).toBe('—');
    expect(types.querySelector('dl > div:not(.is-empty)')!.textContent).toContain('Practice');
  });

  it('CH-5314 a line needs two rounds with the figure: each per-round chart says how many it has', async () => {
    showPlayer(bare({ series: { score: [{ label: 'Sep 1', value: 72 }], gir: [], fairway: [{ label: 'Sep 1', value: 60 }], putts: [] } }));
    await openTab(/Game detail/);
    const lines = codes('CH-5314');
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.textContent)).toContain('A line needs two rounds with fairway holes; this window has 1.');
    expect(lines.map((l) => l.textContent)).toContain('A line needs two rounds with greens in regulation; this window has 0.');
    expect(document.querySelector('svg.ch-gx-line')).toBeNull();
  });

  it('CH-5315 no tee shots or approaches with a finish logged: where shots finish says so', async () => {
    showPlayer(bare());
    await openTab(/Game detail/);
    const texts = codes('CH-5315').map((c) => c.textContent);
    expect(texts).toEqual(['No tee shots with a finish are logged in this window.', 'No approach shots with a finish are logged in this window.']);
  });

  it('CH-5316 a proximity band under 10 shots says how many it has and is not graded; no approaches at all says so', async () => {
    showPlayer(player());
    await openTab(/Game detail/);
    expect(code('CH-5316')!.textContent).toBe('175+ yards: 7 shots, under 10');
    expect(panel('Proximity against the Tour').querySelectorAll('.ch-lad__fill')).toHaveLength(2);
    cleanup();
    showPlayer(bare());
    await openTab(/Game detail/);
    expect(code('CH-5316')!.textContent).toBe('No approach shots with a finish distance are logged in this window.');
  });

  it('CH-5319 a window with more rounds than the shot-level reads take says the newest 100 are covered', async () => {
    showPlayer(withExtra({ truncated: true }));
    await openTab(/Game detail/);
    expect(code('CH-5319')!.textContent).toContain('cover the newest 100');
    cleanup();
    showPlayer(player());
    await openTab(/Game detail/);
    expect(code('CH-5319')).toBeNull();
  });

  it('without the putt read the curve grades only bands the Tour publishes: 15 to 20 ft is not set against the Tour\'s 15 to 25 ft value', async () => {
    showPlayer(withExtra({ puttsError: true, puttBandsNine: null }));
    await openTab(/Game detail/);
    const marks = [...document.querySelectorAll('svg.ch-mk .ch-mk__v')].map((el) => [el.textContent, el.getAttribute('class')]);
    // 10 to 15 ft (20%, 40 putts) is graded against its own Tour value; 15 to 20 ft (13%, 33 putts) has no mark.
    expect(marks.find(([t]) => t === '20%')![1]).toContain('is-loss');
    expect(marks.find(([t]) => t === '13%')![1]).not.toMatch(/is-(gain|loss)/);
  });

  it('CH-5209 CH-5210 CH-5211 CH-5212 a read that failed says so where its figures would be, and Try again asks the server for the page again; the rest of Game detail is still there', async () => {
    const user = userEvent.setup();
    showPlayer(withExtra({ holesError: true, toughest: null, opening: null, approachError: true, approach: null, sprayError: true, spray: null, puttsError: true }));
    await openTab(/Game detail/);
    expect(code('CH-5209')!.textContent).toContain("Toughest holes didn't load.");
    expect(code('CH-5210')!.textContent).toContain("Proximity against the Tour didn't load.");
    expect(codes('CH-5212')).toHaveLength(2);
    expect(code('CH-5211')!.textContent).toContain("Putts past 20 feet didn't load.");
    // None of them is shown as "none logged".
    expect(code('CH-5311')).toBeNull();
    expect(code('CH-5316')).toBeNull();
    expect(code('CH-5315')).toBeNull();
    // What did load is there.
    expect(panel('Outcomes by par')).toBeTruthy();
    expect(tile(panel('Streaks and records'), 'Most pars in a row').querySelector('dd')!.textContent).toBe('6');
    await user.click(within(code('CH-5209') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });
});

/* ─── The Rounds tab ─── */

describe('Rounds tab · bests and comparison', () => {
  it('score by round for the whole window, the personal bests with their course and date, and this window against the one before with its change coloured by direction', async () => {
    showPlayer(player());
    await openTab(/Rounds/);
    const card = (id: string) => document.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement;
    expect(card('rx-score').querySelector('svg.ch-gx-line')!.getAttribute('aria-label')).toContain('Aug 30 73');
    const bests = card('rx-bests');
    expect(tile(bests, 'Best score').textContent).toContain('72');
    expect(tile(bests, 'Best score').textContent).toContain('Pinehurst No. 8 · Sep 9');
    expect(tile(bests, 'Best to par').querySelector('dd')!.textContent).toBe('E');
    expect(tile(bests, 'Best GIR').querySelector('dd')!.textContent).toBe('83.3%');
    expect(tile(bests, 'Fewest putts').textContent).toContain('Oakmont CC · Oct 12');
    const cmp = card('rx-compare');
    expect(cmp.querySelector('th[scope="col"]:nth-child(2)')!.textContent).toBe('Latest 10');
    // Scoring 73.6 against 72.9 is worse (lower is better): amber; putts 29.8 against 30.6 is better: green.
    expect(cells(rowOf(cmp, 'Scoring avg'))).toEqual(['73.6', '72.9', '+0.7']);
    expect(rowOf(cmp, 'Scoring avg').querySelectorAll('td')[2]!.className).toContain('ch-loss');
    expect(rowOf(cmp, 'Putts per round').querySelectorAll('td')[2]!.className).toContain('ch-gain');
    expect(rowOf(cmp, 'Greens in regulation').querySelectorAll('td')[2]!.className).toContain('ch-loss');
  });

  it('CH-5313 no earlier window to compare: the season and qualifiers say why, and last 10 says what it needs', async () => {
    showPlayer(withExtra({ compare: null }, { window: 'season' }));
    await openTab(/Rounds/);
    expect(code('CH-5313')!.textContent).toBe('The season has no earlier window to compare with.');
    cleanup();
    showPlayer(withExtra({ compare: null }, { window: 'qualifiers' }));
    await openTab(/Rounds/);
    expect(code('CH-5313')!.textContent).toBe('Qualifier rounds have no earlier window to compare with.');
    cleanup();
    showPlayer(withExtra({ compare: null }));
    await openTab(/Rounds/);
    expect(code('CH-5313')!.textContent).toContain('Needs 3 earlier 18-hole rounds');
  });

  it('CH-5314 the score line needs two rounds, and a window with no rounds shows none of it', async () => {
    showPlayer(withExtra({ series: { ...x.series, score: [{ label: 'Sep 1', value: 72 }] } }));
    await openTab(/Rounds/);
    expect(code('CH-5314')!.textContent).toBe('A line needs two rounds; this window has 1.');
    cleanup();
    showPlayer(player({ rounds: [] }));
    await openTab(/Rounds/);
    expect(document.querySelector('[aria-labelledby="rx-bests"]')).toBeNull();
    expect(code('CH-5302')).not.toBeNull();
  });

  it('each round carries its type beside the course', async () => {
    showPlayer(player());
    await openTab(/Rounds/);
    const chips = [...document.querySelectorAll('.ch-gx-type')].map((c) => c.textContent);
    expect(chips).toHaveLength(10);
    expect(chips.slice(0, 4)).toEqual(['Practice', 'Qualifier', 'Practice', 'Tournament']);
    expect(document.querySelector('.ch-gx-type.is-tournament')).not.toBeNull();
  });
});

describe('Rounds on the phone', () => {
  phoneWidth();
  it('the bests and the comparison are panels above the round list, and a round row names its type', () => {
    showPhone(player());
    const titles = [...document.querySelectorAll('.ch-stm-panel__h h2')].map((h) => h.textContent);
    expect(titles).toEqual(expect.arrayContaining(['Score by round', 'Personal bests', 'This window against the one before', 'Rounds']));
    expect(titles.indexOf('Personal bests')).toBeLessThan(titles.indexOf('Rounds'));
    expect(document.querySelector('.ch-spm-round .ch-num')!.textContent).toContain('Practice');
  });
});

/* ─── The standing table ─── */

describe('Overview · the standing table', () => {
  it('rows sit under their groups, each group named, with the Tour beside what has one', () => {
    showPlayer(player());
    const groups = [...document.querySelectorAll('table.ch-ft tr.ch-ft__g')].map((g) => g.textContent);
    expect(groups).toEqual(['Strokes gained', 'Scoring', 'Driving', 'Approach', 'Short game', 'Putting', 'Course management', 'Pressure']);
    const body = document.querySelector('table.ch-ft tbody')!;
    const get = (label: string) => [...body.querySelectorAll('tr')].find((r) => r.querySelector('td')?.firstChild?.textContent === label)!;
    const par4 = get('Par 4 scoring').querySelectorAll('td');
    expect([par4[1]!.textContent, par4[2]!.textContent, par4[3]!.textContent]).toEqual(['4.32', '—', '3.97']);
    // Lower is better: 4.32 against the Tour's 3.97 is amber.
    expect(par4[1]!.querySelector('span')!.className).toContain('ch-loss');
    const prox = get('Proximity 50–125 yd').querySelectorAll('td');
    expect(prox[1]!.textContent).toBe('26 ft');
    expect(prox[3]!.textContent).toBe('18 ft');
    // The pressure gap reads with its sign, in strokes to par.
    const gap = get('Pressure gap').querySelectorAll('td');
    expect([gap[1]!.textContent, gap[3]!.textContent]).toEqual(['+0.8', '+0.5']);
  });

  it('CH-5318 a row under its sample floor says what it needs, and only while it has no value', () => {
    showPlayer(player());
    // Proximity 175+ has no value (7 shots): its floor shows; 50–125 has one: none.
    const floors = [...document.querySelectorAll('[data-ch-code="CH-5318"]')].map((f) => f.textContent);
    expect(floors).toEqual(['Needs 10 approaches from the range.']);
    cleanup();
    showPlayer(
      player({
        comparisons: PREVIEW_PLAYER.comparisons.map((c) => (c.label === 'Pressure gap' || c.label === 'Opening hole' || c.label === 'Make 25+ ft' ? { ...c, you: null } : c)),
      }),
    );
    expect([...document.querySelectorAll('[data-ch-code="CH-5318"]')].map((f) => f.textContent)).toEqual([
      'Needs 10 approaches from the range.',
      'Needs 10 putts in the band.',
      'Needs 3 tournament or qualifier rounds and 3 practice rounds.',
      'Needs 5 rounds scored hole by hole.',
    ]);
  });

  it('a player sees the Tour and no team column, for every new row too (Q-91)', () => {
    showPlayer(player({ viewer: 'player', comparisons: PREVIEW_PLAYER.comparisons.map((c) => ({ ...c, team: null })) }), null);
    expect(screen.queryByRole('columnheader', { name: 'Team' })).toBeNull();
    expect([...document.querySelectorAll('table.ch-ft thead th')].map((h) => h.textContent)).toEqual(['Stat', 'You', 'Tour']);
    expect(document.querySelector('.ch-yb__note')!.textContent).not.toContain('Team values');
  });

  it('the Tour is the only benchmark in the new panels: no D1, division or college anywhere on a full profile', async () => {
    showPlayer(player());
    const user = userEvent.setup();
    const words = /\bD[123]\b|\bdivision\b|\bcollege\b|\bNCAA\b/i;
    for (const tab of [/Overview/, /Game detail/, /Rounds/, /Development/]) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(document.body.textContent).not.toMatch(words);
      expect([...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' ')).not.toMatch(words);
    }
  });
});

describe('the early read', () => {
  it('a window with two rounds and no shots shows the new sections as states, not as figures', async () => {
    showPlayer(PREVIEW_PLAYER_EARLY);
    await openTab(/Game detail/);
    expect(code('CH-5301')).not.toBeNull();
    expect(document.querySelector('details.ch-gx-more')).toBeNull();
    await openTab(/Rounds/);
    expect(code('CH-5313')).not.toBeNull();
    expect(tile(document.querySelector('[aria-labelledby="rx-bests"]')!, 'Best score').querySelector('dd')!.textContent).toBe('72');
  });
});

/* ─── Game detail on the phone: the approach section (iPhone brief, 2026-10-01) ─── */

/** A screen, not a phone: nothing matches. */
const wide = () => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
};

describe('Game detail on the phone · the approach section', () => {
  phoneWidth();
  const st = PREVIEW_PLAYER.stats!;
  const chip = (name: string) => userEvent.setup().click(screen.getByRole('button', { name }));
  const fill = (row: Element) => row.querySelector('.ch-brow__bar i') as HTMLElement | null;

  it('the seven bands are rows (band, bar, exact value): no shots reads "No shots", never 0%, and a 100% bar fills its track', async () => {
    showPhone(player({ stats: { ...st, girPct50_75: 100, girPct75_100: null, girPct100_125: 0 } }));
    await chip('Approach');
    const p = panel('Greens hit by distance');
    const rows = [...p.querySelectorAll('li.ch-brow')];
    expect(rows.map((r) => r.querySelector('.ch-brow__b')!.textContent)).toEqual(['50–75', '75–100', '100–125', '125–150', '150–175', '175–200', '200+']);
    expect(rows[0]!.querySelector('.ch-brow__v')!.textContent).toBe('100%');
    expect(fill(rows[0]!)!.style.width).toBe('100%');
    expect(rows[1]!.querySelector('.ch-brow__v')!.textContent).toBe('No shots');
    expect(fill(rows[1]!)).toBeNull();
    expect(rows[2]!.querySelector('.ch-brow__v')!.textContent).toBe('0%');
    expect(fill(rows[2]!)!.style.width).toBe('0%');
    // A phone draws no column chart for the same bands.
    expect(p.querySelector('.ch-lad')).toBeNull();
    expect(within(p).getByRole('list', { name: 'Yards to the pin' })).toBeTruthy();
  });

  it('a screen keeps the column chart for the same bands', async () => {
    wide();
    showPlayer(player());
    await openTab(/Game detail/);
    const p = panel('Greens hit by distance');
    expect(p.querySelector('.ch-lad')).not.toBeNull();
    expect(p.querySelector('.ch-brows')).toBeNull();
  });

  it('CH-5316 a band under the Tour floor says how many shots and what it needs, in its own row', async () => {
    showPhone(player());
    await chip('Approach');
    const p = panel('Proximity against the Tour');
    const rows = [...p.querySelectorAll('li.ch-brow')];
    expect(rows.map((r) => r.textContent)).toEqual(['50–12526′55 shots', '125–17540′72 shots', '175+Needs 107 shots']);
    expect(code('CH-5316')).toBe(p.querySelector('.ch-brows'));
    // The line under the chart is a screen's; the rows say it on a phone.
    expect(p.querySelector('p.ch-gm-p__empty')).toBeNull();
  });

  it('a panel’s note is one short line and its method sits behind "How this is measured", closed; a screen keeps the whole paragraph', async () => {
    showPhone(player());
    await chip('Approach');
    const p = panel('Proximity against the Tour');
    expect(p.querySelector('.ch-gm-p__n')!.textContent).toBe('Shorter is better. The tick is the Tour.');
    const how = p.querySelector('details.ch-gm-how') as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(how.querySelector('summary')!.textContent).toBe('How this is measured');
    expect(how.querySelector('p')!.textContent).toMatch(/lay-ups left out.*A range needs 10 shots\./);
    // The long italic paragraph is nowhere in the default scan path.
    expect([...section('approach').querySelectorAll('.ch-gm-p__n')].filter((n) => !n.closest('details.ch-gx-more')).every((n) => (n.textContent ?? '').length <= 80)).toBe(true);
    cleanup();
    wide();
    showPlayer(player());
    await openTab(/Game detail/);
    expect(document.querySelector('.ch-gm-how')).toBeNull();
    expect(panel('Proximity against the Tour').querySelector('.ch-gm-p__n')!.textContent).toMatch(/A range needs 10 shots\./);
  });

  it('the sample line is honest: Last 10 with three rounds behind it says three qualify, not that ten were read', async () => {
    showPhone(player({ window: 'last10', win: { ...PREVIEW_PLAYER.win, rounds: 3 } }));
    await chip('Approach');
    const rule = section('approach').querySelector('.ch-gx-rule')!;
    expect(rule.textContent).toBe('Last 10 rounds · 3 rounds qualify, 18 holes only');
    // The longer account, with what is left out, is one tap away.
    expect(section('approach').querySelector('details.ch-gm-how p')!.textContent).toMatch(/Last 10 rounds · 3 rounds, 18 holes only \(9-hole rounds are left out\)\. Every approach, whether the green is hit or missed\./);
    cleanup();
    showPhone(player({ window: 'last10', win: { ...PREVIEW_PLAYER.win, rounds: 10 } }));
    await chip('Approach');
    expect(section('approach').querySelector('.ch-gx-rule')!.textContent).toBe('Last 10 rounds · 10 rounds, 18 holes only');
    cleanup();
    showPhone(player({ window: 'season', win: { ...PREVIEW_PLAYER.win, rounds: 3 } }));
    await chip('Approach');
    expect(section('approach').querySelector('.ch-gx-rule')!.textContent).toBe('This season · 3 rounds, 18 holes only');
  });

  it('a player reading their own stats reads "You hit" and a coach "Jonah hits", on a phone and on a screen', async () => {
    showPhone(player({ viewer: 'player' }));
    await chip('Approach');
    expect(section('approach').querySelector('.ch-gm__t p')!.textContent).toMatch(/^You hit \d+% of greens/);
    cleanup();
    showPhone(player());
    await chip('Approach');
    expect(section('approach').querySelector('.ch-gm__t p')!.textContent).toMatch(/^Jonah hits \d+% of greens/);
    cleanup();
    wide();
    showPlayer(player({ viewer: 'player' }), null);
    await openTab(/Game detail/);
    expect(section('approach').querySelector('.ch-gm__t p')!.textContent).toMatch(/^You hit \d+% of greens/);
  });

  it('a figure with nothing behind it says why, in a few words, never a bare dash', async () => {
    showPhone(bare());
    await chip('Approach');
    expect([...section('approach').querySelectorAll('.ch-gm__figs dd.ch-gm__none')].map((d) => d.textContent)).toEqual(['No approach shots', 'No finish distances', 'No missed greens', 'No rough approaches']);
    expect([...section('approach').querySelectorAll('.ch-gm__figs dd')].some((d) => d.textContent === '—')).toBe(false);
    await chip('Putting');
    expect([...section('putting').querySelectorAll('.ch-gm__figs dd.ch-gm__none')].map((d) => d.textContent)).toEqual(['No putts tracked', 'No putts tracked', 'No putts tracked', 'No putts tracked']);
    expect([...section('putting').querySelectorAll('.ch-gm__figs dd')].some((d) => d.textContent === '—')).toBe(false);
  });

  it('the type contract in the stylesheet: the value is 28px and 600, its label and scope are 13 to 14px in secondary ink, and nothing floors them back to 12px', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/stats.css'), 'utf8');
    expect(css).toMatch(/\.ch-gd\.is-phone \.ch-gm__figs dd:not\(\.ch-gm__sub\) \{\s*font: 600 28px\/32px/);
    expect(css).toMatch(/\.ch-gd\.is-phone \.ch-gm__figs dt \{\s*font: 500 13\.5px\/19px var\(--ch-font-sans\);\s*color: var\(--ch-text-secondary\)/);
    expect(css).toMatch(/\.ch-gd\.is-phone \.ch-gm__figs dd\.ch-gm__sub \{\s*font: 400 13px\/18px var\(--ch-font-sans\);\s*color: var\(--ch-text-secondary\)/);
    const floor = css.slice(css.indexOf('Phone text floor'));
    expect(floor).not.toMatch(/\.ch-gd\.is-phone \.ch-gm__figs d[td]/);
  });
});
