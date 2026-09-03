import 'server-only';

/**
 * Invariant runner — invoked as a new, independently fault-isolated arm
 * inside `runReliabilityCollection`'s `Promise.allSettled` fan-out
 * (`collect.ts`), per Bridge Control Plane Phase D.4.3. Reuses the
 * collector's own scheduling (the 3-hourly cron) rather than a separate one.
 *
 * TIMEOUT RULE (D.7 risk): a slow invariant query must not starve the
 * Sentry/Vercel/Supabase arms sharing the same invocation, and a timed-out
 * invariant reports `'unknown'`, never `'pass'` — the same rule
 * `sources.ts`'s `MAX_WALL_CLOCK_MS` budget enforces for the Sentry arm.
 */

import { fetchRoundGraphInvariants } from './round-graph-data';

export type InvariantCheckState = 'pass' | 'fail' | 'unknown';

export interface InvariantCheckOutcome {
  id: string;
  label: string;
  featureId: string;
  severity: 'critical' | 'warning';
  state: InvariantCheckState;
  detail: string;
  /** Null exactly when `state === 'unknown'` — never a fabricated 0. */
  violations: number | null;
  sampleIds: string[];
  checkedAt: string;
}

/** Written to `ReliabilityRun.invariants` — an OPTIONAL field, so a row
 *  written before this shipped still parses (`parseRun` in
 *  `src/lib/admin/data/reliability.ts` never required it). */
export interface InvariantRunSummary {
  version: 1;
  generatedAt: string;
  checks: InvariantCheckOutcome[];
  /** True when EVERY check this run is unknown — the whole arm was blind,
   *  never rendered as "everything passed". */
  blind: boolean;
}

/** Well inside the collector's own MAX_WALL_CLOCK_MS-class budget
 *  (`src/lib/admin/sentry-api.ts:37`), so one slow invariant query cannot
 *  meaningfully delay the run. */
const PER_GROUP_TIMEOUT_MS = 6_000;

/** One entry per check id this runner knows how to produce, so a check
 *  present in neither a timeout's nor a fetch error's result set still gets
 *  a real label/feature_id on its `'unknown'` row instead of the bare id. */
const CHECK_DEFS: readonly { id: string; label: string; featureId: string }[] = [
  { id: 'round-graph-orphaned-shots', label: 'Shots reference a persisted hole', featureId: 'shot_tracking' },
  { id: 'round-graph-completed-without-holes', label: 'Completed rounds have played holes', featureId: 'golf_round_lifecycle' },
];

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms);
  });
  try {
    return await Promise.race([promise.then((value): { ok: true; value: T } => ({ ok: true, value })), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unknownCheck(def: (typeof CHECK_DEFS)[number], now: Date, reason: string): InvariantCheckOutcome {
  return {
    id: def.id,
    label: def.label,
    featureId: def.featureId,
    severity: 'warning',
    state: 'unknown',
    detail: `Could not be evaluated this run: ${reason}.`,
    violations: null,
    sampleIds: [],
    checkedAt: now.toISOString(),
  };
}

/**
 * Runs every registered invariant group. Today there is one group
 * (round-graph, two checks); adding a group means adding one more
 * `withTimeout(...)` call here plus its `CHECK_DEFS` entries — each group is
 * independently timed and independently degrades to `'unknown'`, never
 * taking another group's checks down with it.
 */
export async function runInvariantChecks(now: Date = new Date()): Promise<InvariantRunSummary> {
  const roundGraph = await withTimeout(fetchRoundGraphInvariants(), PER_GROUP_TIMEOUT_MS);

  const checks: InvariantCheckOutcome[] = CHECK_DEFS.map((def) => {
    if (!roundGraph.ok) return unknownCheck(def, now, 'timed out');

    const result = roundGraph.value.results.find((r) => r.id === def.id);
    if (!result) return unknownCheck(def, now, roundGraph.value.error ?? 'not returned this run');

    return {
      id: result.id,
      label: result.label,
      featureId: def.featureId,
      severity: result.severity,
      state: result.violations > 0 ? 'fail' : 'pass',
      detail: result.violations > 0 ? `${result.violations} violation${result.violations === 1 ? '' : 's'} — ${result.rule}` : 'no violations found',
      violations: result.violations,
      sampleIds: result.sampleIds,
      checkedAt: now.toISOString(),
    };
  });

  return {
    version: 1,
    generatedAt: now.toISOString(),
    checks,
    blind: checks.every((c) => c.state === 'unknown'),
  };
}
