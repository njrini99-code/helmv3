/**
 * CoachHelm BASEBALL V10 engine orchestrator.
 *
 * The single entry point the write layer (actions/coachhelm.ts) calls. It
 * composes the full V10 canonical-fact → signal → ranked-action pipeline:
 *
 *   facts (LoadedPlayerMetrics, already built by the loaders) →
 *   generators (5 base + 6 V10 families) →
 *   composites (3 cross-domain rules) →
 *   multi-factor ranking →
 *   ranked candidates the action persists with rank_score.
 *
 * Kept SEPARATE from generators/index.ts so the helper-export direction stays
 * acyclic: index.ts exports the pure helpers + the 5 base generators; v10.ts and
 * composites.ts import those helpers; this orchestrator imports ALL of them. No
 * module imports back into this file, so there is no import cycle.
 *
 * Pure: deterministic for a given input. No DB, no side effects.
 */

import type {
  ImportRunSummary,
  PracticeEffectivenessInput,
} from './loaders-v10';
import {
  runBaseballGenerators,
  scheduleConflictGenerator,
  type BaseballInsightCandidate,
  type BaseballEngineInputs,
} from './generators';
import {
  readinessGenerator,
  liftComplianceGenerator,
  practiceEffectivenessGenerator,
  importQualityGenerator,
  videoEvidenceGenerator,
  type VideoCoverageInput,
} from './generators/v10';
import {
  runBaseballEventFamilyGenerators,
  BASEBALL_EVENT_FAMILY_INSIGHT_TYPES,
} from './generators/event-families';
import {
  runBaseballClassOpsGenerators,
  BASEBALL_CLASS_OPS_INSIGHT_TYPES,
  type ClassOpsInputs,
} from './generators/class-ops';
import { runBaseballComposites } from './generators/composites';
import {
  rankBaseballCandidates,
  type RankedBaseballCandidate,
  type RankingContext,
} from './ranking';

/** Everything the full V10 run needs (a superset of the base inputs). */
export interface BaseballV10EngineInputs extends BaseballEngineInputs {
  /**
   * ISO instant the run considers "now" for every rolling-window calculation
   * downstream (#811 residual). Defaults to `new Date().toISOString()` inside
   * importQualityGenerator itself when omitted, so a non-engine caller that
   * never sets this field keeps its existing real-time behavior unchanged —
   * only runBaseballEngineCore's deterministic path threads its own nowIso
   * through here. Mirrors the nowIso already threaded through
   * loadAllPlayerMetrics/mergeV10PlayerMetrics/mergeEventPlayerMetrics for the
   * same reason: a fixed-clock test must never silently drift as real time
   * carries a Date.now()-based window past the seeded fixture dates.
   */
  now?: string;
  /** Practice-effectiveness inputs the action assembled (one per evaluated block). */
  practiceEffectiveness?: PracticeEffectivenessInput[];
  /** Recent import-run summaries to evaluate for data-quality flags. */
  importRuns?: ImportRunSummary[];
  /** Video-coverage snapshot for the active diagnostic insight set. */
  videoCoverage?: VideoCoverageInput | null;
  /**
   * Class / operations inputs (class conflicts, acknowledgement coverage, stale
   * source data) the action assembled. Absent → those families emit nothing.
   */
  classOps?: ClassOpsInputs;
  /** Per-candidate ranking context keyed by `${generator}:${playerId|'team'}`. */
  rankingContextByKey?: Record<string, RankingContext>;
  /**
   * Team-wide default ranking context (e.g. days-to-next-event) merged UNDER any
   * per-key context. The proximity term inside the ranker only applies to
   * player-scoped candidates, so a team-level signal (schedule/import) is
   * unaffected by the default's daysToNextEvent.
   */
  defaultRankingContext?: RankingContext;
}

/**
 * Generate the FULL V10 candidate set (base + V10 families + composites),
 * unranked. The base `runBaseballGenerators` already covers the 5 box-score
 * generators + schedule conflict; we add the 6 V10 families + 3 composites here.
 */
export function generateAllBaseballCandidates(
  inputs: BaseballV10EngineInputs,
): BaseballInsightCandidate[] {
  const candidates: BaseballInsightCandidate[] = [];

  // 5 base box-score generators + schedule conflict (per-player + team).
  candidates.push(...runBaseballGenerators({ players: inputs.players, events: inputs.events }));

  // 6 V10 per-player families + 23 deepened event-family generators (catching/
  // defense/baserunning + deepened hitting/pitching) + 3 composites. The event-
  // family generators read metrics the action merged via mergeEventPlayerMetrics;
  // a player with no event data simply has none of those metrics → no signals.
  for (const player of inputs.players) {
    candidates.push(...readinessGenerator(player));
    candidates.push(...liftComplianceGenerator(player));
    candidates.push(...runBaseballEventFamilyGenerators(player));
    candidates.push(...runBaseballComposites(player));
  }

  // Class / operations families (per-player inputs the action assembled).
  if (inputs.classOps) {
    candidates.push(...runBaseballClassOpsGenerators(inputs.classOps));
  }

  // Team / operations V10 families.
  for (const pe of inputs.practiceEffectiveness ?? []) {
    candidates.push(...practiceEffectivenessGenerator(pe));
  }
  if (inputs.importRuns && inputs.importRuns.length > 0) {
    candidates.push(...importQualityGenerator(inputs.importRuns, inputs.now));
  }
  if (inputs.videoCoverage) {
    candidates.push(...videoEvidenceGenerator(inputs.videoCoverage));
  }

  return candidates;
}

/**
 * Full V10 run: generate every candidate, then rank with the multi-factor model.
 * Returns candidates sorted strongest-first, each carrying its rank score so the
 * action can persist `rank_score` and every surface orders identically.
 */
export function runBaseballEngineV10(
  inputs: BaseballV10EngineInputs,
): RankedBaseballCandidate[] {
  const candidates = generateAllBaseballCandidates(inputs);
  const ctxByKey = inputs.rankingContextByKey ?? {};
  const dflt = inputs.defaultRankingContext ?? {};
  return rankBaseballCandidates(candidates, (c) => {
    const keyed = ctxByKey[`${c.generator}:${c.playerId ?? 'team'}`] ?? {};
    // Team-scoped candidates ignore the team-wide proximity default (it is about
    // a player's next event), but still honor explicit per-key context.
    const base: RankingContext = c.playerId ? dflt : {};
    return { ...base, ...keyed };
  });
}

// Re-export the helper that the action still needs directly.
export { scheduleConflictGenerator };



/** Every insight_type the V10 engine emits (all AI-flaggable in the read model). */
export const BASEBALL_ALL_INSIGHT_TYPES = [
  // base
  'coachhelm_two_strike_chase',
  'coachhelm_game_practice_gap',
  'coachhelm_command_decay',
  'coachhelm_workload',
  'coachhelm_schedule_conflict',
  // V10 families
  'coachhelm_readiness',
  'coachhelm_lift_compliance',
  'coachhelm_lift_rpe',
  'coachhelm_practice_effectiveness',
  'coachhelm_import_quality',
  'coachhelm_video_evidence',
  // composites
  'coachhelm_composite_command_decay',
  'coachhelm_composite_translation_gap',
  'coachhelm_composite_lift_to_field_risk',
  // deepened event families (catching/defense/baserunning + hitting/pitching)
  ...BASEBALL_EVENT_FAMILY_INSIGHT_TYPES,
  // class / operations
  ...BASEBALL_CLASS_OPS_INSIGHT_TYPES,
] as const;
