/**
 * ============================================================================
 * Root map "Moving" strip + team trend: pure shaping of STORED per-round SG
 * ----------------------------------------------------------------------------
 * Inputs are `golf_rounds.strokes_gained_*` values the stats pipeline already
 * wrote. Nothing here recomputes SG; it only orders, windows and averages the
 * stored per-round numbers the loaders hand in.
 * ========================================================================== */

import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { computeSgTrends, type SgRoundSample } from '@/lib/coachhelm/v3/themes/trend';
import type { ThemeTrend } from '@/lib/coachhelm/v3/themes/types';
import { ROOT_AREAS, ROOT_AREA_LABEL, type RootArea } from './build-root-map';

/** One stored round, newest first. `date` is the date-only `round_date`. */
export interface AreaSgRound {
  date: string;
  tee: number | null;
  approach: number | null;
  short_game: number | null;
  putting: number | null;
  /** SG: Total, per 18 holes. Optional: only the area-average path reads it. */
  total?: number | null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Stored round → countable, per-18 area SG
 * ──────────────────────────────────────────────────────────────────────── */

/** The `golf_rounds` columns the root map selects for per-round SG. */
export const STORED_SG_COLUMNS =
  'round_date, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';

export interface StoredSgRoundRow extends CountableRoundInput {
  round_date: string | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * One stored round as root-map SG, or null when the round is not countable.
 *
 * Partial or mis-entered rounds (e.g. 37 strokes logged as 18 holes, SG tee
 * +17.89) carry absurd per-round SG and would swamp every average and trend,
 * so the same `isCountableRound` rule as the rest of CoachHelm applies.
 *
 * Values are per 18 holes: a 9-hole round's stored SG is a 9-hole total, so
 * it is doubled (the same per-18 convention as putts per round), otherwise a
 * 9-hole round reads as half a round's worth of gain or loss.
 */
export function areaRoundFromStored(row: StoredSgRoundRow): AreaSgRound | null {
  const date = typeof row.round_date === 'string' ? row.round_date.slice(0, 10) : null;
  if (!date || !isCountableRound(row)) return null;
  const holes = row.holes_played ?? 18;
  const per18 = (v: unknown): number | null => {
    const n = toNum(v);
    return n === null ? null : (n * 18) / holes;
  };
  return {
    date,
    tee: per18(row.strokes_gained_tee),
    approach: per18(row.strokes_gained_approach),
    short_game: per18(row.strokes_gained_around_green),
    putting: per18(row.strokes_gained_putting),
    total: per18(row.strokes_gained_total),
  };
}

export interface PlayerAreaSg {
  /** Countable rounds that carry a stored SG: Total (the averaged set). */
  roundsPlayed: number;
  sgTotal: number | null;
  sg: Record<RootArea, number | null>;
}

/**
 * Per-round area SG averaged over COUNTABLE rounds only (per 18 holes).
 *
 * Replaces the `golf_player_stats_cache.sg_*_per_round` read for the root
 * map: that cache is written by the SQL function
 * `update_player_stats_strokes_gained(p_player_id)`, which averages every
 * completed round with an SG total, broken ones included. Mirrors its set
 * (rounds with a stored SG: Total), minus the non-countable rounds.
 */
export function averageAreaSg(rounds: AreaSgRound[]): PlayerAreaSg {
  const counted = rounds.filter((r) => finite(r.total));
  const mean = (pick: (r: AreaSgRound) => number | null | undefined): number | null => {
    const vals = counted.map(pick).filter(finite);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  return {
    roundsPlayed: counted.length,
    sgTotal: mean((r) => r.total),
    sg: {
      tee: mean((r) => r.tee),
      approach: mean((r) => r.approach),
      short_game: mean((r) => r.short_game),
      putting: mean((r) => r.putting),
    },
  };
}

export interface AreaSparkline {
  area: RootArea;
  label: string;
  /** Chronological (oldest → newest) stored values, nulls dropped. */
  points: number[];
  /** Recent-vs-prior delta from `computeSgTrends`; null when either window
   *  is too thin to call (its own MIN_WINDOW rule). */
  trend: ThemeTrend | null;
}

function finite(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const TREND_KEY: Record<RootArea, 'tee' | 'approach' | 'short_game' | 'putting'> = {
  tee: 'tee',
  approach: 'approach',
  short_game: 'short_game',
  putting: 'putting',
};

/**
 * The four sparklines. Returns [] when no area has at least two stored
 * values (a line needs two points), so the caller omits the strip.
 */
export function buildAreaSparklines(roundsNewestFirst: AreaSgRound[], maxPoints = 10): AreaSparkline[] {
  const samples: SgRoundSample[] = roundsNewestFirst.map((r) => ({
    date: r.date,
    sgTee: r.tee,
    sgApproach: r.approach,
    sgAroundGreen: r.short_game,
    sgPutting: r.putting,
  }));
  const trends = computeSgTrends(samples) as Partial<Record<string, ThemeTrend>>;
  const lines = ROOT_AREAS.map((area) => {
    const points = roundsNewestFirst
      .map((r) => r[area])
      .filter(finite)
      .slice(0, maxPoints)
      .reverse();
    return {
      area,
      label: ROOT_AREA_LABEL[area],
      points,
      trend: trends[TREND_KEY[area]] ?? null,
    };
  });
  return lines.some((l) => l.points.length >= 2) ? lines : [];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Team weekly trend
 * ──────────────────────────────────────────────────────────────────────── */

export interface TeamSgRound extends AreaSgRound {
  playerId: string;
}

export interface TeamTrendWeek {
  /** Monday of the ISO week, `YYYY-MM-DD`. */
  weekStart: string;
  /** Team average per area: mean over players of each player's weekly mean.
   *  Null when no player had a stored value that week. */
  values: Record<RootArea, number | null>;
  players: number;
  rounds: number;
  /** Date-only `round_date` of the week's first and last counted round. */
  firstRound: string;
  lastRound: string;
}

/** Monday of the week containing a `YYYY-MM-DD` date, computed in UTC so the
 *  calendar date never shifts with the server's zone. */
export function weekStartOf(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0 Sun .. 6 Sat
  const back = (dow + 6) % 7; // days since Monday
  return new Date(t - back * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Weekly team averages, oldest week first. Each player counts once per week
 * (their own weekly mean), so a player who logged four rounds does not
 * outweigh one who logged one. Weeks with no stored values are skipped.
 *
 * `maxWeeks` windows the trend to the weeks ending at the LATEST counted
 * round with a stored area SG, not at today: a team whose newest counted
 * round is two months old still gets its last `maxWeeks` of play, labelled
 * with the real dates, instead of a window that is mostly empty. Rounds the
 * loader dropped (not countable, or no stored SG) never anchor it.
 */
export function buildTeamTrend(rounds: TeamSgRound[], opts: { maxWeeks?: number } = {}): TeamTrendWeek[] {
  const dated = rounds.filter(
    (r) => /^\d{4}-\d{2}-\d{2}/.test(r.date) && ROOT_AREAS.some((a) => finite(r[a])),
  );
  let inWindow = dated;
  if (opts.maxWeeks !== undefined && opts.maxWeeks > 0 && dated.length > 0) {
    const latest = dated.reduce((m, r) => (r.date.slice(0, 10) > m ? r.date.slice(0, 10) : m), '');
    const [y = 1970, m = 1, d = 1] = weekStartOf(latest).split('-').map(Number);
    const firstWeek = new Date(Date.UTC(y, m - 1, d) - (opts.maxWeeks - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
    inWindow = dated.filter((r) => r.date.slice(0, 10) >= firstWeek);
  }
  const byWeek = new Map<string, Map<string, AreaSgRound[]>>();
  for (const r of inWindow) {
    const wk = weekStartOf(r.date.slice(0, 10));
    const players = byWeek.get(wk) ?? new Map<string, AreaSgRound[]>();
    const list = players.get(r.playerId) ?? [];
    list.push(r);
    players.set(r.playerId, list);
    byWeek.set(wk, players);
  }
  const weeks: TeamTrendWeek[] = [];
  for (const [weekStart, players] of byWeek) {
    const values = {} as Record<RootArea, number | null>;
    let roundCount = 0;
    let firstRound = '';
    let lastRound = '';
    for (const list of players.values()) {
      roundCount += list.length;
      for (const r of list) {
        const day = r.date.slice(0, 10);
        if (!firstRound || day < firstRound) firstRound = day;
        if (day > lastRound) lastRound = day;
      }
    }
    for (const area of ROOT_AREAS) {
      const playerMeans: number[] = [];
      for (const list of players.values()) {
        const vals = list.map((r) => r[area]).filter(finite);
        if (vals.length > 0) playerMeans.push(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
      values[area] = playerMeans.length > 0 ? playerMeans.reduce((s, v) => s + v, 0) / playerMeans.length : null;
    }
    if (ROOT_AREAS.every((a) => values[a] === null)) continue;
    weeks.push({ weekStart, values, players: players.size, rounds: roundCount, firstRound, lastRound });
  }
  return weeks.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/* ─────────────────────────────────────────────────────────────────────────
 * Diverging stack geometry (value space; the chart maps it to pixels)
 * ──────────────────────────────────────────────────────────────────────── */

export interface StackBand {
  area: RootArea;
  /** Per week: [lower, upper] in strokes. Gains stack upward from 0, losses
   *  downward from 0, in ROOT_AREAS order. A null week value adds nothing. */
  bounds: Array<[number, number]>;
}

export interface DivergingStack {
  bands: StackBand[];
  /** Per week: the sum of the four stored team values (null values as 0). */
  net: number[];
  /** Largest absolute stacked extent across weeks (≥ 0). */
  extent: number;
}

export function stackTeamTrend(weeks: TeamTrendWeek[]): DivergingStack {
  const pos = weeks.map(() => 0);
  const neg = weeks.map(() => 0);
  const bands: StackBand[] = ROOT_AREAS.map((area) => ({
    area,
    bounds: weeks.map((w, i) => {
      const v = w.values[area];
      if (!finite(v) || v === 0) return [pos[i]!, pos[i]!] as [number, number];
      if (v > 0) {
        const lo = pos[i]!;
        pos[i] = lo + v;
        return [lo, lo + v] as [number, number];
      }
      const hi = neg[i]!;
      neg[i] = hi + v;
      return [hi + v, hi] as [number, number];
    }),
  }));
  const net = weeks.map((w) => ROOT_AREAS.reduce((s, a) => s + (finite(w.values[a]) ? (w.values[a] as number) : 0), 0));
  const extent = Math.max(0, ...pos, ...neg.map((v) => -v));
  return { bands, net, extent };
}
