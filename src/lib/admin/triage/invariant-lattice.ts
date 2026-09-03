/**
 * Invariant Lattice (Bridge Premium Phase 3, `/admin/health`).
 *
 * "The business/data invariants the repo already checks — read models only,
 * never run the checks at request time." Checked directly, per invariant
 * source named in the brief:
 *
 *  - `scripts/check-schema-invariants.sh` — a CI-only grep script
 *    (`.github/workflows/ci.yml`) that checks two hardcoded schema rules and
 *    writes its result NOWHERE persistent: no table, no `docs/generated`
 *    file, no `admin_events` row. There is no recorded outcome to read.
 *  - `verify:business` (`npm run test:business`) — a vitest suite, CI-only,
 *    same story: no persisted, queryable result exists anywhere.
 *
 * So those two rows are honestly `unknown` on every single request, always —
 * not a placeholder waiting to be wired, a documented fact about what this
 * codebase currently persists. The two sources that DO have a real recorded
 * or cheaply-live-checkable outcome:
 *
 *  - `qualifier-invariants.ts`'s `evaluateQualifierInvariants()` — pure,
 *    already wired into `/admin/qualifiers`, evaluated fresh against
 *    already-fetched rows every request (the repo's own established idiom
 *    for "a read model, not a live check" — same shape `feature-health.ts`
 *    uses everywhere). No total-population count is available on
 *    `QualifierInvariantResult` (only `violations`), so this reports pass/
 *    fail with a violation count, never a fabricated "N/M" ratio the source
 *    data doesn't carry.
 *  - `admin_events` integrity rows (`source = 'integrity'`) — a genuine
 *    nightly-cron RECORDED outcome (`run_integrity_checks()`), already
 *    parsed by `jobs.ts`'s exported `parseIntegrityRows`.
 *  - Bridge Control Plane Phase D.4.3's round-graph invariants
 *    (`src/lib/reliability/invariants/run-checks.ts`) — RECORDED by the
 *    reliability collector every 3h into `background_job_logs`
 *    (`ReliabilityRun.invariants`), read here from the latest snapshot via
 *    `fetchReliabilitySnapshot()`. Same "read a recorded outcome, never
 *    re-run the check at request time" rule as every other row on this
 *    lattice; a check the collector has not yet reported renders `unknown`,
 *    the state `run-checks.ts` itself already guarantees for a timeout or a
 *    failed read, never coerced to `pass`.
 *
 * "A silent data-integrity violation visually outranks ordinary warnings" —
 * `severity` on a failing row is `'critical'` for an integrity-check failure
 * (a genuine data-integrity violation) and for a qualifier invariant marked
 * `critical` by its own severity field; everything else that fails is
 * `'warning'`.
 */

import type { QualifierInvariantResult } from '@/lib/admin/qualifier-invariants';
import type { IntegrityRow } from '@/lib/admin/data/jobs';
import type { InvariantCheckOutcome } from '@/lib/reliability/invariants/run-checks';

export type InvariantCellState = 'pass' | 'unknown' | 'fail';
export type InvariantSeverity = 'critical' | 'warning' | null;

export interface InvariantLatticeRow {
  id: string;
  label: string;
  group: string;
  state: InvariantCellState;
  detail: string;
  severity: InvariantSeverity;
  lastCheckedAt: string | null;
}

export interface InvariantLatticeView {
  rows: readonly InvariantLatticeRow[];
  /** True when any row is a real, recorded FAIL — never derived from
   *  `unknown` rows, which are never treated as failing. */
  anyFailing: boolean;
}

/** Named here, not read from the script — see module header: this is the
 *  honest "we know these exist, we cannot read their outcome" declaration,
 *  not a live check. */
const UNREADABLE_SOURCES: readonly { id: string; label: string; group: string; detail: string }[] = [
  {
    id: 'schema-invariants',
    label: 'Schema invariants',
    group: 'Schema',
    detail: 'scripts/check-schema-invariants.sh runs in CI only and persists no outcome to read.',
  },
  {
    id: 'business-contracts',
    label: 'Business contracts',
    group: 'Business contracts',
    detail: 'npm run test:business runs in CI only and persists no outcome to read.',
  },
];

function qualifierRows(results: readonly QualifierInvariantResult[] | null): InvariantLatticeRow[] {
  if (results === null) {
    return [
      {
        id: 'qualifiers-unreadable',
        label: 'Qualifier invariants',
        group: 'Qualifiers',
        state: 'unknown',
        detail: 'Could not be read this refresh.',
        severity: null,
        lastCheckedAt: null,
      },
    ];
  }

  return results.map((r) => ({
    id: `qualifier-${r.id}`,
    label: r.label,
    group: 'Qualifiers',
    state: r.violations > 0 ? 'fail' : 'pass',
    detail: r.violations > 0 ? `${r.violations} violation${r.violations === 1 ? '' : 's'}` : 'no violations found',
    severity: r.violations > 0 ? r.severity : null,
    lastCheckedAt: null,
  }));
}

function integrityRowsFor(rows: readonly IntegrityRow[] | null): InvariantLatticeRow[] {
  if (rows === null) {
    return [
      {
        id: 'integrity-unreadable',
        label: 'Data-integrity checks',
        group: 'Platform integrity',
        state: 'unknown',
        detail: 'Could not be read this refresh.',
        severity: null,
        lastCheckedAt: null,
      },
    ];
  }

  return rows.map((r) => ({
    id: `integrity-${r.check}`,
    label: r.check,
    group: 'Platform integrity',
    state: r.status === 'pass' ? 'pass' : 'fail',
    detail: r.status === 'pass' ? 'passing' : `${r.count} row${r.count === 1 ? '' : 's'} affected`,
    // A silent data-integrity violation always outranks an ordinary warning.
    severity: r.status === 'pass' ? null : 'critical',
    lastCheckedAt: r.lastRunAt,
  }));
}

function roundGraphRows(checks: readonly InvariantCheckOutcome[] | null): InvariantLatticeRow[] {
  if (checks === null) {
    return [
      {
        id: 'round-graph-unreadable',
        label: 'Round-graph invariants',
        group: 'Round graph',
        state: 'unknown',
        detail: 'Could not be read this refresh.',
        severity: null,
        lastCheckedAt: null,
      },
    ];
  }

  return checks.map((c) => ({
    id: `round-graph-${c.id}`,
    label: c.label,
    group: 'Round graph',
    state: c.state,
    detail: c.detail,
    // 'unknown' rows never carry a severity — matches every other source on
    // this lattice: a state that was never actually established cannot
    // outrank anything.
    severity: c.state === 'fail' ? c.severity : null,
    lastCheckedAt: c.checkedAt,
  }));
}

/** Pure. `qualifierInvariants`/`integrityRows`/`roundGraphChecks` are `null`
 *  only on a failed read of that specific source — never conflated with
 *  "checked, found nothing" (an empty array). `roundGraphChecks` is
 *  OPTIONAL (defaults to `null`, rendered as the same single unknown row a
 *  failed read produces) so a caller that predates Phase D.4.3 keeps
 *  compiling without a source it does not know to fetch yet. */
export function buildInvariantLattice(input: {
  qualifierInvariants: readonly QualifierInvariantResult[] | null;
  integrityRows: readonly IntegrityRow[] | null;
  roundGraphChecks?: readonly InvariantCheckOutcome[] | null;
}): InvariantLatticeView {
  const rows: InvariantLatticeRow[] = [
    ...qualifierRows(input.qualifierInvariants),
    ...integrityRowsFor(input.integrityRows),
    ...roundGraphRows(input.roundGraphChecks ?? null),
    ...UNREADABLE_SOURCES.map((s) => ({
      id: s.id,
      label: s.label,
      group: s.group,
      state: 'unknown' as const,
      detail: s.detail,
      severity: null,
      lastCheckedAt: null,
    })),
  ];

  return { rows, anyFailing: rows.some((r) => r.state === 'fail') };
}
