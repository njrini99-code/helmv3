/**
 * Rollback recommendation — read-only, non-executing, pure.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §4 F.4.3.
 * Compares the reliability-snapshot signal density in the candidate SHA's
 * window against the prior baseline window and outputs one of five
 * verdicts, with itemized evidence. It NEVER calls a deploy or rollback
 * API — matching `config/release-policy.yml`'s
 * `emergency.automatic_override: false` and this repo's `release:status`
 * (`scripts/release-status.mjs`) precedent of reporting, never acting.
 *
 * No I/O here: `summarizeReliabilityWindow` folds raw `ReliabilityRun` rows
 * (already fetched by a caller — a script or a Bridge read model) into a
 * `ReliabilityWindowSummary`, and `evaluateRollback` reasons over two of
 * those. Same split as `release-context.ts`'s classify/fetch separation.
 */

import type { ReliabilityRun } from '@/lib/reliability/types';
import type {
  ReliabilityWindowSummary,
  RollbackEvidence,
  RollbackInput,
  RollbackVerdict,
} from './types';

/**
 * Folds a set of already-fetched `ReliabilityRun` rows (each one snapshot
 * written by the reliability collector, `RELIABILITY_SNAPSHOT_JOB_TYPE`)
 * into the counts `evaluateRollback` needs.
 *
 * Returns `null` for an EMPTY set — "zero rows in this window" is not the
 * same fact as "the collector never ran for this window", and the caller
 * (which knows whether the underlying Supabase query itself failed) is
 * responsible for telling those two apart before calling this. A caller
 * that only has "the query succeeded and returned zero rows" should still
 * pass `null` here, because a window with a genuinely quiet collector and a
 * window the collector never covered render identically at this layer —
 * `evaluateRollback` treats a `null` summary as `UNKNOWN`, never as `KEEP`.
 */
export function summarizeReliabilityWindow(
  runs: readonly ReliabilityRun[],
): ReliabilityWindowSummary | null {
  if (runs.length === 0) return null;

  let totalSignals = 0;
  let criticalSignals = 0;
  let errorSignals = 0;

  for (const run of runs) {
    for (const signal of run.signals) {
      totalSignals += 1;
      if (signal.severity === 'critical') criticalSignals += 1;
      else if (signal.severity === 'error') errorSignals += 1;
    }
  }

  return { runCount: runs.length, totalSignals, criticalSignals, errorSignals };
}

/**
 * A candidate window is worse than baseline when either its total signal
 * count or its critical-signal count has meaningfully grown. `1.5x` and
 * `+2 critical` are deliberately blunt thresholds for a first cut — tune
 * once a real baseline has been observed (same "PROVISIONAL, tighten on
 * first real data" stance `config/mutation-gate.json` documents for its own
 * floor).
 */
const TOTAL_GROWTH_ROLLBACK = 2.0;
const TOTAL_GROWTH_PAUSE = 1.5;
const CRITICAL_DELTA_ROLLBACK = 3;
const CRITICAL_DELTA_PAUSE = 1;

export function evaluateRollback(input: RollbackInput): RollbackVerdict {
  const evidence: RollbackEvidence[] = [];

  if (input.candidateSha === null) {
    return {
      recommendation: 'UNKNOWN',
      evidence: [{ detail: 'No candidate SHA supplied — nothing to evaluate.' }],
    };
  }

  if (input.candidate === null) {
    return {
      recommendation: 'UNKNOWN',
      evidence: [
        { detail: `No readable reliability-snapshot rows for ${input.candidateSha}'s window.` },
      ],
    };
  }

  if (input.baseline === null) {
    return {
      recommendation: 'UNKNOWN',
      evidence: [
        { detail: 'No readable reliability-snapshot rows for the prior baseline window.' },
        {
          detail: `Candidate window: ${input.candidate.totalSignals} signal(s) across ${input.candidate.runCount} run(s) — cannot compare without a baseline.`,
        },
      ],
    };
  }

  const { candidate, baseline } = input;
  evidence.push({
    detail: `Candidate: ${candidate.totalSignals} signal(s) (${candidate.criticalSignals} critical, ${candidate.errorSignals} error) across ${candidate.runCount} run(s).`,
  });
  evidence.push({
    detail: `Baseline: ${baseline.totalSignals} signal(s) (${baseline.criticalSignals} critical, ${baseline.errorSignals} error) across ${baseline.runCount} run(s).`,
  });

  const criticalDelta = candidate.criticalSignals - baseline.criticalSignals;
  const totalGrowth = baseline.totalSignals === 0
    ? (candidate.totalSignals > 0 ? Infinity : 1)
    : candidate.totalSignals / baseline.totalSignals;

  if (criticalDelta >= CRITICAL_DELTA_ROLLBACK || totalGrowth >= TOTAL_GROWTH_ROLLBACK) {
    evidence.push({
      detail:
        criticalDelta >= CRITICAL_DELTA_ROLLBACK
          ? `Critical signals rose by ${criticalDelta} vs. baseline.`
          : `Total signal volume grew ${totalGrowth === Infinity ? 'from zero' : `${totalGrowth.toFixed(1)}x`} vs. baseline.`,
    });
    return { recommendation: 'ROLLBACK_RECOMMENDED', evidence };
  }

  if (criticalDelta >= CRITICAL_DELTA_PAUSE || totalGrowth >= TOTAL_GROWTH_PAUSE) {
    evidence.push({
      detail:
        criticalDelta >= CRITICAL_DELTA_PAUSE
          ? `Critical signals rose by ${criticalDelta} vs. baseline — worth pausing further rollout.`
          : `Total signal volume grew ${totalGrowth.toFixed(1)}x vs. baseline — worth pausing further rollout.`,
    });
    return { recommendation: 'PAUSE_ROLLOUT', evidence };
  }

  if (totalGrowth > 1.0 || candidate.errorSignals > baseline.errorSignals) {
    evidence.push({ detail: 'Some signal growth vs. baseline, below the pause threshold — worth watching.' });
    return { recommendation: 'WATCH', evidence };
  }

  evidence.push({ detail: 'No meaningful signal growth vs. baseline.' });
  return { recommendation: 'KEEP', evidence };
}
