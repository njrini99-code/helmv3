/**
 * v3 LLM typed claim validator (Package 8 slice 1, repair plan 14.10).
 *
 * `citations.ts` scans free text for numeric tokens and checks each one
 * against a FLAT set of evidence values — it has no concept of which
 * metric a number was cited FOR. That is enough to catch a fabricated
 * number but not a MISATTRIBUTED one: a model can cite a real value from
 * the evidence packet under the wrong metric, the wrong player, or the
 * wrong time window and the legacy scan sees nothing wrong, because the
 * value itself really is in the evidence set.
 *
 * This module closes that gap for callers that opt in by supplying an
 * `EvidencePacket`: the model emits STRUCTURED claim references (claim
 * id, metric id, value, player id, window) alongside its prose, and
 * `validateClaims` checks each one against the packet the caller actually
 * built — not against what the model merely typed.
 *
 * This is additive. `citations.ts`'s numeric scan stays wired in
 * compose.ts as defense in depth (a model could still emit an unclaimed
 * number the typed gate never sees); this module is a second, narrower
 * gate for callers that pass typed evidence.
 */

import type { CausalityLevel, DiagnosisDriver } from '@/lib/coachhelm/v2/insights/types';
import { MIN_SAMPLE_N } from '@/lib/coachhelm/v2/insights/upsert';
import { extractNumericTokens, normalize, SAFE_NUMERIC_TOKENS } from './citations';

/** One claim the model asserts, tied to a specific metric/player/window. */
export interface ClaimReference {
  claim_id: string;
  metric_id: string;
  value: number;
  player_id: string;
  window_start: string; // ISO
  window_end: string; // ISO
  /** Set when the claim asserts a CAUSE, not just a measured fact.
   *  Defaults to 'fact' — only a causal claim is checked against the
   *  packet entry's causal backing. */
  claim_type?: 'fact' | 'causal';
}

/**
 * Causal backing for one evidence entry (P0-06 vocabulary, reused from
 * `v2/insights/types.ts` rather than re-invented here). A causal claim
 * needs BOTH a causality level and at least one quantified driver —
 * `causality_level` alone is an unsupported assertion with no data behind
 * it.
 */
export interface CausalSupport {
  causality_level: CausalityLevel;
  drivers: DiagnosisDriver[];
}

/** One metric's evidence for the packet's (player_id, window). */
export interface EvidencePacketEntry {
  metric_id: string;
  value: number;
  sample_n: number;
  causal_support?: CausalSupport;
}

/**
 * The evidence a compose() caller actually built, scoped to ONE player and
 * ONE window — matching how round_review (the only wired-in slice-1
 * caller-to-be) always composes: one player, one round. A claim whose
 * player_id/window doesn't match the packet's own is rejected before its
 * metric is even looked up.
 */
export interface EvidencePacket {
  player_id: string;
  window_start: string; // ISO
  window_end: string; // ISO
  entries: EvidencePacketEntry[];
}

export type ClaimRejectionReason =
  | 'wrong_player'
  | 'wrong_window'
  | 'unknown_metric'
  | 'wrong_field'
  | 'value_mismatch'
  | 'unsupported_small_number'
  | 'unsupported_cause'
  | 'uncited_number';

export interface RejectedClaim {
  claim: ClaimReference;
  reason: ClaimRejectionReason;
}

export interface ClaimValidationResult {
  accepted: ClaimReference[];
  rejected: RejectedClaim[];
  /** True only when nothing was rejected. A claim-free response with no
   *  uncited numbers is renderable; any rejection — including an uncited
   *  number outside the claims block — is not. */
  renderable: boolean;
}

const VALUE_TOLERANCE = 0.005;

function valuesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < VALUE_TOLERANCE;
}

/**
 * Validate a batch of typed claim references against the evidence packet
 * they were supposedly drawn from, then check the surrounding prose for
 * numbers no accepted claim accounts for.
 *
 * Fixed check order per claim — player, then window, then metric
 * existence, then value, then the sample floor, then causal backing —
 * so every fixture trips exactly one reason and reordering never changes
 * which check "wins" for a claim broken in more than one way.
 */
export function validateClaims(
  claims: ClaimReference[],
  packet: EvidencePacket,
  prose: string,
): ClaimValidationResult {
  const accepted: ClaimReference[] = [];
  const rejected: RejectedClaim[] = [];

  for (const claim of claims) {
    const reason = checkClaim(claim, packet);
    if (reason) {
      rejected.push({ claim, reason });
    } else {
      accepted.push(claim);
    }
  }

  // Vacuous-pass guard: a model that emits zero claims (or claims a
  // rejection has already discarded) must not trivially render. A number
  // that maps to a claim's value is "explained" by that claim's own
  // rejection reason — checking it AGAIN here would double-report one
  // mistake under two reasons. This only catches a number in the prose
  // that no claim, accepted or rejected, ever attempted to cite at all.
  const claimedValues = new Set(claims.map((c) => normalize(String(c.value))));
  const proseTokens = extractNumericTokens(prose);
  let uncitedIndex = 0;
  for (const tok of proseTokens) {
    const normalized = normalize(tok);
    if (SAFE_NUMERIC_TOKENS.has(normalized)) continue;
    if (claimedValues.has(normalized)) continue;
    rejected.push({
      claim: {
        claim_id: `uncited:${uncitedIndex++}`,
        metric_id: '',
        value: Number(tok),
        player_id: packet.player_id,
        window_start: packet.window_start,
        window_end: packet.window_end,
      },
      reason: 'uncited_number',
    });
  }

  return {
    accepted,
    rejected,
    renderable: rejected.length === 0,
  };
}

function checkClaim(claim: ClaimReference, packet: EvidencePacket): ClaimRejectionReason | null {
  if (claim.player_id !== packet.player_id) return 'wrong_player';
  if (claim.window_start !== packet.window_start || claim.window_end !== packet.window_end) {
    return 'wrong_window';
  }

  const entry = packet.entries.find((e) => e.metric_id === claim.metric_id);
  if (!entry) return 'unknown_metric';

  if (!valuesMatch(claim.value, entry.value)) {
    // The value didn't match ITS claimed metric — but does it belong to a
    // DIFFERENT metric in the same packet? If so the model cited a real
    // number under the wrong field, distinct from fabricating one outright.
    const misattributed = packet.entries.some(
      (e) => e.metric_id !== claim.metric_id && valuesMatch(claim.value, e.value),
    );
    return misattributed ? 'wrong_field' : 'value_mismatch';
  }

  if (entry.sample_n < MIN_SAMPLE_N) return 'unsupported_small_number';

  if (claim.claim_type === 'causal') {
    const support = entry.causal_support;
    if (!support || support.drivers.length === 0) return 'unsupported_cause';
  }

  return null;
}
