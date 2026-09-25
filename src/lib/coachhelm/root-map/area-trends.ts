/**
 * ============================================================================
 * Root map "Moving" strip + team trend: pure shaping of STORED per-round SG
 * ----------------------------------------------------------------------------
 * Inputs are `golf_rounds.strokes_gained_*` values the stats pipeline already
 * wrote. Nothing here recomputes SG; it only orders, windows and averages the
 * stored per-round numbers the loaders hand in.
 * ========================================================================== */

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
 */
export function buildTeamTrend(rounds: TeamSgRound[]): TeamTrendWeek[] {
  const byWeek = new Map<string, Map<string, AreaSgRound[]>>();
  for (const r of rounds) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(r.date)) continue;
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
    for (const list of players.values()) roundCount += list.length;
    for (const area of ROOT_AREAS) {
      const playerMeans: number[] = [];
      for (const list of players.values()) {
        const vals = list.map((r) => r[area]).filter(finite);
        if (vals.length > 0) playerMeans.push(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
      values[area] = playerMeans.length > 0 ? playerMeans.reduce((s, v) => s + v, 0) / playerMeans.length : null;
    }
    if (ROOT_AREAS.every((a) => values[a] === null)) continue;
    weeks.push({ weekStart, values, players: players.size, rounds: roundCount });
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
