/**
 * CoachHelm BASEBALL loaders (W10.2).
 *
 * Turn raw box-score / stat-event rows into per-player, per-metric aggregates
 * that carry HONEST source refs + confidence. The wave plan's hard constraint:
 *
 *   "Box-score-only data quality: baseball has no pitch-level events, so
 *    generators must use box-score heuristics (K/BB as command proxy) and
 *    honestly disclose lower confidence; small rosters (12-25) may never reach
 *    the golf 0.5 confidence floor for thin bands — recalibrate thresholds
 *    rather than emit false 'high' priority."
 *
 * So:
 *   - Box-score-derived metrics get a fidelity-aware confidence HAIRCUT (proxy
 *     and sensor_optional metrics can never claim 'measured'-grade confidence).
 *   - target_n is RECALIBRATED to baseball roster reality (games, not rounds),
 *     so a 12-game sample is treated as adequate for a season's box scores —
 *     but a 2-game sample is honestly thin.
 *   - We compute the shared confidence blend via the shared engine
 *     (calcConfidence + computeMeasuredFactors) so baseball and golf share ONE
 *     confidence implementation — never a fork that could "learn backward".
 *
 * Pure module: no DB access here (the action fetches rows and passes them in),
 * so this is unit-testable and reusable.
 */

import type {
  InsightConfidenceFactors,
} from '@/lib/coachhelm/shared/evidence-types';
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
  type BaseballMetricUnit,
} from './metrics/registry';

// -----------------------------------------------------------------------------
// Input row shapes (a subset of baseball_player_stats we actually read). Kept
// local + structural so the loaders don't couple to the full generated row.
// -----------------------------------------------------------------------------

/** One box-score / session row from baseball_player_stats. */
export interface BoxScoreRow {
  id: string;
  player_id: string;
  /** 'game' rows feed game-vs-practice + workload; 'practice' feeds the gap. */
  stat_type: string | null;
  session_date: string | null;

  // hitting
  at_bats?: number | null;
  hits?: number | null;
  doubles?: number | null;
  triples?: number | null;
  home_runs?: number | null;
  walks?: number | null;
  strikeouts?: number | null;
  hit_by_pitch?: number | null;
  sacrifice_flies?: number | null;

  // pitching
  innings_pitched?: number | null;
  earned_runs?: number | null;
  walks_allowed?: number | null;
  strikeouts_thrown?: number | null;
  pitches_thrown?: number | null;
  strikes_thrown?: number | null;

  // sensors (optional)
  exit_velocity?: number | null;
  pitch_velocity?: number | null;
}

// -----------------------------------------------------------------------------
// Recalibrated sample targets — baseball roster reality, NOT golf rounds.
// -----------------------------------------------------------------------------

/**
 * Observations (games/sessions) that make a metric's sample "adequate". These
 * are intentionally LOW vs golf because a college baseball season is a few dozen
 * games and a roster is 12-25 players — demanding golf-scale samples would mean
 * the engine never speaks. The honesty comes from confidence (which scales
 * smoothly with sample_n / target_n) plus the fidelity haircut, not from a hard
 * gate that silences thin-but-real signals.
 */
export const BASEBALL_TARGET_N: Record<BaseballMetricId, number> = {
  k_rate: 8,
  bb_rate: 8,
  hitter_k_bb_ratio: 8,
  two_strike_chase_pct: 10,
  batting_avg: 10,
  on_base_pct: 10,
  slugging_pct: 10,
  avg_exit_velocity: 6,
  max_exit_velocity: 6,
  game_practice_avg_delta: 8, // needs both game + practice rows; see loader
  pitcher_k_bb_ratio: 5,
  walks_per_inning: 5,
  strike_pct: 5,
  era: 5,
  avg_pitch_velocity: 4,
  max_pitch_velocity: 4,
  rolling_pitch_count: 1, // workload reads the most recent window; 1 is enough
  rolling_innings: 1,

  // Readiness / wellness (V10) — a handful of recent check-ins is adequate; the
  // generator reads the latest window, so targets stay low + honest.
  soreness_level: 3,
  energy_level: 3,
  sleep_hours: 3,
  arm_status_level: 1, // latest arm-status is meaningful at a single check-in

  // Strength / lift (V10)
  lift_completion_rate: 3,
  lift_rpe_avg: 3,

  // Practice (V10)
  practice_attendance_rate: 2,
  practice_focus_movement: 2,

  // Operations (V10)
  import_warning_rate: 1,
  video_evidence_coverage: 1,

  // --- Deepened catalog (V6 §Pattern Generators / V10 §Generator Families) --
  // Hitting (deepened) — event-derived, but a partial season of PAs is adequate.
  hitter_risp_avg_delta: 8,
  hitter_first_pitch_take_rate: 12,
  hitter_zone_contact_rate: 15,
  hitter_game_cage_ev_gap: 8,
  hitter_pull_rollover_rate: 12,
  // Pitching (deepened) — pitch-event counts add up fast (one outing ≈ 80-100).
  pitcher_first_pitch_strike_rate: 20,
  pitcher_two_strike_putaway_rate: 12,
  pitcher_velo_inning_decay: 15,
  pitcher_handedness_split: 20,
  pitcher_pitch_mix_predictability: 20,
  // Catching — sparse events; a handful is adequate, innings is single-window.
  catcher_recent_innings_caught: 1,
  catcher_throw_accuracy: 6,
  catcher_pop_time: 5,
  catcher_block_miss_rate: 8,
  catcher_run_game_risk: 6,
  // Defense — chance-based; a couple weeks of games is adequate.
  defense_error_cluster_rate: 10,
  defense_routine_reliability: 10,
  defense_throw_accuracy: 8,
  defense_bunt_pfp_execution: 5,
  // Baserunning — opportunity-based; a partial season is adequate.
  baserunning_out_rate: 8,
  baserunning_extra_base_rate: 8,
  baserunning_cs_decision_risk: 6,
  baserunning_first_to_third_rate: 6,
  // Class / operations — deterministic; a single observation is honest.
  class_conflict_count: 1,
  missing_acknowledgement_rate: 3,
  stale_source_days: 1,
  tasks_unseen_rate: 3,
};

/**
 * Fidelity-aware confidence ceiling. Box-score PROXIES (on-base derived without
 * SF context, two-strike chase inferred from K-rate) and SENSOR_OPTIONAL
 * metrics (exit/pitch velo, present only when a device logged them) can NEVER
 * present as fully measured — even a large sample. This is the core
 * "honestly disclose lower confidence" rule.
 */
const FIDELITY_CONFIDENCE_CEILING: Record<string, number> = {
  measured: 1.0,
  // A box-score PROXY can NEVER independently clear the shared 'high' bar
  // (MIN_CONF_FOR_HIGH = 0.5). Capping just under it guarantees a proxy-only
  // signal is at most 'medium' — the wave-plan rule that thin/inferred bands
  // must not emit a false 'high'. A real high needs a measured metric.
  proxy: 0.49,
  sensor_optional: 0.7,
};

/**
 * Minimum contributing events before a genuinely-measured variance term is
 * trusted. Below this, a tiny sample whose few points happen to agree would
 * fabricate "tight = confident". We require a real spread of observations
 * before the variance term counts; otherwise we fall back to honest
 * sample-adequacy only (factors_measured: false).
 */
const MIN_EVENTS_FOR_MEASURED_VARIANCE = 4;

// -----------------------------------------------------------------------------
// Loaded metric — the unit a generator consumes.
// -----------------------------------------------------------------------------

/**
 * One metric loaded for one player: the value, the honest confidence, the
 * sample it rests on, and the source refs that produced it. A generator reads
 * this and never re-derives confidence — the loader owns honesty.
 */
export interface LoadedMetric {
  metric: BaseballMetricId;
  /** The computed value (null when undefined — e.g. ERA with 0 IP). */
  value: number | null;
  unit: BaseballMetricUnit;
  sample_n: number;
  target_n: number;
  /** Normalized [0,1], already fidelity-capped. NEVER a fake 1.0 for a proxy. */
  confidence: number;
  /** The shared confidence-factor inputs (for buildConfidenceReason). */
  confidence_factors: InsightConfidenceFactors;
  source_refs: BaseballInsightSourceRef[];
}

/** All metrics loaded for one player, keyed by metric id. */
export type LoadedPlayerMetrics = {
  playerId: string;
  hittingGames: number;
  pitchingGames: number;
  metrics: Partial<Record<BaseballMetricId, LoadedMetric>>;
};

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

const num = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isGame = (r: BoxScoreRow): boolean => (r.stat_type ?? '').toLowerCase() === 'game';
const hasHitting = (r: BoxScoreRow): boolean => num(r.at_bats) > 0 || num(r.walks) > 0 || num(r.hit_by_pitch) > 0;
const hasPitching = (r: BoxScoreRow): boolean => num(r.innings_pitched) > 0 || num(r.pitches_thrown) > 0;

/**
 * Build the honest confidence for a metric from sample + fidelity + (optional)
 * per-event dispersion. Uses the SHARED engine so baseball and golf compute
 * confidence identically; then applies the fidelity ceiling.
 */
function buildConfidence(
  metric: BaseballMetricId,
  sample_n: number,
  target_n: number,
  dispersion?: { stddev: number; stddev_scale?: number; round_dates: string[] },
): { confidence: number; factors: InsightConfidenceFactors } {
  const sample_adequacy = target_n > 0 ? Math.min(1, sample_n / target_n) : 0;

  // Try a genuinely-measured recency/variance from per-event dispersion — but
  // ONLY when enough events contributed, so a tiny coincidentally-tight sample
  // cannot fabricate high confidence.
  const enoughEvents =
    !!dispersion && (dispersion.round_dates?.length ?? 0) >= MIN_EVENTS_FOR_MEASURED_VARIANCE;
  const measured = enoughEvents
    ? computeMeasuredFactors(
        { stddev: dispersion!.stddev, stddev_scale: dispersion!.stddev_scale, round_dates: dispersion!.round_dates },
        // freshness window in days: a college season ≈ 120 days.
        120,
      )
    : null;

  const factors: InsightConfidenceFactors = measured
    ? { sample_adequacy, recency: measured.recency, variance: measured.variance, factors_measured: true }
    : // No real dispersion → flag UNMEASURED so calcConfidence drops the
      // fabricated variance floor and surfaces honest sample-adequacy (SV-1).
      { sample_adequacy, recency: 1, variance: 0, factors_measured: false };

  const raw = calcConfidence({ confidence_factors: factors });
  const ceiling = FIDELITY_CONFIDENCE_CEILING[getBaseballMetricFidelity(metric)] ?? 0.6;
  return { confidence: Math.max(0, Math.min(ceiling, raw)), factors };
}

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

// -----------------------------------------------------------------------------
// Public: load every metric for one player from their box-score rows.
// -----------------------------------------------------------------------------

/**
 * Load all engine-relevant metrics for ONE player from their box-score rows.
 * Honest by construction: confidence reflects sample size AND fidelity; a metric
 * with no supporting rows is simply absent (never a fabricated value).
 *
 * Visibility of every source ref here is 'staff_only' for game/pitching box
 * scores: a player must not read team-level diagnostic insights unless a coach
 * explicitly marks the resulting insight player_visible. The action enforces the
 * strictest-source rule.
 */
export function loadPlayerMetrics(
  playerId: string,
  rows: BoxScoreRow[],
): LoadedPlayerMetrics {
  const mine = rows.filter((r) => r.player_id === playerId);
  const hitRows = mine.filter(hasHitting);
  const pitchRows = mine.filter(hasPitching);
  const gameHitRows = hitRows.filter(isGame);
  const practiceHitRows = hitRows.filter((r) => !isGame(r));

  const metrics: Partial<Record<BaseballMetricId, LoadedMetric>> = {};

  const add = (
    metric: BaseballMetricId,
    value: number | null,
    sample_n: number,
    refs: BaseballInsightSourceRef[],
    dispersion?: { stddev: number; stddev_scale?: number; round_dates: string[] },
  ) => {
    const target_n = BASEBALL_TARGET_N[metric];
    const { confidence, factors } = buildConfidence(metric, sample_n, target_n, dispersion);
    metrics[metric] = {
      metric,
      value,
      unit: getBaseballMetricUnit(metric),
      sample_n,
      target_n,
      confidence,
      confidence_factors: factors,
      source_refs: refs.map((r) => ({ ...r, confidence })),
    };
  };

  // ---- Hitting plate discipline ----
  if (hitRows.length > 0) {
    const ab = hitRows.reduce((s, r) => s + num(r.at_bats), 0);
    const bb = hitRows.reduce((s, r) => s + num(r.walks), 0);
    const hbp = hitRows.reduce((s, r) => s + num(r.hit_by_pitch), 0);
    const sf = hitRows.reduce((s, r) => s + num(r.sacrifice_flies), 0);
    const k = hitRows.reduce((s, r) => s + num(r.strikeouts), 0);
    const h = hitRows.reduce((s, r) => s + num(r.hits), 0);
    const doubles = hitRows.reduce((s, r) => s + num(r.doubles), 0);
    const triples = hitRows.reduce((s, r) => s + num(r.triples), 0);
    const hr = hitRows.reduce((s, r) => s + num(r.home_runs), 0);
    const pa = ab + bb + hbp + sf;
    const n = hitRows.length;
    const dates = hitRows.map((r) => r.session_date).filter((d): d is string => !!d);

    if (pa > 0) {
      add('k_rate', k / pa, n, [ref('baseball_player_stats', 'strikeouts', 'staff_only', n, 'K rate over sessions')]);
      add('bb_rate', bb / pa, n, [ref('baseball_player_stats', 'walks', 'staff_only', n, 'BB rate over sessions')]);
    }
    if (bb > 0) {
      add('hitter_k_bb_ratio', k / bb, n, [ref('baseball_player_stats', 'strikeouts,walks', 'staff_only', n, 'Hitter K/BB')]);
    } else if (k > 0) {
      // No walks at all → undefined ratio; surface as a thin, honest signal.
      add('hitter_k_bb_ratio', null, n, [ref('baseball_player_stats', 'strikeouts,walks', 'staff_only', n, 'Hitter K/BB (no walks)')]);
    }
    if (ab > 0) {
      add('batting_avg', h / ab, n, [ref('baseball_player_stats', 'hits,at_bats', 'staff_only', n, 'Batting average')]);
      const tb = h + doubles + 2 * triples + 3 * hr;
      add('slugging_pct', tb / ab, n, [ref('baseball_player_stats', 'hits,doubles,triples,home_runs', 'staff_only', n, 'Slugging (proxy)')]);
    }
    if (pa > 0) {
      add('on_base_pct', (h + bb + hbp) / pa, n, [ref('baseball_player_stats', 'hits,walks,hit_by_pitch', 'staff_only', n, 'On-base (proxy)')]);
    }

    // Two-strike chase PROXY: per-game K-rate variance is the only box-score
    // signal we have. We register the season K-rate as the value but cap its
    // confidence via the 'proxy' fidelity; the chase generator interprets it.
    if (pa > 0 && n >= 2) {
      const perGameKRate = gameHitRows
        .map((r) => {
          const gpa = num(r.at_bats) + num(r.walks) + num(r.hit_by_pitch) + num(r.sacrifice_flies);
          return gpa > 0 ? num(r.strikeouts) / gpa : null;
        })
        .filter((x): x is number => x != null);
      const sd = stddev(perGameKRate.map((x) => x * 100));
      add(
        'two_strike_chase_pct',
        k / pa,
        n,
        [ref('baseball_player_stats', 'strikeouts (per-game variance)', 'staff_only', n, 'Two-strike chase proxy')],
        sd != null ? { stddev: sd, stddev_scale: 12, round_dates: dates } : undefined,
      );
    }
  }

  // ---- Game vs practice (avg delta) ----
  if (gameHitRows.length >= 1 && practiceHitRows.length >= 1) {
    const avg = (rs: BoxScoreRow[]) => {
      const ab = rs.reduce((s, r) => s + num(r.at_bats), 0);
      const h = rs.reduce((s, r) => s + num(r.hits), 0);
      return ab > 0 ? h / ab : null;
    };
    const g = avg(gameHitRows);
    const p = avg(practiceHitRows);
    if (g != null && p != null) {
      const n = Math.min(gameHitRows.length, practiceHitRows.length);
      add('game_practice_avg_delta', g - p, n, [
        ref('baseball_player_stats', 'hits,at_bats (game vs practice)', 'staff_only', n, 'Game − practice avg'),
      ]);
    }
  }

  // ---- Contact quality (sensor optional) ----
  const evRows = hitRows.filter((r) => r.exit_velocity != null);
  if (evRows.length > 0) {
    const evs = evRows.map((r) => num(r.exit_velocity));
    const n = evRows.length;
    const dates = evRows.map((r) => r.session_date).filter((d): d is string => !!d);
    const sd = stddev(evs);
    add('avg_exit_velocity', evs.reduce((a, b) => a + b, 0) / n, n, [ref('baseball_player_stats', 'exit_velocity', 'staff_only', n, 'Avg exit velocity')], sd != null ? { stddev: sd, stddev_scale: 8, round_dates: dates } : undefined);
    add('max_exit_velocity', Math.max(...evs), n, [ref('baseball_player_stats', 'exit_velocity', 'staff_only', n, 'Max exit velocity')]);
  }

  // ---- Pitching command + stuff ----
  if (pitchRows.length > 0) {
    const ip = pitchRows.reduce((s, r) => s + num(r.innings_pitched), 0);
    const bbA = pitchRows.reduce((s, r) => s + num(r.walks_allowed), 0);
    const kT = pitchRows.reduce((s, r) => s + num(r.strikeouts_thrown), 0);
    const er = pitchRows.reduce((s, r) => s + num(r.earned_runs), 0);
    const pitches = pitchRows.reduce((s, r) => s + num(r.pitches_thrown), 0);
    const strikes = pitchRows.reduce((s, r) => s + num(r.strikes_thrown), 0);
    const n = pitchRows.length;
    const dates = pitchRows.map((r) => r.session_date).filter((d): d is string => !!d);

    if (bbA > 0) {
      add('pitcher_k_bb_ratio', kT / bbA, n, [ref('baseball_player_stats', 'strikeouts_thrown,walks_allowed', 'staff_only', n, 'Pitcher K/BB')]);
    } else if (kT > 0) {
      add('pitcher_k_bb_ratio', null, n, [ref('baseball_player_stats', 'strikeouts_thrown,walks_allowed', 'staff_only', n, 'Pitcher K/BB (no walks)')]);
    }
    if (ip > 0) {
      add('walks_per_inning', bbA / ip, n, [ref('baseball_player_stats', 'walks_allowed,innings_pitched', 'staff_only', n, 'Walks/inning')]);
      add('era', (er * 9) / ip, n, [ref('baseball_player_stats', 'earned_runs,innings_pitched', 'staff_only', n, 'ERA')]);
    }
    if (pitches > 0) {
      add('strike_pct', strikes / pitches, n, [ref('baseball_player_stats', 'strikes_thrown,pitches_thrown', 'staff_only', n, 'Strike %')]);
    }

    const pvRows = pitchRows.filter((r) => r.pitch_velocity != null);
    if (pvRows.length > 0) {
      const pvs = pvRows.map((r) => num(r.pitch_velocity));
      const sd = stddev(pvs);
      add('avg_pitch_velocity', pvs.reduce((a, b) => a + b, 0) / pvs.length, pvRows.length, [ref('baseball_player_stats', 'pitch_velocity', 'staff_only', pvRows.length, 'Avg pitch velocity')], sd != null ? { stddev: sd, stddev_scale: 3, round_dates: dates } : undefined);
      add('max_pitch_velocity', Math.max(...pvs), pvRows.length, [ref('baseball_player_stats', 'pitch_velocity', 'staff_only', pvRows.length, 'Max pitch velocity')]);
    }

    // ---- Workload (rolling window = last 7 days of GAME pitching) ----
    const cutoff = Date.now() - 7 * 86400_000;
    const recent = pitchRows.filter((r) => r.session_date && Date.parse(r.session_date) >= cutoff);
    if (recent.length > 0) {
      const recentPitches = recent.reduce((s, r) => s + num(r.pitches_thrown), 0);
      const recentInnings = recent.reduce((s, r) => s + num(r.innings_pitched), 0);
      // pitches_thrown is absent in many schemas — only register it when a real
      // non-zero count exists (otherwise the workload generator falls back to
      // innings, which is always present for a pitcher).
      if (recentPitches > 0) {
        add('rolling_pitch_count', recentPitches, recent.length, [ref('baseball_player_stats', 'pitches_thrown (7d)', 'staff_only', recent.length, 'Rolling 7-day pitches')]);
      }
      if (recentInnings > 0) {
        add('rolling_innings', recentInnings, recent.length, [ref('baseball_player_stats', 'innings_pitched (7d)', 'staff_only', recent.length, 'Rolling 7-day innings')]);
      }
    }
  }

  return {
    playerId,
    hittingGames: gameHitRows.length,
    pitchingGames: pitchRows.filter(isGame).length,
    metrics,
  };
}

/** Load metrics for many players at once from a shared row pool. */
export function loadAllPlayerMetrics(
  playerIds: string[],
  rows: BoxScoreRow[],
): LoadedPlayerMetrics[] {
  return playerIds.map((pid) => loadPlayerMetrics(pid, rows));
}

// -----------------------------------------------------------------------------
// Schedule loader — for the schedule-conflict generator.
// -----------------------------------------------------------------------------

/** Minimal event row the schedule-conflict generator needs. */
export interface ScheduleEventRow {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  is_mandatory: boolean | null;
}

/** A detected overlap between two mandatory events. */
export interface ScheduleConflict {
  a: ScheduleEventRow;
  b: ScheduleEventRow;
  /** Minutes the two events overlap. */
  overlapMinutes: number;
}

/**
 * Find overlapping MANDATORY events on the same team — a real scheduling
 * conflict a coach must resolve. Pure; the action passes already-authorized
 * rows. Honest: only mandatory-vs-mandatory overlaps count (optional events
 * overlapping is not a conflict).
 */
export function findScheduleConflicts(events: ScheduleEventRow[]): ScheduleConflict[] {
  const mandatory = events
    .filter((e) => e.is_mandatory && e.start_time)
    .map((e) => ({
      e,
      start: Date.parse(e.start_time),
      end: e.end_time ? Date.parse(e.end_time) : Date.parse(e.start_time) + 60 * 60_000,
    }))
    .filter((x) => Number.isFinite(x.start));

  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < mandatory.length; i++) {
    for (let j = i + 1; j < mandatory.length; j++) {
      const A = mandatory[i];
      const B = mandatory[j];
      if (!A || !B) continue;
      const overlapStart = Math.max(A.start, B.start);
      const overlapEnd = Math.min(A.end, B.end);
      if (overlapEnd > overlapStart) {
        conflicts.push({
          a: A.e,
          b: B.e,
          overlapMinutes: Math.round((overlapEnd - overlapStart) / 60_000),
        });
      }
    }
  }
  return conflicts;
}
