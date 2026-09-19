import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import {
  assertFairwayDirectionField, compileFairwayDirectionField, FAIRWAY_DIRECTION_UNIFORMS, fairwayDirectionLayer,
  fairwayDirectionShaderChunk, fairwayGrainAt, type FairwayDirectionField,
} from '../fairway-direction-field';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { Geometry, HoleScene, LocalFeature, PointM } from '../types';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);

function feature(id: string, kind: LocalFeature['kind'], line: readonly PointM[]): LocalFeature {
  const type: Geometry['type'] = kind === 'route' ? 'LineString' : 'Polygon';
  return { id, kind, type, parts: [[[...line]]], reviewed: true };
}
function sceneWith(features: LocalFeature[], routeFeatureId: string | null): HoleScene {
  return {
    features, contextFeatures: [],
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: features.map(f => f.id), routeFeatureId, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
  } as unknown as HoleScene;
}
function meshWith(grid: MetricTerrainGrid): TerrainMesh {
  return { metricGrid: grid } as unknown as TerrainMesh;
}
function syntheticGrid(originM: [number, number], spacingM: number, columns: number, rows: number): MetricTerrainGrid {
  return { originM, spacingM, columns, rows, heightsM: new Array(columns * rows).fill(0) };
}
/** Minimal difference between two mod-π angles (radians), for comparing a decoded direction against a known tangent. */
function angleDiffModPi(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}
const decodedBand = (code: number) => Math.sin(2 * Math.PI * (code / 255));

describe('fairway direction field (V2 plan §43–47; Task 12)', () => {
  it('follows the route: direction rotates through a dogleg, not a fixed global heading', () => {
    // Two legs: east from (0,50) to (100,50), then north from (100,50) to (100,150).
    const route = feature('route', 'route', [[0, 50], [100, 50], [100, 150]]);
    const fairway = feature('fairway-1', 'fairway', [[-10, 30], [110, 30], [110, 160], [-10, 160]]);
    const scene = sceneWith([route, fairway], 'route');
    const grid = syntheticGrid([-20, -20], 10, 20, 20);
    const field = compileFairwayDirectionField(meshWith(grid), scene, { skew: 0 });
    expect(() => assertFairwayDirectionField(field)).not.toThrow();

    const indexAt = (x: number, y: number) => ((y - grid.originM[1]) / grid.spacingM) * field.columns + (x - grid.originM[0]) / grid.spacingM;
    const iEast = indexAt(50, 50), iNorth = indexAt(100, 120);
    expect(field.active[iEast]).toBe(1);
    expect(field.active[iNorth]).toBe(1);
    const angleEast = (field.directionAngle[iEast]! / 255) * Math.PI, angleNorth = (field.directionAngle[iNorth]! / 255) * Math.PI;
    // East leg: mow-line direction is the route tangent (1, 0) -> angle 0 (mod π).
    expect(angleDiffModPi(angleEast, 0)).toBeLessThan(0.02);
    // North leg: mow-line direction is the route tangent (0, 1) -> angle π/2.
    expect(angleDiffModPi(angleNorth, Math.PI / 2)).toBeLessThan(0.02);
    // The two legs must actually differ (the field is not one fixed heading).
    expect(angleDiffModPi(angleEast, angleNorth)).toBeGreaterThan(1.5);
  });

  it('alternates stripes with the plan-configured period, along the lateral (t) axis at skew 0', () => {
    const route = feature('route', 'route', [[0, 50], [200, 50]]);
    const fairway = feature('fairway-1', 'fairway', [[-5, 30], [25, 30], [25, 70], [-5, 70]]);
    const scene = sceneWith([route, fairway], 'route');
    const grid = syntheticGrid([0, 0], 1, 30, 100);
    const field = compileFairwayDirectionField(meshWith(grid), scene, { skew: 0, periodWM: 8 });
    const at = (x: number, y: number) => y * field.columns + x;
    // t = 0, W/4, W/2, 3W/4, W at x = 10 (a fixed s): band should trace one full sine cycle.
    expect(decodedBand(field.stripePhase[at(10, 50)]!)).toBeCloseTo(0, 1);
    expect(decodedBand(field.stripePhase[at(10, 52)]!)).toBeGreaterThan(0.9);
    expect(decodedBand(field.stripePhase[at(10, 54)]!)).toBeCloseTo(0, 1);
    expect(decodedBand(field.stripePhase[at(10, 56)]!)).toBeLessThan(-0.9);
    // A full period (t = W) returns to the same quantized phase as t = 0.
    expect(field.stripePhase[at(10, 58)]).toBe(field.stripePhase[at(10, 50)]);
  });

  it('leaves nodes clearly outside the fairway/tee untouched: no active flag, no invented angle or phase', () => {
    const route = feature('route', 'route', [[0, 50], [200, 50]]);
    const fairway = feature('fairway-1', 'fairway', [[-5, 30], [25, 30], [25, 70], [-5, 70]]);
    const scene = sceneWith([route, fairway], 'route');
    const grid = syntheticGrid([0, 0], 1, 30, 100);
    const field = compileFairwayDirectionField(meshWith(grid), scene, {});
    const i = 90 * field.columns + 10; // (10, 90): well outside the fairway band [30, 70].
    expect(field.active[i]).toBe(0);
    expect(field.directionAngle[i]).toBe(0);
    expect(field.stripePhase[i]).toBe(0);
  });

  it('compiles a fully inactive field when the hole carries no route (constraint 15: nothing invented)', () => {
    const fairway = feature('fairway-1', 'fairway', [[-5, 30], [25, 30], [25, 70], [-5, 70]]);
    const scene = sceneWith([fairway], null);
    const grid = syntheticGrid([0, 0], 5, 10, 20);
    const field = compileFairwayDirectionField(meshWith(grid), scene, {});
    expect(field.stats.activeShare).toBe(0);
    expect(field.active.every(v => v === 0)).toBe(true);
    expect(field.directionAngle.every(v => v === 0)).toBe(true);
    expect(field.stripePhase.every(v => v === 0)).toBe(true);
    expect(() => assertFairwayDirectionField(field)).not.toThrow();
  });

  it('packs direction and phase as interleaved R,G bytes, matching the field 1:1', () => {
    const route = feature('route', 'route', [[0, 0], [40, 0]]);
    const fairway = feature('fairway-1', 'fairway', [[-2, -10], [42, -10], [42, 10], [-2, 10]]);
    const scene = sceneWith([route, fairway], 'route');
    const grid = syntheticGrid([0, -10], 2, 21, 11);
    const field = compileFairwayDirectionField(meshWith(grid), scene, {});
    const layer = fairwayDirectionLayer(field);
    expect(layer.name).toBe('fairway_direction');
    expect(layer.columns).toBe(field.columns); expect(layer.rows).toBe(field.rows);
    expect(layer.values.length).toBe(field.columns * field.rows * 2);
    for (let i = 0; i < field.columns * field.rows; i += 7) {
      expect(layer.values[i * 2]).toBe(field.directionAngle[i]);
      expect(layer.values[i * 2 + 1]).toBe(field.stripePhase[i]);
    }
  });

  it('fairwayGrainAt: the anisotropic sheen drops to its floor along the mow line and peaks looking across it or straight down', () => {
    // A hand-built one-node field: direction angle 0 (pointing +x), phase near the band's positive peak.
    const field: FairwayDirectionField = {
      originM: [0, 0], spacingM: 1, columns: 1, rows: 1,
      active: Uint8Array.from([1]), directionAngle: Uint8Array.from([0]), stripePhase: Uint8Array.from([64]),
      periodWM: 8, skew: 0, sheenPower: 2, sheenFloor: .75, albedoAmplitude: 0.03, roughnessAmplitude: 0.03,
      stats: { activeShare: 1, ms: 0 }, basis: 'illustrative_style',
    };
    const alongLine = fairwayGrainAt(field, 0, 0, [1, 0, 0]);
    const acrossLine = fairwayGrainAt(field, 0, 0, [0, 1, 0]);
    // Along the line the bands keep their floor (never vanish), across it they peak.
    expect(alongLine.albedo).toBeGreaterThan(1.01);
    expect(alongLine.albedo).toBeCloseTo(1 + (acrossLine.albedo - 1) * .75, 6);
    expect(acrossLine.albedo).toBeGreaterThan(1.02);
    expect(acrossLine.roughness).toBeGreaterThan(0.02);
    const straightDown = fairwayGrainAt(field, 0, 0, [0, 0, 1]);
    // A purely vertical view direction has zero horizontal component, so it
    // reads the same maximal sheen as looking directly across the line.
    expect(straightDown.albedo).toBeCloseTo(acrossLine.albedo, 6);
    expect(straightDown.roughness).toBeCloseTo(acrossLine.roughness, 6);
    // Off the field entirely: neutral.
    expect(fairwayGrainAt(field, 500, 500, [0, 1, 0])).toEqual({ albedo: 1, roughness: 0 });
  });

  it('assertFairwayDirectionField gates a field that invented a value on an inactive node', () => {
    const field: FairwayDirectionField = {
      originM: [0, 0], spacingM: 1, columns: 2, rows: 1,
      active: Uint8Array.from([1, 0]), directionAngle: Uint8Array.from([10, 0]), stripePhase: Uint8Array.from([20, 0]),
      periodWM: 6.5, skew: 0.16, sheenPower: 2, sheenFloor: .75, albedoAmplitude: 0.03, roughnessAmplitude: 0.03,
      stats: { activeShare: 0.5, ms: 0 }, basis: 'illustrative_style',
    };
    expect(() => assertFairwayDirectionField(field)).not.toThrow();
    const corrupted: FairwayDirectionField = { ...field, directionAngle: Uint8Array.from([10, 7]) };
    expect(() => assertFairwayDirectionField(corrupted)).toThrow(/inactive but non-zero/);
  });

  it('produces a GLSL chunk carrying the golfV2-prefixed uniforms and the anti-alias guard', () => {
    const chunk = fairwayDirectionShaderChunk();
    expect(chunk.uniforms).toBe(FAIRWAY_DIRECTION_UNIFORMS);
    expect(chunk.glsl).toContain(`uniform sampler2D ${FAIRWAY_DIRECTION_UNIFORMS.sampler}`);
    expect(chunk.glsl).toContain(`uniform vec4 ${FAIRWAY_DIRECTION_UNIFORMS.frame}`);
    expect(chunk.glsl).toContain(`uniform vec2 ${FAIRWAY_DIRECTION_UNIFORMS.texelM}`);
    expect(chunk.glsl).toContain('vec2 golfV2FairwayGrain(vec2 golfFwWorldXY, vec3 golfFwViewDirWS)');
    expect(chunk.glsl).toContain('fwidth(golfFwPhase)');
    expect(chunk.glsl).not.toContain('three');
  });

  it('compiles hole 7 deterministically from the real fixture', () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
    const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
    const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
    const hole = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    const holeScene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole);
    const a = compileFairwayDirectionField(hole, holeScene), b = compileFairwayDirectionField(hole, holeScene);
    expect(() => assertFairwayDirectionField(a)).not.toThrow();
    expect(Array.from(a.active)).toEqual(Array.from(b.active));
    expect(Array.from(a.directionAngle)).toEqual(Array.from(b.directionAngle));
    expect(Array.from(a.stripePhase)).toEqual(Array.from(b.stripePhase));
    expect(a.stats.activeShare).toBe(b.stats.activeShare);
    // Hole 7 has a real fairway, but is not entirely fairway.
    expect(a.stats.activeShare).toBeGreaterThan(0);
    expect(a.stats.activeShare).toBeLessThan(1);
  });
});
