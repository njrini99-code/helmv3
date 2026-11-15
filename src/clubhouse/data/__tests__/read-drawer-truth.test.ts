import { describe, expect, it } from 'vitest';
import { toChInsight } from '../coachhelm-map';
import { DIVE_PENALTIES } from '../../preview/fixtures-coachhelm-views';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

/**
 * Coach audit 13 Nov 2026 (§3a, the read drawer): Braeden's "Putts Made 5-10 ft" (29.8% over 37 rounds since 27 Feb) said
 * "Lower is better", because the stored read carries no polarity, and its header said "last 10 rounds", the player's board
 * count, not the read's. The direction falls back to the metric registry's; the read says its own rounds and start.
 */
const read = (extra: Partial<EvidenceInsight['evidence']>): EvidenceInsight =>
  ({ ...DIVE_PENALTIES, evidence: { ...DIVE_PENALTIES.evidence, ...extra } }) as EvidenceInsight;
// A rolling read, as Braeden's is (the fixture it is built on is a lifetime one).
const PUTTS_MADE = {
  metric: 'putts_made_5_10ft_pct',
  metric_label: 'Putts Made 5-10 ft',
  unit: 'percent' as const,
  your_value: 29.8,
  polarity: undefined,
  window_basis: 'rolling' as const,
  detail: { ...DIVE_PENALTIES.evidence.detail, window_kind: undefined },
};

describe('which way is better', () => {
  it('a make rate with no stored polarity is higher-is-better, as the metric registry says', () => {
    expect(toChInsight(read(PUTTS_MADE)).compare?.higherBetter).toBe(true);
  });

  it('a stored polarity still wins', () => {
    expect(toChInsight(read({ ...PUTTS_MADE, polarity: 'lower_better' })).compare?.higherBetter).toBe(false);
  });

  it('a lower-is-better metric with no stored polarity stays lower-is-better', () => {
    expect(toChInsight(read({ ...PUTTS_MADE, metric: 'putt_miss_bias_high_pct', polarity: undefined })).compare?.higherBetter).toBe(false);
  });
});

describe('the read’s own sample', () => {
  it('says its rounds and the day it starts: "37 rounds since Feb 27"', () => {
    const ins = toChInsight(read({ ...PUTTS_MADE, rounds_n: 37, window_start: '2026-02-27T00:00:00Z', window_end: '2026-11-12T00:00:00Z' } as never));
    expect(ins.evidence.span).toBe('37 rounds since Feb 27');
  });

  it('counts the rounds it names when it has no round count', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `r${i}`);
    const ins = toChInsight(read({ ...PUTTS_MADE, rounds_n: undefined, source_round_ids: ids, window_start: '2026-09-01' } as never));
    expect(ins.evidence.span).toBe('12 rounds since Sep 1');
  });

  it('a lifetime read says its rounds and no start', () => {
    const ins = toChInsight(read({ ...PUTTS_MADE, rounds_n: 37, window_basis: 'lifetime', window_start: '2026-02-27' } as never));
    expect(ins.evidence.span).toBe('37 rounds');
  });

  it('a read with no rounds to count has none', () => {
    const ins = toChInsight(read({ ...PUTTS_MADE, rounds_n: undefined, source_round_ids: [] } as never));
    expect(ins.evidence.span).toBeNull();
  });
});
