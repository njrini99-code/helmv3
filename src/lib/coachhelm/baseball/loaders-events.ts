/**
 * CoachHelm BASEBALL EVENT-GRAIN loaders — catching / defense / baserunning +
 * the deepened hitting/pitching metrics that need pitch/batted-ball EVENTS.
 *
 * The box-score loaders (`loaders.ts`) cover season-aggregate hitting/pitching/
 * workload; `loaders-v10.ts` covers readiness/lift/practice/import. This module
 * closes the V6 §Pattern Generators / V10 §Generator Families gap: V10 line 243
 * + lines 353-383 RE-MANDATE catching, defense, and baserunning generator
 * families with named metrics (catcher_recent_innings_caught, catcher_throw_
 * accuracy, defense_error_cluster_rate, baserunning_out_rate), and the V6 spec
 * lists 12 hitting + 12 pitching generators we had not built. These loaders
 * derive those metrics from the elite stat-EVENT tables that already exist
 * (migration 20260624000080: baseball_pitch_events, baseball_batted_ball_events,
 * baseball_catching_events, baseball_fielding_events, baseball_baserunning_events).
 *
 * HONESTY CONTRACT (identical to loaders.ts / loaders-v10.ts):
 *   - confidence is the SHARED engine blend (calcConfidence) capped by the
 *     metric's fidelity ceiling — never a fabricated 1.0;
 *   - target_n recalibrated to roster reality (BASEBALL_TARGET_N);
 *   - workload-style metrics (innings caught) are neutral_threshold — the owning
 *     generator alone interprets them, attribution can never learn backward;
 *   - source refs are `staff_only` for staff-restricted diagnostic events so an
 *     insight resting on them defaults coach-only (strictest-source rule);
 *   - a source-starved metric simply does NOT load (no fabricated value) — a team
 *     with no event data sees no catching/defense/baserunning signals at all.
 *
 * Pure module: no DB access (the action fetches rows + passes them in).
 */

import type { InsightConfidenceFactors } from '@/lib/coachhelm/shared/evidence-types';
import { calcConfidence } from '@/lib/coachhelm/shared/evidence-types';
import { computeMeasuredFactors } from '@/lib/coachhelm/shared/base-generator';
import type {
  BaseballInsightSourceRef,
  BaseballSourceVisibility,
} from '@/lib/types/baseball-coachhelm';
import {
  getBaseballMetricFidelity,
  getBaseballMetricUnit,
  type BaseballMetricId,
} from './metrics/registry';
import { BASEBALL_TARGET_N, type LoadedMetric, type LoadedPlayerMetrics } from './loaders';

// -----------------------------------------------------------------------------
// Source row shapes — subsets of the elite stat-event tables we read. Kept local
// + structural (mirrors loaders.ts) so this module does not couple to the full
// generated/hand-written row. Columns match baseball-stat-events.ts EXACTLY.
// -----------------------------------------------------------------------------

/** Subset of baseball_pitch_events. */
export interface PitchEventRow {
  id: string;
  pitcher_id?: string | null;
  batter_id?: string | null;
  data_context?: string | null;
  pitch_number?: number | null;
  pitch_type_classified?: string | null;
  pitch_type?: string | null;
  velocity?: number | null;
  is_swing?: boolean | null;
  is_whiff?: boolean | null;
  is_in_zone?: boolean | null;
  is_called_strike?: boolean | null;
  pitch_call?: string | null;
  /** e.g. '0-0','1-2' — the count BEFORE the pitch. */
  count_state?: string | null;
  batter_handedness?: 'L' | 'R' | 'S' | null;
  measured_at?: string | null;
}

/** Subset of baseball_batted_ball_events. */
export interface BattedBallEventRow {
  id: string;
  batter_id?: string | null;
  data_context?: string | null;
  exit_velocity?: number | null;
  spray_angle?: number | null;
  batted_ball_type?: string | null;
  is_hard_hit?: boolean | null;
  measured_at?: string | null;
}

/** Subset of baseball_catching_events. */
export interface CatchingEventRow {
  id: string;
  catcher_id?: string | null;
  data_context?: string | null;
  event_type?: string | null; // receive|block|throwdown|game_call|mound_visit
  pop_time?: number | null;
  throw_accuracy?: string | null; // 'accurate'|'offline'|'high'|'low'|...
  block_result?: string | null; // 'blocked'|'miss'|'clean'|...
  steal_result?: string | null; // 'out'|'safe'|'cs'|'sb'|...
  innings_caught?: number | null; // not a column today; reserved for stat_facts
  measured_at?: string | null;
}

/** Subset of baseball_fielding_events. */
export interface FieldingEventRow {
  id: string;
  player_id?: string | null;
  data_context?: string | null;
  position?: string | null;
  event_type?: string | null; // 'putout'|'assist'|'error'|'bunt'|'pfp'|...
  chance_difficulty?: string | null; // 'routine'|'medium'|'difficult'|...
  result?: string | null; // 'out'|'safe'|'error'|'success'|...
  error_type?: string | null; // 'fielding'|'throwing'|null
  arm_accuracy?: string | null; // 'accurate'|'offline'|...
  measured_at?: string | null;
}

/** Subset of baseball_baserunning_events. */
export interface BaserunningEventRow {
  id: string;
  runner_id?: string | null;
  data_context?: string | null;
  event_type?: string | null; // 'steal'|'advance'|'first_to_third'|'tag_up'|...
  result?: string | null; // 'safe'|'out'|'cs'|'sb'|'advanced'|'held'|...
  decision_quality?: string | null; // 'good'|'poor'|'aggressive'|'passive'|...
  measured_at?: string | null;
}

// -----------------------------------------------------------------------------
// Shared confidence/ref/metric helpers (mirror loaders.ts so the honesty
// machinery is identical across loader modules).
// -----------------------------------------------------------------------------

const FIDELITY_CONFIDENCE_CEILING: Record<string, number> = {
  measured: 1.0,
  proxy: 0.49,
  sensor_optional: 0.7,
};

/** Below this, a coincidentally-tight variance term is not trusted (SV-1). */
const MIN_EVENTS_FOR_MEASURED_VARIANCE = 4;

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

const lc = (v: string | null | undefined): string => (v ?? '').toLowerCase();

function ref(
  table: string,
  column: string,
  visibility: BaseballSourceVisibility,
  sample_n: number,
  label: string,
): BaseballInsightSourceRef {
  return { table, column, visibility, sample_n, label };
}

/** stddev of a numeric series (population), or undefined for <2 points. */
function stddev(values: number[]): number | undefined {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return undefined;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function buildConfidence(
  metric: BaseballMetricId,
  sample_n: number,
  target_n: number,
  dispersion?: { stddev: number; stddev_scale?: number; round_dates: string[] },
): { confidence: number; factors: InsightConfidenceFactors } {
  const sample_adequacy = target_n > 0 ? Math.min(1, sample_n / target_n) : 0;
  const enoughEvents =
    !!dispersion && (dispersion.round_dates?.length ?? 0) >= MIN_EVENTS_FOR_MEASURED_VARIANCE;
  const measured = enoughEvents
    ? computeMeasuredFactors(
        { stddev: dispersion!.stddev, stddev_scale: dispersion!.stddev_scale, round_dates: dispersion!.round_dates },
        120,
      )
    : null;
  const factors: InsightConfidenceFactors = measured
    ? { sample_adequacy, recency: measured.recency, variance: measured.variance, factors_measured: true }
    : { sample_adequacy, recency: 1, variance: 0, factors_measured: false };
  const raw = calcConfidence({ confidence_factors: factors });
  const ceiling = FIDELITY_CONFIDENCE_CEILING[getBaseballMetricFidelity(metric)] ?? 0.6;
  return { confidence: Math.max(0, Math.min(ceiling, raw)), factors };
}

function toMetric(
  metric: BaseballMetricId,
  value: number | null,
  sample_n: number,
  refs: BaseballInsightSourceRef[],
  dispersion?: { stddev: number; stddev_scale?: number; round_dates: string[] },
): LoadedMetric {
  const target_n = BASEBALL_TARGET_N[metric];
  const { confidence, factors } = buildConfidence(metric, sample_n, target_n, dispersion);
  return {
    metric,
    value,
    unit: getBaseballMetricUnit(metric),
    sample_n,
    target_n,
    confidence,
    confidence_factors: factors,
    source_refs: refs.map((r) => ({ ...r, confidence })),
  };
}

/** A count is the first strike of a count when count_state is '0-0'. */
const isFirstPitch = (c: string | null | undefined): boolean => (c ?? '').trim() === '0-0';
/** A count is a two-strike count when the strikes digit is 2. */
const isTwoStrike = (c: string | null | undefined): boolean => {
  const m = /^(\d)-(\d)$/.exec((c ?? '').trim());
  return m != null && m[2] === '2';
};
/** A count is a hitter's count (0-0,1-0,2-0,3-0,3-1,2-1,3-2) for mix predictability. */
const isFastballCount = (c: string | null | undefined): boolean => {
  const m = /^(\d)-(\d)$/.exec((c ?? '').trim());
  if (!m) return false;
  const balls = Number(m[1]);
  const strikes = Number(m[2]);
  return balls > strikes || (balls === 3 && strikes === 2);
};

// =============================================================================
// HITTING (deepened) — from pitch + batted-ball events.
// =============================================================================

/**
 * Load the deepened HITTING metrics for one batter from their pitch/batted-ball
 * events. RISP is intentionally NOT computed here (it needs PA-level base-state
 * context which lives on baseball_plate_appearances — wired separately if/when
 * dense). Everything here is honest: a metric only loads when its denominator is
 * non-trivially supported.
 */
export function loadHittingEventMetrics(
  batterId: string,
  pitches: PitchEventRow[],
  battedBalls: BattedBallEventRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  const mine = pitches.filter((p) => p.batter_id === batterId);

  // First-pitch take rate: of 0-0 pitches taken for a STRIKE (passive on a
  // hittable pitch). Denominator = first pitches that were in-zone (hittable).
  const firstHittable = mine.filter((p) => isFirstPitch(p.count_state) && p.is_in_zone === true);
  if (firstHittable.length > 0) {
    const taken = firstHittable.filter((p) => p.is_swing !== true).length;
    out.hitter_first_pitch_take_rate = toMetric(
      'hitter_first_pitch_take_rate',
      taken / firstHittable.length,
      firstHittable.length,
      [ref('baseball_pitch_events', 'count_state,is_in_zone,is_swing', 'staff_only', firstHittable.length, 'First-pitch takes on hittable pitches')],
    );
  }

  // In-zone contact rate: 1 − whiff-on-in-zone-swings. Denominator = in-zone
  // swings. A DECLINE is the concern; registry direction handles the sense.
  const zoneSwings = mine.filter((p) => p.is_in_zone === true && p.is_swing === true);
  if (zoneSwings.length > 0) {
    const whiffs = zoneSwings.filter((p) => p.is_whiff === true).length;
    out.hitter_zone_contact_rate = toMetric(
      'hitter_zone_contact_rate',
      1 - whiffs / zoneSwings.length,
      zoneSwings.length,
      [ref('baseball_pitch_events', 'is_in_zone,is_swing,is_whiff', 'staff_only', zoneSwings.length, 'In-zone contact rate')],
    );
  }

  // Pull-side rollover rate: pull-side ground balls / batted balls. Pull side is
  // a negative spray_angle for a RHH; we use |spray| with the ground-ball type as
  // a handedness-agnostic rollover proxy (a hard pull GB is the rollover marker).
  const myBatted = battedBalls.filter((b) => b.batter_id === batterId);
  if (myBatted.length > 0) {
    const rollovers = myBatted.filter(
      (b) => lc(b.batted_ball_type) === 'ground_ball' && Math.abs(num(b.spray_angle)) >= 15,
    ).length;
    out.hitter_pull_rollover_rate = toMetric(
      'hitter_pull_rollover_rate',
      rollovers / myBatted.length,
      myBatted.length,
      [ref('baseball_batted_ball_events', 'batted_ball_type,spray_angle', 'staff_only', myBatted.length, 'Pull-side ground-ball share')],
    );
  }

  // Game − cage exit-velo gap: avg EV in official/scrimmage contexts MINUS avg EV
  // in cage/practice contexts. sensor_optional — only loads when EV is logged on
  // BOTH sides. A negative gap (cage EV not transferring) is the concern.
  const withEv = myBatted.filter((b) => b.exit_velocity != null);
  const gameEv = withEv.filter((b) => ['official_game', 'scrimmage'].includes(lc(b.data_context)));
  const cageEv = withEv.filter((b) => ['cage', 'practice'].includes(lc(b.data_context)));
  if (gameEv.length >= 2 && cageEv.length >= 2) {
    const avg = (rs: BattedBallEventRow[]) => rs.reduce((s, r) => s + num(r.exit_velocity), 0) / rs.length;
    const n = Math.min(gameEv.length, cageEv.length);
    out.hitter_game_cage_ev_gap = toMetric(
      'hitter_game_cage_ev_gap',
      avg(gameEv) - avg(cageEv),
      n,
      [ref('baseball_batted_ball_events', 'exit_velocity,data_context (game vs cage)', 'staff_only', n, 'Game − cage exit velocity')],
    );
  }

  return out;
}

// =============================================================================
// PITCHING (deepened) — from pitch events.
// =============================================================================

/**
 * Load the deepened PITCHING metrics for one pitcher from their pitch events.
 * Velocity decay is the canonical learn-backward guard: it is computed as the
 * signed (late − early) delta and registered higher_better, so a velo DROP is
 * NEVER scored as an improvement anywhere downstream.
 */
export function loadPitchingEventMetrics(
  pitcherId: string,
  pitches: PitchEventRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  const mine = pitches.filter((p) => p.pitcher_id === pitcherId);
  if (mine.length === 0) return out;

  // First-pitch strike rate: 0-0 pitches that were strikes (in-zone OR swing OR
  // a called/foul strike result). Higher is better; a low rate falls behind.
  const firstPitches = mine.filter((p) => isFirstPitch(p.count_state));
  if (firstPitches.length > 0) {
    const strikes = firstPitches.filter(
      (p) => p.is_in_zone === true || p.is_swing === true || p.is_called_strike === true || lc(p.pitch_call) === 'strike',
    ).length;
    out.pitcher_first_pitch_strike_rate = toMetric(
      'pitcher_first_pitch_strike_rate',
      strikes / firstPitches.length,
      firstPitches.length,
      [ref('baseball_pitch_events', 'count_state,is_in_zone,is_called_strike', 'staff_only', firstPitches.length, 'First-pitch strike rate')],
    );
  }

  // Two-strike putaway rate: of two-strike pitches, the share that ended the AB
  // in a strikeout (whiff on a 2-strike pitch OR a called strike three). A low
  // rate = can't finish hitters. Denominator = two-strike pitches faced.
  const twoStrike = mine.filter((p) => isTwoStrike(p.count_state));
  if (twoStrike.length > 0) {
    const putaways = twoStrike.filter(
      (p) => (p.is_whiff === true && p.is_swing === true) || lc(p.pitch_call) === 'strikeout',
    ).length;
    out.pitcher_two_strike_putaway_rate = toMetric(
      'pitcher_two_strike_putaway_rate',
      putaways / twoStrike.length,
      twoStrike.length,
      [ref('baseball_pitch_events', 'count_state,is_whiff,pitch_call', 'staff_only', twoStrike.length, 'Two-strike putaway rate')],
    );
  }

  // Velo decay within outings: avg velo of LATE-window pitches (pitch_number in
  // the top tercile) MINUS EARLY-window pitches (bottom tercile). Needs velo +
  // pitch_number on enough pitches. sensor_optional. Signed delta, higher_better.
  const veloPitches = mine.filter((p) => p.velocity != null && p.pitch_number != null);
  if (veloPitches.length >= 9) {
    const sorted = [...veloPitches].sort((a, b) => num(a.pitch_number) - num(b.pitch_number));
    const tercile = Math.max(1, Math.floor(sorted.length / 3));
    const early = sorted.slice(0, tercile);
    const late = sorted.slice(-tercile);
    const avg = (rs: PitchEventRow[]) => rs.reduce((s, r) => s + num(r.velocity), 0) / rs.length;
    const dates = veloPitches.map((p) => p.measured_at).filter((d): d is string => !!d);
    const sd = stddev(veloPitches.map((p) => num(p.velocity)));
    out.pitcher_velo_inning_decay = toMetric(
      'pitcher_velo_inning_decay',
      avg(late) - avg(early),
      veloPitches.length,
      [ref('baseball_pitch_events', 'velocity,pitch_number (late − early)', 'staff_only', veloPitches.length, 'Velo decay within outing')],
      sd != null ? { stddev: sd, stddev_scale: 3, round_dates: dates } : undefined,
    );
  }

  // Handedness split: in-zone-contact-allowed proxy is too sparse; instead use
  // whiff rate as the platoon-effectiveness proxy and report the gap between the
  // WORSE and BETTER platoon side (a big gap = an exploitable side). Lower better.
  const vsL = mine.filter((p) => p.batter_handedness === 'L' && p.is_swing === true);
  const vsR = mine.filter((p) => p.batter_handedness === 'R' && p.is_swing === true);
  if (vsL.length >= 8 && vsR.length >= 8) {
    const whiffRate = (rs: PitchEventRow[]) => rs.filter((p) => p.is_whiff === true).length / rs.length;
    const wl = whiffRate(vsL);
    const wr = whiffRate(vsR);
    const n = Math.min(vsL.length, vsR.length);
    out.pitcher_handedness_split = toMetric(
      'pitcher_handedness_split',
      Math.abs(wl - wr),
      n,
      [ref('baseball_pitch_events', 'batter_handedness,is_whiff (platoon gap)', 'staff_only', n, 'Handedness whiff-rate gap')],
    );
  }

  // Pitch-mix predictability: in fastball/hitter counts, the share thrown of the
  // single most-used pitch type. A high share = one-dimensional/predictable.
  const fbCount = mine.filter((p) => isFastballCount(p.count_state) && (p.pitch_type_classified ?? p.pitch_type));
  if (fbCount.length >= 8) {
    const counts = new Map<string, number>();
    for (const p of fbCount) {
      const t = lc(p.pitch_type_classified ?? p.pitch_type);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const top = Math.max(...counts.values());
    out.pitcher_pitch_mix_predictability = toMetric(
      'pitcher_pitch_mix_predictability',
      top / fbCount.length,
      fbCount.length,
      [ref('baseball_pitch_events', 'pitch_type,count_state (fastball counts)', 'staff_only', fbCount.length, 'Top-pitch share in fastball counts')],
    );
  }

  return out;
}

// =============================================================================
// CATCHING — from catching events.
// =============================================================================

export function loadCatchingMetrics(
  catcherId: string,
  catching: CatchingEventRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  const mine = catching.filter((c) => c.catcher_id === catcherId);
  if (mine.length === 0) return out;

  // Recent innings caught (workload, neutral_threshold) — rolling 7-day sum of
  // the innings_caught column where present (game_call/receive grain). Honest:
  // only loads when a non-zero innings figure exists in the window.
  const cutoff = Date.now() - 7 * 86400_000;
  const recent = mine.filter((c) => c.measured_at && Date.parse(c.measured_at) >= cutoff);
  const recentInnings = recent.reduce((s, c) => s + num(c.innings_caught), 0);
  if (recentInnings > 0) {
    out.catcher_recent_innings_caught = toMetric(
      'catcher_recent_innings_caught',
      recentInnings,
      recent.length,
      [ref('baseball_catching_events', 'innings_caught (7d)', 'staff_only', recent.length, 'Rolling 7-day innings caught')],
    );
  }

  // Throw accuracy on throwdowns: share with throw_accuracy = 'accurate'.
  const throwdowns = mine.filter((c) => lc(c.event_type) === 'throwdown' && c.throw_accuracy != null);
  if (throwdowns.length > 0) {
    const accurate = throwdowns.filter((c) => lc(c.throw_accuracy) === 'accurate').length;
    out.catcher_throw_accuracy = toMetric(
      'catcher_throw_accuracy',
      accurate / throwdowns.length,
      throwdowns.length,
      [ref('baseball_catching_events', 'event_type,throw_accuracy', 'staff_only', throwdowns.length, 'Throwdown accuracy')],
    );
  }

  // Pop time (proxy — no calibrated baseline): avg pop_time on throwdowns. Lower
  // is better; the generator compares against the registry threshold.
  const popRows = mine.filter((c) => c.pop_time != null);
  if (popRows.length > 0) {
    const pops = popRows.map((c) => num(c.pop_time));
    const sd = stddev(pops);
    const dates = popRows.map((c) => c.measured_at).filter((d): d is string => !!d);
    out.catcher_pop_time = toMetric(
      'catcher_pop_time',
      pops.reduce((a, b) => a + b, 0) / pops.length,
      popRows.length,
      [ref('baseball_catching_events', 'pop_time', 'staff_only', popRows.length, 'Average pop time')],
      sd != null ? { stddev: sd, stddev_scale: 0.15, round_dates: dates } : undefined,
    );
  }

  // Block-miss rate: misses / blockable balls (block events). Lower is better.
  const blocks = mine.filter((c) => lc(c.event_type) === 'block' && c.block_result != null);
  if (blocks.length > 0) {
    const misses = blocks.filter((c) => lc(c.block_result) === 'miss').length;
    out.catcher_block_miss_rate = toMetric(
      'catcher_block_miss_rate',
      misses / blocks.length,
      blocks.length,
      [ref('baseball_catching_events', 'event_type,block_result', 'staff_only', blocks.length, 'Block-miss rate')],
    );
  }

  // Run-game risk: opponent SB success against this catcher = (safe) / (attempts).
  const attempts = mine.filter((c) => lc(c.event_type) === 'throwdown' && c.steal_result != null);
  if (attempts.length > 0) {
    const safe = attempts.filter((c) => ['safe', 'sb'].includes(lc(c.steal_result))).length;
    out.catcher_run_game_risk = toMetric(
      'catcher_run_game_risk',
      safe / attempts.length,
      attempts.length,
      [ref('baseball_catching_events', 'event_type,steal_result', 'staff_only', attempts.length, 'SB success allowed')],
    );
  }

  return out;
}

// =============================================================================
// DEFENSE — from fielding events.
// =============================================================================

export function loadDefenseMetrics(
  playerId: string,
  fielding: FieldingEventRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  const mine = fielding.filter((f) => f.player_id === playerId);
  if (mine.length === 0) return out;

  const isError = (f: FieldingEventRow) => lc(f.result) === 'error' || f.error_type != null;

  // Error-cluster rate: errors / total chances. Lower is better.
  out.defense_error_cluster_rate = toMetric(
    'defense_error_cluster_rate',
    mine.filter(isError).length / mine.length,
    mine.length,
    [ref('baseball_fielding_events', 'result,error_type', 'staff_only', mine.length, 'Error rate over chances')],
  );

  // Routine-play reliability: routine chances converted to outs / routine chances.
  const routine = mine.filter((f) => lc(f.chance_difficulty) === 'routine');
  if (routine.length > 0) {
    const converted = routine.filter((f) => lc(f.result) === 'out' || lc(f.result) === 'success').length;
    out.defense_routine_reliability = toMetric(
      'defense_routine_reliability',
      converted / routine.length,
      routine.length,
      [ref('baseball_fielding_events', 'chance_difficulty,result', 'staff_only', routine.length, 'Routine-play reliability')],
    );
  }

  // Throwing accuracy on plays with a throw: share arm_accuracy = 'accurate',
  // EXCLUDING throwing errors from the numerator.
  const throws = mine.filter((f) => f.arm_accuracy != null);
  if (throws.length > 0) {
    const accurate = throws.filter(
      (f) => lc(f.arm_accuracy) === 'accurate' && lc(f.error_type) !== 'throwing',
    ).length;
    out.defense_throw_accuracy = toMetric(
      'defense_throw_accuracy',
      accurate / throws.length,
      throws.length,
      [ref('baseball_fielding_events', 'arm_accuracy,error_type', 'staff_only', throws.length, 'Defensive throw accuracy')],
    );
  }

  // Bunt/PFP execution: success rate on bunt/pfp-typed events.
  const bunts = mine.filter((f) => ['bunt', 'pfp'].includes(lc(f.event_type)));
  if (bunts.length > 0) {
    const ok = bunts.filter((f) => lc(f.result) === 'out' || lc(f.result) === 'success').length;
    out.defense_bunt_pfp_execution = toMetric(
      'defense_bunt_pfp_execution',
      ok / bunts.length,
      bunts.length,
      [ref('baseball_fielding_events', 'event_type,result', 'staff_only', bunts.length, 'Bunt/PFP execution')],
    );
  }

  return out;
}

// =============================================================================
// BASERUNNING — from baserunning events.
// =============================================================================

export function loadBaserunningMetrics(
  runnerId: string,
  baserun: BaserunningEventRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  const mine = baserun.filter((b) => b.runner_id === runnerId);
  if (mine.length === 0) return out;

  const isOut = (b: BaserunningEventRow) => ['out', 'cs'].includes(lc(b.result));

  // Outs-on-bases rate: baserunning outs / all baserunning opportunities. Lower
  // is better. V10: baserunning_out_rate.
  out.baserunning_out_rate = toMetric(
    'baserunning_out_rate',
    mine.filter(isOut).length / mine.length,
    mine.length,
    [ref('baseball_baserunning_events', 'result', 'staff_only', mine.length, 'Outs-on-bases rate')],
  );

  // Extra-base-taken rate: extra bases taken / extra-base opportunities ('advance'
  // grain). Higher is better; a low rate = passive baserunning.
  const advances = mine.filter((b) => lc(b.event_type) === 'advance');
  if (advances.length > 0) {
    const taken = advances.filter((b) => ['advanced', 'safe'].includes(lc(b.result))).length;
    out.baserunning_extra_base_rate = toMetric(
      'baserunning_extra_base_rate',
      taken / advances.length,
      advances.length,
      [ref('baseball_baserunning_events', 'event_type,result', 'staff_only', advances.length, 'Extra-base-taken rate')],
    );
  }

  // CS decision-risk: poor-decision caught-stealings / steal attempts. We count a
  // CS as a DECISION risk only when decision_quality flags it poor — not every
  // out (a good jump thrown out by a great throw is not a decision error).
  const steals = mine.filter((b) => lc(b.event_type) === 'steal');
  if (steals.length > 0) {
    const poorCs = steals.filter(
      (b) => isOut(b) && ['poor', 'aggressive'].includes(lc(b.decision_quality)),
    ).length;
    out.baserunning_cs_decision_risk = toMetric(
      'baserunning_cs_decision_risk',
      poorCs / steals.length,
      steals.length,
      [ref('baseball_baserunning_events', 'event_type,result,decision_quality', 'staff_only', steals.length, 'CS decision-risk rate')],
    );
  }

  // First-to-third aggressiveness: first-to-third taken / first-to-third opps.
  const ftt = mine.filter((b) => lc(b.event_type) === 'first_to_third');
  if (ftt.length > 0) {
    const took = ftt.filter((b) => ['advanced', 'safe'].includes(lc(b.result))).length;
    out.baserunning_first_to_third_rate = toMetric(
      'baserunning_first_to_third_rate',
      took / ftt.length,
      ftt.length,
      [ref('baseball_baserunning_events', 'event_type,result', 'staff_only', ftt.length, 'First-to-third rate')],
    );
  }

  return out;
}

// -----------------------------------------------------------------------------
// Merge — non-destructively fold every event-derived metric INTO an existing
// LoadedPlayerMetrics. Box-score + V10 metrics win on key collision (there are
// none today — disjoint metric ids), so this only ADDS the new domains.
// -----------------------------------------------------------------------------

export interface EventLoaderInputs {
  pitchEvents: PitchEventRow[];
  battedBallEvents: BattedBallEventRow[];
  catchingEvents: CatchingEventRow[];
  fieldingEvents: FieldingEventRow[];
  baserunningEvents: BaserunningEventRow[];
}

/**
 * Merge catching/defense/baserunning + deepened hitting/pitching event metrics
 * into a player's already-loaded box-score + V10 metrics. Existing metrics win
 * on key collision (disjoint ids today), so this is purely additive.
 */
export function mergeEventPlayerMetrics(
  base: LoadedPlayerMetrics,
  events: EventLoaderInputs,
): LoadedPlayerMetrics {
  return {
    ...base,
    metrics: {
      ...loadHittingEventMetrics(base.playerId, events.pitchEvents, events.battedBallEvents),
      ...loadPitchingEventMetrics(base.playerId, events.pitchEvents),
      ...loadCatchingMetrics(base.playerId, events.catchingEvents),
      ...loadDefenseMetrics(base.playerId, events.fieldingEvents),
      ...loadBaserunningMetrics(base.playerId, events.baserunningEvents),
      // existing (box-score + V10) metrics win — never overwritten.
      ...base.metrics,
    },
  };
}
