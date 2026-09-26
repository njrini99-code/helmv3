import { describe, expect, it } from 'vitest';
import { branchDetailOf } from './build-root-map';
import { isTemplatedRootCause, plainMetricLabel, plainRootCause, richWhySentence } from './plain-copy';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

const TEMPLATED = 'Sand Save % is off its benchmark — likely cause inferred from the aggregate, not a measured shot sequence';

describe('plainMetricLabel', () => {
  it('never returns a raw metric id', () => {
    expect(plainMetricLabel('scrambling_pct_sand')).toBe('Sand saves');
    expect(plainMetricLabel('putts_made_10_15ft_pct')).toBe('Putts made from 10–15 ft');
    expect(plainMetricLabel('putts_made_25_plus_ft_pct')).toBe('Putts made from 25+ ft');
    expect(plainMetricLabel('approach_proximity_175_plus_ft')).toBe('Approach from 175+ yd');
    expect(plainMetricLabel('practice_tournament_delta')).toBe('Practice vs Tournament Delta');
    expect(plainMetricLabel('some_new_metric_pct')).toBe('Some new metric %');
  });
});

describe('templated diagnosis', () => {
  it('is recognised and rewritten in plain words, subject from the metric', () => {
    expect(isTemplatedRootCause(TEMPLATED)).toBe(true);
    expect(plainRootCause(TEMPLATED, 'scrambling_pct_sand')).toBe(
      'Sand saves: below the benchmark. The likely cause comes from the round totals; it has not been traced shot by shot yet.',
    );
    expect(plainRootCause(TEMPLATED)).toMatch(/^Sand Save %: below the benchmark/);
  });
  it('leaves a real root cause as stored', () => {
    expect(isTemplatedRootCause('Reads the break short on downhill putts.')).toBe(false);
    expect(plainRootCause('Reads the break short on downhill putts.')).toBe('Reads the break short on downhill putts.');
    expect(plainRootCause('  ')).toBeNull();
  });
});

describe('richWhySentence', () => {
  it('picks the explanatory sentences, never the drill, lowering shouted words', () => {
    const content =
      'You ESCAPE the bunker fine — 71% of your 21 sand shots reached the green — but you finish 17 ft from the hole and then 2-putt (12 of 15 reached greens). The driver is distance control OUT of the sand and the lag putt that follows, not your splash. Drill: bunker shots to a 6-ft circle.';
    expect(richWhySentence(content)).toBe(
      'You escape the bunker fine — 71% of your 21 sand shots reached the green — but you finish 17 ft from the hole and then 2-putt (12 of 15 reached greens). The driver is distance control out of the sand and the lag putt that follows, not your splash.',
    );
  });
  it('keeps acronyms and returns null when no sentence names a cause', () => {
    expect(richWhySentence('You make 21% from 10-15 ft (PGA Tour ~36%). Keep working it.')).toBeNull();
    expect(richWhySentence("That's driven by doubles (PGA Tour ~5%).")).toBe("That's driven by doubles (PGA Tour ~5%).");
  });
  it('never shows a sentence cut off mid-way', () => {
    expect(richWhySentence('The driver is under-clu')).toBeNull();
  });
});

describe('branchDetailOf copy', () => {
  const evidence = {
    metric: 'scrambling_pct_sand',
    metric_label: 'Sand Save %',
    unit: 'percent',
    your_value: 14.3,
    comparison_value: 50,
    sample_n: 21,
    confidence: 0.8,
    diagnosis: {
      symptom: 's',
      root_cause: TEMPLATED,
      causality_level: 'inferred_hypothesis',
      drivers: [{ metric: 'scrambling_pct_sand', value: 14.3, unit: 'percent', sample_n: 21, source: 'x' }],
      recommended_action: 'r',
    },
  } as unknown as InsightEvidence;

  it('humanizes the driver label and carries the richer stored text as the Why', () => {
    const d = branchDetailOf({
      id: 'i1',
      title: 't',
      content: 'You escape fine, but you finish 17 ft away and 2-putt.',
      evidence,
    });
    expect(d?.driver?.label).toBe('Sand Save %');
    expect(d?.driver?.label).not.toMatch(/_/);
    expect(d?.rootCause).toMatch(/^Sand saves: below the benchmark/);
    expect(d?.whySentence).toBe('You escape fine, but you finish 17 ft away and 2-putt.');
  });

  it('falls back to a plain label when the driver reads another metric', () => {
    const ev = { ...evidence, diagnosis: { ...evidence.diagnosis!, drivers: [{ metric: 'scrambling_pct_rough', value: 30, unit: 'percent', sample_n: 9, source: 'x' }] } } as InsightEvidence;
    expect(branchDetailOf({ id: 'i', title: 't', content: 'c', evidence: ev })?.driver?.label).toBe('Up-and-downs from the rough');
  });
});
