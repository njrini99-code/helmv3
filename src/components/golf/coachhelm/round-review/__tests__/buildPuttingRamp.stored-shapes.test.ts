import { describe, it, expect } from 'vitest';
import { buildPuttingRamp } from '../buildReviewViewModel';
import type { RoundReviewContent } from '@/app/golf/actions/round-review-system';

/**
 * Audit row 42: new reviews bucket putts on the six shared edges, but
 * `golf_round_reviews.round_stats` is frozen jsonb — every review stored
 * before the change keeps the old four 0-5/5-15/15-25/25+ ranges. The ramp
 * must render whichever shape it is handed, verbatim.
 */
function breakdown(ranges: RoundReviewContent['puttingBreakdown']['ranges']): RoundReviewContent['puttingBreakdown'] {
  return { ranges, avgFirstPuttDist: null, threePuttHoles: [], onePuttCount: 0, totalPutts: 30 };
}

describe('buildPuttingRamp — stored bucket shapes', () => {
  it('renders an old four-bucket stored review as stored', () => {
    const ramp = buildPuttingRamp(breakdown([
      { label: '0-5 ft', attempts: 18, made: 16, pct: 89 },
      { label: '5-15 ft', attempts: 8, made: 2, pct: 25 },
      { label: '15-25 ft', attempts: 3, made: 0, pct: 0 },
      { label: '25+ ft', attempts: 0, made: 0, pct: 0 },
    ]));
    expect(ramp.cols).toEqual(['0-5 ft', '5-15 ft', '15-25 ft', '25+ ft']);
    expect(ramp.cells.map((c) => c.value)).toEqual(['89%', '25%', '0%', '—']);
    expect(ramp.cells[0]!.n).toBe('16/18');
  });

  it('renders a new six-bucket review', () => {
    const ramp = buildPuttingRamp(breakdown([
      { label: '0–3 ft', attempts: 12, made: 12, pct: 100 },
      { label: '3–5 ft', attempts: 5, made: 3, pct: 60 },
      { label: '5–10 ft', attempts: 6, made: 2, pct: 33 },
      { label: '10–15 ft', attempts: 3, made: 0, pct: 0 },
      { label: '15–25 ft', attempts: 3, made: 0, pct: 0 },
      { label: '25+ ft', attempts: 1, made: 0, pct: 0 },
    ]));
    expect(ramp.cols).toHaveLength(6);
    expect(ramp.cols[0]).toBe('0–3 ft');
  });

  it('tolerates an empty ranges array', () => {
    expect(buildPuttingRamp(breakdown([]))).toEqual({ cols: [], cells: [] });
  });
});
