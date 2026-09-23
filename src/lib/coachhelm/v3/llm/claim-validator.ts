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
  /**
   * A7 (chat slice, 2026-09-23): the unit the model said this value was in.
   * Optional and unset by every compose() caller — a value cited under the
   * right metric/player/window can still be presented in the wrong unit
   * ("58 strokes gained" for a value that is actually a make-rate percent),
   * which neither the flat numeric scan nor a bare value match can see.
   * Checked only when both this and the matched entry's own `unit` are
   * present, so an entry with no declared unit does not spuriously reject
   * every claim against it.
   */
  unit?: string;
  /**
   * A7 (chat slice): the attempts/rounds/shots the model said this value was
   * measured over. Distinct from `sample_n`'s floor check below — a model
   * can cite a packet's real value while attributing it to the WRONG
   * denominator ("58% over 43 attempts" when the entry was actually 18
   * attempts), which reads as fully grounded to a bare value/metric check.
   * Optional; unset by every compose() caller.
   */
  denominator?: number | null;
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
  /**
   * `'measurement'`: a direct, single-observation fact (a round's own
   * score, putts, fairways hit — there is no "n" to sample, the count
   * IS the fact). Exempt from the `MIN_SAMPLE_N` floor below.
   * `'aggregate'`: a value computed over multiple observations (a
   * multi-round rate, a season average) — floored at `MIN_SAMPLE_N`,
   * same as the v2 insight-writer contract this reuses.
   *
   * Defaults to `'aggregate'` when omitted so an unlabeled entry fails
   * safe (floored), rather than an entry silently skipping the floor
   * because a producer forgot to set this.
   */
  kind?: 'measurement' | 'aggregate';
  causal_support?: CausalSupport;
  /**
   * A7 (chat slice): this entry's own unit ('percent', 'strokes', 'yards',
   * 'feet', 'count', 'score', 'ratio' — `Measurement.unit`'s vocabulary, but
   * left as a bare string here rather than importing chat's schema, since
   * this module has no other dependency on `chat/provenance.ts`). Optional
   * so a compose() caller that never sets it is unaffected; `wrong_unit`
   * only fires when a claim declares its own `unit` AND this entry declares
   * one, and they differ.
   */
  unit?: string;
  /**
   * A7 (chat slice): the denominator (attempts/rounds/shots) this entry's
   * value was actually computed over, when the metric is a rate. Optional
   * for the same reason as `unit` — `wrong_denominator` only fires when
   * both a claim's and this entry's denominator are present and differ.
   */
  denominator?: number | null;
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
  | 'uncited_number'
  /** A7 (chat slice): the claim's own `unit` disagrees with the matched
   *  entry's `unit`. Only checked when both declare one. */
  | 'wrong_unit'
  /** A7 (chat slice): the claim's own `denominator` disagrees with the
   *  matched entry's `denominator`. Only checked when both declare one. */
  | 'wrong_denominator';

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

// Claims and packet entries both carry plain `number`s (never the
// string-typed `EvidenceClaim.value` citations.ts deals with), so exact
// float equality would be the naive choice — this tolerance exists only
// for a value that crossed a JSON round-trip or a display-rounding step
// upstream (e.g. a caller building a claim from a `.toFixed(1)` string it
// re-parsed): 0.005 is half of the smallest increment (0.01) a 1-decimal
// percentage or strokes-gained figure can differ by, so two renderings of
// the SAME true value always match while any real difference still trips
// `wrong_field`/`value_mismatch`.
const VALUE_TOLERANCE = 0.005;

function valuesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < VALUE_TOLERANCE;
}

/**
 * Causal-language markers in free text: "because", "due to", "caused by",
 * "led to", "as a result", "which is why", and near-synonyms.
 *
 * SHOULD-3 (post-#1991 review): a model can write causal PROSE while
 * tagging its structured claim `claim_type: 'fact'` (or omitting the
 * field) — `checkClaim`'s causal-backing check only ever runs when the
 * claim itself declares `'causal'`, so an untagged causal sentence would
 * sail through with no backing check at all. This scans the rendered
 * prose independently of what the model DECLARED, closing that gap: the
 * model's own label is not trusted.
 */
const CAUSAL_LANGUAGE_RE =
  /\b(because|due to|caused? by|(?:has |have |had )?led to|leads? to|leading to|as a result(?: of)?|which is why|the reason (?:is|for|was)|results? in|resulting in|resulted in)\b/i;

/**
 * Hole numbers (1-18), par values (3/4/5), and written-out dates ("Sept
 * 12" / "September 12th") — numbers that describe the STRUCTURE of a
 * round rather than assert a fact needing evidence backing. SHOULD-4
 * (post-#1991 review): these were tripping `uncited_number` on otherwise
 * good text, since nothing registers "hole 14" as an evidence value.
 * Deliberately narrow (requires the structural keyword immediately
 * beside the number) so a bare number elsewhere is still scrutinised.
 */
const HOLE_NUMBER_RE = /\bhole\s*#?\s*(\d{1,2})\b/gi;
const PAR_RE = /\bpar[\s-]?(3|4|5)\b/gi;
const MONTH_DAY_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;

function structurallyExemptTokens(prose: string): Set<string> {
  const exempt = new Set<string>();
  for (const re of [HOLE_NUMBER_RE, PAR_RE, MONTH_DAY_RE]) {
    for (const m of prose.matchAll(re)) {
      if (m[1]) exempt.add(normalize(m[1]));
    }
  }
  return exempt;
}

/**
 * Validate a batch of typed claim references against the evidence packet
 * they were supposedly drawn from, then check the surrounding prose for
 * numbers no accepted claim accounts for and for causal language no
 * claim backs.
 *
 * Fixed check order per claim — player, then window, then metric
 * existence, then value, then unit, then denominator, then the sample
 * floor, then causal backing — so every fixture trips exactly one reason
 * and reordering never changes which check "wins" for a claim broken in
 * more than one way.
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
  // that no claim, accepted or rejected, ever attempted to cite at all,
  // is not one of the packet's own values cited informally (SHOULD-4),
  // and is not part of a structural mention (hole/par/date, SHOULD-4).
  const claimedValues = new Set(claims.map((c) => normalize(String(c.value))));
  const packetValues = new Set(packet.entries.map((e) => normalize(String(e.value))));
  // Chat re-review (2026-09-23): "across 43 attempts" in otherwise-honest
  // prose was tripping `uncited_number` — only a claim's or entry's VALUE
  // ever counted as citable, never the denominator/sample size the value
  // was computed OVER. The legacy numeric audit (`auditNumericClaims`,
  // `chat/provenance.ts`) already treats a denominator as supported; this
  // typed gate was narrower and rejected real answers because of it.
  // Scoped to entries an ACCEPTED claim actually names — not every entry in
  // the packet — so an unrelated metric's denominator can never "support" a
  // fabricated number about a different one it was never cited alongside.
  for (const c of accepted) {
    const entry = packet.entries.find((e) => e.metric_id === c.metric_id);
    if (!entry) continue;
    if (entry.denominator !== undefined && entry.denominator !== null) {
      packetValues.add(normalize(String(entry.denominator)));
    }
    packetValues.add(normalize(String(entry.sample_n)));
  }
  const structuralExempt = structurallyExemptTokens(prose);
  const proseTokens = extractNumericTokens(prose);
  let uncitedIndex = 0;
  for (const tok of proseTokens) {
    const normalized = normalize(tok);
    if (SAFE_NUMERIC_TOKENS.has(normalized)) continue;
    if (claimedValues.has(normalized)) continue;
    if (packetValues.has(normalized)) continue;
    if (structuralExempt.has(normalized)) continue;
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

  // SHOULD-3: causal PROSE with no accepted claim actually tagged and
  // backed as causal. Independent of any individual claim's own
  // `claim_type` — a claim mistagged (or left) 'fact' does not exempt
  // causal-sounding prose from needing backing.
  const hasCausalLanguage = CAUSAL_LANGUAGE_RE.test(prose);
  const hasBackedCausalClaim = accepted.some((c) => c.claim_type === 'causal');
  // A claim properly tagged 'causal' but lacking backing already earned
  // its own unsupported_cause rejection via checkClaim — don't ALSO add
  // the prose-level synthetic one for the same underlying mistake. This
  // check exists for causal prose NO claim was ever tagged to cover.
  const alreadyFlagged = rejected.some((r) => r.reason === 'unsupported_cause');
  if (hasCausalLanguage && !hasBackedCausalClaim && !alreadyFlagged) {
    rejected.push({
      claim: {
        claim_id: 'unsupported-cause:prose',
        metric_id: '',
        value: 0,
        player_id: packet.player_id,
        window_start: packet.window_start,
        window_end: packet.window_end,
      },
      reason: 'unsupported_cause',
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

  // A7 (chat slice): the value matched, but is it the same STATEMENT? A
  // model can cite a packet's real number while mislabeling its unit or its
  // denominator — neither is visible to a bare value comparison, since the
  // value itself is correct. Only checked when both sides declare the
  // field, so an entry (or a compose() claim, which never sets either)
  // with nothing to compare against never spuriously rejects.
  if (claim.unit !== undefined && entry.unit !== undefined && claim.unit !== entry.unit) {
    return 'wrong_unit';
  }
  if (
    claim.denominator !== undefined &&
    claim.denominator !== null &&
    entry.denominator !== undefined &&
    entry.denominator !== null &&
    claim.denominator !== entry.denominator
  ) {
    return 'wrong_denominator';
  }

  // A 'measurement' entry (a round's own score/putts/fairways) has no "n"
  // to sample — the count IS the fact. Only an 'aggregate' entry (a
  // multi-round rate or average) is floored. Unlabeled defaults to
  // 'aggregate' so it fails safe.
  //
  // #1999 re-review, NICE: `sample_n === 0` is never a real "the count IS
  // the fact" measurement — it means zero rounds/attempts actually backed
  // this entry, which is a builder bug or a genuinely empty window, not
  // evidence. Checked BEFORE the 'measurement' exemption so a zero-support
  // entry can never dodge the floor just by being labeled 'measurement'.
  if (entry.sample_n === 0) {
    return 'unsupported_small_number';
  }
  if ((entry.kind ?? 'aggregate') === 'aggregate' && entry.sample_n < MIN_SAMPLE_N) {
    return 'unsupported_small_number';
  }

  if (claim.claim_type === 'causal') {
    const support = entry.causal_support;
    if (!support || support.drivers.length === 0) return 'unsupported_cause';
  }

  return null;
}
