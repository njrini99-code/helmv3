/**
 * CoachHelm Slice 0 delivery (flag `coachhelm_reads_v1_copy`): overlapping
 * reads fold into one (03 S6, 04 example 7) and each player holds 3 open
 * reads + 1 strength (03 S7, S8). Pure functions; synthetic fixtures only.
 */
import { describe, it, expect } from 'vitest';
import {
  capReadsPerPlayer,
  deliverReads,
  foldOverlappingReads,
  foldSentence,
  isMeasuredZeroRead,
  readKind,
  READS_OPEN_MAX,
  READS_STRENGTH_MAX,
} from '@/app/golf/actions/insight-delivery-reads';
import type { RankableEvidenceInsight } from '@/app/golf/actions/insight-delivery-ranking';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

type Ev = Partial<InsightEvidence>;
type Over = Partial<Omit<RankableEvidenceInsight, 'evidence'>> & { ev?: Ev };

/** A finding by default: behind a Tour baseline on a higher-is-better rate, medium priority. */
function read(id: string, metric: string, over: Over = {}): RankableEvidenceInsight {
  const { ev = {}, ...rest } = over;
  return {
    id,
    player_id: 'p-1',
    category: 'putting',
    insight_type: 'putt_distance',
    title: `Read ${id}`,
    content: `Body ${id}.`,
    signature: `v3:x:${id}`,
    evidence: {
      metric,
      unit: 'percent',
      your_value: 40,
      comparison_value: 60,
      comparison_source: 'pga_baseline',
      strokes_impact: 0,
      strokes_impact_method: 'peer_delta',
      confidence: 0.8,
      sample_n: 40,
      ...ev,
    } as InsightEvidence,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...rest,
  };
}

/** A strength: ahead of the comparison at low priority. */
const strength = (id: string, metric: string, over: Over = {}) =>
  read(id, metric, { priority: 'low', ...over, ev: { your_value: 80, comparison_value: 60, ...over.ev } });

const laggy = (id = 'tee') =>
  read(id, 'sg_ott', { category: 'tee', insight_type: 'tee_strategy', signature: 'v3:tee_strategy:tee_strategy:laggy', title: 'Driver may be costing you more than it gains', priority: 'high', ev: { polarity: 'higher_better', comparison_source: 'your_baseline' } });
const sharp = (id = 'tee') =>
  read(id, 'sg_ott', { category: 'tee', insight_type: 'tee_strategy', signature: 'v3:tee_strategy:tee_strategy:sharp', title: 'Driver is performing: keep it in play', priority: 'low', ev: { polarity: 'higher_better', comparison_source: 'your_baseline', your_value: 58, comparison_value: 60 } });
const inconclusive = (id = 'tee') =>
  read(id, 'sg_ott', { category: 'tee', insight_type: 'tee_strategy', signature: 'v3:tee_strategy:tee_strategy:inconclusive', title: 'Driver vs layback: no clear preference', priority: 'low' });
const penalties = (id = 'pen', over: Over = {}) =>
  read(id, 'penalty_rate_per_round', { category: 'course_management', insight_type: 'course_management', title: 'Penalty strokes: 0.8 per round', ...over, ev: { unit: 'count', your_value: 0.8, comparison_value: 0.3, ...over.ev } });
const bigNumbers = (id = 'big') =>
  read(id, 'big_number_rate', { category: 'course_management', insight_type: 'course_management', title: 'Double bogey-or-worse rate: 12%', ev: { your_value: 12, comparison_value: 5 } });

describe('readKind (the Clubhouse board rule, server side)', () => {
  it('a card that states no finding is a note', () => {
    expect(readKind(sharp())).toBe('note');
    expect(readKind(inconclusive())).toBe('note');
    expect(readKind(read('par', 'scoring_par_4', { ev: { feed_exempt: true } }))).toBe('note');
  });

  it('ahead of the comparison in the metric\'s own direction at low priority is a strength', () => {
    expect(readKind(strength('s', 'putts_made_5_10ft_pct'))).toBe('strength');
    // Lower is better for penalties: 0.2 under a 0.3 comparison is ahead.
    expect(readKind(penalties('p', { priority: 'low', ev: { your_value: 0.2 } }))).toBe('strength');
    expect(readKind(penalties('p'))).toBe('finding');
  });

  it('a resolved read is a strength; a college or estimated comparison is never judged one', () => {
    expect(readKind(read('r', 'putts_made_5_10ft_pct', { lifecycle_state: 'resolved' }))).toBe('strength');
    expect(readKind(strength('c', 'putts_made_5_10ft_pct', { ev: { comparison_source: 'cohort_avg' } }))).toBe('finding');
    expect(readKind(strength('e', 'putts_made_5_10ft_pct', { ev: { comparison_source: 'estimated_target' } }))).toBe('finding');
  });
});

describe('isMeasuredZeroRead', () => {
  it('only a strokes-gained baseline that prints as 0.0 is a measured zero', () => {
    expect(isMeasuredZeroRead({ strokes_impact: 0.04, strokes_impact_method: 'sg_baseline' })).toBe(true);
    expect(isMeasuredZeroRead({ strokes_impact: 0.06, strokes_impact_method: 'sg_baseline' })).toBe(false);
    expect(isMeasuredZeroRead({ strokes_impact: 0, strokes_impact_method: 'peer_delta' })).toBe(false);
    expect(isMeasuredZeroRead({ strokes_impact: 0, strokes_impact_method: 'rough_estimate' })).toBe(false);
  });
});

describe('foldOverlappingReads', () => {
  it('a driver read and a penalties read are one read: the higher-ranked stays, the other is named on it', () => {
    const out = foldOverlappingReads([laggy(), read('putt', 'putts_made_5_10ft_pct'), penalties()]);
    expect(out.map((r) => r.id)).toEqual(['tee', 'putt']);
    expect(out[0]!.also).toEqual([{ id: 'pen', title: 'Penalty strokes: 0.8 per round', relation: 'overlap' }]);
    expect(out[0]!.content).toBe('Body tee. Also in this read: “Penalty strokes: 0.8 per round”.');
  });

  it('driver performing against a high penalty rate is the opposing pair of 04 example 7', () => {
    const out = foldOverlappingReads([penalties(), sharp()]);
    expect(out.map((r) => r.id)).toEqual(['pen']);
    expect(out[0]!.also).toEqual([{ id: 'tee', title: 'Driver is performing: keep it in play', relation: 'opposing' }]);
    expect(out[0]!.content).toBe('Body pen. Pulls the other way: “Driver is performing”.'.replace('”', ': keep it in play”'));
  });

  it('pairs chain: driver, penalties and big numbers are one read even when penalties rank last', () => {
    const out = foldOverlappingReads([bigNumbers(), laggy(), penalties()]);
    expect(out.map((r) => r.id)).toEqual(['big']);
    expect(out[0]!.also?.map((a) => a.id)).toEqual(['tee', 'pen']);
  });

  it('driver and big numbers alone are not a pair', () => {
    expect(foldOverlappingReads([laggy(), bigNumbers()]).map((r) => r.id)).toEqual(['tee', 'big']);
  });

  it('three-putts and the 25+ ft make rate fold (03 S6)', () => {
    const chain = read('chain', 'three_putt_chain', { insight_type: 'composite', ev: { polarity: 'lower_better', your_value: 9, comparison_value: 3 } });
    const lag = read('lag', 'putts_made_25_plus_ft_pct');
    expect(foldOverlappingReads([lag, chain]).map((r) => r.id)).toEqual(['lag']);
  });

  it('one metric in two categories folds (opening hole and the front-9 starter)', () => {
    const warmup = read('warmup', 'opening_hole_delta', { category: 'pressure', insight_type: 'warmup_hole' });
    const starter = read('starter', 'opening_hole_delta', { category: 'scoring', insight_type: 'composite' });
    expect(foldOverlappingReads([starter, warmup]).map((r) => r.id)).toEqual(['starter']);
  });

  it('a card that found nothing, a measured zero and another player never fold', () => {
    const zero = penalties('zero', { ev: { strokes_impact: 0, strokes_impact_method: 'sg_baseline' } });
    expect(foldOverlappingReads([inconclusive(), penalties()]).map((r) => r.id)).toEqual(['tee', 'pen']);
    expect(foldOverlappingReads([laggy(), zero]).map((r) => r.id)).toEqual(['tee', 'zero']);
    expect(foldOverlappingReads([laggy(), penalties('pen', { player_id: 'p-2' })]).map((r) => r.id)).toEqual(['tee', 'pen']);
  });

  it('with nothing to fold the list is returned as it was', () => {
    const list = [read('a', 'putts_made_5_10ft_pct'), read('b', 'putts_made_10_15ft_pct')];
    expect(foldOverlappingReads(list)).toEqual(list);
  });
});

describe('foldSentence', () => {
  it('names overlapping and opposing reads, without doubled punctuation', () => {
    expect(
      foldSentence([
        { id: 'a', title: 'Penalty strokes: 0.8 per round.', relation: 'overlap' },
        { id: 'b', title: 'Double bogey-or-worse rate: 12%', relation: 'overlap' },
        { id: 'c', title: 'Driver is performing', relation: 'opposing' },
      ]),
    ).toBe('Also in this read: “Penalty strokes: 0.8 per round”; “Double bogey-or-worse rate: 12%”. Pulls the other way: “Driver is performing”.');
  });
});

describe('capReadsPerPlayer', () => {
  it(`holds a player to ${READS_OPEN_MAX} open reads and ${READS_STRENGTH_MAX} strength, in rank order`, () => {
    const list = [
      read('f1', 'putts_made_3_5ft_pct'),
      strength('s1', 'putts_made_5_10ft_pct'),
      read('f2', 'putts_made_10_15ft_pct'),
      strength('s2', 'putts_made_15_25ft_pct'),
      read('f3', 'putts_made_25_plus_ft_pct'),
      read('f4', 'scrambling_pct_sand'),
    ];
    const { shown, more, slotOf } = capReadsPerPlayer(list);
    expect(shown.map((r) => r.id)).toEqual(['f1', 's1', 'f2', 'f3']);
    expect(more.map((r) => r.id)).toEqual(['s2', 'f4']);
    expect(slotOf.get('s1')).toBe('strength');
    expect(slotOf.get('f3')).toBe('open');
  });

  it('a note and a measured zero are never open reads', () => {
    const zero = read('zero', 'approach_proximity_50_125ft', { ev: { strokes_impact: 0, strokes_impact_method: 'sg_baseline' } });
    const { shown, more } = capReadsPerPlayer([inconclusive(), zero, read('f1', 'putts_made_3_5ft_pct')]);
    expect(shown.map((r) => r.id)).toEqual(['f1']);
    expect(more.map((r) => r.id)).toEqual(['tee', 'zero']);
  });

  it('counts each player separately and keeps a mixed list in its order (the coach team sweep)', () => {
    const list = [1, 2, 3, 4].flatMap((n) => [
      read(`a${n}`, `m${n}`, { player_id: 'a' }),
      read(`b${n}`, `m${n}`, { player_id: 'b' }),
    ]);
    expect(capReadsPerPlayer(list).shown.map((r) => r.id)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']);
  });
});

describe('deliverReads', () => {
  const list = [laggy(), penalties(), read('f2', 'putts_made_10_15ft_pct'), read('f3', 'putts_made_3_5ft_pct'), read('f4', 'putts_made_25_plus_ft_pct')];

  it('with the flag off (neither step) the list is unchanged', () => {
    expect(deliverReads(list, { fold: false, cap: false })).toEqual(list);
  });

  it('folds before it caps, so a folded read never takes a slot', () => {
    expect(deliverReads(list, { fold: true, cap: true }).map((r) => r.id)).toEqual(['tee', 'f2', 'f3']);
    expect(deliverReads(list, { fold: true, cap: false }).map((r) => r.id)).toEqual(['tee', 'f2', 'f3', 'f4']);
  });

  it('never moves or drops a player\'s first read; only a note or a measured zero ahead of it goes', () => {
    const lists = [list, [penalties(), sharp()], [bigNumbers(), laggy(), penalties()]];
    for (const l of lists) {
      expect(deliverReads(l, { fold: true, cap: true })[0]?.id).toBe(l[0]!.id);
      expect(deliverReads(l, { fold: true, cap: false })[0]?.id).toBe(l[0]!.id);
    }
    expect(deliverReads([inconclusive(), read('x', 'm')], { fold: true, cap: true }).map((r) => r.id)).toEqual(['x']);
    expect(deliverReads([inconclusive(), read('x', 'm')], { fold: true, cap: false }).map((r) => r.id)).toEqual(['tee', 'x']);
  });
});
