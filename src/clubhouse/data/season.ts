import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { isCountableRound } from '@/lib/golf/round-countable';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import { chLogServer } from '../lib/track-server';

/**
 * Season rounds, shared by every Clubhouse screen so a player's average,
 * form and strokes gained read the same on Home, Roster and Stats.
 *
 * Season: 1 August to 31 July (the college golf year, same as dashboard-data).
 * Countable: isCountableRound. Averages and form use 18-hole rounds only.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ChRound {
  id: string;
  player_id: string;
  course_name: string | null;
  tees_played: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

const ROUND_COLUMNS =
  'id, player_id, course_name, tees_played, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';

export const TREND_LENGTH = 7;
export const MIN_SG_ROUNDS = 3;

export function seasonStartDate(now = new Date()): string {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-08-01`;
}

/** Newest first. `error` is true when any page failed; rounds then holds what loaded before it. */
export async function loadSeasonRounds(
  supabase: Supabase,
  playerIds: string[],
  opts: { surface: string; since?: string | null },
): Promise<{ rounds: ChRound[]; error: boolean }> {
  const since = opts.since === undefined ? seasonStartDate() : opts.since;
  const rounds: ChRound[] = [];
  for (const ids of chunkIds(playerIds)) {
    const res = await fetchAllRowsResult<ChRound>(
      (from, to) => {
        let q = supabase
          .from('golf_rounds')
          .select(ROUND_COLUMNS)
          .in('player_id', ids)
          .eq('is_test', false)
          .eq('status', 'completed')
          .not('total_score', 'is', null);
        if (since) q = q.gte('round_date', since);
        return q.order('round_date', { ascending: false }).order('id', { ascending: true }).range(from, to);
      },
      undefined,
      { table: 'golf_rounds', action: `clubhouse.${opts.surface}`, feature: 'coach_dashboard', sport: 'golf' },
    );
    if (res.error) {
      chLogServer(opts.surface, 'rounds', res.error);
      return { rounds: [], error: true };
    }
    rounds.push(...(res.data ?? []));
  }
  // C-15: the total and to-par from the holes (front + back nine), never a stale total_score column (round-total.ts).
  const countable = rounds.filter((r) => r.total_score != null && isCountableRound(r)).map(withCanonicalRoundTotal);
  countable.sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id)));
  return { rounds: countable, error: false };
}

export function isFull18(r: ChRound): boolean {
  return (r.holes_played ?? 18) === 18 && r.total_score != null;
}

export type ChForm = 'improving' | 'steady' | 'slipping' | 'early';

/** Recent form: the newer half of the trend against the older half, in strokes. */
export function formStatus(trend: number[]): ChForm {
  if (trend.length < 3) return 'early';
  const half = Math.floor(trend.length / 2);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const change = m(trend.slice(trend.length - half)) - m(trend.slice(0, half));
  if (change <= -0.5) return 'improving';
  if (change >= 0.5) return 'slipping';
  return 'steady';
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export interface ChPlayerSeason {
  /** 18-hole countable rounds this season. */
  rounds: number;
  avg: number | null;
  toPar: number | null;
  /** Oldest to newest, up to seven 18-hole scores. */
  trend: number[];
  /** Newer half minus older half of the trend; negative is better. */
  formChange: number | null;
  sgPerRound: number | null;
  sgRounds: number;
  sgLegs: { tee: number | null; approach: number | null; around: number | null; putting: number | null };
  status: ChForm;
  /** Newest first. */
  recent: ChRound[];
  lastRoundDate: string | null;
}

/** One player's season from their rounds (any order; 9-hole rounds are ignored). */
export function summarizePlayer(all: ChRound[]): ChPlayerSeason {
  const list = all.filter(isFull18);
  const scores = list.map((r) => r.total_score as number);
  const nums = (pick: (r: ChRound) => number | null) => list.map(pick).filter((v): v is number => v != null);
  const sg = nums((r) => r.strokes_gained_total);
  const trend = scores.slice(0, TREND_LENGTH).reverse();
  const half = Math.floor(trend.length / 2);
  const legs = (pick: (r: ChRound) => number | null) => {
    const v = nums(pick);
    return v.length >= MIN_SG_ROUNDS ? mean(v) : null;
  };
  return {
    rounds: list.length,
    avg: mean(scores),
    toPar: mean(nums((r) => r.score_to_par)),
    trend,
    formChange: trend.length >= 3 ? (mean(trend.slice(trend.length - half)) ?? 0) - (mean(trend.slice(0, half)) ?? 0) : null,
    sgPerRound: sg.length >= MIN_SG_ROUNDS ? mean(sg) : null,
    sgRounds: sg.length,
    sgLegs: {
      tee: legs((r) => r.strokes_gained_tee),
      approach: legs((r) => r.strokes_gained_approach),
      around: legs((r) => r.strokes_gained_around_green),
      putting: legs((r) => r.strokes_gained_putting),
    },
    status: formStatus(trend),
    recent: list.slice(0, 10),
    // C-24(e): the newest countable round of either length (a nine-hole round yesterday is a round yesterday), whatever the order given.
    lastRoundDate: all.reduce<string | null>((a, r) => (a == null || r.round_date > a ? r.round_date : a), null),
  };
}

export function groupByPlayer(rounds: ChRound[]): Map<string, ChRound[]> {
  const map = new Map<string, ChRound[]>();
  for (const r of rounds) {
    const list = map.get(r.player_id) ?? [];
    list.push(r);
    map.set(r.player_id, list);
  }
  return map;
}

/** "Senior", "Junior"... from a graduation year and the academic year in progress. */
export function classYearLabel(graduationYear: number | null, now = new Date()): string | null {
  if (!graduationYear) return null;
  const academicEnd = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  const labels = ['Senior', 'Junior', 'Sophomore', 'Freshman'];
  return labels[graduationYear - academicEnd] ?? `Class of ${graduationYear}`;
}

export function fullName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed player';
}

/** "Oct 12" for a round date (a calendar date, not an instant). */
export function shortDate(roundDate: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    new Date(`${roundDate.slice(0, 10)}T12:00:00Z`),
  );
}
