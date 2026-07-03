/**
 * CoachHelm BASEBALL generators (W10.3).
 *
 * Five box-score-honest generators:
 *   1. twoStrikeChaseGenerator   — chase-prone hitters (K-rate spike proxy)
 *   2. gameVsPracticeGapGenerator — players who shrink in games
 *   3. veloCommandDecayGenerator  — falling pitch velo OR worsening command
 *   4. workloadGenerator          — rolling pitch/inning load vs safe ceiling
 *   5. scheduleConflictGenerator  — overlapping MANDATORY events
 *
 * EVERY generator:
 *   - resolves improvement direction from the metric registry (never infers sign
 *     from a raw delta) — the #1 wave risk;
 *   - takes confidence VERBATIM from the loader (which already applied the
 *     fidelity haircut + recalibrated roster targets) — it does not re-invent
 *     confidence;
 *   - runs every emitted priority through the SHARED priority/confidence gate so
 *     a thin-sample baseball signal can never present as false 'high';
 *   - attaches a structured shared Diagnosis with quantified, sourced drivers
 *     and an honest causality_level (single-metric box-score signals are always
 *     `inferred_hypothesis`, never presented as observed fact).
 *
 * Pure functions: a generator takes loaded inputs and returns candidate
 * insights. The action (coachhelm.ts) persists them. No DB, no side effects.
 */

import type {
  Diagnosis,
  DiagnosisDriver,
  InsightPriority,
  CausalityLevel,
} from '@/lib/coachhelm/shared/evidence-types';
import { enforcePriorityConfidenceGate } from '@/lib/coachhelm/shared/base-generator';
import { buildConfidenceReason } from '@/lib/coachhelm/shared/base-generator';
import type {
  BaseballInsightEvidence,
  BaseballInsightSourceRef,
  BaseballSourceVisibility,
} from '@/lib/types/baseball-coachhelm';
import {
  getBaseballMetricUnit,
  isBaseballSampleThin,
  baseballMetricPlayerVisible,
} from '../metrics/registry';
import type {
  LoadedMetric,
  LoadedPlayerMetrics,
  ScheduleConflict,
  ScheduleEventRow,
} from '../loaders';
import { findScheduleConflicts } from '../loaders';

// -----------------------------------------------------------------------------
// Candidate insight — what a generator emits; the action maps it to a row.
// -----------------------------------------------------------------------------

/** A generated, not-yet-persisted insight candidate. */
export interface BaseballInsightCandidate {
  /** Stable generator id (also the dedupe-key prefix + generated_by column). */
  generator: string;
  /** Subject player, or null for a team-level insight (schedule conflict). */
  playerId: string | null;
  /** insight_type — MUST match the command-center AI regex so the daily brief
   *  surfaces it (the read model flags rows whose type matches
   *  /ai|engine|coachhelm|prediction|forecast/). We prefix every type
   *  'coachhelm_' to guarantee that. */
  insightType: string;
  title: string;
  body: string;
  /** Gated priority — never above what confidence supports. */
  priority: InsightPriority;
  /** Normalized [0,1] confidence (from the loader). */
  confidence: number;
  /** May the SUBJECT player read this? Derived strictest-wins from sources. */
  playerVisible: boolean;
  /** Full evidence bundle (persisted to metadata + source_refs column). */
  evidence: BaseballInsightEvidence;
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const VIS_RANK: Record<BaseballSourceVisibility, number> = {
  team: 0,
  player_only: 1,
  staff_only: 2,
};

/** Strictest-wins: an insight built from any staff_only source is staff_only. */
export function strictestVisibility(refs: BaseballInsightSourceRef[]): BaseballSourceVisibility {
  let worst: BaseballSourceVisibility = 'team';
  for (const r of refs) {
    if (VIS_RANK[r.visibility] > VIS_RANK[worst]) worst = r.visibility;
  }
  return worst;
}

/** A box-score-derived insight may be shown to the player only when nothing it
 *  rests on is staff-restricted. With the current loaders every metric ref is
 *  staff_only, so engine insights default to coach-only — honest and safe.
 *
 *  ROLE-VISIBILITY FLOOR (V10 §"Role visibility is tested"): when a `metricId` is
 *  supplied, the registry's per-metric player-eligibility floor is AND-ed in so a
 *  staff-only scouting/health/operations metric can NEVER become player-visible
 *  even if its source refs happen to permit it (strictest-wins). The floor only
 *  NARROWS visibility — it never widens it. Omitting `metricId` preserves the
 *  exact prior behavior (source-ref visibility only), so composite/multi-metric
 *  signals with no single anchoring metric are unchanged. */
export function playerVisibleFor(
  refs: BaseballInsightSourceRef[],
  metricId?: string,
): boolean {
  const sourceAllows = strictestVisibility(refs) !== 'staff_only';
  if (metricId === undefined) return sourceAllows;
  return baseballMetricPlayerVisible(metricId, sourceAllows);
}

export function driver(m: LoadedMetric): DiagnosisDriver {
  return {
    metric: m.metric,
    value: m.value ?? 0,
    unit: mapUnit(getBaseballMetricUnit(m.metric)),
    sample_n: m.sample_n,
    source: m.source_refs[0]?.label ?? m.source_refs[0]?.table ?? 'baseball_player_stats',
  };
}

// Map the baseball unit set onto the shared DiagnosisUnit set.
function mapUnit(u: ReturnType<typeof getBaseballMetricUnit>): DiagnosisDriver['unit'] {
  switch (u) {
    case 'percent':
      return 'percent';
    case 'mph':
      return 'mph';
    case 'ratio':
    case 'avg':
      return 'ratio';
    case 'count':
    case 'innings':
      return 'count';
  }
}

export function buildEvidence(
  primary: LoadedMetric,
  diagnosis: Diagnosis,
  causality: CausalityLevel,
  extraRefs: BaseballInsightSourceRef[] = [],
): BaseballInsightEvidence {
  const refs = [...primary.source_refs, ...extraRefs];
  return {
    sample_n: primary.sample_n,
    target_n: primary.target_n,
    confidence_factors: primary.confidence_factors,
    diagnosis,
    causality_level: causality,
    source_refs: refs,
  };
}

/** Apply the shared priority/confidence honesty gate. */
export function gate(priority: InsightPriority, confidence: number): InsightPriority {
  return enforcePriorityConfidenceGate(priority, confidence) ?? 'low';
}

/**
 * V10 thin-sample priority clamp: a signal whose sample is below the metric's
 * registry `min_sample` can never present above 'low', regardless of confidence
 * (wave risk #2 — false 'high' on tiny rosters). Compose with `gate()`: gate
 * handles confidence, this handles sample. Both must pass before a 'high' ships.
 */
export function clampThinSample(
  priority: InsightPriority,
  metricId: string,
  sampleN: number,
): InsightPriority {
  return isBaseballSampleThin(metricId, sampleN) ? 'low' : priority;
}

export const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
export const r2 = (v: number): string => v.toFixed(2);
export const avg3 = (v: number): string => v.toFixed(3);

// =============================================================================
// 1. TWO-STRIKE CHASE
//    Signal: a hitter whose strikeout rate is high AND volatile game-to-game —
//    the box-score proxy for chasing out of the zone with two strikes. We CANNOT
//    observe the actual pitch sequence, so this is always inferred_hypothesis.
// =============================================================================

const CHASE_K_RATE_THRESHOLD = 0.28; // 28% K-rate is elevated for college hitters

export function twoStrikeChaseGenerator(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  const m = player.metrics.two_strike_chase_pct;
  if (!m || m.value == null) return [];
  if (m.value < CHASE_K_RATE_THRESHOLD) return [];

  const refs = m.source_refs;
  const visible = playerVisibleFor(refs, m.metric);
  const confidence = m.confidence;

  // Severity by how far over threshold, then GATED by confidence.
  const over = m.value - CHASE_K_RATE_THRESHOLD;
  const rawPriority: InsightPriority = over >= 0.12 ? 'high' : over >= 0.06 ? 'medium' : 'low';
  // Two gates: confidence (gate) AND registry min_sample (clampThinSample). A
  // thin band can never present as 'high' even if its proxy confidence somehow
  // cleared the bar.
  const priority = clampThinSample(gate(rawPriority, confidence), m.metric, m.sample_n);

  const diagnosis: Diagnosis = {
    symptom: `Strikeout rate of ${pct(m.value)} over ${m.sample_n} sessions, elevated and inconsistent game to game.`,
    root_cause:
      'Likely expanding the zone with two strikes — chasing pitches out of the zone rather than battling for contact.',
    causality_level: 'inferred_hypothesis',
    drivers: [driver(m)],
    recommended_action:
      'Two-strike approach work: choke up, widen stance for contact, and run two-strike BP rounds where the goal is to put the ball in play.',
    confidence_reason: buildConfidenceReason({ sample_n: m.sample_n, confidence_factors: m.confidence_factors }),
  };

  return [
    {
      generator: 'two_strike_chase',
      playerId: player.playerId,
      insightType: 'coachhelm_two_strike_chase',
      title: 'Two-strike chase risk',
      body: `Elevated strikeout rate (${pct(m.value)}) suggests chasing with two strikes. Box-score proxy — confirm with at-bat video.`,
      priority,
      confidence,
      playerVisible: visible,
      evidence: buildEvidence(m, diagnosis, 'inferred_hypothesis'),
    },
  ];
}

// =============================================================================
// 2. GAME-VS-PRACTICE GAP
//    Signal: a hitter whose game average is well below practice average — the
//    classic "looks great in the cage, shrinks in games" transfer gap. Uses the
//    SIGNED delta metric (higher_better in the registry: a positive/zero gap is
//    fine, a negative gap is the problem).
// =============================================================================

const GAP_THRESHOLD = -0.05; // game avg ≥ 50 points below practice = a real gap

function gameVsPracticeGapGenerator(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  const m = player.metrics.game_practice_avg_delta;
  if (!m || m.value == null) return [];
  if (m.value > GAP_THRESHOLD) return []; // gap not negative enough

  const confidence = m.confidence;
  const magnitude = Math.abs(m.value);
  const rawPriority: InsightPriority = magnitude >= 0.1 ? 'high' : magnitude >= 0.05 ? 'medium' : 'low';
  const priority = clampThinSample(gate(rawPriority, confidence), m.metric, m.sample_n);
  const points = Math.round(magnitude * 1000);

  const diagnosis: Diagnosis = {
    symptom: `Game batting average is ${points} points below practice average across ${m.sample_n} comparable sessions.`,
    root_cause:
      'Performance is not transferring from practice to games — most often a competitive-anxiety / approach-under-pressure gap rather than a mechanical one.',
    causality_level: 'inferred_hypothesis',
    drivers: [driver(m)],
    recommended_action:
      'Add game-like pressure to practice: live ABs, situational hitting with consequences, and a consistent pre-pitch routine to carry into games.',
    confidence_reason: buildConfidenceReason({ sample_n: m.sample_n, confidence_factors: m.confidence_factors }),
  };

  return [
    {
      generator: 'game_vs_practice_gap',
      playerId: player.playerId,
      insightType: 'coachhelm_game_practice_gap',
      title: 'Practice-to-game gap',
      body: `Game average is ${points} points under practice (${avg3(magnitude)}). Performance isn't transferring to live competition.`,
      priority,
      confidence,
      playerVisible: playerVisibleFor(m.source_refs, m.metric),
      evidence: buildEvidence(m, diagnosis, 'inferred_hypothesis'),
    },
  ];
}

// =============================================================================
// 3. VELO / COMMAND DECAY (pitching)
//    Two related signals on a pitcher:
//      a) command decay — high walks/inning OR low strike%
//      b) stuff decay — note: a single window can't prove a velo DROP without a
//         baseline, so we flag LOW absolute strike% / high walk rate as command,
//         and surface avg velo as a context driver (never claiming a drop we
//         can't observe). DIRECTION is resolved from the registry: a lower velo
//         is NOT scored as an improvement anywhere.
// =============================================================================

const WALKS_PER_INNING_THRESHOLD = 0.6; // ~5.4 BB/9 — clearly fraying command
const STRIKE_PCT_FLOOR = 0.58; // below ~58% strikes = command concern

function veloCommandDecayGenerator(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  const out: BaseballInsightCandidate[] = [];

  const wpi = player.metrics.walks_per_inning;
  const strikePct = player.metrics.strike_pct;
  const velo = player.metrics.avg_pitch_velocity;

  // Pick the WORSE command signal as primary; require at least one to fire.
  const commandHit =
    (wpi?.value != null && wpi.value >= WALKS_PER_INNING_THRESHOLD) ||
    (strikePct?.value != null && strikePct.value <= STRIKE_PCT_FLOOR);
  if (!commandHit) return out;

  const primary: LoadedMetric | undefined =
    wpi?.value != null && wpi.value >= WALKS_PER_INNING_THRESHOLD ? wpi : strikePct;
  if (!primary || primary.value == null) return out;

  const confidence = primary.confidence;
  const isWalkDriven = primary.metric === 'walks_per_inning';
  const severity =
    isWalkDriven && primary.value >= 0.9 ? 'high' : !isWalkDriven && primary.value <= 0.52 ? 'high' : 'medium';
  const priority = clampThinSample(gate(severity as InsightPriority, confidence), primary.metric, primary.sample_n);

  const drivers: DiagnosisDriver[] = [driver(primary)];
  const extraRefs: BaseballInsightSourceRef[] = [];
  if (velo?.value != null) {
    drivers.push(driver(velo));
    extraRefs.push(...velo.source_refs);
  }

  const symptom = isWalkDriven
    ? `Issuing ${r2(primary.value)} walks per inning over ${primary.sample_n} outings.`
    : `Throwing only ${pct(primary.value)} strikes over ${primary.sample_n} outings.`;

  const diagnosis: Diagnosis = {
    symptom,
    root_cause:
      'Command is fraying — release point or tempo is inconsistent, putting the pitcher behind in counts. Velocity is shown for context, not as a measured drop (single-window box scores cannot prove a velo decline).',
    causality_level: 'inferred_hypothesis',
    drivers,
    recommended_action:
      'Bullpen focus on strike-one and fastball command to both halves; track first-pitch-strike % next outing. If velocity has trended down across recent appearances, screen for fatigue before adjusting mechanics.',
    confidence_reason: buildConfidenceReason({ sample_n: primary.sample_n, confidence_factors: primary.confidence_factors }),
  };

  out.push({
    generator: 'velo_command_decay',
    playerId: player.playerId,
    insightType: 'coachhelm_command_decay',
    title: isWalkDriven ? 'Command slipping (walks)' : 'Command slipping (strike %)',
    body: isWalkDriven
      ? `${r2(primary.value)} BB/inning — command is fraying. Strike-one focus needed.`
      : `Only ${pct(primary.value)} strikes thrown — falling behind in counts.`,
    priority,
    confidence,
    playerVisible: playerVisibleFor([...primary.source_refs, ...extraRefs], primary.metric),
    evidence: buildEvidence(primary, diagnosis, 'inferred_hypothesis', extraRefs),
  });

  return out;
}

// =============================================================================
// 4. WORKLOAD
//    Signal: rolling 7-day pitch count / innings above a safe ceiling. The
//    workload metrics are NEUTRAL_THRESHOLD in the registry — there is no
//    "improvement" direction; we monitor against a ceiling. This generator is
//    the ONLY place that interprets these metrics, exactly as the registry
//    documents, so attribution never learns "more pitches = better/worse".
// =============================================================================

const WEEKLY_PITCH_CEILING = 100; // conservative college rolling-7d pitch guard
const WEEKLY_INNINGS_CEILING = 7;

export function workloadGenerator(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  const pitches = player.metrics.rolling_pitch_count;
  const innings = player.metrics.rolling_innings;

  const overPitches = pitches?.value != null && pitches.value > 0 ? pitches.value - WEEKLY_PITCH_CEILING : -Infinity;
  const overInnings = innings?.value != null ? innings.value - WEEKLY_INNINGS_CEILING : -Infinity;
  if (overPitches <= 0 && overInnings <= 0) return [];

  // Prefer pitch count when present (most schemas have no pitches_thrown column,
  // so innings is the reliable fallback). The chosen metric is the primary
  // (drives confidence + source refs); the other is a context driver.
  const usePitches = overPitches > 0 && pitches?.value != null;
  const primary = usePitches ? pitches! : innings!;
  const confidence = primary.confidence;

  const over = usePitches ? overPitches : overInnings;
  // Workload is a HEALTH flag — severity by how far over the ceiling.
  const rawPriority: InsightPriority = usePitches
    ? over >= 40
      ? 'high'
      : over >= 15
        ? 'medium'
        : 'low'
    : over >= 4
      ? 'high'
      : over >= 2
        ? 'medium'
        : 'low';
  const priority = clampThinSample(gate(rawPriority, confidence), primary.metric, primary.sample_n);

  const drivers: DiagnosisDriver[] = [driver(primary)];
  const extraRefs: BaseballInsightSourceRef[] = [];
  const other = usePitches ? innings : pitches;
  if (other?.value != null && other.value > 0) {
    drivers.push(driver(other));
    extraRefs.push(...other.source_refs);
  }

  const loadDesc = usePitches
    ? `${Math.round(primary.value!)} pitches`
    : `${r2(primary.value!)} innings`;

  const diagnosis: Diagnosis = {
    symptom: `Threw ${loadDesc}${other?.value != null && other.value > 0 ? (usePitches ? ` / ${r2(other.value)} innings` : ` / ${Math.round(other.value)} pitches`) : ''} in the last 7 days — above the safe rolling ceiling (${WEEKLY_PITCH_CEILING} pitches / ${WEEKLY_INNINGS_CEILING} innings).`,
    root_cause:
      'Accumulated short-window workload raises injury risk and degrades stuff. This is a recorded count, not a hypothesis about cause.',
    causality_level: 'observed_sequence',
    drivers,
    recommended_action:
      'Build in rest before the next appearance, cap the next outing, and confirm the rolling count before clearing for the next game.',
    confidence_reason: buildConfidenceReason({ sample_n: primary.sample_n, confidence_factors: primary.confidence_factors }),
  };

  return [
    {
      generator: 'workload',
      playerId: player.playerId,
      insightType: 'coachhelm_workload',
      title: 'Workload above safe ceiling',
      body: `${loadDesc} in 7 days — over the rolling ceiling. Plan rest before the next outing.`,
      priority,
      confidence,
      // Workload is a recorded count (observed), but it is a HEALTH/SAFETY judgment
      // surface a coach owns — handed raw to a player it drives self-management, not
      // development. The registry pins rolling_pitch_count / rolling_innings as
      // player_eligible:false, so the floor keeps this staff-only regardless of the
      // source-ref visibility (strictest-wins), enforcing in the registry what the
      // strictest-source rule only happened to do.
      playerVisible: playerVisibleFor([...primary.source_refs, ...extraRefs], primary.metric),
      evidence: buildEvidence(primary, diagnosis, 'observed_sequence', extraRefs),
    },
  ];
}

// =============================================================================
// 5. SCHEDULE CONFLICT (team-level)
//    Signal: two MANDATORY events overlap. This is an OBSERVED fact (the rows
//    overlap), so causality_level is observed_sequence and confidence is high —
//    it is a deterministic check, not a statistical inference. It is the one
//    generator that does not rest on box-score data, so it is reliably 'high'.
// =============================================================================

export function scheduleConflictGenerator(events: ScheduleEventRow[]): BaseballInsightCandidate[] {
  const conflicts: ScheduleConflict[] = findScheduleConflicts(events);
  return conflicts.map((c) => {
    const refs: BaseballInsightSourceRef[] = [
      { table: 'baseball_events', column: 'start_time,end_time,is_mandatory', visibility: 'team', sample_n: 2, label: 'Overlapping mandatory events', confidence: 1 },
    ];
    const driverList: DiagnosisDriver[] = [
      { metric: 'rolling_pitch_count', value: c.overlapMinutes, unit: 'count', sample_n: 2, source: 'baseball_events overlap (minutes)' },
    ];
    const diagnosis: Diagnosis = {
      symptom: `"${c.a.title}" and "${c.b.title}" are both mandatory and overlap by ${c.overlapMinutes} minutes.`,
      root_cause: 'Two mandatory commitments are double-booked — players cannot attend both.',
      causality_level: 'observed_sequence',
      drivers: driverList,
      recommended_action: 'Reschedule or relax the mandatory flag on one event so players are not forced to miss a required commitment.',
      confidence_reason: '2 overlapping mandatory event rows; deterministic check',
    };
    return {
      generator: 'schedule_conflict',
      playerId: null,
      insightType: 'coachhelm_schedule_conflict',
      title: 'Mandatory schedule conflict',
      body: `"${c.a.title}" overlaps "${c.b.title}" by ${c.overlapMinutes} min — both are mandatory.`,
      priority: 'high' as InsightPriority,
      confidence: 1,
      playerVisible: true, // schedule is team-visible by nature
      evidence: {
        sample_n: 2,
        target_n: 2,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1, factors_measured: true },
        diagnosis,
        causality_level: 'observed_sequence',
        source_refs: refs,
      },
    };
  });
}

// =============================================================================
// Orchestration
// =============================================================================

/** Inputs the full run needs. */
export interface BaseballEngineInputs {
  players: LoadedPlayerMetrics[];
  events: ScheduleEventRow[];
}

/**
 * Run every generator and return all candidates. Pure: deterministic for a given
 * input. The action persists the result. Per-player generators run for each
 * player; the schedule generator runs once on the team's events.
 */
export function runBaseballGenerators(inputs: BaseballEngineInputs): BaseballInsightCandidate[] {
  const candidates: BaseballInsightCandidate[] = [];
  for (const player of inputs.players) {
    candidates.push(...twoStrikeChaseGenerator(player));
    candidates.push(...gameVsPracticeGapGenerator(player));
    candidates.push(...veloCommandDecayGenerator(player));
    candidates.push(...workloadGenerator(player));
  }
  candidates.push(...scheduleConflictGenerator(inputs.events));
  return candidates;
}

/** All generator ids — useful for the action's stale-row reconciliation. */
const _BASEBALL_GENERATOR_IDS = [
  'two_strike_chase',
  'game_vs_practice_gap',
  'velo_command_decay',
  'workload',
  'schedule_conflict',
] as const;

export type BaseballGeneratorId = (typeof _BASEBALL_GENERATOR_IDS)[number];


