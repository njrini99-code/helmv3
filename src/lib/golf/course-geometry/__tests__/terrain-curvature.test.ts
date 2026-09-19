import { describe, expect, it } from 'vitest';
import type { MetricTerrainGrid } from '../terrain-source';
import { compileCurvature, compileCurvatureFields, CURVATURE_SCALES, normalizeCurvature } from '../terrain-curvature';

/** Peek'n Peak's metric grids are 2 m, resampled from 1 m USGS 3DEP. */
const SPACING = 2;
const SIZE = 41;

/** A synthetic 41x41 grid at 2 m, centred so the middle node sits at (0, 0). */
function syntheticGrid(height: (x: number, y: number) => number | null, size = SIZE): MetricTerrainGrid {
  const originM: [number, number] = [-((size - 1) / 2) * SPACING, -((size - 1) / 2) * SPACING];
  const heightsM: (number | null)[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(originM[0] + column * SPACING, originM[1] + row * SPACING));
  return { originM, spacingM: SPACING, columns: size, rows: size, heightsM };
}
const at = (row: number, column: number) => row * SIZE + column;
const CENTRE = at((SIZE - 1) / 2, (SIZE - 1) / 2);
/** Nodes whose whole Laplacian stencil has a complete smoothing disc: the
 * stencil reaches one node out, and each of those needs `radiusNodes` more. */
const interiorMargin = (radiusM: number) => Math.max(1, Math.round(radiusM / SPACING)) + 1;
function worstInterior(values: Float32Array, radiusM: number): number {
  const margin = interiorMargin(radiusM);
  let worst = 0;
  for (let row = margin; row < SIZE - margin; row++) for (let column = margin; column < SIZE - margin; column++) worst = Math.max(worst, Math.abs(values[at(row, column)] ?? NaN));
  return worst;
}
const BOTH_SCALES = [CURVATURE_SCALES.localRadiusM, CURVATURE_SCALES.landformRadiusM];

describe('terrain curvature (§21–23)', () => {
  it('reads a plane as flat at both scales', () => {
    const plane = syntheticGrid((x, y) => 0.06 * x - 0.04 * y + 118);
    for (const radiusM of BOTH_SCALES) {
      const values = compileCurvature(plane, radiusM);
      expect(values.length).toBe(SIZE * SIZE);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(worstInterior(values, radiusM)).toBeLessThan(1e-6);
    }
  });

  it('reads a bowl as concave and recovers the analytic Laplacian', () => {
    const k = 0.01;
    const bowl = syntheticGrid((x, y) => k * (x * x + y * y));
    const local = compileCurvature(bowl, CURVATURE_SCALES.localRadiusM);
    const landform = compileCurvature(bowl, CURVATURE_SCALES.landformRadiusM);
    // Smoothing a paraboloid offsets it by a constant, so the 5-point
    // Laplacian stays exact: the only error is Float32 storage of 0.04
    // (~9e-10) plus double cancellation over heights to ~32 m (~1e-14).
    expect(local[CENTRE]).toBeCloseTo(4 * k, 6);
    expect(landform[CENTRE]).toBeCloseTo(4 * k, 6);
    // A paraboloid is concave everywhere, not only under the middle node.
    for (const node of [at(20, 20), at(14, 20), at(20, 26), at(17, 23)]) {
      expect(local[node]).toBeGreaterThan(0);
      expect(landform[node]).toBeGreaterThan(0);
    }
  });

  it('reads a hill as convex', () => {
    const k = 0.01;
    const hill = syntheticGrid((x, y) => 140 - k * (x * x + y * y));
    const local = compileCurvature(hill, CURVATURE_SCALES.localRadiusM);
    const landform = compileCurvature(hill, CURVATURE_SCALES.landformRadiusM);
    expect(local[CENTRE]).toBeCloseTo(-4 * k, 6);
    expect(landform[CENTRE]).toBeCloseTo(-4 * k, 6);
    for (const node of [at(14, 20), at(20, 26), at(17, 23)]) expect(local[node]).toBeLessThan(0);
  });

  it('separates a narrow bump from a broad hill', () => {
    // Gaussian sigma 2 m on a slope: analytically -2A/sigma^2 = -0.3 at the
    // peak before smoothing, attenuated but not erased by the local disc.
    const bump = syntheticGrid((x, y) => 0.04 * x + 0.6 * Math.exp(-(x * x + y * y) / 8));
    const bumpLocal = compileCurvature(bump, CURVATURE_SCALES.localRadiusM);
    const bumpLandform = compileCurvature(bump, CURVATURE_SCALES.landformRadiusM);
    expect(bumpLocal[CENTRE]).toBeLessThan(-0.05);
    expect(bumpLocal[CENTRE]).toBeGreaterThan(-0.25);
    // A 12 m disc averages the bump away; the landform scale barely sees it.
    expect(Math.abs(bumpLocal[CENTRE] ?? NaN)).toBeGreaterThan(50 * Math.abs(bumpLandform[CENTRE] ?? NaN));

    // Gaussian sigma 30 m: -2A/sigma^2 = -0.0111 at the peak, a landform the
    // 12 m disc cannot average away. It only widens it, from sigma^2 = 900 to
    // 900 + R^2/4 = 936, which costs the peak 900/936 of its amplitude:
    // -2 * 5 * (900 / 936) / 936 = -0.01027.
    const broad = syntheticGrid((x, y) => 5 * Math.exp(-(x * x + y * y) / 1800));
    const broadLocal = compileCurvature(broad, CURVATURE_SCALES.localRadiusM);
    const broadLandform = compileCurvature(broad, CURVATURE_SCALES.landformRadiusM);
    expect(broadLandform[CENTRE]).toBeLessThan(0);
    expect(broadLandform[CENTRE]).toBeCloseTo(-0.01027, 4);
    expect(broadLocal[CENTRE]).toBeCloseTo(-0.0111, 4);
    expect((broadLandform[CENTRE] ?? NaN) / (broadLocal[CENTRE] ?? NaN)).toBeGreaterThan(0.8);
  });

  it('treats a hole of nulls as unsupported without poisoning its rim', () => {
    const k = 0.01;
    const holed = syntheticGrid((x, y) => (Math.abs(x) <= SPACING && Math.abs(y) <= SPACING ? null : k * (x * x + y * y)));
    expect(holed.heightsM.filter(height => height == null).length).toBe(9);
    for (const radiusM of BOTH_SCALES) {
      const values = compileCurvature(holed, radiusM);
      expect(values.every(Number.isFinite)).toBe(true);
      // The hole itself reports nothing at all.
      for (const node of [CENTRE, at(19, 19), at(21, 21), at(19, 21)]) expect(values[node]).toBe(0);
      // Its rim still reads the bowl it sits in: dropping the axis that
      // points into the hole halves the magnitude, it never flips the sign.
      for (const node of [at(18, 20), at(22, 20), at(20, 18), at(20, 22), at(18, 18)]) expect(values[node]).toBeGreaterThan(0);
    }
    // Away from the hole the field is unchanged from the intact bowl.
    const intact = compileCurvature(syntheticGrid((x, y) => k * (x * x + y * y)), CURVATURE_SCALES.localRadiusM);
    expect(compileCurvature(holed, CURVATURE_SCALES.localRadiusM)[at(10, 10)]).toBeCloseTo(intact[at(10, 10)] ?? NaN, 9);
  });

  it('normalizes on robust percentiles and clamps the tails', () => {
    // 101 ascending values: type-7 p05 is 5 and p95 is 95 exactly.
    const values = Float32Array.from({ length: 101 }, (_, index) => index);
    const normalized = normalizeCurvature(values, null);
    expect(normalized[5]).toBeCloseTo(-1, 6);
    expect(normalized[95]).toBeCloseTo(1, 6);
    expect(normalized[50]).toBeCloseTo(0, 6);
    expect(normalized[0]).toBe(-1);
    expect(normalized[100]).toBe(1);
    expect(normalized.every(value => value >= -1 && value <= 1)).toBe(true);
  });

  it('computes percentiles over supported nodes only', () => {
    const values = Float32Array.from({ length: 101 }, (_, index) => index);
    const support = Uint8Array.from({ length: 101 }, (_, index) => (index >= 90 ? 0 : 1));
    const normalized = normalizeCurvature(values, support);
    // 90 supported values: type-7 p05 is 4.45 and p95 is 84.55.
    expect(normalized[5]).toBeCloseTo(2 * (5 - 4.45) / 80.1 - 1, 5);
    expect(normalized[84]).toBeCloseTo(2 * (84 - 4.45) / 80.1 - 1, 5);
    // Unsupported nodes carry no tint rather than the clamped +1 the same
    // raw value would earn inside the mask.
    expect(normalized[95]).toBe(0);
    expect(normalizeCurvature(values, null)[95]).toBe(1);
  });

  it('maps a degenerate range to zero', () => {
    expect(normalizeCurvature(new Float32Array(50).fill(3.25), null).every(value => value === 0)).toBe(true);
    const nearlyFlat = Float32Array.from({ length: 50 }, (_, index) => 1 + index * 1e-12);
    expect(normalizeCurvature(nearlyFlat, null).every(value => value === 0)).toBe(true);
    expect(normalizeCurvature(new Float32Array(8).fill(1), new Uint8Array(8)).every(value => value === 0)).toBe(true);
  });

  it('compiles both scales into one deterministic field set', () => {
    expect(Object.isFrozen(CURVATURE_SCALES)).toBe(true);
    expect(CURVATURE_SCALES).toEqual({ localRadiusM: 2.5, landformRadiusM: 12 });
    const saddle = syntheticGrid((x, y) => (Math.abs(x) <= SPACING && Math.abs(y) <= SPACING ? null : 0.01 * (x * x - 0.5 * y * y) + 0.3 * Math.sin(x / 3)));
    const fields = compileCurvatureFields(saddle);
    expect(fields.basis).toBe('source_derived_visual');
    expect(fields.scales).toEqual({ localRadiusM: 2.5, landformRadiusM: 12 });
    for (const field of [fields.local, fields.landform, fields.localNormalized, fields.landformNormalized]) {
      expect(field.length).toBe(SIZE * SIZE);
      expect(field.every(Number.isFinite)).toBe(true);
    }
    expect(fields.support.length).toBe(SIZE * SIZE);
    expect([...fields.support].filter(flag => flag === 0).length).toBe(9);
    expect(fields.support[CENTRE]).toBe(0);
    expect(fields.support[at(10, 10)]).toBe(1);
    expect(fields.localNormalized[CENTRE]).toBe(0);
    expect(fields.localNormalized.every(value => value >= -1 && value <= 1)).toBe(true);
    expect(fields.landformNormalized.every(value => value >= -1 && value <= 1)).toBe(true);
    // The normalized fields really do reach both rails on real terrain.
    expect(Math.min(...fields.localNormalized)).toBeCloseTo(-1, 6);
    expect(Math.max(...fields.localNormalized)).toBeCloseTo(1, 6);

    const again = compileCurvatureFields(saddle);
    expect([...again.local]).toEqual([...fields.local]);
    expect([...again.landform]).toEqual([...fields.landform]);
    expect([...again.localNormalized]).toEqual([...fields.localNormalized]);
    expect([...again.landformNormalized]).toEqual([...fields.landformNormalized]);
    expect([...again.support]).toEqual([...fields.support]);
  });
});
