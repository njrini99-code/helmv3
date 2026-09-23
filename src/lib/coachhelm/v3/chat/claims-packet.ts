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
import type { EvidencePacket, EvidencePacketEntry } from '../llm/claim-validator';

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
