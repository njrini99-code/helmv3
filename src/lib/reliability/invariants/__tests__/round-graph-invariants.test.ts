import { describe, it, expect } from 'vitest';
import { evaluateCompletedRoundsWithoutHoles, evaluateOrphanedShots } from '../round-graph-invariants';

describe('evaluateOrphanedShots', () => {
  it('reports zero violations as a real pass, with an empty sample', () => {
    const result = evaluateOrphanedShots(0, []);
    expect(result.violations).toBe(0);
    expect(result.sampleIds).toEqual([]);
    expect(result.severity).toBe('critical');
    expect(result.id).toBe('round-graph-orphaned-shots');
  });

  it('carries the exact count and a bounded sample through unchanged', () => {
    const result = evaluateOrphanedShots(42, ['shot-1', 'shot-2']);
    expect(result.violations).toBe(42);
    expect(result.sampleIds).toEqual(['shot-1', 'shot-2']);
  });

  it('does not mutate the caller\'s sample array', () => {
    const input = ['a', 'b'];
    const result = evaluateOrphanedShots(2, input);
    result.sampleIds.push('c');
    expect(input).toEqual(['a', 'b']);
  });
});

describe('evaluateCompletedRoundsWithoutHoles', () => {
  it('reports zero violations as a real pass', () => {
    const result = evaluateCompletedRoundsWithoutHoles(0, []);
    expect(result.violations).toBe(0);
    expect(result.id).toBe('round-graph-completed-without-holes');
    expect(result.severity).toBe('critical');
  });

  it('carries the exact count and sample through unchanged', () => {
    const result = evaluateCompletedRoundsWithoutHoles(3, ['round-1', 'round-2', 'round-3']);
    expect(result.violations).toBe(3);
    expect(result.sampleIds).toEqual(['round-1', 'round-2', 'round-3']);
  });
});
