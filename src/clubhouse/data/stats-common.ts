import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import type { StatsFilter } from '@/app/golf/actions/stats-data-types';
import { chLogServer } from '../lib/track-server';
import { isFull18, seasonStartDate, type ChRound } from './season';

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

/** The same window, expressed for getDetailedStats (shot-level stats). */
export function windowFilter(w: ChWindow): StatsFilter {
  if (w === 'last10') return { preset: 'last10' };
  if (w === 'qualifiers') return { roundType: 'qualifier', preset: 'custom', startDate: seasonStartDate() };
  return { preset: 'custom', startDate: seasonStartDate() };
}

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
          'round_id, greens_hit, greens_total, fairways_hit, fairways_total, total_putts, scramble_attempts, scrambles_converted, birdies, eagles, sand_attempts, sand_saves, three_putts',
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

/** D1 averages from golf_pga_standards (div1_avg_value), for the team's tour. */
export async function loadD1(supabase: Supabase, tour: ChTour, surface: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await supabase
    .from('golf_pga_standards')
    .select('metric_id, div1_avg_value, tour')
    .in('tour', tour === 'lpga' ? ['lpga', 'pga'] : ['pga']);
  if (error) {
    chLogServer(surface, 'd1Benchmarks', error);
    return out;
  }
  // LPGA rows win for a women's team; PGA fills any gap (same rule as stats-leak-maps).
  const rows = [...(data ?? [])].sort((a, b) => (a.tour === tour ? 1 : 0) - (b.tour === tour ? 1 : 0));
  for (const r of rows) {
    const v = r.div1_avg_value == null ? null : Number(r.div1_avg_value);
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
