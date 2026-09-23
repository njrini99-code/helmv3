/**
 * ============================================================================
 * CoachHelm chat — the turn verdict (repair plan §14.10, "chat publication")
 * ----------------------------------------------------------------------------
 * Publication waits for validation. Before this module, `chat/stream/route.ts`
 * carried two independent booleans (`grounded`, `streamErrored`) that had to be
 * combined correctly at every call site, and a THIRD, unwritten rule lived only
 * in `onFinish`'s fallback: what to do when `execute` never got a chance to
 * compute either one at all (the client disconnected before the stream
 * finished). That third case defaulted to treating a bare, unaudited fragment
 * as grounded — the actual defect this module exists to close.
 *
 * `computeTurnVerdict` is the ONE place that decides accepted vs. rejected,
 * as an ORDERED list of checks — stream completeness first, then the numeric
 * claim audit — so a later check (claim-validator.ts, #1991, not wired yet)
 * slots in as one more step in the same list rather than a new boolean
 * threaded through every caller. The first check that rejects wins; nothing
 * downstream of a completeness failure is worth auditing, because there is no
 * complete answer to audit.
 * ========================================================================== */

import { auditNumericClaims } from './provenance';
import type { Measurement, MeasurementSeries, UnsupportedClaim } from './provenance';

// Rebase reconciliation (#1997 vs. a since-merged main commit): main grew
// `auditNumericClaims` two more optional params (extraSupportedDates, a
// coach-timezone-aware conversion) after this module was written against
// the shorter, 4-arg call shape. Threaded through `computeTurnVerdict` too
// so this module gets the same accuracy `auditNumericClaims`'s newer
// callers do, rather than silently degrading every turn to the older
// UTC-only, no-date-check behavior.

export type TurnVerdictReason = 'stream_incomplete' | 'ungrounded_claims';

export type TurnVerdict =
  | { outcome: 'accepted' }
  | {
      outcome: 'rejected';
      reason: TurnVerdictReason;
      /** Coach-facing prose for the failure affordance — never provider
       *  internals or prompt text (see `sanitiseStreamError` for why). */
      note: string;
      /** Populated only for `reason: 'ungrounded_claims'`. */
      unsupported: UnsupportedClaim[];
    };

export const STREAM_INCOMPLETE_NOTE =
  "This answer didn't finish coming through, so it's shown as a draft rather than a complete response. Please ask again.";

export const UNGROUNDED_NOTE =
  "Some figures in this answer could not be traced back to your program's data, so I've flagged it rather than presenting them as fact. Please ask again.";

/**
 * Whether the model's stream itself completed.
 *
 * `false` covers both a provider error mid-stream (an inline `error` chunk —
 * see route.ts's forwarding loop) and a stream that ended with no `finish`
 * chunk at all (a dropped client connection, or the platform tearing down
 * the function before the model call finished). Neither is a claim-quality
 * problem — the turn simply never reached a state worth auditing — so this
 * check runs FIRST and short-circuits the numeric audit entirely.
 */
export function computeTurnVerdict(args: {
  streamComplete: boolean;
  text: string;
  measurements: readonly Measurement[];
  series: readonly MeasurementSeries[];
  detailNumbers: readonly number[];
  /** Every ISO date reachable inside the turn's tool evidence — see
   *  {@link auditNumericClaims}'s `extraSupportedDates` param. Optional and
   *  defaults to none, matching that param's own backward-compatible
   *  default. */
  detailDates?: readonly string[];
  /** The coach's IANA zone — see {@link auditNumericClaims}'s `timezone`
   *  param. Omitted degrades to UTC-only day math, same as that param. */
  timezone?: string;
}): TurnVerdict {
  if (!args.streamComplete) {
    return { outcome: 'rejected', reason: 'stream_incomplete', note: STREAM_INCOMPLETE_NOTE, unsupported: [] };
  }

  const unsupported = auditNumericClaims(
    args.text,
    args.measurements,
    args.series,
    args.detailNumbers,
    args.detailDates,
    args.timezone,
  );
  if (unsupported.length > 0) {
    return { outcome: 'rejected', reason: 'ungrounded_claims', note: UNGROUNDED_NOTE, unsupported };
  }

  // A later check (claim-validator.ts, #1991) adds its own `return` here,
  // between this line and the accepted return below — its own reason and
  // note, same ordered-checks shape, no change to this function's signature
  // or to any caller.

  return { outcome: 'accepted' };
}

/**
 * The persisted UI part type for a rejected verdict, keyed by reason.
 *
 * `'ungrounded_claims'` keeps the pre-existing wire name (`data-grounding-
 * flag`) rather than renaming it: production already has rows carrying that
 * part type (N15, #1975), and `restore.ts`'s replay list is additive, never
 * a rename, so an already-persisted row keeps working. `'stream_incomplete'`
 * is a new, additive part type for a case that previously wrote nothing at
 * all.
 */
export function verdictPartType(reason: TurnVerdictReason): 'data-grounding-flag' | 'data-turn-incomplete' {
  return reason === 'ungrounded_claims' ? 'data-grounding-flag' : 'data-turn-incomplete';
}
