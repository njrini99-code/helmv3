/**
 * `golf_insight_exposure.rank_score` is NULL on every row ever written.
 *
 * Measured against production 2026-08-18:
 *
 *     rows                        127,295
 *     distinct insights               203
 *     rank_position populated     127,295
 *     rank_score populated              0
 *     orphaned insight_id               0
 *
 * The writer accepts it — `recordInsightExposure` maps `rank_score:
 * r.rank_score ?? null` — but nothing supplies one. `recordExposureForReturned`
 * in insight-delivery.ts takes `Array<{ id, player_id }>`, so a score cannot
 * even be expressed at the call site.
 *
 * The score is not missing, it is DISCARDED. `rankEvidenceInsights` computes
 * one per insight, sorts on it, and then does `.map((row) => row.insight)` —
 * throwing it away one line before the ledger would record it.
 *
 * Why the column is worth filling rather than dropping: `rank_position` is
 * list-relative, so position 0 of a 2-item feed and position 0 of a 20-item
 * feed are indistinguishable, and a change in ranking QUALITY over time is
 * invisible. `rank_score` is absolute and comparable across surfaces and
 * across time — which matters now specifically, because `readStrokeImpact`
 * (6d2ea74b7) fixed the feed reading `strokes_impact` from the wrong key, so
 * every score before that fix was computed from a null impact. Recording the
 * score is what lets that change be seen rather than asserted.
 */
import { describe, it, expect } from 'vitest';
import { buildExposureRows } from '@/lib/coachhelm/v3/effectiveness/exposure-rows';

const INSIGHTS = [
  { id: 'i1', player_id: 'p1' },
  { id: 'i2', player_id: 'p1' },
  { id: 'i3', player_id: 'p2' },
];

describe('buildExposureRows', () => {
  it('carries the rank score for each insight when one is known', () => {
    const rows = buildExposureRows(INSIGHTS, 'coach_feed', 'c1', new Map([
      ['i1', 4.25],
      ['i2', 1.5],
      ['i3', 0.75],
    ]));

    expect(rows.map((r) => r.rank_score)).toEqual([4.25, 1.5, 0.75]);
  });

  it('still records position, surface and coach', () => {
    const rows = buildExposureRows(INSIGHTS, 'coach_feed', 'c1');

    expect(rows.map((r) => r.rank_position)).toEqual([0, 1, 2]);
    expect(rows.every((r) => r.surface === 'coach_feed')).toBe(true);
    expect(rows.every((r) => r.coach_id === 'c1')).toBe(true);
  });

  it('leaves rank_score undefined on surfaces that do not rank', () => {
    // hub_signal / roster_card / round_review pick a single insight without
    // producing a comparable score. A fabricated 0 would read as "ranked last".
    const rows = buildExposureRows([INSIGHTS[0]!], 'round_review', null);
    expect(rows[0]!.rank_score).toBeUndefined();
  });

  it('omits a score for an insight missing from the map rather than defaulting it', () => {
    const rows = buildExposureRows(INSIGHTS, 'coach_feed', 'c1', new Map([['i1', 4.25]]));

    expect(rows[0]!.rank_score).toBe(4.25);
    expect(rows[1]!.rank_score).toBeUndefined();
    expect(rows[2]!.rank_score).toBeUndefined();
  });

  it('keeps a genuine zero score, which is not the same as unknown', () => {
    const rows = buildExposureRows([INSIGHTS[0]!], 'coach_feed', 'c1', new Map([['i1', 0]]));
    expect(rows[0]!.rank_score).toBe(0);
  });

  it('drops rows with no id or no player_id rather than writing a broken one', () => {
    const rows = buildExposureRows(
      [{ id: '', player_id: 'p1' }, { id: 'i2', player_id: '' }, INSIGHTS[0]!],
      'coach_feed',
      'c1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.insight_id).toBe('i1');
    // Position is the index in the SURFACED list, so it must be re-derived
    // after filtering rather than inherited from the original array.
    expect(rows[0]!.rank_position).toBe(0);
  });

  it('returns nothing for an empty list', () => {
    expect(buildExposureRows([], 'coach_feed', 'c1')).toEqual([]);
  });
});
