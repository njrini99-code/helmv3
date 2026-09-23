/**
 * v3 LLM structured claims block — parsing shared by every caller
 * (repair plan 14.10, Package 8 / addendum A7).
 *
 * `compose.ts` (round_review and the other non-streaming composers) and
 * `chat/stream/route.ts` (coach chat) both ask the model to append a
 * `<<<CLAIMS>>>...<<<END_CLAIMS>>>` block naming every factual/causal number
 * it cited, then hand the block to `claim-validator.ts`'s `validateClaims()`.
 * This module is the ONE place that finds, strips and parses that block, so
 * a delimiter-handling fix (MUST-1/MUST-2, #1991's own review) lives in one
 * spot instead of drifting between two copies. Extracted from `compose.ts`
 * (A7 slice, 2026-09-23) when chat became a second caller — compose's own
 * behavior is unchanged, only its imports moved.
 */

import { z } from 'zod';
import { validateClaims, type EvidencePacket } from './claim-validator';

export const CLAIMS_OPEN = '<<<CLAIMS>>>';
export const CLAIMS_CLOSE = '<<<END_CLAIMS>>>';
export const CLAIMS_BLOCK_RE = /<<<CLAIMS>>>([\s\S]*?)<<<END_CLAIMS>>>/;

export function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Remove every claims-block delimiter from `text`, however many there are:
 * every complete `<<<CLAIMS>>>...<<<END_CLAIMS>>>` pair (global, not just the
 * first — MUST-1, post-#1991 review: without `/g` a SECOND block survived a
 * `.replace()` into player text), everything from an unterminated opener
 * through the end of the string, and any stray closer with no matching
 * opener. Called on every malformed path so a duplicated or broken claims
 * block can never leave a literal delimiter or a raw JSON fragment in text a
 * player or coach reads.
 */
export function stripAllClaimsDelimiters(text: string): string {
  let out = text.replace(new RegExp(CLAIMS_BLOCK_RE.source, 'g'), '');
  const openIdx = out.indexOf(CLAIMS_OPEN);
  if (openIdx !== -1) out = out.slice(0, openIdx);
  out = out.split(CLAIMS_CLOSE).join('');
  return out.trim();
}

export const ClaimReferenceSchema = z.object({
  claim_id: z.string(),
  metric_id: z.string(),
  value: z.number(),
  player_id: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  claim_type: z.enum(['fact', 'causal']).optional(),
  /**
   * A7 (chat slice): "58%" and "58 strokes gained" are different claims over
   * the same number — without a unit on the claim, a value that matches
   * ANY metric with that number validates regardless of what the model said
   * it was. Optional so a compose() caller (never sets it) is unaffected;
   * see `checkClaim`'s `wrong_unit`.
   */
  unit: z.string().optional(),
  /**
   * A7 (chat slice): the attempts/rounds/shots the model said the number was
   * over. Distinct from `sample_n`'s FLOOR check below — this catches a real
   * value cited with a swapped denominator ("58% over 43 attempts" when the
   * packet's entry was actually observed over 18). Optional; unset for every
   * existing compose() caller.
   */
  denominator: z.number().nullable().optional(),
});
export type ClaimReference = z.infer<typeof ClaimReferenceSchema>;
export const ClaimsBlockSchema = z.array(ClaimReferenceSchema);

export interface TypedClaimAttempt {
  accepted: ReturnType<typeof validateClaims>['accepted'];
  rejected: ReturnType<typeof validateClaims>['rejected'];
  /** True when the claims block was absent or failed to parse. Distinct
   *  from a plain rejection: nothing here names a specific bad claim. */
  malformed: boolean;
}

/**
 * Strip the claims block (delimiters included) out of the raw model text
 * and parse it, when present, against `packet`. Never throws — a missing,
 * duplicated, unterminated, or invalid-JSON/-schema block comes back as
 * `malformed: true` rather than an exception, matching every caller's
 * contract that a provider or parsing problem never surfaces past this
 * module.
 *
 * `packet` is nullable/optional so a caller can opt out per turn (chat: a
 * team-level or multi-player turn has no single (player, window) to build a
 * packet for — see `chat/claims-packet.ts` — and the typed gate simply does
 * not engage for that turn; the legacy numeric scan still runs).
 *
 * With no packet, a block is still stripped if the raw text happens to
 * contain one — chat's system-prompt instruction to emit a block is
 * unconditional (built before any tool call, before it is knowable whether
 * THIS turn will resolve to a single-player packet at all), so a
 * multi-player/team turn can still produce a well-formed block that nothing
 * validates; it must never leak into the persisted or displayed text
 * regardless. When the raw text carries no block marker at all, it is
 * returned byte-identical (MUST-2, post-#1991 review) — every compose()
 * caller with no `evidence_packet` has never asked the model for one, so
 * this remains a no-op for it.
 *
 * More than one opener or closer (a duplicated block) and an opener with no
 * matching closer (an unterminated block) are BOTH malformed, not "use the
 * first one" — MUST-1 (post-#1991 review): a second, unparsed block must
 * never reach a reader as literal text.
 */
export function extractAndValidateClaims(
  rawText: string,
  packet: EvidencePacket | undefined | null,
): { strippedText: string; claims: TypedClaimAttempt | null } {
  if (!packet) {
    const hasMarker = rawText.includes(CLAIMS_OPEN) || rawText.includes(CLAIMS_CLOSE);
    return { strippedText: hasMarker ? stripAllClaimsDelimiters(rawText) : rawText, claims: null };
  }

  const strippedText = stripAllClaimsDelimiters(rawText);
  const openCount = countOccurrences(rawText, CLAIMS_OPEN);
  const closeCount = countOccurrences(rawText, CLAIMS_CLOSE);
  if (openCount !== 1 || closeCount !== 1) {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  // Exactly one opener and one closer exist, but they could still be in the
  // wrong order (closer before opener) — `.match` returns null in that case
  // rather than a false match, so this guard is load-bearing, not defensive
  // dead code.
  const match = rawText.match(CLAIMS_BLOCK_RE);
  if (!match) {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? '');
  } catch {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  const result = ClaimsBlockSchema.safeParse(parsed);
  if (!result.success) {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  const validated = validateClaims(result.data, packet, strippedText);
  return {
    strippedText,
    claims: { accepted: validated.accepted, rejected: validated.rejected, malformed: false },
  };
}

/**
 * `extractAndValidateClaims`, wrapped to fail closed instead of throwing.
 *
 * `validateClaims` is documented pure and every path inside
 * `extractAndValidateClaims` is already defensive (a JSON parse failure or a
 * schema mismatch comes back as `malformed: true`, never an exception) — but
 * `packet` itself is NOT independently schema-validated the way a model's
 * own claims block is; a caller-side bug building one (e.g.
 * `chat/claims-packet.ts` handing back a packet with a missing `entries`
 * array) could still throw from inside `checkClaim`'s own iteration. A
 * production coach must never see an unhandled 500 — or worse, an unverified
 * answer — because the SECOND-order gate itself broke, so this is the one
 * call site every caller should use instead of the raw function: any thrown
 * error is treated exactly like a malformed block (rejected, never a crash),
 * and the text is still stripped so a broken claims block can never leak
 * into what the caller returns or persists.
 */
export function extractAndValidateClaimsSafe(
  rawText: string,
  packet: EvidencePacket | undefined | null,
): { strippedText: string; claims: TypedClaimAttempt | null } {
  try {
    return extractAndValidateClaims(rawText, packet);
  } catch {
    const hasMarker = rawText.includes(CLAIMS_OPEN) || rawText.includes(CLAIMS_CLOSE);
    return {
      strippedText: hasMarker ? stripAllClaimsDelimiters(rawText) : rawText,
      claims: packet ? { accepted: [], rejected: [], malformed: true } : null,
    };
  }
}
