// =============================================================================
// src/lib/baseball/exercise-conflict.ts
//
// Wave 4 — Exercise Conflict-Score Engine (pure, deterministic; NO AI).
//
// SHARED TYPE CONTRACT — these types are the source of truth for all
// lift-builder consumers. Import with `import type` everywhere else.
//
// Scoring logic:
//   A region "overlaps" if it appears in exercise.stressRegions (primary
//   stress, weight ×1.5) or exercise.primaryBodyRegions (secondary only, not
//   in stressRegions; weight ×0.75). For each overlapping sore region the
//   contribution is:
//
//     contribution = (flag.maxSeverity / 10) × (1 + flag.count × 0.3) × weightMultiplier
//
//   Pitcher amplification: when isPitcherSensitive=true AND at least one
//   overlapping region belongs to the throwing-arm group (shoulder, elbow,
//   forearm), the total is multiplied by 1.6.
//
//   Level thresholds:  none (score < 2) | caution (2 ≤ score ≤ 5) | high (score > 5)
//
// Warning language contract (non-negotiable):
//   Human, safety-first phrasing. NEVER use 'injury', 'must', 'cannot'.
//   Use 'worth reviewing', 'associated with', 'consider', 'may want to'.
//
// PURE: no Supabase, no server imports, no React — safe for unit tests and
// client-side exercise builders.
// =============================================================================

import { regionsForBaseballRiskGroup } from '@/lib/lifting/soreness-regions';

// ─── Shared Type Contract ─────────────────────────────────────────────────────
// Wave 4 owns these. All other files import with `import type`.

export type StressLevel = 'none' | 'low' | 'medium' | 'high';

export type LiftBlockType =
  | 'warmup'
  | 'power'
  | 'main'
  | 'accessory'
  | 'arm_care'
  | 'conditioning'
  | 'recovery';

export interface BuilderExercise {
  id: string;
  name: string;
  category: string;
  movementPattern: string;
  primaryBodyRegions: string[];
  secondaryBodyRegions: string[];
  stressRegions: string[];
  throwingArmStress: StressLevel;
  spineLoading: StressLevel;
  lowerBodyLoading: StressLevel;
  rotationalStress: StressLevel;
  gripStress: StressLevel;
  isPitcherSensitive: boolean;
  equipment: string[];
  demoVideoUrl: string | null;
}

export interface GroupSorenessFlag {
  bodyRegion: string;
  count: number;
  maxSeverity: number;
}

export interface ExerciseConflict {
  score: number;
  level: 'none' | 'caution' | 'high';
  warnings: string[];
  affectedRegions: string[];
}

export interface GroupAvailabilityCell {
  playerId: string;
  playerName: string;
  blocks: Array<{
    slot: string;
    status: 'available' | 'class' | 'practice' | 'game' | 'unavailable' | 'unknown';
  }>;
}

export interface LiftDraftExercise {
  id: string;
  exerciseId: string;
  prescription: {
    sets?: number;
    reps?: number;
    loadMode?: 'weight' | 'percent' | 'rpe' | 'bodyweight';
    load?: number;
    rpe?: number;
    rest?: number;
    note?: string;
  };
}

export interface LiftSessionDraftBlock {
  id: string;
  title: string;
  type: LiftBlockType;
  exercises: LiftDraftExercise[];
}

// ─── Internal constants ───────────────────────────────────────────────────────

/**
 * Throwing-arm region IDs from the soreness registry.
 * Stored as Set<string> so `.has(flag.bodyRegion)` never narrows the param type.
 * Same pattern as overuse-rules.ts.
 */
const THROWING_ARM_REGION_SET: ReadonlySet<string> = new Set<string>(
  regionsForBaseballRiskGroup('throwing_arm'),
);

/** Weight applied when the sore region appears in exercise.stressRegions. */
const STRESS_REGION_WEIGHT = 1.5;

/**
 * Weight applied when the sore region appears in exercise.primaryBodyRegions
 * but NOT in exercise.stressRegions (secondary contribution).
 */
const PRIMARY_REGION_WEIGHT = 0.75;

/**
 * Score multiplier applied when isPitcherSensitive=true AND at least one sore
 * region is a throwing-arm region.
 */
const PITCHER_SENSITIVE_AMP = 1.6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreLevelOf(score: number): 'none' | 'caution' | 'high' {
  if (score > 5) return 'high';
  if (score >= 2) return 'caution';
  return 'none';
}

/** Convert a snake_case region ID to human-readable label ('right shoulder'). */
function regionLabel(region: string): string {
  return region.replace(/_/g, ' ');
}

function buildWarnings(
  level: 'none' | 'caution' | 'high',
  affectedRegions: ReadonlySet<string>,
  isPitcherSensitive: boolean,
  pitcherThrowingArmOverlap: boolean,
): string[] {
  if (level === 'none' || affectedRegions.size === 0) return [];

  const regionPhrase = [...affectedRegions].map(regionLabel).join(', ');
  const warnings: string[] = [];

  if (level === 'caution') {
    warnings.push(
      `This exercise is associated with soreness in ${regionPhrase} — worth reviewing load and volume before programming.`,
    );
  } else {
    // high
    warnings.push(
      `This exercise overlaps with reported soreness in ${regionPhrase} — consider substituting or significantly reducing volume.`,
    );
  }

  if (isPitcherSensitive && pitcherThrowingArmOverlap) {
    warnings.push(
      'Exercise is flagged as pitcher-sensitive and overlaps a throwing-arm region — may want to consult with your athletic trainer before including.',
    );
  }

  return warnings;
}

// ─── Score engine ─────────────────────────────────────────────────────────────

/**
 * Score an exercise against the group's current soreness flags.
 *
 * Pure and deterministic — no I/O, no randomness. Safe to call on every
 * render or in tests without any setup.
 *
 * @param exercise     The exercise candidate from the lift builder.
 * @param groupSoreness Aggregated soreness flags for the group (one entry per
 *                     region, already aggregated across players).
 */
export function scoreExerciseConflict(
  exercise: BuilderExercise,
  groupSoreness: GroupSorenessFlag[],
): ExerciseConflict {
  if (groupSoreness.length === 0) {
    return { score: 0, level: 'none', warnings: [], affectedRegions: [] };
  }

  const stressSet = new Set(exercise.stressRegions);
  const primarySet = new Set(exercise.primaryBodyRegions);

  let rawScore = 0;
  let pitcherThrowingArmOverlap = false;
  const affectedSet = new Set<string>();

  for (const flag of groupSoreness) {
    const inStress = stressSet.has(flag.bodyRegion);
    // Only use primary weight when the region is NOT already in stressRegions —
    // avoids double-counting and ensures the stricter weight wins.
    const inPrimary = !inStress && primarySet.has(flag.bodyRegion);

    if (!inStress && !inPrimary) continue;

    const weight = inStress ? STRESS_REGION_WEIGHT : PRIMARY_REGION_WEIGHT;
    // Contribution rises with severity (0–10 scale) and player count.
    // count factor: 1 player = ×1.0, 5 players = ×2.5, 10 players = ×4.0.
    const contribution =
      (flag.maxSeverity / 10) * (1 + flag.count * 0.3) * weight;

    rawScore += contribution;
    affectedSet.add(flag.bodyRegion);

    // Track whether any overlapping region is a throwing-arm site for pitcher amp.
    if (exercise.isPitcherSensitive && THROWING_ARM_REGION_SET.has(flag.bodyRegion)) {
      pitcherThrowingArmOverlap = true;
    }
  }

  const amplifiedScore = pitcherThrowingArmOverlap
    ? rawScore * PITCHER_SENSITIVE_AMP
    : rawScore;

  // Round to two decimal places to keep scores readable in UI and tests.
  const score = Math.round(amplifiedScore * 100) / 100;
  const level = scoreLevelOf(score);

  return {
    score,
    level,
    warnings: buildWarnings(level, affectedSet, exercise.isPitcherSensitive, pitcherThrowingArmOverlap),
    affectedRegions: [...affectedSet],
  };
}

// ─── Substitution suggester ───────────────────────────────────────────────────

/**
 * Find exercises from the library that:
 *   1. Share the same `category` and `movementPattern` as `exercise`.
 *   2. Score strictly lower on `scoreExerciseConflict` than `exercise` itself.
 *
 * Returned sorted ascending by conflict score (least conflicted first).
 * The input exercise is always excluded even if present in `library`.
 *
 * @param exercise     The exercise to find replacements for.
 * @param library      The full exercise library to search (may include exercise).
 * @param groupSoreness Current group soreness for scoring.
 */
export function suggestSubstitutions(
  exercise: BuilderExercise,
  library: BuilderExercise[],
  groupSoreness: GroupSorenessFlag[],
): BuilderExercise[] {
  const baseScore = scoreExerciseConflict(exercise, groupSoreness).score;

  return library
    .filter(
      (ex) =>
        ex.id !== exercise.id &&
        ex.category === exercise.category &&
        ex.movementPattern === exercise.movementPattern,
    )
    .map((ex) => ({
      exercise: ex,
      score: scoreExerciseConflict(ex, groupSoreness).score,
    }))
    .filter(({ score }) => score < baseScore)
    .sort((a, b) => a.score - b.score)
    .map(({ exercise: ex }) => ex);
}
