import { describe, expect, it } from 'vitest';
import { rankByAbsoluteStrokeImpact } from '@/lib/golf/pattern-impact-ranking';

const row = (id: string, stroke_impact: number | null) => ({ id, stroke_impact });

describe('rankByAbsoluteStrokeImpact', () => {
  it('ranks by the size of the impact, so the biggest NEGATIVE leak comes first', () => {
    const ranked = rankByAbsoluteStrokeImpact(
      [row('a', 1.5), row('b', -6.5), row('c', 3), row('d', -0.2), row('e', -4)],
      10,
    );
    expect(ranked.map((r) => r.id)).toEqual(['b', 'e', 'c', 'a', 'd']);
  });

  it('keeps only the top N by absolute impact', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row(`pos${i}`, 0.1 + i * 0.1)),
      row('big-leak', -9),
      row('mid-leak', -1.45),
    ];
    const ranked = rankByAbsoluteStrokeImpact(rows, 10);
    expect(ranked).toHaveLength(10);
    expect(ranked[0]!.id).toBe('big-leak');
    expect(ranked.map((r) => r.id)).toContain('mid-leak');
  });

  it('breaks ties deterministically: positive before negative, then by id', () => {
    const ranked = rankByAbsoluteStrokeImpact([row('z', -2), row('b', 2), row('a', 2), row('y', -2)], 10);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'y', 'z']);
  });

  it('puts rows with no usable impact last, never first', () => {
    const ranked = rankByAbsoluteStrokeImpact(
      [row('none', null), row('nan', Number.NaN), row('real', -0.1), row('zero', 0)],
      10,
    );
    expect(ranked.map((r) => r.id)).toEqual(['real', 'zero', 'nan', 'none']);
  });

  it('does not mutate its input and handles an empty list', () => {
    const input = [row('a', 1), row('b', -3)];
    rankByAbsoluteStrokeImpact(input, 10);
    expect(input.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rankByAbsoluteStrokeImpact([], 10)).toEqual([]);
  });
});
