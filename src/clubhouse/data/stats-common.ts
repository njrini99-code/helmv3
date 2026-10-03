import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsTogether } from './paging';
import { chLogServer } from '../lib/track-server';
import { lastTenFloor, seasonStartDate, type ChRound } from './season';
import { hasScore } from './stats-weight';
import {
  earlierCount,
  hasRange,
  PICK_LIST_MAX,
  previousRounds,
  roundKind,
  selectRounds,
  type ChFilter,
  type ChFilterOptions,
  type ChFilterRow,
  type ChWindow,
} from './stats-filter';

export { parseWindow, type ChWindow } from './stats-filter';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const WINDOW_LABEL: Record<ChWindow, string> = {
  last10: 'Last 10 rounds',
  season: 'This season',
  qualifiers: 'Qualifier rounds',
};

/** A round as the filter reads it. */
export function roundRow(r: ChRound): ChFilterRow {
  return { id: r.id, date: r.round_date.slice(0, 10), kind: roundKind(r.round_type), course: r.course_name, holes: r.holes_played ?? 18 };
}

/**
 * One player's rounds under the filter, newest first: matched on type, round length (18 holes unless the filter says 9 or both),
 * course and time, then the picks, then the newest-ten cut (see stats-filter). Rounds posted as a total only are in (they are scores);
 * the hole-level figures take `holeRounds` of the result (round-scope).
 */
export function roundsInFilter(rounds: ChRound[], f: ChFilter): ChRound[] {
  return selectRounds(rounds.filter(hasScore), f, seasonStartDate(), roundRow);
}

/** The matching rounds before the newest ten, for "vs. previous 10", across seasons like the ten; null when the filter has no previous window or there are fewer than three. */
export function previousInFilter(rounds: ChRound[], f: ChFilter): ChRound[] | null {
  return previousRounds(rounds.filter(hasScore), f, seasonStartDate(), roundRow);
}

/** How many matching rounds come before the newest ten. */
export function earlierInFilter(rounds: ChRound[], f: ChFilter): number {
  return earlierCount(rounds.filter(hasScore), f, seasonStartDate(), roundRow);
}

/** Rounds from this season only (Last 10 and a custom range can load earlier ones; the season's own figures must not count them). */
export function seasonOnly(rounds: ChRound[]): ChRound[] {
  const start = seasonStartDate();
  return rounds.filter((r) => r.round_date.slice(0, 10) >= start);
}

/**
 * Where the rounds read starts. Last 10 reads a rolling year back (`lastTenFloor`: the newest ten and the ten before them, across seasons,
 * Q-122); Season and Qualifiers read this season; a custom range reads from its own start when that is before the season (no bound when
 * the range has no start). Undefined is `loadSeasonRounds`' own default, the season.
 */
export function loadSince(f: ChFilter): string | null | undefined {
  if (hasRange(f)) {
    if (!f.from) return null;
    return f.from < seasonStartDate() ? f.from : undefined;
  }
  return f.window === 'last10' ? lastTenFloor() : undefined;
}

/** What the sheet can list: the loaded rounds of both lengths (newest first, cut at the list size), and the courses with how many rounds each. */
export function filterOptions(rounds: ChRound[], names?: Map<string, string>): ChFilterOptions {
  const full = rounds.filter(hasScore);
  const counts = new Map<string, number>();
  for (const r of full) if (r.course_name?.trim()) counts.set(r.course_name, (counts.get(r.course_name) ?? 0) + 1);
  return {
    rounds: full.slice(0, PICK_LIST_MAX).map((r) => ({ ...roundRow(r), score: r.total_score as number, player: names?.get(r.player_id) ?? null })),
    total: full.length,
    courses: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    seasonStart: seasonStartDate(),
  };
}

/** How strokes gained moved against the previous window: the chip's change, and the words when there is none to show. */
export interface ChSgChange {
  delta: number | null;
  /** "vs. previous 10", "No earlier rounds", ...; empty when the window has no previous one by design (season, qualifiers). */
  context: string;
}

/**
 * `earlier` is how many matching rounds come before the last 10. Both means
 * need three rounds with shots (MIN_SG_ROUNDS), so "no earlier rounds" is
 * said only when there are none, and a thin earlier stretch says so instead.
 */
export function sgChange(current: number | null, previous: number | null, window: ChWindow, earlier: number): ChSgChange {
  if (current != null && previous != null) return { delta: current - previous, context: 'vs. previous 10' };
  if (window !== 'last10' || current == null) return { delta: null, context: '' };
  return { delta: null, context: earlier <= 0 ? 'No earlier rounds' : 'Too few earlier rounds with shots' };
}

export interface ChRoundCache {
  round_id: string;
  greens_hit: number | null;
  greens_total: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  total_putts: number | null;
  scramble_attempts: number | null;
  scrambles_converted: number | null;
  birdies: number | null;
  eagles: number | null;
  sand_attempts: number | null;
  sand_saves: number | null;
  three_putts: number | null;
  penalty_strokes: number | null;
  double_bogeys: number | null;
  triple_plus: number | null;
  pars?: number | null;
  bogeys?: number | null;
}

const HOLE_COUNTS = ['eagles', 'birdies', 'pars', 'bogeys', 'double_bogeys', 'triple_plus'] as const;
const HOLE_LEVEL = ['birdies', 'eagles', 'scramble_attempts', 'scrambles_converted', 'sand_attempts', 'sand_saves', 'three_putts', 'double_bogeys', 'triple_plus'] as const;

/**
 * C-24(a): a cache row for a round with no hole scored (its totals only) holds zeros for every hole-level count, which an
 * average would read as "no birdies, no three-putts". When every score count is known and they add up to no hole, the
 * hole-level counts are unknown (null), not zero. Round-level totals (greens, fairways, putts) stay. Exported for the tests.
 */
export function withoutEmptyHoleCounts(row: ChRoundCache): ChRoundCache {
  const counts = HOLE_COUNTS.map((k) => row[k]);
  if (!counts.every((v) => typeof v === 'number') || counts.reduce<number>((a, v) => a + (v as number), 0) > 0) return row;
  const out = { ...row };
  for (const k of HOLE_LEVEL) out[k] = null;
  return out;
}

/** Per-round cached aggregates (GIR, fairways, scrambling, birdies...) keyed by round id. */
export async function loadRoundCache(
  supabase: Supabase,
  roundIds: string[],
  surface: string,
): Promise<{ byRound: Map<string, ChRoundCache>; error: boolean }> {
  const byRound = new Map<string, ChRoundCache>();
  // The chunks are independent, so they are read in parallel.
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      supabase
        .from('golf_round_stats_cache')
        .select(
          'round_id, greens_hit, greens_total, fairways_hit, fairways_total, total_putts, scramble_attempts, scrambles_converted, birdies, eagles, sand_attempts, sand_saves, three_putts, penalty_strokes, double_bogeys, triple_plus, pars, bogeys',
        )
        .in('round_id', ids),
    ),
  );
  for (const { data, error } of results) {
    if (error) {
      chLogServer(surface, 'roundCache', error);
      return { byRound, error: true };
    }
    for (const row of data ?? []) byRound.set(row.round_id, withoutEmptyHoleCounts(row));
  }
  return { byRound, error: false };
}

/** Aggregate rate over rounds, weighting by attempts (never a mean of percentages). */
export function rate(rows: ChRoundCache[], made: keyof ChRoundCache, total: keyof ChRoundCache): number | null {
  let m = 0;
  let t = 0;
  for (const r of rows) {
    const a = r[made];
    const b = r[total];
    if (typeof a === 'number' && typeof b === 'number' && b > 0) {
      m += a;
      t += b;
    }
  }
  return t > 0 ? (m / t) * 100 : null;
}

export function perRound(rows: ChRoundCache[], key: keyof ChRoundCache): number | null {
  const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export type ChTour = 'pga' | 'lpga';

/**
 * The Tour's average for each metric from golf_pga_standards (`pga_tour_value`, which holds the LPGA
 * value on an LPGA row), for the team's own tour only: a women's team is never graded against the
 * men's values, and a metric the tour has no value for has no benchmark (Q-88: never D1, always Tour).
 */
export async function loadTourBenchmarks(supabase: Supabase, tour: ChTour, surface: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await supabase.from('golf_pga_standards').select('metric_id, pga_tour_value').eq('tour', tour);
  if (error) {
    chLogServer(surface, 'tourBenchmarks', error);
    return out;
  }
  for (const r of data ?? []) {
    const v = r.pga_tour_value == null ? null : Number(r.pga_tour_value);
    if (v != null && Number.isFinite(v)) out.set(r.metric_id, v);
  }
  return out;
}

export function tourForGender(gender: string | null | undefined): ChTour {
  return gender === 'womens' || gender === 'women' || gender === 'female' ? 'lpga' : 'pga';
}

/** Monday (UTC date string) of the week a calendar date falls in. */
export function weekOf(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function weekLabel(monday: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${monday}T12:00:00Z`));
}

export interface ChPuttRow {
  roundId: string;
  feet: number;
  made: boolean;
}

export interface ChPuttBand {
  label: string;
  made: number;
  attempts: number;
  /** The Tour's make rate for the band; null where the tour has none. */
  bench: number | null;
}

interface PuttBandDef {
  label: string;
  /** Upper edge in feet, inclusive: "3–5 ft" is (3, 5], as the calculator and the cache writer cut them. The last band is open. */
  hi: number;
  /** The golf_pga_standards metric whose Tour make rate grades this band; null where the tour publishes none. */
  metric: string | null;
}

/** Make rate by distance in the bands golf_pga_standards grades (3–5 up to 25+), so a band's Tour mark is the same distances. */
export const PUTT_BANDS: PuttBandDef[] = [
  { label: '0–3 ft', hi: 3, metric: null },
  { label: '3–5 ft', hi: 5, metric: 'putts_made_3_5ft_pct' },
  { label: '5–10 ft', hi: 10, metric: 'putts_made_5_10ft_pct' },
  { label: '10–15 ft', hi: 15, metric: 'putts_made_10_15ft_pct' },
  { label: '15–25 ft', hi: 25, metric: 'putts_made_15_25ft_pct' },
  { label: '25+ ft', hi: Infinity, metric: 'putts_made_25_plus_ft_pct' },
];

/**
 * The calculator's nine bands (Putting by distance on the production page). The Tour publishes five standards, so
 * 15–20 and 20–25 ft are graded against the 15–25 standard and the last three against the 25+ standard, as
 * production's own table does; 0–3 ft has none.
 */
export const PUTT_BANDS_NINE: PuttBandDef[] = [
  { label: '0–3 ft', hi: 3, metric: null },
  { label: '3–5 ft', hi: 5, metric: 'putts_made_3_5ft_pct' },
  { label: '5–10 ft', hi: 10, metric: 'putts_made_5_10ft_pct' },
  { label: '10–15 ft', hi: 15, metric: 'putts_made_10_15ft_pct' },
  { label: '15–20 ft', hi: 20, metric: 'putts_made_15_25ft_pct' },
  { label: '20–25 ft', hi: 25, metric: 'putts_made_15_25ft_pct' },
  { label: '25–30 ft', hi: 30, metric: 'putts_made_25_plus_ft_pct' },
  { label: '30–35 ft', hi: 35, metric: 'putts_made_25_plus_ft_pct' },
  { label: '35+ ft', hi: Infinity, metric: 'putts_made_25_plus_ft_pct' },
];

/** The putts in `rows` counted into the bands, with each band's Tour make rate where there is one. */
export function bandPutts(rows: ChPuttRow[], bench: Map<string, number>, bands: PuttBandDef[] = PUTT_BANDS): ChPuttBand[] {
  return bands.map((b, i) => {
    const lo = i ? bands[i - 1]!.hi : -Infinity;
    const inBand = rows.filter((r) => r.feet > lo && r.feet <= b.hi);
    return { label: b.label, attempts: inBand.length, made: inBand.filter((r) => r.made).length, bench: b.metric ? (bench.get(b.metric) ?? null) : null };
  });
}

/** Every putt with a distance and a result on these rounds, read in parallel chunks (and each chunk's pages together, `fetchAllRowsTogether`). */
export async function loadPutts(supabase: Supabase, roundIds: string[]): Promise<{ rows: ChPuttRow[]; error: boolean }> {
  const rows: ChPuttRow[] = [];
  // The chunks are independent, so they are read in parallel.
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      fetchAllRowsTogether<{ round_id: string; putt_distance_feet: number | null; putt_made: boolean | null }>(
        (from, to) =>
          supabase
            .from('golf_shots')
            .select('round_id, putt_distance_feet, putt_made')
            .in('round_id', ids)
            .not('putt_distance_feet', 'is', null)
            .not('putt_made', 'is', null)
            .order('id', { ascending: true })
            .range(from, to),
        undefined,
        { table: 'golf_shots', action: 'clubhouse.stats.putts', feature: 'stats_analytics', sport: 'golf' },
      ),
    ),
  );
  for (const res of results) {
    if (res.error) {
      chLogServer('stats', 'putts', res.error, 'stats_analytics');
      return { rows: [], error: true };
    }
    for (const r of res.data ?? []) {
      const feet = Number(r.putt_distance_feet);
      if (Number.isFinite(feet) && feet >= 0 && feet <= 120) rows.push({ roundId: r.round_id, feet, made: !!r.putt_made });
    }
  }
  return { rows, error: false };
}

/**
 * The longest putt made on these rounds (the season's best on Team stats): one row from the database (made, a distance of 0 to 120 feet,
 * the longest) instead of every putt of the season to find it. A tie goes to the lowest round id, then the lowest shot id, in the database and
 * across chunks alike, so the answer does not depend on how the rounds were chunked or which chunk answered first. Null when none was made;
 * `error` when the read failed (the best is then left out and logged, never shown as zero). The rows are compared here too, so a source that
 * returns more than one still answers right.
 */
export async function loadLongestPutt(supabase: Supabase, roundIds: string[]): Promise<{ longest: ChPuttRow | null; error: boolean }> {
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      supabase
        .from('golf_shots')
        .select('round_id, putt_distance_feet, putt_made')
        .in('round_id', ids)
        .eq('putt_made', true)
        .gte('putt_distance_feet', 0)
        .lte('putt_distance_feet', 120)
        .order('putt_distance_feet', { ascending: false })
        .order('round_id', { ascending: true })
        .order('id', { ascending: true })
        .limit(1),
    ),
  );
  let longest: ChPuttRow | null = null;
  for (const res of results) {
    if (res.error) {
      chLogServer('stats', 'longestPutt', res.error, 'stats_analytics');
      return { longest: null, error: true };
    }
    for (const r of res.data ?? []) {
      const feet = Number(r.putt_distance_feet);
      if (r.putt_made && Number.isFinite(feet) && feet >= 0 && feet <= 120 && (!longest || feet > longest.feet || (feet === longest.feet && r.round_id < longest.roundId))) {
        longest = { roundId: r.round_id, feet, made: true };
      }
    }
  }
  return { longest, error: false };
}
