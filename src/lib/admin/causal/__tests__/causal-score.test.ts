import { describe, it, expect } from 'vitest';
import { computeCausalScore, deriveTemporalComponent, type CausalComponentScore } from '../causal-score';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';

function component(name: CausalComponentScore['name'], score: number | null): CausalComponentScore {
  return { name, score, detail: 'test' };
}

describe('computeCausalScore', () => {
  it('returns unknown for an empty component list', () => {
    expect(computeCausalScore([])).toEqual({ label: 'unknown', confidence: null, components: [] });
  });

  it('returns unknown when every component has no evidence', () => {
    const components = [
      component('temporal', null),
      component('stack_overlap', null),
      component('changed_feature_overlap', null),
      component('historical_mechanism_match', null),
    ];
    const result = computeCausalScore(components);
    expect(result.label).toBe('unknown');
    expect(result.confidence).toBeNull();
  });

  it('never lets a single maxed-out component alone reach a high confidence', () => {
    const components = [
      component('temporal', 1),
      component('stack_overlap', null),
      component('changed_feature_overlap', null),
      component('historical_mechanism_match', null),
    ];
    const result = computeCausalScore(components);
    expect(result.label).toBe('likely-cause');
    expect(result.confidence).not.toBeNull();
    expect(result.confidence as number).toBeLessThan(0.3);
  });

  it('confidence rises as more independent components corroborate', () => {
    const one = computeCausalScore([component('temporal', 0.8), component('stack_overlap', null), component('changed_feature_overlap', null), component('historical_mechanism_match', null)]);
    const two = computeCausalScore([component('temporal', 0.8), component('stack_overlap', 0.8), component('changed_feature_overlap', null), component('historical_mechanism_match', null)]);
    const four = computeCausalScore([component('temporal', 0.8), component('stack_overlap', 0.8), component('changed_feature_overlap', 1), component('historical_mechanism_match', 0.8)]);
    expect((two.confidence as number)).toBeGreaterThan(one.confidence as number);
    expect((four.confidence as number)).toBeGreaterThan(two.confidence as number);
  });

  it('caps confidence below 1 even when every component is maxed', () => {
    const components = [
      component('temporal', 1),
      component('stack_overlap', 1),
      component('changed_feature_overlap', 1),
      component('historical_mechanism_match', 1),
    ];
    const result = computeCausalScore(components);
    expect(result.confidence as number).toBeLessThan(1);
    expect(result.confidence as number).toBeLessThanOrEqual(0.95);
  });

  it('a component scoring a real, measured zero does not by itself flip the label away from unknown when nothing else is evidenced', () => {
    const components = [
      component('temporal', null),
      component('stack_overlap', 0),
      component('changed_feature_overlap', null),
      component('historical_mechanism_match', null),
    ];
    const result = computeCausalScore(components);
    expect(result.label).toBe('unknown');
  });

  it('missing evidence never inflates confidence relative to the same components fully evidenced', () => {
    const partial = computeCausalScore([component('temporal', 0.9), component('stack_overlap', null), component('changed_feature_overlap', null), component('historical_mechanism_match', null)]);
    const full = computeCausalScore([component('temporal', 0.9), component('stack_overlap', 0.9), component('changed_feature_overlap', 0.9), component('historical_mechanism_match', 0.9)]);
    expect((partial.confidence as number)).toBeLessThan(full.confidence as number);
  });
});

describe('deriveTemporalComponent', () => {
  function verdict(relationship: ReleaseRelationshipVerdict['relationship'], confidence = 0.7): ReleaseRelationshipVerdict {
    return { relationship, confidence, evidenceFor: [], evidenceAgainst: [] };
  }

  it('carries the classifier confidence through for new-after-release', () => {
    const c = deriveTemporalComponent(verdict('new-after-release', 0.8));
    expect(c.score).toBe(0.8);
    expect(c.name).toBe('temporal');
  });

  it('carries the classifier confidence through for regressed-after-release', () => {
    const c = deriveTemporalComponent(verdict('regressed-after-release', 0.7));
    expect(c.score).toBe(0.7);
  });

  it('is null (no evidence FOR causation) for existed-before-release', () => {
    expect(deriveTemporalComponent(verdict('existed-before-release')).score).toBeNull();
  });

  it('is null for no-causal-signal', () => {
    expect(deriveTemporalComponent(verdict('no-causal-signal', 0)).score).toBeNull();
  });

  it('is null for unknown', () => {
    expect(deriveTemporalComponent(verdict('unknown', 0)).score).toBeNull();
  });

  it('is null for improved-after-release (evidence against, not for)', () => {
    expect(deriveTemporalComponent(verdict('improved-after-release')).score).toBeNull();
  });
});
