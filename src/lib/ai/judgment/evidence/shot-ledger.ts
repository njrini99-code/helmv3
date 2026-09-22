/**
 * Deterministic shot-trace evidence compiler + hard-invariant validator.
 *
 * Runs BEFORE any judgment and owns everything code can prove:
 *   - the trace's step facts are recomputed from the step rows the detail
 *     RPC returned, never from `trace_runs.observed_step_count` /
 *     `missing_required_step_count` (both have lagged — see
 *     reconcileObservedStepCount and HELD.md's 20260902160000 row);
 *   - the verify.* steps' expected/actual counts are compared here;
 *   - the shot ledger (when the caller has it) is checked against the
 *     storage contract: contiguous shot numbers per hole, legal units,
 *     non-negative distances, a holed shot is that hole's last shot.
 *
 * Output is a compact, id-free state for Jev plus `hardInvariantFailed`
 * (P0). Jev is only asked about what is left ambiguous.
 */

import {
  getGolfRoundWorkflowDefinition,
  type FlightStepDefinition,
  type GolfRoundWorkflow,
} from '@/lib/observability/golf-round-flight-workflow';

export interface TraceRunRow {
  workflow: string;
  status: string;
  duration_ms?: number | null;
  failure_step?: string | null;
  failure_code?: string | null;
  failure_summary?: string | null;
  metadata?: unknown;
  [key: string]: unknown;
}

export interface TraceStepRow {
  step_key: string;
  status: string;
  layer?: string | null;
  requiredness?: string | null;
  duration_ms?: number | null;
  error_code?: string | null;
  error_summary?: string | null;
  expected?: unknown;
  observed?: unknown;
  [key: string]: unknown;
}

/** The subset of a golf_shots row the ledger contract is about. */
export interface LedgerShot {
  hole_number: number;
  shot_number: number;
  shot_type?: string | null;
  result?: string | null;
  distance_to_hole_before?: number | null;
  distance_to_hole_after?: number | null;
  distance_unit_before?: string | null;
  distance_unit_after?: string | null;
  penalty_strokes?: number | null;
}

export interface ShotTraceEvidence {
  workflow: string;
  run_status: string;
  status_downgraded_from: string | null;
  duration_ms: number | null;
  failure: { step: string | null; code: string | null; summary: string | null };
  steps: {
    declared: number;
    observed: number;
    required_declared: string[];
    required_observed_success: string[];
    required_missing: string[];
    required_failed: string[];
    conditional_missing: string[];
    warned: string[];
    ordered: Array<{ key: string; status: string; layer: string | null; ms: number | null; error: string | null }>;
  };
  verification: Array<{ step: string; expected: number | null; actual: number | null; matched: boolean | null }>;
  recovery: {
    fallback_used: boolean;
    conflict_seen: boolean;
    retry_seen: boolean;
  };
  ledger: {
    supplied: boolean;
    shot_count: number;
    holes: number;
    violations: string[];
  } | null;
  hard_invariants: string[];
}

const LEGAL_UNITS = new Set(['yards', 'feet', 'meters', 'metres']);
const CONFLICT_CODES = /busy|55P03|conflict|stale|lock_not_available|version/i;
const RETRY_CODES = /retry|timeout|ECONN|fetch failed|network/i;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function verifyCounts(observed: unknown): { expected: number | null; actual: number | null } {
  if (!observed || typeof observed !== 'object') return { expected: null, actual: null };
  const o = observed as Record<string, unknown>;
  return { expected: num(o.expected), actual: num(o.actual) };
}

function isGolfWorkflow(value: string): value is GolfRoundWorkflow {
  try {
    return Array.isArray(getGolfRoundWorkflowDefinition(value as GolfRoundWorkflow));
  } catch {
    return false;
  }
}

/** Ledger contract checks. Returns violation codes; empty means clean. */
export function validateShotLedger(shots: readonly LedgerShot[]): string[] {
  const violations = new Set<string>();
  const byHole = new Map<number, LedgerShot[]>();
  for (const shot of shots) {
    if (!Number.isInteger(shot.hole_number) || shot.hole_number < 1 || shot.hole_number > 18) violations.add('hole_number_out_of_range');
    const list = byHole.get(shot.hole_number) ?? [];
    list.push(shot);
    byHole.set(shot.hole_number, list);
    for (const [unit, dist] of [
      [shot.distance_unit_before, shot.distance_to_hole_before],
      [shot.distance_unit_after, shot.distance_to_hole_after],
    ] as const) {
      if (unit != null && !LEGAL_UNITS.has(unit)) violations.add('illegal_distance_unit');
      if (dist != null && (!Number.isFinite(dist) || dist < 0)) violations.add('negative_distance');
    }
    if (shot.penalty_strokes != null && (shot.penalty_strokes < 0 || shot.penalty_strokes > 2)) violations.add('penalty_strokes_out_of_range');
  }
  for (const list of byHole.values()) {
    const numbers = list.map((s) => s.shot_number).sort((a, b) => a - b);
    if (new Set(numbers).size !== numbers.length) violations.add('duplicate_shot_number');
    if (numbers[0] !== 1 || numbers.some((n, i) => n !== i + 1)) violations.add('non_contiguous_shot_numbers');
    const holedIndex = list.findIndex((s) => s.result === 'hole' || s.result === 'holed');
    if (holedIndex >= 0) {
      const holed = list[holedIndex]!;
      if (holed.shot_number !== Math.max(...numbers)) violations.add('shot_after_holed');
      if (holed.distance_to_hole_after != null && holed.distance_to_hole_after !== 0) violations.add('holed_shot_nonzero_leave');
    }
  }
  return [...violations];
}

export function compileShotTraceEvidence(input: {
  run: TraceRunRow;
  steps: readonly TraceStepRow[];
  shots?: readonly LedgerShot[] | null;
}): ShotTraceEvidence {
  const { run, steps } = input;
  const definition: readonly FlightStepDefinition[] = isGolfWorkflow(run.workflow)
    ? getGolfRoundWorkflowDefinition(run.workflow)
    : [];
  const byKey = new Map(steps.map((s) => [s.step_key, s] as const));

  const requiredDeclared = definition.filter((d) => d.requiredness === 'required').map((d) => d.key);
  const requiredObservedSuccess = requiredDeclared.filter((k) => byKey.get(k)?.status === 'success');
  const requiredMissing = requiredDeclared.filter((k) => {
    const s = byKey.get(k);
    return !s || s.status === 'missing' || s.status === 'pending';
  });
  const requiredFailed = requiredDeclared.filter((k) => byKey.get(k)?.status === 'failure');
  const conditionalMissing = definition
    .filter((d) => d.requiredness === 'conditional')
    .map((d) => d.key)
    .filter((k) => !byKey.has(k));
  const warned = steps.filter((s) => s.status === 'warning').map((s) => s.step_key);

  const verification = steps
    .filter((s) => s.step_key.startsWith('verify.') && s.observed && typeof s.observed === 'object')
    .map((s) => {
      const { expected, actual } = verifyCounts(s.observed);
      return {
        step: s.step_key,
        expected,
        actual,
        matched: expected == null || actual == null ? null : expected === actual,
      };
    });

  const errorText = [run.failure_code, run.failure_summary, ...steps.map((s) => `${s.error_code ?? ''} ${s.error_summary ?? ''}`)]
    .filter(Boolean)
    .join(' ');
  const recovery = {
    fallback_used: byKey.get('db.direct_submit_fallback')?.status === 'success',
    conflict_seen: CONFLICT_CODES.test(errorText),
    retry_seen: RETRY_CODES.test(errorText),
  };

  const metadata = run.metadata && typeof run.metadata === 'object' ? (run.metadata as Record<string, unknown>) : {};
  const downgradedFrom = typeof metadata.status_downgraded_from === 'string' ? metadata.status_downgraded_from : null;

  const ledgerViolations = input.shots ? validateShotLedger(input.shots) : [];
  const ledger = input.shots
    ? {
        supplied: true,
        shot_count: input.shots.length,
        holes: new Set(input.shots.map((s) => s.hole_number)).size,
        violations: ledgerViolations,
      }
    : null;

  // P0 — what code can prove without asking anyone.
  const hard: string[] = [];
  // A failed required step under a success run is a contradiction — unless
  // the submit fallback rescued the write (db.submit_round_atomic failed at
  // the transport level, db.direct_submit_fallback succeeded): that is the
  // documented recovery path, and the verification counts below still judge
  // whether it landed. Found by the first calibration run (fixture
  // submit_fallback_rescued escalated from code).
  const rescued = recovery.fallback_used && requiredFailed.every((k) => k === 'db.submit_round_atomic');
  if (run.status === 'success' && requiredFailed.length > 0 && !rescued) hard.push('success_with_failed_required_step');
  if (verification.some((v) => v.matched === false && v.step === 'verify.shots')) hard.push('persisted_shot_count_mismatch');
  if (verification.some((v) => v.matched === false && v.step === 'verify.holes')) hard.push('persisted_hole_count_mismatch');
  for (const v of ledgerViolations) hard.push(`ledger:${v}`);

  return {
    workflow: run.workflow,
    run_status: run.status,
    status_downgraded_from: downgradedFrom,
    duration_ms: num(run.duration_ms),
    failure: {
      step: run.failure_step ?? null,
      code: run.failure_code ?? null,
      summary: run.failure_summary ? String(run.failure_summary).slice(0, 300) : null,
    },
    steps: {
      declared: definition.length,
      observed: steps.length,
      required_declared: requiredDeclared,
      required_observed_success: requiredObservedSuccess,
      required_missing: requiredMissing,
      required_failed: requiredFailed,
      conditional_missing: conditionalMissing,
      warned,
      ordered: steps.map((s) => ({
        key: s.step_key,
        status: s.status,
        layer: s.layer ?? null,
        ms: num(s.duration_ms),
        error: s.error_code ?? (s.error_summary ? String(s.error_summary).slice(0, 120) : null),
      })),
    },
    verification,
    recovery,
    ledger,
    hard_invariants: hard,
  };
}

/**
 * Which traces deserve a judgment at all. Never every trace: failures,
 * warnings, recomputed missing required steps, verification mismatches,
 * recovery paths, plus a deterministic 1-in-N sample of clean successes for
 * calibration.
 */
export function shouldJudgeTrace(evidence: ShotTraceEvidence, traceId: string, sampleEvery = 50): { judge: boolean; why: string } {
  if (evidence.hard_invariants.length > 0) return { judge: true, why: 'hard_invariant' };
  if (evidence.run_status === 'failure') return { judge: true, why: 'failure' };
  if (evidence.run_status === 'warning' || evidence.status_downgraded_from) return { judge: true, why: 'warning' };
  if (evidence.steps.required_missing.length > 0) return { judge: true, why: 'required_missing' };
  if (evidence.verification.some((v) => v.matched === false)) return { judge: true, why: 'verification_mismatch' };
  if (evidence.recovery.fallback_used || evidence.recovery.conflict_seen || evidence.recovery.retry_seen) return { judge: true, why: 'recovery_path' };
  // Deterministic sample: hash-free, uses the uuid's last byte so re-runs pick the same traces.
  const tail = parseInt(traceId.slice(-2), 16);
  if (Number.isFinite(tail) && tail % Math.max(1, Math.round(sampleEvery / 2.56)) === 0) return { judge: true, why: 'sample' };
  return { judge: false, why: 'clean' };
}
