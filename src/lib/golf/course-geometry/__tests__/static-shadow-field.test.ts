import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseGeometryPackage } from '../schema';
import { assertStaticShadowField, compileStaticShadowField, sampleStaticShadow, staticShadowLayer } from '../static-shadow-field';
import { parseTerrainMesh, TERRAIN_LIGHT_DIRECTION, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
const SIZE_M = 120;
function world(height: (x: number, y: number) => number, woods: PointM[][] = []): { mesh: TerrainMesh; scene: HoleScene } {
  const size = SIZE_M / 2 + 1, heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(column * 2, row * 2));
  const metricGrid: MetricTerrainGrid = { originM: [0, 0], spacingM: 2, columns: size, rows: size, heightsM };
  const mesh = { vertices: [], triangleFeatures: [], triangleMaterials: [], featureIds: [], featureKinds: [], metricGrid, contextFeatureIds: [],
    renderProfile: { tacticalBoundsM: [0, 0, SIZE_M, SIZE_M], contextBoundsM: [0, 0, SIZE_M, SIZE_M] } } as unknown as TerrainMesh;
  const features: LocalFeature[] = woods.map((ring, i) => ({ id: `woods-${i}`, kind: 'woods', type: 'Polygon', parts: [[ring]], reviewed: true }));
  const scene = { features, contextFeatures: [], contextZones: [], hole: { featureIds: features.map(f => f.id) }, events: [] } as unknown as HoleScene;
  return { mesh, scene };
}
const sunXY = [TERRAIN_LIGHT_DIRECTION[0], TERRAIN_LIGHT_DIRECTION[1]] as const;
const elevation = Math.atan2(TERRAIN_LIGHT_DIRECTION[2], Math.hypot(...sunXY));

describe('static shadow field (§68, §71; Task 16)', () => {
  it('leaves a flat plane fully lit', () => {
    const { mesh, scene } = world(() => 100);
    const field = compileStaticShadowField(mesh, scene, { blurM: 0 });
    expect(() => assertStaticShadowField(field)).not.toThrow();
    expect(field.terrainShadow.every(v => v === 255)).toBe(true);
    expect(field.canopyShadow.every(v => v === 255)).toBe(true);
    expect(field.stats.shadowedShare).toBe(0);
    expect(field.crowns).toBe(0);
  });

  it('casts a terrain shadow of height / tan(elevation) on the side away from the sun and none toward it', () => {
    // A 10 m wall along x = 60: ground east of it is 10 m higher. The sun comes from +x (sun[0] > 0), so the shadow falls west of the wall.
    const { mesh, scene } = world((x) => (x >= 60 ? 110 : 100));
    const field = compileStaticShadowField(mesh, scene, { blurM: 0 });
    const expected = 10 / Math.tan(elevation);
    // Along the sun's ground direction from the wall foot, going away from the sun.
    const ux = -sunXY[0] / Math.hypot(...sunXY), uy = -sunXY[1] / Math.hypot(...sunXY);
    const start: PointM = [59.9, 60];
    const shadowedAt = (d: number) => sampleStaticShadow(field, start[0] + ux * d, start[1] + uy * d, 'terrainShadow')! < 0.5;
    expect(shadowedAt(2)).toBe(true);
    expect(shadowedAt(expected - 3)).toBe(true);
    expect(shadowedAt(expected + 3)).toBe(false);
    // Nothing on the high, sun-facing side.
    expect(sampleStaticShadow(field, 70, 60, 'terrainShadow')).toBe(1);
    expect(field.stats.shadowedShare).toBeGreaterThan(0.02);
    expect(field.stats.shadowedShare).toBeLessThan(0.2);
  });

  it('projects canopy crowns along the sun as soft offset shadows, only where woods stand', () => {
    const ring: PointM[] = [[20, 20], [60, 20], [60, 60], [20, 60], [20, 20]];
    const { mesh, scene } = world(() => 100, [ring]);
    const field = compileStaticShadowField(mesh, scene);
    expect(() => assertStaticShadowField(field)).not.toThrow();
    expect(field.crowns).toBeGreaterThan(3);
    expect(field.stats.canopyShare).toBeGreaterThan(0.01);
    // Shadows lie inside the woods or downstream of them along the sun's ground direction (−sun XY), never upstream.
    const ux = -sunXY[0] / Math.hypot(...sunXY), uy = -sunXY[1] / Math.hypot(...sunXY);
    for (let row = 0; row < field.rows; row++) for (let column = 0; column < field.columns; column++) {
      if (field.canopyShadow[row * field.columns + column]! > 200) continue;
      const x = column * field.spacingM, y = row * field.spacingM;
      // Project the shadowed node back toward the sun: within the reach it must cross the woods box.
      let hits = false;
      for (let d = 0; d <= 40; d += 1) { const px = x - ux * d, py = y - uy * d; if (px >= 16 && px <= 64 && py >= 16 && py <= 64) { hits = true; break; } }
      expect(hits).toBe(true);
    }
    expect(field.terrainShadow.every(v => v === 255)).toBe(true);
    const layer = staticShadowLayer(field);
    expect(layer.name).toBe('static_shadow'); expect(layer.values).toBe(field.combined); expect(layer.basis).toBe('art_directed_static');
  });

  it('compiles hole 7 deterministically inside a sane shadowed share', () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
    const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
    const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
    const hole = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole);
    const a = compileStaticShadowField(hole, scene), b = compileStaticShadowField(hole, scene);
    expect(() => assertStaticShadowField(a)).not.toThrow();
    expect(Array.from(a.combined)).toEqual(Array.from(b.combined));
    expect(a.crowns).toBeGreaterThan(50);
    expect(a.stats.shadowedShare).toBeGreaterThan(0.01);
    expect(a.stats.shadowedShare).toBeLessThan(0.5);
    expect(a.stats.ms).toBeLessThan(4000);
  });
});
