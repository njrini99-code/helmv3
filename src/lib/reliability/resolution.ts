/**
 * Regression detection: which archived faults have come BACK.
 *
 * Pure on purpose — every rule below is a judgement about production state, and
 * a judgement that can only be exercised against production is one nobody can
 * test.
 *
 * WHY THIS MODULE DOES NOT DECIDE WHAT TO ARCHIVE
 * ----------------------------------------------
 * It used to. That was a mistake, and a specific one rather than a stylistic
 * one: `autoResolveFixedIncidents` (src/lib/admin/auto-resolve.ts) has decided
 * what is fixed since long before this module existed, and it carries an
 * exclusion this module did not.
 *
 * Its Rule A — quiet since a production deploy that is at least 24h old — is
 * the same inference this module's archive branch made. But Rule A also skips
 * every OPERATOR-GATED fault: `provider_*_credit_exhausted`,
 * `_invalid_credential`, `_missing_credential`, `_plan_gated_model`. Those fire
 * only when something exercises the path, so a quiet weekend is
 * indistinguishable from a fix, and no deploy has ever topped up a billing
 * account or rotated a key. Measured in production 2026-08-06: EVERY provider
 * fault in the table had been flagged resolved while still broken — one sat
 * closed for ten days with a dead credential.
 *
 * A second archive rule without that exclusion would have re-earned that bug at
 * full price. So the decision stays in ONE place, made once, and this module
 * keeps the half that nothing else provides.
 *
 * REOPEN — the piece that genuinely has no other home. auto-resolve.ts's own
 * doc says regression semantics "need no extra code" because a fault that fires
 * again arrives as a fresh unresolved row. It does — carrying no memory that it
 * was ever fixed, by what, or how many times this has happened. "We already
 * fixed this and it came back" is a completely different fact from "this is
 * broken", and only the fingerprint-level resolution record can tell them
 * apart.
 */

export interface OpenFault {
  fingerprint: string;
  /** Most recent occurrence observed in the window. */
  lastSeenAt: string;
  occurrences: number;
}

export interface ExistingResolution {
  fingerprint: string;
  resolvedAt: string;
  resolutionSource: 'auto' | 'manual';
  /** Last occurrence known when it was resolved. Null for older rows. */
  lastSeenAtResolution: string | null;
  reopenedAt: string | null;
}

export interface ReopenInputs {
  /** Faults with at least one occurrence in the caller's window. */
  openFaults: readonly OpenFault[];
  /** Current resolution rows, keyed however the caller likes. */
  resolutions: readonly ExistingResolution[];
}

export interface ReopenDecision {
  fingerprint: string;
  lastSeenAt: string;
  resolvedAt: string;
  reason: string;
}

/**
 * Which archived faults have recurred since they were archived.
 *
 * A fault with no resolution row cannot regress — it was never claimed fixed —
 * so it is skipped rather than treated as anything. Deciding whether such a
 * fault should now be archived is `autoResolveFixedIncidents`'s job; see the
 * module doc for why that is deliberately not here.
 */
export function planReopens(input: ReopenInputs): ReopenDecision[] {
  const byFingerprint = new Map(input.resolutions.map((r) => [r.fingerprint, r]));
  const reopen: ReopenDecision[] = [];

  for (const fault of input.openFaults) {
    const resolution = byFingerprint.get(fault.fingerprint);
    if (!resolution) continue;

    // Compare against the last occurrence known AT RESOLUTION, not against
    // resolvedAt. A fault that fired once more between the fix landing and the
    // cron noticing is not a regression — the resolver already knew about that
    // occurrence, and comparing against resolvedAt would cry wolf on every
    // fix. Falling back to resolvedAt when the column is null keeps older rows
    // working.
    const baseline = resolution.lastSeenAtResolution ?? resolution.resolvedAt;
    const isNewer = new Date(fault.lastSeenAt).getTime() > new Date(baseline).getTime();

    // `reopenedAt` already set means this regression has been raised. Without
    // this check a fault firing every three hours would raise a fresh
    // regression every tick — noise that buries the signal it is made of.
    if (!isNewer || resolution.reopenedAt) continue;

    reopen.push({
      fingerprint: fault.fingerprint,
      lastSeenAt: fault.lastSeenAt,
      resolvedAt: resolution.resolvedAt,
      reason:
        `recurred at ${fault.lastSeenAt}, after being resolved ` +
        `(${resolution.resolutionSource}) at ${resolution.resolvedAt}`,
    });
  }

  return reopen;
}

/** Whether a resolved fault's fix is actually live, for the Bridge to render. */
export type ShipStatus = 'shipped' | 'pending' | 'unknown';

/**
 * Has the fix shipped?
 *
 * Three outcomes, never two. `unknown` exists because Vercel can be unreachable,
 * and rendering that as `pending` would tell an operator their fix has not
 * shipped when the truth is that we could not find out.
 */
export function shipStatus(input: {
  fixedInSha: string | null;
  resolvedAt: string;
  productionSha: string | null;
  productionDeployedAt: string | null;
}): ShipStatus {
  if (!input.productionSha && !input.productionDeployedAt) return 'unknown';

  // Exact match is the strongest evidence available without git ancestry.
  if (input.fixedInSha && input.productionSha) {
    const a = input.fixedInSha.toLowerCase();
    const b = input.productionSha.toLowerCase();
    if (a.startsWith(b) || b.startsWith(a)) return 'shipped';
  }

  // Otherwise fall back to time: a production deploy after the resolution was
  // recorded almost certainly carries it. Weaker, and deliberately not reported
  // as an exact-SHA match.
  if (input.productionDeployedAt) {
    return new Date(input.productionDeployedAt).getTime() >= new Date(input.resolvedAt).getTime()
      ? 'shipped'
      : 'pending';
  }

  return 'unknown';
}
