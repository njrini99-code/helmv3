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
import {
  buildExposureRows,
  dedupeExposureRows,
  exposureDedupeKey,
  startOfUtcDayIso,
} from '@/lib/coachhelm/v3/effectiveness/exposure-rows';

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

// ---------------------------------------------------------------------------
// #1506 — dedup: one exposure row per (insight, coach, surface, day)
// ---------------------------------------------------------------------------
//
// `recordExposureForReturned` fires on every server render, not once per
// view. Production measured up to 349 rows for a single (insight, coach, day)
// bucket. `dedupeExposureRows` is the app-level, racy-but-adequate filter
// (issue's Option 1) applied right before insert — this pins its logic.

describe('exposureDedupeKey', () => {
  it('is the same key regardless of which fields are undefined vs null', () => {
    expect(exposureDedupeKey({ insight_id: 'i1', coach_id: null, surface: null })).toBe(
      exposureDedupeKey({ insight_id: 'i1' }),
    );
  });

  it('distinguishes different coaches viewing the same insight', () => {
    const a = exposureDedupeKey({ insight_id: 'i1', coach_id: 'c1', surface: 'coach_feed' });
    const b = exposureDedupeKey({ insight_id: 'i1', coach_id: 'c2', surface: 'coach_feed' });
    expect(a).not.toBe(b);
  });

  it('distinguishes different surfaces for the same insight and coach', () => {
    const a = exposureDedupeKey({ insight_id: 'i1', coach_id: 'c1', surface: 'coach_feed' });
    const b = exposureDedupeKey({ insight_id: 'i1', coach_id: 'c1', surface: 'roster_card' });
    expect(a).not.toBe(b);
  });
});

describe('dedupeExposureRows', () => {
  const row = (insight_id: string, coach_id: string | null, surface: string) => ({
    insight_id,
    player_id: 'p1',
    coach_id,
    surface,
    rank_position: 0,
  });

  it('drops a row whose (insight, coach, surface) key was already recorded today', () => {
    const rows = [row('i1', 'c1', 'coach_feed'), row('i2', 'c1', 'coach_feed')];
    const already = new Set([exposureDedupeKey({ insight_id: 'i1', coach_id: 'c1', surface: 'coach_feed' })]);

    const out = dedupeExposureRows(rows, already);

    expect(out.map((r) => r.insight_id)).toEqual(['i2']);
  });

  it('keeps every row when nothing has been recorded yet', () => {
    const rows = [row('i1', 'c1', 'coach_feed'), row('i2', 'c1', 'coach_feed')];
    expect(dedupeExposureRows(rows, new Set())).toHaveLength(2);
  });

  it('collapses many renders of the same insight down to one row — the #1506 shape', () => {
    // 349 renders in a day of the same (insight, coach, surface) triple.
    const rows = Array.from({ length: 349 }, () => row('i1', 'c1', 'coach_feed'));
    // The first render's key is already "recorded" by the time later renders
    // in the same batch are filtered — simulating same-day re-selects.
    const already = new Set([exposureDedupeKey({ insight_id: 'i1', coach_id: 'c1', surface: 'coach_feed' })]);

    expect(dedupeExposureRows(rows, already)).toHaveLength(0);
  });

  it('does not confuse a null coach_id (player-facing surfaces) with a real one', () => {
    const rows = [row('i1', null, 'player_feed')];
    const already = new Set([exposureDedupeKey({ insight_id: 'i1', coach_id: 'c9', surface: 'player_feed' })]);

    expect(dedupeExposureRows(rows, already)).toHaveLength(1);
  });
});

describe('startOfUtcDayIso', () => {
  it('floors to UTC midnight of the given day', () => {
    expect(startOfUtcDayIso(new Date('2026-08-18T23:59:59.999Z'))).toBe('2026-08-18T00:00:00.000Z');
    expect(startOfUtcDayIso(new Date('2026-08-18T00:00:00.000Z'))).toBe('2026-08-18T00:00:00.000Z');
  });
});
