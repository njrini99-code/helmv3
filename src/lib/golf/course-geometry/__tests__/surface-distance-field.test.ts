import { describe, expect, it } from 'vitest';
import type { HoleScene, LocalFeature, PointM } from '../types';
import type { LocalContextZone } from '../context-layer';
import {
  buildSignedDistanceField, buildSurfaceDistanceLayers, dequantizeSignedDistance, pathLines, quantizeSignedDistance,
  SDF_RANGE_M, SDF_ZERO, SURFACE_DISTANCE_LAYERS, type PolygonRings,
} from '../surface-distance-field';

const FRAME = { boundsM: [-50, -50, 50, 50] as const };
const RES = { width: 200, height: 200 };
const TEXEL = 0.5;

/** 512 sides keep the chord error under half a millimetre at r = 20 m. */
function circle(cx: number, cy: number, radius: number, sides = 512): PointM[] {
  const ring: PointM[] = [];
  for (let i = 0; i < sides; i++) { const a = 2 * Math.PI * i / sides; ring.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]); }
  ring.push(ring[0]!);
  return ring;
}
function square(cx: number, cy: number, half: number): PointM[] {
  return [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half], [cx - half, cy - half]];
}
/** Texel index whose centre is nearest world (x, y) on the 200×200 frame. */
function texel(x: number, y: number): number {
  const column = Math.min(RES.width - 1, Math.max(0, Math.round((x - FRAME.boundsM[0]) / TEXEL - .5)));
  const row = Math.min(RES.height - 1, Math.max(0, Math.round((y - FRAME.boundsM[1]) / TEXEL - .5)));
  return row * RES.width + column;
}
function distanceToSegment(p: PointM, a: PointM, b: PointM): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

describe('signed distance fields (§36 convention)', () => {
  it('lays texel centres out row-major from the south-west corner', () => {
    const field = buildSignedDistanceField([[square(0, 0, 10)]], FRAME, RES);
    expect(field.width).toBe(200); expect(field.height).toBe(200);
    expect(field.texelM).toEqual([0.5, 0.5]);
    expect(field.boundsM).toEqual([-50, -50, 50, 50]);
    expect(field.distanceM.length).toBe(200 * 200);
    expect(field.basis).toBe('source_derived_visual');
    // Row 0 is the south edge: the texel at (0, −49.75) lies 39.75 m south of the square.
    expect(field.distanceM[texel(0, -49.75)]).toBeCloseTo(-39.75, 5);
    expect(field.distanceM[0]).toBeCloseTo(-Math.hypot(39.75, 39.75), 5);
  });

  it('is positive inside a circle, negative outside, and matches the analytic distance', () => {
    const field = buildSignedDistanceField([[circle(0, 0, 20)]], FRAME, RES);
    // Texel centres sit at quarter metres: texel(0, 0) is (0.25, 0.25).
    expect(field.distanceM[texel(0, 0)]).toBeCloseTo(20 - Math.hypot(.25, .25), 2);
    expect(field.distanceM[texel(10.25, 0)]).toBeCloseTo(20 - Math.hypot(10.25, .25), 2);
    expect(field.distanceM[texel(30.25, 0)]).toBeCloseTo(-(Math.hypot(30.25, .25) - 20), 2);
    expect(field.distanceM[texel(-30.25, 30.25)]).toBeCloseTo(-(Math.hypot(30.25, 30.25) - 20), 2);
    // Texels straddling the rim are within half a texel diagonal of zero, on the correct side.
    let signs = 0;
    for (const angle of [0, 0.7, 1.9, 3.3, 4.6, 5.9]) {
      const inner = field.distanceM[texel(19.6 * Math.cos(angle), 19.6 * Math.sin(angle))]!, outer = field.distanceM[texel(20.4 * Math.cos(angle), 20.4 * Math.sin(angle))]!;
      expect(inner).toBeGreaterThan(0); expect(outer).toBeLessThan(0);
      expect(Math.abs(inner)).toBeLessThan(0.8); expect(Math.abs(outer)).toBeLessThan(0.8);
      signs++;
    }
    expect(signs).toBe(6);
  });

  it('treats holes as outside and overlapping polygons as one union', () => {
    const donut: PolygonRings = [circle(0, 0, 20), circle(0, 0, 6)];
    const field = buildSignedDistanceField([donut], FRAME, RES);
    expect(field.distanceM[texel(0, 0)]).toBeCloseTo(-(6 - Math.hypot(.25, .25)), 2);
    expect(field.distanceM[texel(13, 0)]).toBeCloseTo(20 - Math.hypot(13.25, .25), 2);
    expect(field.distanceM[texel(0, 30)]).toBeCloseTo(-(Math.hypot(.25, 30.25) - 20), 2);
    const union = buildSignedDistanceField([[square(-8, 0, 10)], [square(8, 0, 10)]], FRAME, RES);
    // The overlap belongs to both squares: inside, never negative.
    expect(union.distanceM[texel(0, 0)]).toBeGreaterThan(0);
    // South of the seam the nearest boundary is the shared bottom edge at y = −10.
    expect(union.distanceM[texel(0, -20.25)]).toBeCloseTo(-10.25, 5);
    // East of both squares the nearest boundary is the right square's edge at x = 18.
    expect(union.distanceM[texel(30.25, 0)]).toBeCloseTo(-12.25, 5);
  });

  it('builds path layers from centrelines as round-capped ribbons', () => {
    const field = buildSignedDistanceField({ lines: [{ points: [[-30, 0], [30, 0]], widthM: 3 }, { points: [[0, 10], [0, 40]], widthM: 6 }] }, FRAME, RES);
    expect(field.distanceM[texel(0, 0)]).toBeCloseTo(1.5 - .25, 5);
    expect(field.distanceM[texel(10, 0.75)]).toBeCloseTo(0.75, 5);
    expect(field.distanceM[texel(10, 5.25)]).toBeCloseTo(-3.75, 5);
    // The wider path wins where it is nearer.
    expect(field.distanceM[texel(0, 25)]).toBeCloseTo(3 - .25, 5);
    // Beyond a round cap the distance runs to the endpoint.
    expect(field.distanceM[texel(40.25, 0)]).toBeCloseTo(-(Math.hypot(10.25, .25) - 1.5), 5);
  });

  it('matches a brute-force minimum over segments everywhere', () => {
    const rings: PolygonRings[] = [[circle(-15, 10, 12, 40)], [square(20, -20, 9)], [[[-40, -40], [-20, -45], [-25, -20], [-40, -40]]]];
    const field = buildSignedDistanceField(rings, FRAME, RES);
    const segments: [PointM, PointM][] = [];
    for (const polygon of rings) for (const ring of polygon) for (let i = 1; i < ring.length; i++) segments.push([ring[i - 1]!, ring[i]!]);
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < 300; k++) {
      const column = Math.floor(random() * RES.width), row = Math.floor(random() * RES.height);
      const p: PointM = [FRAME.boundsM[0] + (column + .5) * TEXEL, FRAME.boundsM[1] + (row + .5) * TEXEL];
      const brute = Math.min(SDF_RANGE_M, segments.reduce((best, [a, b]) => Math.min(best, distanceToSegment(p, a, b)), Infinity));
      // Float32 storage: about 4e-6 at 36 m.
      expect(Math.abs(field.distanceM[row * RES.width + column]!)).toBeCloseTo(brute, 4);
    }
  });

  it('clamps to the reach and reads an empty layer as far outside', () => {
    const empty = buildSignedDistanceField([], FRAME, RES);
    expect(empty.distanceM.every(value => value === -SDF_RANGE_M)).toBe(true);
    const far = buildSignedDistanceField([[square(0, 0, 1)]], { boundsM: [-200, -200, 200, 200] }, { width: 80, height: 80 }, 30);
    expect(far.maxDistanceM).toBe(30);
    expect(far.distanceM[0]).toBe(-30);
    expect(Math.max(...far.distanceM)).toBeLessThanOrEqual(1);
    expect(() => buildSignedDistanceField([], { boundsM: [1, 0, 0, 1] }, RES)).toThrow(/ordered bounds/);
  });

  it('quantizes with the boundary at exactly 32768 and sub-2 mm error', () => {
    const values = Float32Array.from([0, 1.234, -1.234, 63.999, -63.999, 100, -100, 0.0009]);
    const packed = quantizeSignedDistance(values);
    expect(packed[0]).toBe(SDF_ZERO);
    expect(packed[5]).toBe(65535); expect(packed[6]).toBe(1);
    const step = SDF_RANGE_M / (SDF_ZERO - 1);
    expect(step).toBeLessThan(0.002);
    for (const i of [1, 2, 3, 4, 7]) expect(Math.abs(dequantizeSignedDistance(packed[i]!) - values[i]!)).toBeLessThanOrEqual(step / 2 + 1e-6);
    expect(dequantizeSignedDistance(SDF_ZERO)).toBe(0);
    expect(dequantizeSignedDistance(65535)).toBeCloseTo(SDF_RANGE_M, 9);
  });

  it('is deterministic', () => {
    const a = buildSignedDistanceField([[circle(3, -4, 15)]], FRAME, RES), b = buildSignedDistanceField([[circle(3, -4, 15)]], FRAME, RES);
    expect(a.distanceM).toEqual(b.distanceM);
  });

  it('builds the five hole layers from the scene, own and context features, paths from zones', () => {
    const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
    const zone = (id: string, cls: LocalContextZone['class'], line: PointM[], widthM?: number): LocalContextZone => ({
      id, class: cls, type: 'LineString', parts: [[line]], basis: 'source_geometry' as LocalContextZone['basis'], reviewed: true,
      fidelity: 'high', render: 'ribbon' as LocalContextZone['render'], attributes: widthM == null ? {} : { widthM },
    });
    const scene = {
      overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
      target: { kind: 'unknown_pin', greenFeatureId: 'green' },
      hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: ['green', 'bunker', 'fairway'], routeFeatureId: null, greenFeatureId: 'green', nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
      features: [feature('green', 'green', circle(30, 30, 10)), feature('bunker', 'bunker', circle(15, 30, 4)), feature('fairway', 'fairway', square(-10, 0, 20))],
      contextFeatures: [feature('pond', 'water', circle(-30, -30, 8))],
      contextZones: [zone('path', 'cart_path', [[-45, 40], [45, 40]]), zone('road', 'road', [[-45, -45], [45, -45]], 8), zone('wall', 'wall', [[0, 0], [1, 1]])],
      events: [], orientationRadians: 0, attribution: '',
    } as unknown as HoleScene;
    const { layerNames, layers } = buildSurfaceDistanceLayers(scene, FRAME, RES);
    expect(layerNames).toEqual([...SURFACE_DISTANCE_LAYERS]);
    expect(layers).toHaveLength(5);
    const at = (name: string, x: number, y: number) => layers[layerNames.indexOf(name as never)]!.distanceM[texel(x, y)]!;
    const quarter = Math.hypot(.25, .25);
    expect(at('green', 30, 30)).toBeCloseTo(10 - quarter, 1);
    expect(at('bunker', 30, 30)).toBeCloseTo(-(Math.hypot(15.25, .25) - 4), 1);
    expect(at('bunker', 15, 30)).toBeCloseTo(4 - quarter, 1);
    expect(at('fairway', -10, 0)).toBeCloseTo(19.75, 5);
    expect(at('water', -30, -30)).toBeCloseTo(8 - quarter, 1);
    expect(at('path', 0, 40)).toBeCloseTo(1.2 - .25, 5);
    expect(at('path', 0, -45)).toBeCloseTo(4 - .25, 5);
    expect(pathLines(scene.contextZones)).toHaveLength(2);
    expect(at('path', 0.25, 0.25)).toBeLessThan(0);
  });
});
