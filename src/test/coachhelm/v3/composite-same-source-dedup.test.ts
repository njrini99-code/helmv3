import { describe, it, expect } from 'vitest';
import { sharesSource, dedupeBySharedSource } from '@/lib/coachhelm/v3/composite/synthesis';

describe('sharesSource', () => {
  it('true when two composites name at least one common source insight', () => {
    expect(sharesSource(['lag', 'short'], ['pressure', 'short'])).toBe(true);
  });
  it('false when sources are disjoint', () => {
    expect(sharesSource(['lag', 'short'], ['pressure', 'mid'])).toBe(false);
  });
  it('false for two ctx composites (both empty) — never collapse independent ctx cascades', () => {
    expect(sharesSource([], [])).toBe(false);
    expect(sharesSource([], ['x'])).toBe(false);
  });
});

describe('dedupeBySharedSource', () => {
  const A = { id: 'A', ids: ['lag', 'short'], impact: 0.9 };
  const B = { id: 'B', ids: ['pressure', 'short'], impact: 0.4 };
  const C = { id: 'C', ids: ['tee', 'fairway'], impact: 0.2 };
  it('keeps the higher-impact composite when two share a source', () => {
    const kept = dedupeBySharedSource([A, B, C], (m) => m.ids, (m) => m.impact).map((m) => m.id);
    expect(kept).toContain('A');
    expect(kept).not.toContain('B');
    expect(kept).toContain('C');
  });
  it('is deterministic on an impact tie (lexically-smaller id wins)', () => {
    const X = { id: 'X', ids: ['s'], impact: 0.5 };
    const Y = { id: 'Y', ids: ['s'], impact: 0.5 };
    const kept = dedupeBySharedSource([Y, X], (m) => m.ids, (m) => m.impact).map((m) => m.id);
    expect(kept).toEqual(['X']);
  });
  it('never collapses two ctx composites that share no source (both empty)', () => {
    const F = { id: 'closing', ids: [], impact: 0.6 };
    const G = { id: 'front9', ids: [], impact: 0.5 };
    const kept = dedupeBySharedSource([F, G], (m) => m.ids, (m) => m.impact).map((m) => m.id);
    expect(kept).toEqual(['closing', 'front9']);
  });
});
