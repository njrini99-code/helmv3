import { describe, expect, it } from 'vitest';
import { buildConfidenceReason as golfReason } from '@/lib/coachhelm/v3/engine/generator-base';
import { buildConfidenceReason, plainConfidenceReason, sureSentence } from '../confidence-reason';

/** READ-S1: the engine's bookkeeping reached coaches as "recency/variance not measured (sample-adequacy only)". */
const STORED = [
  '30 observations; recency/variance not measured (sample-adequacy only); sample adequate',
  '27 observations; recency/variance not measured (sample-adequacy only); sample 90% of target',
  '30 observations; recency measured 0.80; variance measured 0.60; sample adequate',
  '12 observations; sample 40% of target',
  'sample adequate',
  'Sample adequate.',
];

describe('how sure, in a coach’s words', () => {
  it('says the sample and the tier', () => {
    expect(sureSentence('27 approaches', 'solid')).toBe('27 approaches. Enough for a solid read.');
    expect(sureSentence('12 putts', 'early')).toBe('12 putts. Enough for an early read.');
    expect(sureSentence('4 rounds', 'thin')).toBe('4 rounds. Only a thin read so far.');
    expect(sureSentence('4 rounds', null)).toBe('4 rounds.');
  });

  it('both engines write the same plain sentence, and nothing about the blend', () => {
    const evidence = { sample_n: 27, confidence: 0.9, confidence_factors: { sample_adequacy: 0.9, recency: 1, variance: 0.5, factors_measured: false } };
    expect(buildConfidenceReason(evidence)).toBe('27 observations. Enough for a solid read.');
    expect(golfReason(evidence)).toBe(buildConfidenceReason(evidence));
    expect(plainConfidenceReason(buildConfidenceReason(evidence))).toBe('27 observations. Enough for a solid read.');
  });

  it.each(STORED)('a row stored with the old text reads as no reason: %s', (reason) => {
    expect(plainConfidenceReason(reason)).toBeNull();
  });

  it('a reason a person can use stands, and nothing is none', () => {
    expect(plainConfidenceReason(' Twenty-one rounds is enough to trust an average this size ')).toBe('Twenty-one rounds is enough to trust an average this size');
    expect(plainConfidenceReason('')).toBeNull();
    expect(plainConfidenceReason(undefined)).toBeNull();
  });
});
