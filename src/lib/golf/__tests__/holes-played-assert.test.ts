/**
 * A4 — submit_round_atomic trusts `p_round_data.holes_played` when present,
 * but ACCEPTS ANY COUNT when it is omitted or not a number:
 * `v_expected_holes := COALESCE((p_round_data->>'holes_played')::INT,
 * v_supplied_holes)` (supabase/migrations/20260821043500_*). The TS submit
 * path must assert `holes_played` is present and equals the number of hole
 * entries BEFORE calling the RPC, rather than relying on the RPC's own
 * fallback-to-anything-supplied behavior.
 */
import { describe, it, expect } from 'vitest';
import { assertHolesPlayedMatchesPayload } from '../holes-played-assert';

describe('assertHolesPlayedMatchesPayload', () => {
  it('passes when holes_played equals the number of hole entries', () => {
    expect(assertHolesPlayedMatchesPayload(18, 18)).toEqual({ ok: true });
  });

  it('fails with a clear error when holes_played is missing (undefined)', () => {
    const result = assertHolesPlayedMatchesPayload(undefined, 18);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/holes-played count/i);
  });

  it('fails with a clear error when holes_played is null', () => {
    const result = assertHolesPlayedMatchesPayload(null, 9);
    expect(result.ok).toBe(false);
  });

  it('fails when holes_played does not match the number of hole entries submitted', () => {
    const result = assertHolesPlayedMatchesPayload(18, 9);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/18/);
    expect(!result.ok && result.error).toMatch(/9/);
  });

  it('rejects a non-finite value rather than coercing it', () => {
    expect(assertHolesPlayedMatchesPayload(Number.NaN, 9).ok).toBe(false);
    expect(assertHolesPlayedMatchesPayload('18' as unknown as number, 18).ok).toBe(false);
  });
});
