import { describe, expect, it } from 'vitest';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { bigNumber, penalties, PREVIEW_TOUR, slope } from '../../preview/fixtures-coachhelm';
import { toChInsight } from '../coachhelm-map';
import { moreReadsLine, NEEDS_MAX, partitionInsights, WORKING_MAX, type ChInsight } from '../coachhelm-shape';
import { isMeasuredZero, strokesAtStake, withoutZeroImpact } from '../coachhelm-strokes';

type Strokes = Pick<InsightEvidence, 'strokes_impact' | 'strokes_impact_method'>;
const ev = (strokes_impact: number, strokes_impact_method: InsightEvidence['strokes_impact_method']): Strokes => ({ strokes_impact, strokes_impact_method });

describe('130102 strokes a round: said only when it is a real estimate', () => {
  it('a strokes-gained baseline that is not zero is said, one decimal, unsigned', () => {
    expect(strokesAtStake(ev(0.42, 'sg_baseline'))).toBe('0.4');
    expect(strokesAtStake(ev(-1.26, 'sg_baseline'))).toBe('1.3');
    expect(isMeasuredZero(ev(0.42, 'sg_baseline'))).toBe(false);
  });

  it('a strokes-gained baseline at 0.0 is a measured zero: nothing is said, and it is the one zero that is hidden', () => {
    expect(strokesAtStake(ev(0, 'sg_baseline'))).toBeNull();
    expect(strokesAtStake(ev(0.04, 'sg_baseline'))).toBeNull();
    expect(isMeasuredZero(ev(0, 'sg_baseline'))).toBe(true);
    expect(isMeasuredZero(ev(-0.04, 'sg_baseline'))).toBe(true);
    // 0.06 prints as 0.1, so it is an estimate, not a zero.
    expect(isMeasuredZero(ev(0.06, 'sg_baseline'))).toBe(false);
  });

  it('a peer delta that is not zero is said', () => {
    expect(strokesAtStake(ev(0.9, 'peer_delta'))).toBe('0.9');
  });

  it('a peer delta of zero is no estimate: nothing is said and the read is not hidden', () => {
    expect(strokesAtStake(ev(0, 'peer_delta'))).toBeNull();
    expect(isMeasuredZero(ev(0, 'peer_delta'))).toBe(false);
  });

  it('a rough estimate is never said, zero or not, and never hidden', () => {
    expect(strokesAtStake(ev(1.2, 'rough_estimate'))).toBeNull();
    expect(strokesAtStake(ev(0, 'rough_estimate'))).toBeNull();
    expect(isMeasuredZero(ev(0, 'rough_estimate'))).toBe(false);
  });

  it('a missing value or method says nothing and hides nothing', () => {
    expect(strokesAtStake(null)).toBeNull();
    expect(strokesAtStake(undefined)).toBeNull();
    const noMethod = { strokes_impact: 0.8 } as unknown as Strokes;
    const noValue = { strokes_impact_method: 'sg_baseline' } as unknown as Strokes;
    expect(strokesAtStake(noMethod)).toBeNull();
    expect(strokesAtStake(noValue)).toBeNull();
    expect(isMeasuredZero(noMethod)).toBe(false);
    expect(isMeasuredZero(noValue)).toBe(false);
    expect(strokesAtStake({ strokes_impact: Number.NaN, strokes_impact_method: 'peer_delta' })).toBeNull();
  });

  it('the mapper marks only a measured zero, and leaves every other card the shape it was', () => {
    const withStrokes = (i: EvidenceInsight, s: Strokes): EvidenceInsight => ({ ...i, evidence: { ...i.evidence, ...s } });
    expect(toChInsight(withStrokes(penalties('p'), ev(0, 'sg_baseline'))).measuredZero).toBe(true);
    expect('measuredZero' in toChInsight(withStrokes(penalties('p'), ev(0, 'peer_delta')))).toBe(false);
    expect('measuredZero' in toChInsight(withStrokes(penalties('p'), ev(0, 'rough_estimate')))).toBe(false);
    expect('measuredZero' in toChInsight(withStrokes(penalties('p'), ev(0.7, 'sg_baseline')))).toBe(false);
  });
});

describe('130102 "Projected impact: ~0.00 strokes per round." is not drawn', () => {
  const ZERO = 'Hazard holes cost you strokes. Projected impact: ~0.00 strokes per round. Aim away from the water.';
  const REAL = 'Hazard holes cost you strokes. Projected impact: ~0.80 strokes per round played here. Aim away from the water.';

  it('a zero figure is dropped whatever the row carries, and the sentences around it stay', () => {
    expect(withoutZeroImpact(ZERO, ev(0, 'peer_delta'))).toBe('Hazard holes cost you strokes. Aim away from the water.');
    expect(withoutZeroImpact(ZERO, ev(0.9, 'sg_baseline'))).toBe('Hazard holes cost you strokes. Aim away from the water.');
    expect(withoutZeroImpact('Projected impact: ~−0.00 strokes per round.', ev(0, 'sg_baseline'))).toBe('');
    expect(withoutZeroImpact('Projected impact: ~-0.00 strokes per round', null)).toBe('');
  });

  it('a real figure on a row that carries one stays; on a row with no estimate it goes', () => {
    expect(withoutZeroImpact(REAL, ev(0.8, 'historical_correlation'))).toBe(REAL);
    expect(withoutZeroImpact(REAL, ev(0.8, 'peer_delta'))).toBe(REAL);
    expect(withoutZeroImpact(REAL, ev(0, 'peer_delta'))).toBe('Hazard holes cost you strokes. Aim away from the water.');
    expect(withoutZeroImpact(REAL, ev(0.8, 'rough_estimate'))).toBe('Hazard holes cost you strokes. Aim away from the water.');
    expect(withoutZeroImpact(REAL, null)).toBe('Hazard holes cost you strokes. Aim away from the water.');
  });

  it('text with no such sentence is unchanged', () => {
    expect(withoutZeroImpact('You average 1.1 penalty strokes per round.', ev(0, 'peer_delta'))).toBe('You average 1.1 penalty strokes per round.');
    expect(withoutZeroImpact(null, ev(0, 'peer_delta'))).toBe('');
  });

  it('the card never draws it: not in the lede, not in Why we think this', () => {
    const lead = (content: string) => toChInsight({ ...penalties('p'), content, evidence: { ...penalties('p').evidence, ...ev(0, 'peer_delta') } });
    const asWhy = lead(ZERO);
    expect(asWhy.lede).toBe('Hazard holes cost you strokes.');
    expect(asWhy.why).toBe('Aim away from the water.');
    const asLede = lead('Projected impact: ~0.00 strokes per round. Aim away from the water.');
    expect(asLede.lede).toBe('Aim away from the water.');
    expect(asLede.why).toBeNull();
  });
});

describe('130102 the player Board: three that need work and one that is working, the rest in the Deep dive', () => {
  const finding = toChInsight(penalties('p'), { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
  const strength = toChInsight(bigNumber('p'), { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
  const note: ChInsight = { ...toChInsight(slope('p')), kind: 'note' };
  const needs = (n: number) => Array.from({ length: n }, (_, k) => ({ ...finding, id: `f${k}` }));
  const goods = (n: number) => Array.from({ length: n }, (_, k) => ({ ...strength, id: `s${k}` }));
  const ids = (l: readonly ChInsight[]) => l.map((i) => i.id);
  const shown = (p: ReturnType<typeof partitionInsights>) => (p.focus ? 1 : 0) + p.also.length + p.working.length;

  it('the caps are three and one', () => {
    expect(finding.kind).toBe('finding');
    expect(strength.kind).toBe('strength');
    expect([NEEDS_MAX, WORKING_MAX]).toEqual([3, 1]);
  });

  it.each([
    // [findings, strengths, focus, also, working, more]
    [0, 0, null, [], [], 0],
    [0, 1, null, [], ['s0'], 0],
    [0, 3, null, [], ['s0'], 2],
    [2, 0, 'f0', ['f1'], [], 0],
    [2, 1, 'f0', ['f1'], ['s0'], 0],
    [3, 0, 'f0', ['f1', 'f2'], [], 0],
    [3, 1, 'f0', ['f1', 'f2'], ['s0'], 0],
    [3, 3, 'f0', ['f1', 'f2'], ['s0'], 2],
    [9, 0, 'f0', ['f1', 'f2'], [], 6],
    [9, 1, 'f0', ['f1', 'f2'], ['s0'], 6],
    [9, 3, 'f0', ['f1', 'f2'], ['s0'], 8],
  ] as const)('%i that need work and %i working: focus %s, also %j, working %j, %i more', (f, s, focus, also, working, more) => {
    const list = [...needs(f), ...goods(s)];
    const p = partitionInsights(list);
    expect(p.focus?.id ?? null).toBe(focus);
    expect(ids(p.also)).toEqual(also);
    expect(ids(p.working)).toEqual(working);
    expect(p.more).toBe(more);
    // The counts are true: what is shown and what is left add up to every read the Deep dive lists.
    expect(shown(p) + p.more).toBe(list.length);
  });

  it('the feed’s order is kept: the board never re-ranks, it only stops after three', () => {
    const list = [...needs(5)].reverse();
    const p = partitionInsights(list);
    expect([p.focus!.id, ...ids(p.also)]).toEqual(['f4', 'f3', 'f2']);
  });

  it('a picked read from the list keeps the same three on the board; a picked strength is the one working', () => {
    const list = [...needs(9), ...goods(3)];
    const byFinding = partitionInsights(list, 'f2');
    expect(byFinding.focus!.id).toBe('f2');
    expect(ids(byFinding.also)).toEqual(['f0', 'f1']);
    expect(byFinding.more).toBe(8);
    const byStrength = partitionInsights(list, 's2');
    expect(byStrength.focus!.id).toBe('s2');
    expect(ids(byStrength.also)).toEqual(['f0', 'f1', 'f2']);
    expect(byStrength.working).toEqual([]);
    expect(byStrength.more).toBe(8);
  });

  it('a measured zero is not an open read on the board, and is counted among the reads in the Deep dive', () => {
    const zero = { ...finding, id: 'z', measuredZero: true };
    const p = partitionInsights([zero, ...needs(2), ...goods(1)]);
    expect(p.focus!.id).toBe('f0');
    expect(ids(p.also)).toEqual(['f1']);
    expect(p.more).toBe(1);
    // Picked before it was hidden: the board falls back to the current focus.
    expect(partitionInsights([zero, ...needs(1)], 'z').focus!.id).toBe('f0');
    // A zero that is not measured stays: a peer delta of 0 is no estimate, not nothing to fix.
    expect(partitionInsights([{ ...finding, id: 'pd' }]).focus!.id).toBe('pd');
  });

  it('an out-of-date read sorts after the current ones, so the cap cuts it first, and it is counted', () => {
    const stale = { ...finding, id: 'old', stale: { newestRound: 'Oct 5' } };
    const p = partitionInsights([stale, ...needs(3), ...goods(1)]);
    expect([p.focus!.id, ...ids(p.also)]).toEqual(['f0', 'f1', 'f2']);
    expect(ids(p.working)).toEqual(['s0']);
    expect(p.more).toBe(1);
    // With room for it, it is drawn last.
    expect(ids(partitionInsights([stale, ...needs(1)]).also)).toEqual(['old']);
  });

  it('a note is in neither the board nor the count', () => {
    const p = partitionInsights([note, ...needs(4)]);
    expect(p.more).toBe(1);
  });

  it('the line says how many are left, in words, and nothing when none are', () => {
    expect(moreReadsLine(0)).toBe('');
    expect(moreReadsLine(1)).toBe('1 more read in the Deep dive');
    expect(moreReadsLine(6)).toBe('6 more reads in the Deep dive');
  });
});
