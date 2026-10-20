/**
 * The team pool benchmark (CoachHelm supercharge Slice 7a; `02` §3 and §4,
 * `03` §5.2, `04` §1.1 and §2).
 *
 * Every benchmark word on a read was the Tour, so every college player read
 * "below benchmark" everywhere. The team pool is the primary comparison word:
 * the POOLED attempts of the player's teammates in the same window (not the
 * median of their noisy rates), so 8 teammates × 30 putts give one rate over
 * about 240 putts.
 *
 * Rules (owner defaults, `03` §5.2 and the slice brief):
 *   - the player's own attempts are never in their pool;
 *   - only countable, non-test rounds count (`isCountableRound`), inside the
 *     read's window;
 *   - privacy: at least 5 rostered players with a countable round in the
 *     window (the player included), or no team line, so a pool never stands
 *     for one identifiable teammate on a tiny roster;
 *   - floor: at least 4 teammates with at least 3 countable rounds; only those
 *     teammates contribute, and at least 4 of them must have attempts in the
 *     family itself (a sand pool from one teammate's bunker holes would be
 *     that teammate's number);
 *   - at least 100 pooled attempts for an attempt-counted family (`02` §3:
 *     below that the design falls back to a program pool, which the owner has
 *     not approved, so there is simply no team line).
 *   No program pool is built (open owner question; default no).
 *
 * Pure: data in, value out. The loader (`loader.ts`) reads the rows; nothing
 * here touches Supabase.
 */
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import type {
  ComparisonLine,
  InsightComparison,
  InsightEvidence,
  InsightSampleUnit,
  InsightUnit,
} from '@/lib/coachhelm/v2/insights/types';

/** `03` §5.2 / brief: rostered players with a countable round in the window. */
export const TEAM_POOL_MIN_ROSTER = 5;
/** `03` §5.2: teammates (the player excluded) with enough rounds to pool. */
export const TEAM_POOL_MIN_TEAMMATES = 4;
/** `03` §5.2: countable rounds a teammate needs in the window to contribute. */
export const TEAM_POOL_MIN_TEAMMATE_ROUNDS = 3;
/** `02` §3: pooled attempts below which the team line is not drawn. */
export const TEAM_POOL_MIN_ATTEMPTS = 100;

export type PuttBand = '3_5ft' | '5_10ft' | '10_15ft' | '15_25ft' | '25_plus_ft';
export type ApproachBand = '50_125ft' | '125_175ft' | '175_plus_ft';

export const PUTT_BANDS: readonly PuttBand[] = ['3_5ft', '5_10ft', '10_15ft', '15_25ft', '25_plus_ft'];
export const APPROACH_BANDS: readonly ApproachBand[] = ['50_125ft', '125_175ft', '175_plus_ft'];

/** The metric families a pool can be drawn for: the shot- or hole-countable ones. */
export type TeamPoolFamily =
  | `putt_make:${PuttBand}`
  | 'three_putt'
  | 'gir'
  | `approach_green_hit:${ApproachBand}`
  | 'scrambling'
  | 'sand_save'
  | 'penalty_rate'
  | 'par_scoring:3'
  | 'par_scoring:4'
  | 'par_scoring:5';

export const TEAM_POOL_FAMILIES: readonly TeamPoolFamily[] = [
  ...PUTT_BANDS.map((b) => `putt_make:${b}` as const),
  'three_putt',
  'gir',
  ...APPROACH_BANDS.map((b) => `approach_green_hit:${b}` as const),
  'scrambling',
  'sand_save',
  'penalty_rate',
  'par_scoring:3',
  'par_scoring:4',
  'par_scoring:5',
];

/** One scored hole, as `golf_holes` stores it. */
export interface PoolHole {
  par: number | null;
  score: number | null;
  putts: number | null;
  penalty_strokes: number | null;
  gir: boolean | null;
  sand_save: boolean | null;
  up_and_down: boolean | null;
}

/** One putt: feet as `update_player_putt_make_pct` reads them (raw
 *  `distance_to_hole_before`, clamped 0..120) and whether it dropped. */
export interface PoolPutt {
  feet: number;
  made: boolean;
}

/** One approach, already banded and judged by the generator's own helpers
 *  (`bucketApproachDistance`, `reachedGreen`) in the loader. */
export interface PoolApproach {
  band: ApproachBand;
  green_hit: boolean;
}

/** One round with the columns the countable rule reads, and its records. */
export interface PoolRound extends CountableRoundInput {
  id: string;
  round_date: string;
  holes: readonly PoolHole[];
  putts: readonly PoolPutt[];
  approaches: readonly PoolApproach[];
}

export interface PoolPlayer {
  player_id: string;
  rounds: readonly PoolRound[];
}

/** Inclusive YYYY-MM-DD bounds; `start` null means from the beginning. */
export interface PoolWindow {
  start: string | null;
  end: string;
}

export interface TeamPool {
  family: TeamPoolFamily;
  /** In the read's scale: a percent as 0-100 (1 dp), strokes to 2 dp. */
  value: number;
  /** Pooled attempts (or rounds for a per-round rate). */
  n: number;
  n_unit: InsightSampleUnit;
  n_noun: string;
  unit: InsightUnit;
  /** Teammates whose attempts are in the pool. */
  players: number;
  window_start: string | null;
  window_end: string;
}

export type TeamPoolNoneReason =
  | 'privacy_roster'
  | 'teammate_floor'
  | 'family_players'
  | 'pooled_attempts';

export type TeamPoolOutcome =
  | { kind: 'pool'; pool: TeamPool }
  | { kind: 'none'; reason: TeamPoolNoneReason };

interface FamilyMeta {
  scale: 'percent' | 'per_18' | 'mean';
  unit: InsightUnit;
  n_unit: InsightSampleUnit;
  n_noun: string;
  /** Whether `TEAM_POOL_MIN_ATTEMPTS` applies (not to a per-round rate). */
  attemptFloor: boolean;
}

function metaFor(family: TeamPoolFamily): FamilyMeta {
  if (family.startsWith('putt_make:')) return { scale: 'percent', unit: 'percent', n_unit: 'putts', n_noun: 'putts', attemptFloor: true };
  if (family.startsWith('approach_green_hit:')) return { scale: 'percent', unit: 'percent', n_unit: 'approaches', n_noun: 'approaches', attemptFloor: true };
  if (family.startsWith('par_scoring:')) return { scale: 'mean', unit: 'strokes', n_unit: 'holes', n_noun: 'holes', attemptFloor: true };
  switch (family) {
    case 'three_putt':
      return { scale: 'percent', unit: 'percent', n_unit: 'holes', n_noun: 'putted holes', attemptFloor: true };
    case 'gir':
      return { scale: 'percent', unit: 'percent', n_unit: 'holes', n_noun: 'holes', attemptFloor: true };
    case 'scrambling':
      return { scale: 'percent', unit: 'percent', n_unit: 'opportunities', n_noun: 'missed greens', attemptFloor: true };
    case 'sand_save':
      return { scale: 'percent', unit: 'percent', n_unit: 'opportunities', n_noun: 'bunker holes', attemptFloor: true };
    default:
      // penalty_rate: penalty strokes per 18 holes, counted in rounds.
      return { scale: 'per_18', unit: 'count', n_unit: 'rounds', n_noun: 'rounds', attemptFloor: false };
  }
}

/** The putt band a distance falls in, with `update_player_putt_make_pct`'s edges. */
export function puttBandOf(feet: number): PuttBand | null {
  const f = Math.min(Math.max(feet, 0), 120);
  if (f > 3 && f <= 5) return '3_5ft';
  if (f > 5 && f <= 10) return '5_10ft';
  if (f > 10 && f <= 15) return '10_15ft';
  if (f > 15 && f <= 25) return '15_25ft';
  if (f > 25) return '25_plus_ft';
  return null;
}

/** Numerator and denominator one round adds to a family. */
export interface Tally {
  num: number;
  den: number;
}

/** Pure: what one round adds to a family, on the same definitions the player's read uses. */
export function tallyRound(round: Pick<PoolRound, 'holes' | 'putts' | 'approaches'>, family: TeamPoolFamily): Tally {
  let num = 0;
  let den = 0;
  if (family.startsWith('putt_make:')) {
    const band = family.slice('putt_make:'.length) as PuttBand;
    for (const p of round.putts) {
      if (!Number.isFinite(p.feet) || puttBandOf(p.feet) !== band) continue;
      den += 1;
      if (p.made) num += 1;
    }
    return { num, den };
  }
  if (family.startsWith('approach_green_hit:')) {
    const band = family.slice('approach_green_hit:'.length) as ApproachBand;
    for (const a of round.approaches) {
      if (a.band !== band) continue;
      den += 1;
      if (a.green_hit) num += 1;
    }
    return { num, den };
  }
  if (family.startsWith('par_scoring:')) {
    const par = Number(family.slice('par_scoring:'.length));
    for (const h of round.holes) {
      if (h.par !== par || h.score == null || !Number.isFinite(h.score)) continue;
      den += 1;
      num += h.score;
    }
    return { num, den };
  }
  for (const h of round.holes) {
    switch (family) {
      case 'three_putt':
        if (h.putts == null) break;
        den += 1;
        if (h.putts >= 3) num += 1;
        break;
      case 'gir':
        if (h.gir == null) break;
        den += 1;
        if (h.gir) num += 1;
        break;
      case 'scrambling':
        // An up-and-down chance is a missed green with the flag recorded.
        if (h.gir !== false || h.up_and_down == null) break;
        den += 1;
        if (h.up_and_down) num += 1;
        break;
      case 'sand_save':
        // One chance per bunker hole, from the flag the cache reads.
        if (h.sand_save == null) break;
        den += 1;
        if (h.sand_save) num += 1;
        break;
      case 'penalty_rate':
        // Per scored hole, scaled to 18 like the stats cache.
        if (h.score == null) break;
        den += 1;
        num += h.penalty_strokes ?? 0;
        break;
      default:
        break;
    }
  }
  return { num, den };
}

function inWindow(day: string, w: PoolWindow): boolean {
  const d = day.slice(0, 10);
  return d <= w.end && (w.start === null || d >= w.start);
}

/** A player's countable, non-test rounds inside the window. */
export function countableRoundsInWindow(player: PoolPlayer, w: PoolWindow): PoolRound[] {
  return player.rounds.filter(
    (r) => r.is_test !== true && typeof r.round_date === 'string' && inWindow(r.round_date, w) && isCountableRound(r),
  );
}

function roundTo(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/**
 * Pure: the team pool for one player, family and window, or why there is none.
 * `players` is the roster (the player may be in it; they are excluded).
 */
export function computeTeamPool(input: {
  players: readonly PoolPlayer[];
  playerId: string;
  family: TeamPoolFamily;
  window: PoolWindow;
}): TeamPoolOutcome {
  const { players, playerId, family, window } = input;
  const byPlayer = players.map((p) => ({ id: p.player_id, rounds: countableRoundsInWindow(p, window) }));
  const withRounds = byPlayer.filter((p) => p.rounds.length > 0).length;
  if (withRounds < TEAM_POOL_MIN_ROSTER) return { kind: 'none', reason: 'privacy_roster' };

  const teammates = byPlayer.filter(
    (p) => p.id !== playerId && p.rounds.length >= TEAM_POOL_MIN_TEAMMATE_ROUNDS,
  );
  if (teammates.length < TEAM_POOL_MIN_TEAMMATES) return { kind: 'none', reason: 'teammate_floor' };

  let num = 0;
  let den = 0;
  let rounds = 0;
  let contributing = 0;
  for (const t of teammates) {
    let pDen = 0;
    let pRounds = 0;
    for (const r of t.rounds) {
      const tally = tallyRound(r, family);
      num += tally.num;
      pDen += tally.den;
      if (tally.den > 0) pRounds += 1;
    }
    den += pDen;
    rounds += pRounds;
    if (pDen > 0) contributing += 1;
  }
  if (contributing < TEAM_POOL_MIN_TEAMMATES) return { kind: 'none', reason: 'family_players' };

  const meta = metaFor(family);
  if (den <= 0 || (meta.attemptFloor && den < TEAM_POOL_MIN_ATTEMPTS)) {
    return { kind: 'none', reason: 'pooled_attempts' };
  }

  const raw = num / den;
  const value =
    meta.scale === 'percent' ? roundTo(raw * 100, 1) : meta.scale === 'per_18' ? roundTo(raw * 18, 2) : roundTo(raw, 2);
  return {
    kind: 'pool',
    pool: {
      family,
      value,
      n: meta.n_unit === 'rounds' ? rounds : den,
      n_unit: meta.n_unit,
      n_noun: meta.n_noun,
      unit: meta.unit,
      players: contributing,
      window_start: window.start,
      window_end: window.end,
    },
  };
}

/**
 * Pure: which pool family a read compares against, by its insight type AND
 * metric. The type matters: `putt_bias` rows carry a putt-band metric id but
 * their `your_value` is a side-vs-side gap, not a make rate, and
 * `approach_miss` rows carry a proximity id while `your_value` is the green-hit
 * percent. Null for every read whose value no pool measures.
 */
export function familyForRead(insightType: string, metric: string): TeamPoolFamily | null {
  if (insightType === 'putt_distance') {
    const m = /^putts_made_(3_5ft|5_10ft|10_15ft|15_25ft|25_plus_ft)_pct$/.exec(metric);
    return m ? (`putt_make:${m[1]}` as TeamPoolFamily) : null;
  }
  if (insightType === 'approach_miss') {
    const m = /^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/.exec(metric);
    return m ? (`approach_green_hit:${m[1]}` as TeamPoolFamily) : null;
  }
  if (insightType === 'scrambling' && metric === 'scrambling_pct_sand') return 'sand_save';
  if (insightType === 'par_scoring') {
    const m = /^scoring_par_([345])$/.exec(metric);
    return m ? (`par_scoring:${m[1]}` as TeamPoolFamily) : null;
  }
  if (insightType === 'course_management' && metric === 'penalty_rate_per_round') return 'penalty_rate';
  return null;
}

/** Day bounds (YYYY-MM-DD) of a window given as ISO strings. */
function day(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

/**
 * Pure: the pool window for a read. The read's own window: `window_end` (today
 * when empty) back to `window_start`, else `window_days` before the end, else
 * the beginning (a lifetime value with no start).
 */
export function poolWindowFor(
  evidence: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days' | 'window_basis'>,
  now: Date = new Date(),
): PoolWindow {
  const end = day(evidence.window_end) ?? now.toISOString().slice(0, 10);
  const start = day(evidence.window_start);
  if (start) return { start, end };
  const days = Number(evidence.window_days);
  if (evidence.window_basis !== 'lifetime' && Number.isFinite(days) && days > 0) {
    const s = new Date(Date.parse(`${end}T00:00:00Z`) - days * 86400_000).toISOString().slice(0, 10);
    return { start: s, end };
  }
  return { start: null, end };
}

/** The team line exactly as it is stored. */
export function teamPoolLine(pool: TeamPool): ComparisonLine {
  return {
    source: 'team_pool',
    label: 'Team pool',
    value: pool.value,
    n: pool.n,
    unit: pool.unit,
    n_unit: pool.n_unit,
    n_noun: pool.n_noun,
    players: pool.players,
    window_start: pool.window_start,
    window_end: pool.window_end,
  };
}

/**
 * Pure: the read's evidence with the team line as `comparison.primary` and the
 * Tour (the flat comparison, when it is a Tour anchor) kept as a further line.
 * Nothing else changes: the flat `comparison_*` fields, the standing block and
 * the strokes arithmetic stay on the Tour (`02` §3: "Strokes use the Tour
 * baseline; words use your team").
 */
export function withTeamComparison<E extends InsightEvidence>(evidence: E, pool: TeamPool): E {
  const team = teamPoolLine(pool);
  const lines: ComparisonLine[] = [team];
  if (evidence.comparison_source === 'pga_baseline' && Number.isFinite(evidence.comparison_value)) {
    lines.push({
      source: 'tour',
      label: evidence.comparison_label,
      value: evidence.comparison_value,
      n: null,
      unit: evidence.unit,
    });
  }
  const comparison: InsightComparison = { primary: team, lines };
  return { ...evidence, comparison };
}
