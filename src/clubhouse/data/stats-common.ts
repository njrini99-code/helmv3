import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chLogServer } from '../lib/track-server';
import { isFull18, type ChRound } from './season';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The Stats window switch: last 10 rounds per player, the season, or qualifier rounds. */
export type ChWindow = 'last10' | 'season' | 'qualifiers';

export function parseWindow(v: string | undefined): ChWindow {
  return v === 'season' || v === 'qualifiers' ? v : 'last10';
}

export const WINDOW_LABEL: Record<ChWindow, string> = {
  last10: 'Last 10 rounds',
  season: 'This season',
  qualifiers: 'Qualifier rounds',
};

const QUALIFIER_TYPES = new Set(['qualifier', 'qualifying']);

/** One player's rounds in the window, newest first (18-hole, countable, already season-bounded). */
export function roundsInWindow(rounds: ChRound[], w: ChWindow): ChRound[] {
  const full = rounds.filter(isFull18);
  if (w === 'qualifiers') return full.filter((r) => QUALIFIER_TYPES.has((r.round_type ?? '').toLowerCase()));
  if (w === 'last10') return full.slice(0, 10);
  return full;
}

/** The window before this one, for "vs. previous" deltas. Season and qualifiers have none. */
export function previousWindow(rounds: ChRound[], w: ChWindow): ChRound[] | null {
  if (w !== 'last10') return null;
  const prev = rounds.filter(isFull18).slice(10, 20);
  return prev.length >= 3 ? prev : null;
}

/** How strokes gained moved against the previous window: the chip's change, and the words when there is none to show. */
export interface ChSgChange {
  delta: number | null;
  /** "vs. previous 10", "No earlier rounds", ...; empty when the window has no previous one by design (season, qualifiers). */
  context: string;
}

/**
 * `earlier` is how many 18-hole rounds come before the last 10. Both means
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
          'round_id, greens_hit, greens_total, fairways_hit, fairways_total, total_putts, scramble_attempts, scrambles_converted, birdies, eagles, sand_attempts, sand_saves, three_putts, penalty_strokes, double_bogeys, triple_plus',
        )
        .in('round_id', ids),
    ),
  );
  for (const { data, error } of results) {
    if (error) {
      chLogServer(surface, 'roundCache', error);
      return { byRound, error: true };
    }
    for (const row of data ?? []) byRound.set(row.round_id, row);
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

/** Every putt with a distance and a result on these rounds, read in parallel chunks. */
export async function loadPutts(supabase: Supabase, roundIds: string[]): Promise<{ rows: ChPuttRow[]; error: boolean }> {
  const rows: ChPuttRow[] = [];
  // The chunks are independent, so they are read in parallel.
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      fetchAllRowsResult<{ round_id: string; putt_distance_feet: number | null; putt_made: boolean | null }>(
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
