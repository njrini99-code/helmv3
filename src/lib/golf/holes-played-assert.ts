/**
 * A4 (2026-09-02) — `submit_round_atomic` trusts `p_round_data.holes_played`
 * when present, but ACCEPTS ANY COUNT when it is omitted or not a number:
 *
 *   v_expected_holes := COALESCE((p_round_data->>'holes_played')::INT, v_supplied_holes);
 *
 * (`supabase/migrations/20260821043500_*`). `submitGolfRoundComprehensive`
 * builds `holes_played` from the same `data.holes.length` it uses to build
 * `holesPayload`, so today the two can never disagree — this is a
 * belt-and-suspenders gate against a FUTURE refactor decoupling them (a
 * client-supplied count, or the field getting dropped/renamed at the actual
 * `.rpc()` call site) closing the gap at the TS layer, with a message the
 * player can actually act on, rather than relying on the RPC's own
 * fallback-to-anything-supplied behavior or its generic "Hole count
 * mismatch" text.
 */
export type HolesPlayedAssertResult = { ok: true } | { ok: false; error: string };

export function assertHolesPlayedMatchesPayload(
  holesPlayedValue: unknown,
  holesPayloadLength: number,
): HolesPlayedAssertResult {
  if (typeof holesPlayedValue !== 'number' || !Number.isFinite(holesPlayedValue)) {
    return {
      ok: false,
      error: 'Round submission is missing a holes-played count. Please try again.',
    };
  }
  if (holesPlayedValue !== holesPayloadLength) {
    return {
      ok: false,
      error: `Round submission holes-played count (${holesPlayedValue}) does not match the ${holesPayloadLength} hole(s) submitted.`,
    };
  }
  return { ok: true };
}
