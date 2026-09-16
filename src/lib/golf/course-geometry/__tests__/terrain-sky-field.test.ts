import { describe, expect, it } from 'vitest';
import type { MetricTerrainGrid } from '../terrain-source';
import { compileSkyField, marchSteps, SKY_FIELD_OPTIONS } from '../terrain-sky-field';

/** Peek'n Peak's metric grids are 2 m, resampled from 1 m USGS 3DEP. */
const SPACING = 2;

/** A synthetic square grid at 2 m, centred so the middle node sits at (0, 0). */
function syntheticGrid(height: (x: number, y: number) => number | null, size: number): MetricTerrainGrid {
  const originM: [number, number] = [-((size - 1) / 2) * SPACING, -((size - 1) / 2) * SPACING];
  const heightsM: (number | null)[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(originM[0] + column * SPACING, originM[1] + row * SPACING));
  return { originM, spacingM: SPACING, columns: size, rows: size, heightsM };
}
/** Node index of the grid point nearest world (x, y) on a centred grid. */
function nodeAt(grid: MetricTerrainGrid, x: number, y: number): number {
  const column = Math.round((x - grid.originM[0]) / grid.spacingM), row = Math.round((y - grid.originM[1]) / grid.spacingM);
  return row * grid.columns + column;
}
/** Nodes whose every ray stays inside the grid. */
function interior(grid: MetricTerrainGrid, radiusM: number): number[] {
  const margin = Math.max(1, Math.round(radiusM / grid.spacingM)) + 1, nodes: number[] = [];
  for (let row = margin; row < grid.rows - margin; row++) for (let column = margin; column < grid.columns - margin; column++) nodes.push(row * grid.columns + column);
  return nodes;
}
const SIZE = 61;
const ORIGIN = (grid: MetricTerrainGrid) => nodeAt(grid, 0, 0);

describe('bent-sky field (§24–25)', () => {
  it('marches at geometric steps that end on the radius', () => {
    expect(marchSteps(20)).toEqual([1, 2, 3, 4, 6, 9, 14, 20]);
    expect(marchSteps(1)).toEqual([1]);
    expect(marchSteps(3)).toEqual([1, 2, 3]);
  });

  it('sees the whole sky from a horizontal plane, bent normal straight up', () => {
    const plane = syntheticGrid(() => 412, SIZE);
    const field = compileSkyField(plane);
    expect(field.visibility.length).toBe(SIZE * SIZE);
    expect(field.bentXY.length).toBe(SIZE * SIZE * 2);
    expect(field.exposure.length).toBe(SIZE * SIZE);
    expect(field.basis).toBe('source_derived_visual');
    expect(field.options).toEqual({ radiusM: 40, directions: 16 });
    for (let n = 0; n < field.visibility.length; n++) {
      expect(field.visibility[n]).toBe(1);
      expect(field.exposure[n]).toBe(0);
      expect(field.support[n]).toBe(1);
    }
    for (const n of interior(plane, SKY_FIELD_OPTIONS.radiusM)) {
      expect(Math.abs(field.bentXY[n * 2]!)).toBeLessThan(1e-6);
      expect(Math.abs(field.bentXY[n * 2 + 1]!)).toBeLessThan(1e-6);
    }
  });

  it('measures against the horizontal: a uniform slope loses a little sky and bends downhill', () => {
    const slope = syntheticGrid(x => 0.1 * x, SIZE);
    const field = compileSkyField(slope);
    for (const n of interior(slope, SKY_FIELD_OPTIONS.radiusM)) {
      expect(field.visibility[n]).toBeLessThan(1);
      expect(field.visibility[n]).toBeGreaterThan(0.9);
      // z rises with x, so the open sky lies toward −x.
      expect(field.bentXY[n * 2]).toBeLessThan(-1e-4);
      expect(Math.abs(field.bentXY[n * 2 + 1]!)).toBeLessThan(1e-6);
      expect(field.exposure[n]).toBeGreaterThan(0);
    }
  });

  it('encloses a valley floor and bends the walls toward the open side', () => {
    const valley = syntheticGrid(x => 0.3 * Math.abs(x), SIZE);
    const field = compileSkyField(valley);
    const floor = ORIGIN(valley), wall = nodeAt(valley, 30, 0), wallLeft = nodeAt(valley, -30, 0);
    expect(field.visibility[floor]).toBeLessThan(1);
    expect(field.visibility[floor]).toBeGreaterThan(0.6);
    // High on the wall the far side falls below the horizon, so more sky shows than on the floor.
    expect(field.visibility[wall]).toBeGreaterThan(field.visibility[floor]!);
    // Symmetric walls: the floor's bent normal is straight up.
    expect(Math.abs(field.bentXY[floor * 2]!)).toBeLessThan(1e-6);
    expect(Math.abs(field.bentXY[floor * 2 + 1]!)).toBeLessThan(1e-6);
    // On the +x wall the uphill (+x) rays are occluded, so the sky bends toward −x; mirror on the −x wall.
    expect(field.bentXY[wall * 2]).toBeLessThan(-0.01);
    expect(field.bentXY[wallLeft * 2]).toBeGreaterThan(0.01);
    expect(field.bentXY[wall * 2]).toBeCloseTo(-field.bentXY[wallLeft * 2]!, 6);
    // A floor sees no fall-away.
    expect(field.exposure[floor]).toBe(0);
  });

  it('leaves a ridge crest fully open and exposed, bending its flanks downhill', () => {
    const ridge = syntheticGrid(x => -0.3 * Math.abs(x), SIZE);
    const field = compileSkyField(ridge);
    const crest = ORIGIN(ridge), flank = nodeAt(ridge, 10, 0);
    expect(field.visibility[crest]).toBe(1);
    expect(field.exposure[crest]).toBeGreaterThan(0.05);
    expect(Math.abs(field.bentXY[crest * 2]!)).toBeLessThan(1e-6);
    // On the +x flank the crest (−x) occludes and the ground falls away toward +x.
    expect(field.visibility[flank]).toBeLessThan(1);
    expect(field.bentXY[flank * 2]).toBeGreaterThan(0.01);
    expect(field.exposure[flank]).toBeGreaterThan(0);
    expect(field.exposure[flank]).toBeLessThan(field.exposure[crest]!);
  });

  it('is deterministic and the direction count changes the sampling honestly', () => {
    const valley = syntheticGrid((x, y) => 0.3 * Math.abs(x) + 0.05 * Math.sin(y / 7), SIZE);
    const a = compileSkyField(valley), b = compileSkyField(valley);
    expect(a.visibility).toEqual(b.visibility);
    expect(a.bentXY).toEqual(b.bentXY);
    expect(a.exposure).toEqual(b.exposure);
    const eight = compileSkyField(valley, { radiusM: 40, directions: 8 }), sixteen = compileSkyField(valley, { radiusM: 40, directions: 16 });
    expect(eight.options.directions).toBe(8);
    expect(eight.visibility).not.toEqual(sixteen.visibility);
    for (const field of [eight, sixteen]) for (let n = 0; n < field.visibility.length; n++) {
      expect(field.visibility[n]).toBeGreaterThanOrEqual(0);
      expect(field.visibility[n]).toBeLessThanOrEqual(1);
      expect(Number.isFinite(field.bentXY[n * 2]!) && Number.isFinite(field.bentXY[n * 2 + 1]!)).toBe(true);
    }
  });

  it('respects the radius: ground beyond it neither occludes nor exposes', () => {
    const cliff = syntheticGrid(x => (x >= 60 ? 50 : 0), 101);
    const near = compileSkyField(cliff, { radiusM: 40, directions: 16 }), far = compileSkyField(cliff, { radiusM: 80, directions: 16 });
    const origin = ORIGIN(cliff);
    expect(near.visibility[origin]).toBe(1);
    expect(far.visibility[origin]).toBeLessThan(1);
    expect(far.bentXY[origin * 2]).toBeLessThan(0);
  });

  it('skips unsupported nodes and keeps their neighbours finite', () => {
    const holed = syntheticGrid((x, y) => (Math.hypot(x, y) < 9 ? null : 0.02 * x + 300), SIZE);
    const field = compileSkyField(holed);
    for (let n = 0; n < field.visibility.length; n++) {
      const supported = holed.heightsM[n] != null;
      expect(field.support[n]).toBe(supported ? 1 : 0);
      if (!supported) {
        expect(field.visibility[n]).toBe(0);
        expect(field.exposure[n]).toBe(0);
        expect(field.bentXY[n * 2]).toBe(0);
        expect(field.bentXY[n * 2 + 1]).toBe(0);
      } else {
        expect(Number.isFinite(field.visibility[n]!)).toBe(true);
        expect(field.visibility[n]).toBeGreaterThan(0.9);
      }
    }
    // A node on the hole's rim still answers from the rays that found ground.
    const rim = nodeAt(holed, 10, 0);
    expect(field.support[rim]).toBe(1);
    expect(field.visibility[rim]).toBeGreaterThan(0.9);
  });
});
