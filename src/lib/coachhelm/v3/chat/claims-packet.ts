/**
 * ============================================================================
 * CoachHelm chat — the typed claim gate's opt-in packet (addendum A7 slice 1,
 * repair plan 14.10)
 * ----------------------------------------------------------------------------
 * `claim-validator.ts`'s `EvidencePacket` is scoped to exactly ONE player and
 * ONE window — that is how compose()'s existing callers (round_review) always
 * shape their evidence. A coach chat turn is not always that shape: "how did
 * Alice do this month" is, but "who's struggling on the greens" or "compare
 * Alice and Bob" is a team- or multi-player question with no single (player,
 * window) pair to validate typed claims against.
 *
 * `buildSinglePlayerPacket` returns a packet only when THIS turn's fresh,
 * player-scoped measurements resolve to exactly one player and one shared
 * window — mirroring compose()'s own opt-in contract (`req.evidence_packet`
 * is optional; the typed gate simply does not run when a caller has nothing
 * to build one from). Returning `null` here means `computeTurnVerdict`'s
 * claim-validation check does not engage for this turn, and the turn is
 * still covered by the legacy numeric audit (`auditNumericClaims`) exactly as
 * before — failing the typed check CLOSED on an ambiguous turn would reject
 * most of chat, which is the opposite of what a "slice 1" opt-in gate is for.
 * ========================================================================== */

import type { Measurement } from './provenance';
import {
  validateClaims,
  type ClaimReference,
  type EvidencePacket,
  type EvidencePacketEntry,
  type RejectedClaim,
} from '../llm/claim-validator';
import {
  CLAIMS_BLOCK_RE,
  CLAIMS_CLOSE,
  CLAIMS_OPEN,
  ClaimsBlockSchema,
  countOccurrences,
  stripAllClaimsDelimiters,
  type TypedClaimAttempt,
} from '../llm/claims-block';

/**
 * A measurement's own `sample_size` describes how many observations produced
 * its value. A `sample_size` of 0 or 1 has no "n" to sample — a single
 * round's own score or putt count IS the fact, not an aggregate — so it maps
 * to `kind: 'measurement'` (exempt from `claim-validator.ts`'s MIN_SAMPLE_N
 * floor). Anything aggregated over 2+ observations maps to `'aggregate'`
 * (floored), matching the floor's own reasoning in `checkClaim`.
 */
function entryKind(m: Measurement): EvidencePacketEntry['kind'] {
  return m.sample_size <= 1 ? 'measurement' : 'aggregate';
}

/**
 * Build a single-player, single-window `EvidencePacket` from this turn's
 * fresh measurements, or `null` when the turn is not that shape.
 *
 * Only `entity.kind === 'player'` measurements are considered — a team or
 * round measurement carries no player id to scope a packet by. Chat
 * measurements never carry `causal_support` (no chat tool computes one
 * today), so any causal claim the model tags against them is rejected by
 * `checkClaim`'s existing `unsupported_cause` check, same as a claim with no
 * backing at all.
 */
export function buildSinglePlayerPacket(
  measurements: readonly Measurement[],
): EvidencePacket | null {
  const playerMeasurements = measurements.filter(
    (m): m is Measurement & { window_start: string; window_end: string } =>
      m.entity.kind === 'player' && m.window_start !== null && m.window_end !== null,
  );
  if (playerMeasurements.length === 0) return null;

  const playerIds = new Set(playerMeasurements.map((m) => m.entity.id));
  if (playerIds.size !== 1) return null;

  const windows = new Set(playerMeasurements.map((m) => `${m.window_start}\u0000${m.window_end}`));
  if (windows.size !== 1) return null;

  const playerId = [...playerIds][0] as string;
  const windowKey = [...windows][0] as string;
  const sepIdx = windowKey.indexOf('\u0000');
  const windowStart = windowKey.slice(0, sepIdx);
  const windowEnd = windowKey.slice(sepIdx + 1);

  const withValue = playerMeasurements.filter((m): m is typeof m & { value: number } => m.value !== null);
  if (withValue.length === 0) return null;

  const entries: EvidencePacketEntry[] = withValue.map((m) => ({
    metric_id: m.metric_id,
    value: m.value,
    sample_n: m.sample_size,
    kind: entryKind(m),
    unit: m.unit,
    denominator: m.denominator,
  }));

  return { player_id: playerId, window_start: windowStart, window_end: windowEnd, entries };
}

// ---------------------------------------------------------------------------
// Audit row 47(a) — every claim checked, whatever the turn's shape
// ---------------------------------------------------------------------------

type WindowedMeasurement = Measurement & { window_start: string; window_end: string; value: number };

/**
 * One packet per (player, window) the turn's measurements cover — the
 * multi-player / multi-window generalisation of {@link buildSinglePlayerPacket}.
 * A team or round measurement carries no player to scope by and builds none.
 */
export function buildPlayerPackets(measurements: readonly Measurement[]): EvidencePacket[] {
  const groups = new Map<string, WindowedMeasurement[]>();
  for (const m of measurements) {
    if (m.entity?.kind !== 'player' || m.window_start === null || m.window_end === null || m.value === null) continue;
    const key = `${m.entity.id}\u0000${m.window_start}\u0000${m.window_end}`;
    const list = groups.get(key) ?? [];
    list.push(m as WindowedMeasurement);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    const first = list[0] as WindowedMeasurement;
    return {
      player_id: first.entity.id,
      window_start: first.window_start,
      window_end: first.window_end,
      entries: list.map((m) => ({
        metric_id: m.metric_id,
        value: m.value,
        sample_n: m.sample_size,
        kind: entryKind(m),
        unit: m.unit,
        denominator: m.denominator,
      })),
    };
  });
}

function decimalsOf(n: number): number {
  const s = String(n);
  if (/e/i.test(s)) return 20;
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Coach-facing prose rounds ("58.3%" for a stored 58.333), and the model is
 * told to copy the value it wrote. `claim-validator.ts` compares at a fixed
 * 0.005 tolerance, so an honest rounding would read as `value_mismatch`.
 * A claim is snapped to its entry's exact value only when the entry, rounded
 * to the claim's OWN precision, equals the claim — so 58.3 and 58 both bind to
 * 58.333, while 58.4 (wrong at its own precision) still fails.
 */
function snapToEntry(claim: ClaimReference, packet: EvidencePacket): ClaimReference {
  const entry = packet.entries.find((e) => e.metric_id === claim.metric_id);
  if (!entry) return claim;
  const d = decimalsOf(claim.value);
  if (d >= decimalsOf(entry.value)) return claim;
  const factor = 10 ** d;
  const rounded = Math.round(entry.value * factor) / factor;
  return Math.abs(rounded - claim.value) < 1e-9 ? { ...claim, value: entry.value } : claim;
}

const MALFORMED: TypedClaimAttempt = { accepted: [], rejected: [], malformed: true };

function stripOnly(rawText: string): string {
  const hasMarker = rawText.includes(CLAIMS_OPEN) || rawText.includes(CLAIMS_CLOSE);
  return hasMarker ? stripAllClaimsDelimiters(rawText) : rawText;
}

/**
 * The chat claim gate (flag `coachhelm_chat_claim_gate`), audit row 47(a).
 *
 * Strips the claims block and validates EVERY claim in it against the packet
 * for the claim's own (player, window):
 *   - no packet for that player this turn → `wrong_player`;
 *   - the player is in the turn, but not over that window → `wrong_window`;
 *   - otherwise `claim-validator.ts`'s own per-claim checks (metric, value,
 *     unit, denominator, sample floor, causal backing).
 *
 * Returns `claims: null` (the gate does not engage) only when the turn has no
 * player-scoped measurement at all — a team turn has nothing to bind a player
 * claim to, and is judged by the numeric audit alone, as before. With player
 * evidence present, a missing or broken block is `malformed` (rejected).
 *
 * `uncited_number` is deliberately NOT applied here. It compares prose tokens
 * against raw packet VALUES as strings — "58" never equals "58.333", and a
 * round score or an insight's own figure from a tool's `detail` is never a
 * packet entry — so it rejected most honest answers. Every prose number is
 * already checked, before this gate runs, by `auditNumericClaims`, which since
 * row 47(b) binds each number to the player and metric the text names.
 *
 * Causal PROSE ("because", "led to") with no backed causal claim is still
 * rejected, exactly as `validateClaims` rules it. Chat measurements never
 * carry `causal_support`, so with the flag on any causal wording about a
 * player fails the turn — an owner decision, reported rather than changed.
 *
 * Never throws: any internal error fails closed as `malformed`.
 */
export function extractAndValidateChatClaims(
  rawText: string,
  measurements: readonly Measurement[],
): { strippedText: string; claims: TypedClaimAttempt | null } {
  let packets: EvidencePacket[];
  try {
    packets = buildPlayerPackets(measurements);
  } catch {
    return { strippedText: stripOnly(rawText), claims: MALFORMED };
  }
  if (packets.length === 0) return { strippedText: stripOnly(rawText), claims: null };

  const strippedText = stripAllClaimsDelimiters(rawText);
  try {
    if (countOccurrences(rawText, CLAIMS_OPEN) !== 1 || countOccurrences(rawText, CLAIMS_CLOSE) !== 1) {
      return { strippedText, claims: MALFORMED };
    }
    const match = rawText.match(CLAIMS_BLOCK_RE);
    if (!match) return { strippedText, claims: MALFORMED };
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? '');
    } catch {
      return { strippedText, claims: MALFORMED };
    }
    const result = ClaimsBlockSchema.safeParse(parsed);
    if (!result.success) return { strippedText, claims: MALFORMED };

    const accepted: ClaimReference[] = [];
    const rejected: RejectedClaim[] = [];
    for (const raw of result.data) {
      const forPlayer = packets.filter((p) => p.player_id === raw.player_id);
      if (forPlayer.length === 0) {
        rejected.push({ claim: raw, reason: 'wrong_player' });
        continue;
      }
      const packet = forPlayer.find((p) => p.window_start === raw.window_start && p.window_end === raw.window_end);
      if (!packet) {
        rejected.push({ claim: raw, reason: 'wrong_window' });
        continue;
      }
      // Empty prose: this call judges the CLAIM only (see the doc comment for
      // why prose-level `uncited_number` is not applied).
      const verdict = validateClaims([snapToEntry(raw, packet)], packet, '');
      accepted.push(...verdict.accepted);
      rejected.push(...verdict.rejected);
    }

    // Prose-level causal check, once for the turn (see doc comment).
    const causallyBacked = accepted.some((c) => c.claim_type === 'causal');
    const alreadyFlagged = rejected.some((r) => r.reason === 'unsupported_cause');
    if (!causallyBacked && !alreadyFlagged) {
      const prose = validateClaims([], packets[0] as EvidencePacket, strippedText);
      rejected.push(...prose.rejected.filter((r) => r.reason === 'unsupported_cause'));
    }

    return { strippedText, claims: { accepted, rejected, malformed: false } };
  } catch {
    return { strippedText, claims: MALFORMED };
  }
}
