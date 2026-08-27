/**
 * Self-healing decisions: what the reliability cron should archive, and what it
 * should drag back into view.
 *
 * Pure on purpose — every rule below is a judgement about production state, and
 * a judgement that can only be exercised against production is one nobody can
 * test. The I/O lives in `resolution-io.ts`.
 *
 * THE TWO DECISIONS
 * -----------------
 * AUTO-RESOLVE. A fault stops appearing after a deploy. That is the ordinary
 * shape of "someone fixed it", and it is the only evidence available without a
 * human saying so — nothing in the events themselves announces a fix.
 *
 * REOPEN. An archived fault appears again. That is a regression, and it is the
 * single most valuable thing this system can tell you: "we already fixed this
 * and it came back" is a completely different fact from "this is broken".
 *
 * WHY A DEPLOY IS REQUIRED FOR AUTO-RESOLVE
 * -----------------------------------------
 * Silence alone is not evidence of a fix. A nightly cron that fails once a day
 * is silent for 23 hours; a seasonal feature is silent all summer; an outage
 * that ended on its own is silent until it returns. Requiring a production
 * deploy AFTER the last occurrence is what separates "someone shipped
 * something and the fault stopped" from "nothing happened to be running".
 *
 * It is still an inference, not proof — which is exactly why the resolution it
 * writes is marked `auto` and never overwrites a human's `manual` decision, and
 * why the Bridge must present the two differently.
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

export interface ResolutionInputs {
  /** Faults with at least one occurrence in the collector's window. */
  openFaults: readonly OpenFault[];
  /** Current resolution rows, keyed however the caller likes. */
  resolutions: readonly ExistingResolution[];
  /**
   * When production last shipped. Null when Vercel could not be read — and that
   * is NOT treated as "no deploy": with an unknown deploy time nothing is
   * auto-resolved at all, because the alternative is archiving live faults on a
   * false premise. Reopening still works, since it needs no deploy evidence.
   */
  productionDeployedAt: string | null;
  /** Commit SHA currently in production, recorded on the resolution. */
  productionSha: string | null;
  now: Date;
  /** A fault must be silent at least this long before auto-resolution. */
  quietHours?: number;
}

export interface AutoResolveDecision {
  fingerprint: string;
  lastSeenAt: string;
  reason: string;
}

export interface ReopenDecision {
  fingerprint: string;
  lastSeenAt: string;
  resolvedAt: string;
  reason: string;
}

export interface ResolutionPlan {
  autoResolve: AutoResolveDecision[];
  reopen: ReopenDecision[];
  /** Why nothing was auto-resolved, when that is the case. Never silent. */
  autoResolveBlockedReason: string | null;
}

/**
 * Minimum silence before a fault may be archived.
 *
 * 24h is chosen so a DAILY cron gets at least one scheduled chance to fail
 * again before its fault is archived. A shorter window would archive a nightly
 * job's failure during the day and reopen it every night — churn that reads as
 * a regression storm and is really just the schedule.
 */
export const DEFAULT_QUIET_HOURS = 24;

function hoursBetween(fromIso: string, to: Date): number {
  const ms = to.getTime() - new Date(fromIso).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : Number.NaN;
}

/**
 * Decide what to archive and what to bring back.
 *
 * Reopen is evaluated FIRST and wins: a fault that recurred after its
 * resolution is a regression even if it has since gone quiet again, and
 * archiving it in the same pass would erase the signal it exists to raise.
 */
export function planResolutions(input: ResolutionInputs): ResolutionPlan {
  const quietHours = input.quietHours ?? DEFAULT_QUIET_HOURS;
  const byFingerprint = new Map(input.resolutions.map((r) => [r.fingerprint, r]));

  const reopen: ReopenDecision[] = [];
  const autoResolve: AutoResolveDecision[] = [];

  for (const fault of input.openFaults) {
    const resolution = byFingerprint.get(fault.fingerprint);

    if (resolution) {
      // Compare against the last occurrence known AT RESOLUTION, not against
      // resolvedAt. A fault that fired once more between the fix landing and
      // the cron noticing is not a regression — the resolver already knew about
      // that occurrence. Falling back to resolvedAt when the column is null
      // keeps older rows working.
      const baseline = resolution.lastSeenAtResolution ?? resolution.resolvedAt;
      const isNewer = new Date(fault.lastSeenAt).getTime() > new Date(baseline).getTime();
      if (isNewer && !resolution.reopenedAt) {
        reopen.push({
          fingerprint: fault.fingerprint,
          lastSeenAt: fault.lastSeenAt,
          resolvedAt: resolution.resolvedAt,
          reason:
            `recurred at ${fault.lastSeenAt}, after being resolved ` +
            `(${resolution.resolutionSource}) at ${resolution.resolvedAt}`,
        });
      }
      // Already-resolved faults are never re-archived here: either they
      // regressed (handled above) or they are correctly quiet and need nothing.
      continue;
    }

    // Unresolved fault. Archive only when BOTH hold: it has been quiet long
    // enough, and production shipped something after its last occurrence.
    if (!input.productionDeployedAt) continue;

    const quietFor = hoursBetween(fault.lastSeenAt, input.now);
    if (!Number.isFinite(quietFor) || quietFor < quietHours) continue;

    const deployedAfter =
      new Date(input.productionDeployedAt).getTime() > new Date(fault.lastSeenAt).getTime();
    if (!deployedAfter) continue;

    autoResolve.push({
      fingerprint: fault.fingerprint,
      lastSeenAt: fault.lastSeenAt,
      reason:
        `no occurrence for ${Math.floor(quietFor)}h, and production deployed at ` +
        `${input.productionDeployedAt} after the last one`,
    });
  }

  return {
    autoResolve,
    reopen,
    // Say why nothing was archived rather than reporting an empty list that
    // reads as "nothing qualified".
    autoResolveBlockedReason: input.productionDeployedAt
      ? null
      : 'no production deploy timestamp available — auto-resolution is skipped rather than guessed',
  };
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
