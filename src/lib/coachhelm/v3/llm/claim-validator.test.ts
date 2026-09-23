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

  it('does not flag a number present in the packet even when no claim cited it (SHOULD-4)', () => {
    // 55.6 is a real packet value (gir_pct) but the model never emitted a
    // claim for it — should still be exempt, not "uncited".
    const result = validateClaims([], packet(), 'Greens in regulation sat at 55.6%.');

    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });

  it('does not flag hole numbers, par values, or written dates (SHOULD-4)', () => {
    // No ordinal suffix ("12th") and no trailing year on the date — both
    // would either dodge extraction entirely or introduce an unrelated
    // token this test isn't about. "September 12." isolates exactly the
    // month-day exemption this fixture exists to check.
    const result = validateClaims(
      [],
      packet(),
      'On hole 14, a par 4, you made bogey. It happened on September 12.',
    );

    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });

  it('still flags a bare number with no structural keyword nearby (SHOULD-4 stays narrow)', () => {
    // 14 alone (no "hole"/"par" beside it) must still be scrutinised.
    const result = validateClaims([], packet(), 'You had 14 good looks at birdie.');

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('uncited_number');
  });
});

describe('validateClaims() — kind: measurement vs aggregate (post-#1991 review)', () => {
  it('accepts a measurement claim with sample_n below MIN_SAMPLE_N — no "n" to sample for a single round', () => {
    const measurementPacket = packet({
      entries: [{ metric_id: 'total_putts', value: 28, sample_n: 1, kind: 'measurement' }],
    });
    const result = validateClaims([claim()], measurementPacket, 'You took 28 putts today.');

    expect(result.accepted).toEqual([claim()]);
    expect(result.rejected).toEqual([]);
  });

  it('still floors an aggregate claim at MIN_SAMPLE_N', () => {
    const aggregatePacket = packet({
      entries: [{ metric_id: 'total_putts', value: 28, sample_n: 1, kind: 'aggregate' }],
    });
    const result = validateClaims([claim()], aggregatePacket, 'You took 28 putts today.');

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_small_number');
  });

  it('defaults an unlabeled entry to aggregate — fails safe', () => {
    const unlabeledPacket = packet({
      entries: [{ metric_id: 'total_putts', value: 28, sample_n: 1 }],
    });
    const result = validateClaims([claim()], unlabeledPacket, 'You took 28 putts today.');

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_small_number');
  });

  it("#1999 re-review, NICE: a 'measurement' entry with sample_n 0 is still floored — zero support is never 'the count IS the fact'", () => {
    const zeroSamplePacket = packet({
      entries: [{ metric_id: 'total_putts', value: 28, sample_n: 0, kind: 'measurement' }],
    });
    const result = validateClaims([claim()], zeroSamplePacket, 'You took 28 putts today.');

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_small_number');
  });
});

describe('validateClaims() — causal-language detector (SHOULD-3, post-#1991 review)', () => {
  it('rejects (unsupported_cause) causal PROSE when the claim is tagged "fact"', () => {
    const causalPacket = packet({
      entries: [{ metric_id: 'three_putt_rate', value: 20, sample_n: 18 }],
    });
    // The claim is well-formed and tagged 'fact' — it passes its OWN
    // per-claim check (which only checks causal backing for claim_type
    // 'causal'). Only the prose-level detector catches this.
    const factTaggedClaim = claim({ metric_id: 'three_putt_rate', value: 20, claim_type: 'fact' });
    const result = validateClaims(
      [factTaggedClaim],
      causalPacket,
      'Your three-putt rate is 20% because your lag putting broke down.',
    );

    expect(result.accepted).toEqual([factTaggedClaim]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_cause');
    expect(result.renderable).toBe(false);
  });

  it('rejects (unsupported_cause) causal PROSE when claim_type is omitted entirely', () => {
    const causalPacket = packet({
      entries: [{ metric_id: 'three_putt_rate', value: 20, sample_n: 18 }],
    });
    const untaggedClaim = claim({ metric_id: 'three_putt_rate', value: 20 });
    delete (untaggedClaim as { claim_type?: string }).claim_type;
    const result = validateClaims(
      [untaggedClaim],
      causalPacket,
      'Your three-putt rate is 20%, which is why your scores climbed.',
    );

    expect(result.rejected.some((r) => r.reason === 'unsupported_cause')).toBe(true);
  });

  it('does not double-report when a properly-tagged causal claim already failed its own backing check', () => {
    const causalPacket = packet({
      entries: [{ metric_id: 'three_putt_rate', value: 20, sample_n: 18 }],
    });
    const bad = claim({ metric_id: 'three_putt_rate', value: 20, claim_type: 'causal' });
    const result = validateClaims(
      [bad],
      causalPacket,
      'Your three-putt rate is 20% because your lag putting broke down.',
    );

    // checkClaim() already rejected this one claim as unsupported_cause —
    // the prose-level detector must not add a SECOND rejection for the
    // same underlying mistake.
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unsupported_cause');
  });

  it('accepts causal prose backed by a proper causal claim', () => {
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

    expect(result.rejected).toEqual([]);
    expect(result.renderable).toBe(true);
  });

  it('does not flag prose with no causal language at all', () => {
    const result = validateClaims([claim()], packet(), 'You took 28 putts today.');
    expect(result.rejected).toEqual([]);
  });
});

describe('validateClaims() — fixed check order (nice-to-have, post-#1991 review)', () => {
  it('a claim broken TWO ways (wrong player AND below the sample floor) reports only the first check in order', () => {
    // player check runs before the sample-floor check — wrong_player must
    // win even though this claim would ALSO fail the floor.
    const thinPacket = packet({
      player_id: PLAYER,
      entries: [{ metric_id: 'three_putt_rate', value: 20, sample_n: 1, kind: 'aggregate' }],
    });
    const bad = claim({ metric_id: 'three_putt_rate', value: 20, player_id: 'someone-else' });
    const result = validateClaims([bad], thinPacket, 'Your three-putt rate is 20%.');

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('wrong_player');
  });
});
