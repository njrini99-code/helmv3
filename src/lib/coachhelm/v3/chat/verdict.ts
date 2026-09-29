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
 * as an ORDERED list of checks — stream completeness, then the numeric claim
 * audit, then (addendum A7 slice 1, 2026-09-23) the typed claim gate from
 * `claim-validator.ts` (#1991) — so the first check that rejects wins;
 * nothing downstream of an earlier failure is worth checking, because there
 * is no complete, ungrounded-claim-free answer left to validate more finely.
 *
 * The typed gate is OPT-IN per turn: it only runs when `claims` is non-null,
 * which `chat/stream/route.ts` produces only with `coachhelm_chat_claim_gate`
 * on AND at least one player-scoped measurement in the turn. Since audit row
 * 47(a) that covers multi-player and multi-window turns too — each claim is
 * checked against the packet for its own (player, window); see
 * `chat/claims-packet.ts`'s `extractAndValidateChatClaims`. A team-only turn
 * has nothing to bind a player claim to and is judged by the two checks
 * above only, same as before this gate existed.
 * ========================================================================== */

import { auditNumericClaims } from './provenance';
import type { AuditPlayer, Measurement, MeasurementSeries, ScopedNumber, UnsupportedClaim } from './provenance';
import type { RejectedClaim } from '../llm/claim-validator';
import type { TypedClaimAttempt } from '../llm/claims-block';

// Rebase reconciliation (#1997 vs. a since-merged main commit): main grew
// `auditNumericClaims` two more optional params (extraSupportedDates, a
// coach-timezone-aware conversion) after this module was written against
// the shorter, 4-arg call shape. Threaded through `computeTurnVerdict` too
// so this module gets the same accuracy `auditNumericClaims`'s newer
// callers do, rather than silently degrading every turn to the older
// UTC-only, no-date-check behavior.

export type TurnVerdictReason = 'stream_incomplete' | 'ungrounded_claims' | 'claim_validation_failed';

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
      /** Populated only for `reason: 'claim_validation_failed'` — the typed
       *  gate's own rejected claims, `{claim_id, metric_id, reason}` only,
       *  mirroring `compose.ts`'s no-prose logging contract. */
      rejectedClaims?: RejectedClaim[];
    };

export const STREAM_INCOMPLETE_NOTE =
  "This answer didn't finish coming through, so it isn't being shown. Please ask again.";

export const UNGROUNDED_NOTE =
  "Some figures in this answer could not be traced back to your program's data, so I've flagged it rather than presenting them as fact. Please ask again.";

export const CLAIM_VALIDATION_FAILED_NOTE =
  "A figure in this answer didn't match your program's data for that player and window, so I've flagged it rather than presenting it as fact. Please ask again.";

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
  /** Numbers from the tools' `detail` payloads — bare, or scoped to a
   *  player/field by `collectScopedNumbers` (audit row 47b). */
  detailNumbers: readonly (number | ScopedNumber)[];
  /** Every ISO date reachable inside the turn's tool evidence — see
   *  {@link auditNumericClaims}'s `extraSupportedDates` param. Optional and
   *  defaults to none, matching that param's own backward-compatible
   *  default. */
  detailDates?: readonly string[];
  /** The coach's IANA zone — see {@link auditNumericClaims}'s `timezone`
   *  param. Omitted degrades to UTC-only day math, same as that param. */
  timezone?: string;
  /** The coach's roster, so the numeric audit can recognise a player named in
   *  the text and bind the number to them (audit row 47b). Optional; omitted,
   *  only the evidence's own entity labels are recognised. */
  players?: readonly AuditPlayer[];
  /**
   * The typed claim gate's result for this turn, or `null` when it did not
   * engage (no single-player packet — see `chat/claims-packet.ts`) or the
   * caller has not adopted it yet. Optional and defaults to `null` so this
   * remains additive for any existing caller.
   */
  claims?: TypedClaimAttempt | null;
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
    { players: args.players },
  );
  if (unsupported.length > 0) {
    return { outcome: 'rejected', reason: 'ungrounded_claims', note: UNGROUNDED_NOTE, unsupported };
  }

  // Addendum A7 slice 1: the typed claim gate, third and last check. A
  // malformed block (missing, duplicated, unterminated, or invalid JSON) is
  // treated the same as a rejected claim, not silently accepted — the model
  // was asked for one and its absence/breakage is itself a sign something is
  // wrong, mirroring compose.ts's own contract for an opted-in packet.
  const claims = args.claims ?? null;
  if (claims && (claims.malformed || claims.rejected.length > 0)) {
    return {
      outcome: 'rejected',
      reason: 'claim_validation_failed',
      note: CLAIM_VALIDATION_FAILED_NOTE,
      unsupported: [],
      rejectedClaims: claims.rejected,
    };
  }

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
 * all. `'claim_validation_failed'` (A7 slice 1) reuses `data-grounding-flag`
 * rather than minting a third part type — from the coach's point of view
 * both are the same signal ("a number in this answer didn't check out"), and
 * `restore.ts`/`ChatThread.tsx` already collapse either to just the note.
 */
export function verdictPartType(reason: TurnVerdictReason): 'data-grounding-flag' | 'data-turn-incomplete' {
  return reason === 'stream_incomplete' ? 'data-turn-incomplete' : 'data-grounding-flag';
}

/**
 * Why a turn was rejected, in the durable shape both the message's verdict
 * part and the `golf_coachhelm_llm_calls` row carry (audit row 47c). Bare
 * number literals and `metric_id:reason` pairs only — never prose, a player
 * name or a database value. `null` for an accepted turn.
 */
export interface VerdictRecord {
  reason: TurnVerdictReason;
  /** `ungrounded_claims`: the flagged numbers. `claim_validation_failed`:
   *  `metric_id:reason` per rejected claim. `stream_incomplete`: empty. */
  unmatched_tokens: string[];
  /** The subset of `unmatched_tokens` that exist in the evidence but under a
   *  different player or metric (row 47b). Omitted when there are none. */
  misattributed_tokens?: string[];
}

export function verdictRecord(verdict: TurnVerdict): VerdictRecord | null {
  if (verdict.outcome === 'accepted') return null;
  if (verdict.reason === 'claim_validation_failed') {
    return {
      reason: verdict.reason,
      unmatched_tokens: (verdict.rejectedClaims ?? []).map((r) => `${r.claim.metric_id || '(none)'}:${r.reason}`),
    };
  }
  const record: VerdictRecord = { reason: verdict.reason, unmatched_tokens: verdict.unsupported.map((c) => c.text) };
  const misattributed = verdict.unsupported.filter((c) => c.misattributed).map((c) => c.text);
  if (misattributed.length > 0) record.misattributed_tokens = misattributed;
  return record;
}

const VERDICT_PART_TYPES: ReadonlySet<string> = new Set(['data-grounding-flag', 'data-turn-incomplete']);

/**
 * The `ui_parts` to persist for a turn, with the verdict's reason attached
 * (audit row 47c). The part `execute` streamed carries only the coach-facing
 * note; this merges `{reason, unmatched_tokens, misattributed_tokens}` into
 * it, and APPENDS one when none was streamed — the path where `onFinish`
 * fires before `execute` ever reached a verdict, which used to store a
 * `'failed'` row with no reason anywhere. `restore.ts` reads only
 * `data.note`, so the extra fields never change what a coach sees.
 */
export function withVerdictPart(parts: readonly unknown[], verdict: TurnVerdict): unknown[] {
  const record = verdictRecord(verdict);
  if (!record || verdict.outcome !== 'rejected') return [...parts];
  let merged = false;
  const out = parts.map((p) => {
    if (merged || !p || typeof p !== 'object') return p;
    const part = p as { type?: unknown; data?: unknown };
    if (typeof part.type !== 'string' || !VERDICT_PART_TYPES.has(part.type)) return p;
    merged = true;
    const data = part.data && typeof part.data === 'object' ? (part.data as Record<string, unknown>) : {};
    return { ...part, data: { ...data, note: typeof data.note === 'string' ? data.note : verdict.note, ...record } };
  });
  if (!merged) {
    out.push({ type: verdictPartType(verdict.reason), id: 'turn-verdict', data: { note: verdict.note, ...record } });
  }
  return out;
}

