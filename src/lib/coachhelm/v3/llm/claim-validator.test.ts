/**
 * validateClaims() — typed claim gate (Package 8 slice 1, repair plan
 * 14.10). Each adversarial fixture is built to trip EXACTLY one check,
 * asserted by `reason`, not just by rejection — a test that only checks
 * "was it rejected" can't tell a mis-ordered check from a correct one.
 */

import { describe, it, expect } from 'vitest';
import { validateClaims, type ClaimReference, type EvidencePacket } from './claim-validator';

const WINDOW = { window_start: '2026-09-01T00:00:00.000Z', window_end: '2026-09-08T00:00:00.000Z' };
const PLAYER = 'player-1';

function packet(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  return {
    player_id: PLAYER,
    ...WINDOW,
    entries: [
      { metric_id: 'total_putts', value: 28, sample_n: 18 },
      { metric_id: 'gir_pct', value: 55.6, sample_n: 18 },
    ],
    ...overrides,
  };
}

function claim(overrides: Partial<ClaimReference> = {}): ClaimReference {
  return {
    claim_id: 'c1',
    metric_id: 'total_putts',
    value: 28,
    player_id: PLAYER,
    ...WINDOW,
    ...overrides,
  };
}

describe('validateClaims() — happy path', () => {
  it('accepts a claim whose metric/value/player/window all match the packet', () => {
    const result = validateClaims([claim()], packet(), 'You took 28 putts today.');
    expect(result.accepted).toEqual([claim()]);
    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });

  it('accepts a claim with zero claims and no numbers in the prose', () => {
    const result = validateClaims([], packet(), 'Solid ball-striking round overall.');
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });
});

describe('validateClaims() — adversarial fixtures', () => {
  it('rejects a value cited under the wrong metric (wrong_field)', () => {
    // 55.6 is real — but it's gir_pct's value, not total_putts's.
    const bad = claim({ metric_id: 'total_putts', value: 55.6 });
    const result = validateClaims([bad], packet(), 'You took 55.6 putts today.');

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('wrong_field');
    expect(result.rejected[0]?.claim).toEqual(bad);
    expect(result.renderable).toBe(false);
  });

  it('rejects a claim whose sample_n is below the platform floor (unsupported_small_number)', () => {
    const thinPacket = packet({
      entries: [{ metric_id: 'three_putt_rate', value: 20, sample_n: 2 }],
    });
    const bad = claim({ metric_id: 'three_putt_rate', value: 20 });
    const result = validateClaims([bad], thinPacket, 'Your three-putt rate is 20%.');

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_small_number');
  });

  it('rejects a causal claim with no hypothesis/driver backing it (unsupported_cause)', () => {
    // Entry exists, value matches, sample floor is fine — but nothing backs
    // a CAUSAL assertion (no causal_support on the entry at all).
    const causalPacket = packet({
      entries: [{ metric_id: 'three_putt_rate', value: 20, sample_n: 18 }],
    });
    const bad = claim({ metric_id: 'three_putt_rate', value: 20, claim_type: 'causal' });
    const result = validateClaims(
      [bad],
      causalPacket,
      'Your three-putt rate is 20% because your lag putting broke down.',
    );

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_cause');
  });

  it('accepts a causal claim WHEN the entry carries causal_support with a driver', () => {
    const causalPacket = packet({
      entries: [
        {
          metric_id: 'three_putt_rate',
          value: 20,
          sample_n: 18,
          causal_support: {
            causality_level: 'inferred_hypothesis',
            drivers: [
              { metric: 'lag_putt_3_5ft_leave_pct', value: 40, unit: 'percent', sample_n: 18, source: 'golf_shots' },
            ],
          },
        },
      ],
    });
    const good = claim({ metric_id: 'three_putt_rate', value: 20, claim_type: 'causal' });
    const result = validateClaims(
      [good],
      causalPacket,
      'Your three-putt rate is 20% because your lag putting broke down.',
    );

    expect(result.accepted).toEqual([good]);
    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });

  it('rejects a claim about the wrong player (wrong_player)', () => {
    const bad = claim({ player_id: 'player-2' });
    const result = validateClaims([bad], packet(), 'You took 28 putts today.');

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('wrong_player');
  });

  it('rejects a claim about the wrong window (wrong_window)', () => {
    const bad = claim({ window_start: '2026-08-01T00:00:00.000Z', window_end: '2026-08-08T00:00:00.000Z' });
    const result = validateClaims([bad], packet(), 'You took 28 putts today.');

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('wrong_window');
  });

  it('rejects a metric not present in the packet at all (unknown_metric)', () => {
    const bad = claim({ metric_id: 'scrambling_pct', value: 40 });
    const result = validateClaims([bad], packet(), 'Your scrambling rate is 40%.');

    expect(result.rejected[0]?.reason).toBe('unknown_metric');
  });

  it('rejects a fabricated value matching no metric in the packet (value_mismatch)', () => {
    const bad = claim({ metric_id: 'total_putts', value: 42 });
    const result = validateClaims([bad], packet(), 'You took 42 putts today.');

    expect(result.rejected[0]?.reason).toBe('value_mismatch');
  });
});

describe('validateClaims() — vacuous-pass guard', () => {
  it('rejects (uncited_number) when the prose has a number no accepted claim covers, even with zero claims', () => {
    const result = validateClaims([], packet(), 'You took 42 putts today.');

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('uncited_number');
    expect(result.renderable).toBe(false);
  });

  it('does not flag universally-safe tokens (0/1/2/3/100) as uncited', () => {
    const result = validateClaims([], packet(), 'You had 1 three-putt and 0 penalty strokes.');

    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });

  it('does not flag a number that an ACCEPTED claim already covers', () => {
    const result = validateClaims([claim()], packet(), 'You took 28 putts today — 28 total.');

    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });
});
