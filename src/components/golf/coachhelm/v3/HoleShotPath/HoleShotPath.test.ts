/**
 * HoleShotPath geometry tests.
 *
 * The component is mostly SVG paint; the load-bearing logic lives in
 * geometry.ts. These tests pin down the contract the user spelled
 * out: hazards land WHERE the player said the ball ended up, and the
 * shot endpoints are derived from real distance/lie data — not from
 * imagined course geometry.
 */

import { describe, it, expect } from 'vitest';
import {
  plotHole,
  inferHoleYardage,
  segmentPath,
  scoreToParLabel,
  formatYards,
  VB,
} from './geometry';
import type { ShotInput } from './types';

// ---------------------------------------------------------------------------
// inferHoleYardage — priority chain
// ---------------------------------------------------------------------------

describe('inferHoleYardage', () => {
  it('uses explicit yardage when provided', () => {
    expect(inferHoleYardage([], 4, 412)).toBe(412);
  });

  it('falls back to shot 1 distance_to_hole_before when yardage missing', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 150,
        distance_to_hole_before: 387,
      },
    ];
    expect(inferHoleYardage(shots, 4, null)).toBe(387);
  });

  it('falls back to par-based defaults when no data', () => {
    expect(inferHoleYardage([], 3, null)).toBe(175);
    expect(inferHoleYardage([], 4, null)).toBe(380);
    expect(inferHoleYardage([], 5, null)).toBe(525);
  });

  it('falls back to 360y as final default', () => {
    expect(inferHoleYardage([], undefined, null)).toBe(360);
  });
});

// ---------------------------------------------------------------------------
// plotHole — endpoint geometry from real data
// ---------------------------------------------------------------------------

describe('plotHole', () => {
  it('returns empty arrays for zero shots', () => {
    const plot = plotHole({ shots: [], par: 4, yardage: 400 });
    expect(plot.shots).toEqual([]);
    expect(plot.segments).toEqual([]);
    expect(plot.hazards).toEqual([]);
  });

  it('orders shots by shot_number even if input is out of order', () => {
    const shots: ShotInput[] = [
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 12 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots.map((s) => s.shot_number)).toEqual([1, 2, 3]);
  });

  it('places shot endpoints closer to pin as distance_to_hole_after shrinks', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300 },
      { shot_number: 2, lie_after: 'fairway', distance_to_hole_after: 100 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 20 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    // Smaller y = closer to pin (top of viewBox)
    expect(plot.shots[0]!.y).toBeGreaterThan(plot.shots[1]!.y);
    expect(plot.shots[1]!.y).toBeGreaterThan(plot.shots[2]!.y);
  });

  it('snaps the final putt to the pin coordinates', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 25 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 3, yardage: 175 });
    const last = plot.shots[plot.shots.length - 1]!;
    expect(last.x).toBe(plot.pin.x);
    expect(last.y).toBe(plot.pin.y);
  });

  it('miss-left pushes x left of fairway center, miss-right pushes right', () => {
    const left: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 150, miss_direction: 'left' },
    ];
    const right: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 150, miss_direction: 'right' },
    ];
    const lp = plotHole({ shots: left, par: 4, yardage: 400 });
    const rp = plotHole({ shots: right, par: 4, yardage: 400 });
    expect(lp.shots[0]!.x).toBeLessThan(50);
    expect(rp.shots[0]!.x).toBeGreaterThan(50);
  });

  it('respects viewBox bounds — no endpoint escapes the SVG', () => {
    const shots: ShotInput[] = Array.from({ length: 8 }, (_, i) => ({
      shot_number: i + 1,
      lie_after: 'rough' as const,
      distance_to_hole_after: 400 - i * 50,
      // Stack all misses left to force the clamp.
      miss_direction: 'left' as const,
    }));
    const plot = plotHole({ shots, par: 5, yardage: 525 });
    for (const s of plot.shots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(VB.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(VB.height);
    }
  });
});

// ---------------------------------------------------------------------------
// Hazards land AT the shot endpoint — the user's correction
// ---------------------------------------------------------------------------

describe('plotHole — hazards reconstruct from shot data', () => {
  it('plants a bunker at the endpoint where the player said they ended in sand', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 220,
        distance_to_hole_before: 400,
      },
      {
        // The user's literal example: "miss-bunker 112 yards away"
        shot_number: 2,
        lie_after: 'sand',
        distance_to_hole_after: 112,
        distance_to_hole_before: 220,
      },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards).toHaveLength(1);
    const sand = plot.hazards[0]!;
    expect(sand.kind).toBe('sand');
    // Bunker should sit at the same coordinates as shot 2's endpoint.
    const shot2 = plot.shots[1]!;
    expect(sand.x).toBe(shot2.x);
    expect(sand.y).toBe(shot2.y);
    expect(sand.origin_shot).toBe(2);
  });

  it('plants a rough cluster when lie_after === rough', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 180 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 380 });
    expect(plot.hazards).toHaveLength(1);
    expect(plot.hazards[0]!.kind).toBe('rough');
  });

  it('plants water for water lie OR for a penalty flag', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'water', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'fairway', distance_to_hole_after: 100, is_penalty: true },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards).toHaveLength(2);
    expect(plot.hazards[0]!.kind).toBe('water');
    expect(plot.hazards[1]!.kind).toBe('water');
  });

  it('does NOT plant a hazard for fairway or green lies', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 18 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards).toHaveLength(0);
  });

  it('normalizes v2 lie strings — bunker→sand, heavy_rough→rough', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'bunker', distance_to_hole_after: 80 },
      { shot_number: 2, lie_after: 'heavy_rough', distance_to_hole_after: 40 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards.map((h) => h.kind)).toEqual(['sand', 'rough']);
  });
});

// ---------------------------------------------------------------------------
// Segment paths — Bezier control point above the midpoint
// ---------------------------------------------------------------------------

describe('segmentPath', () => {
  it('produces a Quadratic Bezier "M…Q…" string', () => {
    const seg = {
      from: { x: 50, y: 180 },
      to: { x: 55, y: 100 },
      control: { x: 52.5, y: 130 },
      to_lie: 'fairway' as const,
      to_index: 0,
    };
    const d = segmentPath(seg);
    expect(d).toMatch(/^M /);
    expect(d).toContain(' Q ');
  });

  it('control point sits above (smaller y than) the midpoint for arc lift', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 200 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    const seg = plot.segments[0]!;
    const midY = (seg.from.y + seg.to.y) / 2;
    expect(seg.control.y).toBeLessThanOrEqual(midY);
  });
});

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

describe('formatYards', () => {
  it('returns em-dash for null', () => {
    expect(formatYards(null)).toBe('—');
  });

  it('handles sub-yard values', () => {
    expect(formatYards(0.3)).toBe('<1 yd');
  });

  it('rounds and pluralizes', () => {
    expect(formatYards(1)).toBe('1 yd');
    expect(formatYards(2)).toBe('2 yds');
    expect(formatYards(147.4)).toBe('147 yds');
  });
});

describe('scoreToParLabel', () => {
  it('returns null when score or par is missing', () => {
    expect(scoreToParLabel(null, 4)).toBe(null);
    expect(scoreToParLabel(4, undefined)).toBe(null);
  });

  it('maps standard golf scores', () => {
    expect(scoreToParLabel(4, 4)).toBe('E');
    expect(scoreToParLabel(3, 4)).toBe('Birdie');
    expect(scoreToParLabel(2, 4)).toBe('Eagle');
    expect(scoreToParLabel(1, 4)).toBe('Albatross');
    expect(scoreToParLabel(5, 4)).toBe('Bogey');
    expect(scoreToParLabel(6, 4)).toBe('Double');
    expect(scoreToParLabel(7, 4)).toBe('Triple');
  });

  it('falls through to numeric +N for larger scores', () => {
    expect(scoreToParLabel(8, 4)).toBe('+4');
  });
});
