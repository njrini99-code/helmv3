import { describe, expect, it } from 'vitest';
import type { HoleScene, LocalFeature, PointM } from '../types';
import type { MetricTerrainGrid } from '../terrain-source';
import type { TerrainMesh } from '../terrain';
import { compileCurvatureFields } from '../terrain-curvature';
import { compileSkyField } from '../terrain-sky-field';
import { SURFACE_DISTANCE_LAYERS } from '../surface-distance-field';
import { BOUNDARY_DISTANCE_RANGE_M, compileFieldAtlas, FIELD_ATLAS_OPTIONS, fieldAtlasBytes, RELIEF_SLOPE_RANGE_M, sampleFieldAtlas } from '../field-atlas';

const SPACING = 2;
/** A synthetic square grid at 2 m, centred so the middle node sits at (0, 0) (mirrors terrain-sky-field.test.ts). */
function syntheticGrid(height: (x: number, y: number) => number | null, size: number): MetricTerrainGrid {
  const originM: [number, number] = [-((size - 1) / 2) * SPACING, -((size - 1) / 2) * SPACING];
  const heightsM: (number | null)[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(originM[0] + column * SPACING, originM[1] + row * SPACING));
  return { originM, spacingM: SPACING, columns: size, rows: size, heightsM };
}
function circle(cx: number, cy: number, radius: number, sides = 64): PointM[] {
  const ring: PointM[] = [];
  for (let i = 0; i < sides; i++) { const a = 2 * Math.PI * i / sides; ring.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]); }
  ring.push(ring[0]!);
  return ring;
}
function feature(id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature { return { id, kind, type: 'Polygon', parts: [[ring]], reviewed: true }; }
function sceneWith(features: LocalFeature[]): HoleScene {
  return {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: null },
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: features.map(f => f.id), routeFeatureId: null, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features, events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
}
function meshWith(grid?: MetricTerrainGrid, tacticalBoundsM?: [number, number, number, number]): TerrainMesh {
  return {
    metricGrid: grid,
    renderProfile: tacticalBoundsM && {
      compilerVersion: 'x', styleVersion: 'x', tacticalBoundsM, contextBoundsM: tacticalBoundsM,
      terrainAvailable: true, contextCoverage: 'complete', teeGeometry: 'reviewed', treeEvidence: 'none', limitations: [],
    },
  } as unknown as TerrainMesh;
}
const BOUNDS: [number, number, number, number] = [-40, -40, 40, 40];

describe('field atlas packer (§16–19, §108)', () => {
  it('sizes the grid from bounds and target size and reports the six sdf layers', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(), BOUNDS, { targetSize: 64 });
    expect(atlas.width).toBe(64); expect(atlas.height).toBe(64);
    expect(atlas.boundsM).toEqual(BOUNDS);
    expect(atlas.basis).toBe('source_derived_visual');
    expect(atlas.sdfLayers?.layerNames).toEqual([...SURFACE_DISTANCE_LAYERS]);
    expect(atlas.sdfLayers?.data.length).toBe(64 * 64 * 6);
    expect(atlas.reliefRGBA16F.length).toBe(64 * 64 * 4);
    expect(atlas.bentRGBA8.length).toBe(64 * 64 * 4);
    expect(atlas.semanticRGBA8.length).toBe(64 * 64 * 4);
  });

  it('keeps a non-square bounds box at one uniform texel size', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(), [-40, -20, 40, 20], { targetSize: 80 });
    expect(atlas.width).toBe(80); expect(atlas.height).toBe(40);
  });

  it('defaults to a 512-texel target size', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(), BOUNDS);
    expect(Math.max(atlas.width, atlas.height)).toBe(FIELD_ATLAS_OPTIONS.targetSize);
  });

  it('rejects degenerate bounds', () => {
    expect(() => compileFieldAtlas(sceneWith([]), meshWith(), [10, 0, 0, 10])).toThrow(/bounds/);
  });

  it('defaults relief and bent channels to the unsupported-neutral values without a metric grid', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(undefined), BOUNDS, { targetSize: 32 });
    expect(sampleFieldAtlas(atlas, 'dzdx', 0, 0)).toBeCloseTo(0, 6);
    expect(sampleFieldAtlas(atlas, 'dzdy', 0, 0)).toBeCloseTo(0, 6);
    expect(sampleFieldAtlas(atlas, 'curvature', 0, 0)).toBeCloseTo(0, 6);
    expect(sampleFieldAtlas(atlas, 'skyVisibility', 0, 0)).toBeCloseTo(1, 4);
    expect(sampleFieldAtlas(atlas, 'exposure', 0, 0)).toBeCloseTo(0, 4);
    expect(sampleFieldAtlas(atlas, 'bentX', 0, 0)).toBeCloseTo(0, 2);
  });

  it('round-trips a known constant slope through the relief channel within quantisation error', () => {
    const grid = syntheticGrid(x => 0.1 * x, 81); // dz/dx = 0.1 exactly, dz/dy = 0, no curvature.
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(grid), BOUNDS, { targetSize: 128 });
    const step = RELIEF_SLOPE_RANGE_M / 32767;
    for (const [x, y] of [[0, 0], [10.5, -8.25], [-15, 15]] as PointM[]) {
      expect(Math.abs(sampleFieldAtlas(atlas, 'dzdx', x, y)! - 0.1)).toBeLessThanOrEqual(step + 1e-9);
      expect(Math.abs(sampleFieldAtlas(atlas, 'dzdy', x, y)!)).toBeLessThanOrEqual(step + 1e-9);
      expect(Math.abs(sampleFieldAtlas(atlas, 'curvature', x, y)!)).toBeLessThanOrEqual(1 / 32767 + 1e-9);
    }
  });

  it('accepts precomputed curvature/sky sources instead of recompiling them', () => {
    const grid = syntheticGrid((x, y) => 400 + 0.05 * x - 0.02 * y, 61);
    const sky = compileSkyField(grid), curvature = compileCurvatureFields(grid);
    const withSources = compileFieldAtlas(sceneWith([]), meshWith(grid), BOUNDS, { targetSize: 48 }, { sky, curvature });
    const recomputed = compileFieldAtlas(sceneWith([]), meshWith(grid), BOUNDS, { targetSize: 48 });
    expect(withSources.reliefRGBA16F).toEqual(recomputed.reliefRGBA16F);
    expect(withSources.bentRGBA8).toEqual(recomputed.bentRGBA8);
  });

  it('derives surface class, nearest boundary and sdf layers from scene rings', () => {
    const scene = sceneWith([feature('green', 'green', circle(20, 0, 8)), feature('bunker', 'bunker', circle(-20, 0, 5))]);
    const atlas = compileFieldAtlas(scene, meshWith(), BOUNDS, { targetSize: 160 });
    const green = SURFACE_DISTANCE_LAYERS.indexOf('green'), bunker = SURFACE_DISTANCE_LAYERS.indexOf('bunker');
    expect(Math.round(sampleFieldAtlas(atlas, 'surfaceClass', 20, 0)!)).toBe(green + 1);
    expect(Math.round(sampleFieldAtlas(atlas, 'nearestBoundaryClass', 20, 0)!)).toBe(green);
    expect(sampleFieldAtlas(atlas, 'boundaryDistance', 20, 0)!).toBeCloseTo(8, 0);
    expect(Math.round(sampleFieldAtlas(atlas, 'surfaceClass', 0, 0)!)).toBe(0); // between the two, inside neither.
    expect([green, bunker]).toContain(Math.round(sampleFieldAtlas(atlas, 'nearestBoundaryClass', 0, 0)!));
    expect(sampleFieldAtlas(atlas, 'green', 20, 0)!).toBeGreaterThan(0);
    expect(sampleFieldAtlas(atlas, 'bunker', -20, 0)!).toBeGreaterThan(0);
    expect(sampleFieldAtlas(atlas, 'fairway', 0, 0)!).toBeLessThan(0);
  });

  it('clamps boundary distance to its packed range when nothing is nearby', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(), BOUNDS, { targetSize: 32 });
    expect(sampleFieldAtlas(atlas, 'boundaryDistance', 0, 0)!).toBeCloseTo(BOUNDARY_DISTANCE_RANGE_M, 0);
  });

  it('flags texels outside the tactical bounds as context, inside as hole', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(undefined, [-10, -10, 10, 10]), BOUNDS, { targetSize: 80 });
    expect(sampleFieldAtlas(atlas, 'contextMask', 0, 0)!).toBeCloseTo(0, 1);
    expect(sampleFieldAtlas(atlas, 'contextMask', 35, 35)!).toBeCloseTo(1, 1);
  });

  it('samples null outside the atlas bounds and for a channel the atlas does not carry', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(), BOUNDS, { targetSize: 32 });
    expect(sampleFieldAtlas(atlas, 'dzdx', 1000, 1000)).toBeNull();
    expect(sampleFieldAtlas({ ...atlas, sdfLayers: undefined }, 'green', 0, 0)).toBeNull();
  });

  it('is deterministic across two compiles', () => {
    const grid = syntheticGrid((x, y) => 400 + Math.sin(x / 10) * 2 + y * 0.01, 51);
    const scene = sceneWith([feature('green', 'green', circle(10, 10, 6))]);
    const mesh = meshWith(grid);
    const a = compileFieldAtlas(scene, mesh, BOUNDS, { targetSize: 96 }), b = compileFieldAtlas(scene, mesh, BOUNDS, { targetSize: 96 });
    expect(a.reliefRGBA16F).toEqual(b.reliefRGBA16F);
    expect(a.bentRGBA8).toEqual(b.bentRGBA8);
    expect(a.semanticRGBA8).toEqual(b.semanticRGBA8);
    expect(a.sdfLayers!.data).toEqual(b.sdfLayers!.data);
  });

  it('reports total packed bytes as the sum of every typed array', () => {
    const atlas = compileFieldAtlas(sceneWith([]), meshWith(), BOUNDS, { targetSize: 32 });
    const expected = atlas.reliefRGBA16F.byteLength + atlas.bentRGBA8.byteLength + atlas.semanticRGBA8.byteLength + atlas.sdfLayers!.data.byteLength;
    expect(fieldAtlasBytes(atlas)).toBe(expected);
  });
});
