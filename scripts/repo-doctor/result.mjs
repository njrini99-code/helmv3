// Result model for repo:doctor. Statuses are richer than pass/fail on purpose —
// collapsing "external unavailable" or "drift" into FAIL loses the information a
// human needs to act. See config/repo/manifest.yml and the spec.

export const Status = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  DRIFT: 'DRIFT',       // desired ≠ live/observed
  STALE: 'STALE',       // a derived artifact no longer matches its source
  UNKNOWN: 'UNKNOWN',   // could not determine (e.g. external unavailable)
  BLOCKED: 'BLOCKED',   // a check itself crashed — never silently green
  LOCAL_ONLY: 'LOCAL_ONLY',
});

// Which statuses count as a hard failure (exit 1). UNKNOWN/BLOCKED map to
// distinct exit codes so "couldn't check" is never reported as "passed".
const HARD = new Set([Status.FAIL, Status.DRIFT, Status.STALE]);

/** A single finding. */
export function check(id, status, title, extra = {}) {
  return { id, status, title, ...extra };
}

/**
 * Aggregate a flat list of checks into a run result with exit-code semantics:
 *   0 = all clean
 *   1 = one or more hard invariants failed (FAIL/DRIFT/STALE)
 *   2 = a check crashed (BLOCKED) — fail closed, never green
 *   3 = required external state could not be retrieved (UNKNOWN present, no hard fails)
 */
export function summarize(checks, meta = {}) {
  const counts = {};
  for (const s of Object.values(Status)) counts[s] = 0;
  for (const c of checks) counts[c.status] = (counts[c.status] ?? 0) + 1;

  let exitCode = 0;
  if (counts[Status.BLOCKED] > 0) exitCode = 2;
  else if (checks.some((c) => HARD.has(c.status))) exitCode = 1;
  else if (counts[Status.UNKNOWN] > 0) exitCode = 3;

  return {
    ok: exitCode === 0,
    exitCode,
    ...meta,
    counts,
    checks,
  };
}
