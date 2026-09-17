/** Per-vertex context/zone attributes for the V2 ground (ground-context-v2.ts):
 * V1's `contextWeight` and `compileRoughHierarchy` zone branch, per vertex,
 * from the scene's polygons. A synthetic scene with closed-form geometry
 * (a context fairway, a turf zone, a parking zone, an uncertain zone), then
 * the real Upper holes with their context layer. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseContextLayer } from '../context-layer';
import { compileBaseDisplayLod0 } from '../display-mesh-v2';
import { compileGroundContextAttributes, paintedGroundZones } from '../ground-context-v2';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh } from '../terrain';
import type { HoleScene, LocalFeature, PointM } from '../types';
import { SURFACE_CLASS_IDS } from '../visual-artifact';
import { MERIDIAN_STYLE } from '../visual-style';

const square = (cx: number, cy: number, half: number): PointM[] => [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half], [cx - half, cy - half]];
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
type Zone = NonNullable<HoleScene['contextZones']>[number];
const zone = (id: string, cls: Zone['class'], ring: PointM[], basis: Zone['basis'] = 'source', holes: PointM[][] = []): Zone =>
  ({ id, class: cls, type: 'Polygon', parts: [[ring, ...holes]], basis, reviewed: true, fidelity: 'low', render: 'ground', attributes: {} }) as unknown as Zone;
function sceneWith(features: LocalFeature[], contextFeatures: LocalFeature[], contextZones: Zone[]): HoleScene {
  return {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: null },
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: features.map(f => f.id), routeFeatureId: null, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features, contextFeatures, contextZones, events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
}
const ROUGH = SURFACE_CLASS_IDS.indexOf('rough'), GROUND = SURFACE_CLASS_IDS.indexOf('ground'), FAIRWAY = SURFACE_CLASS_IDS.indexOf('fairway'), WOODS = SURFACE_CLASS_IDS.indexOf('woods');
const positionsOf = (points: PointM[]): Float32Array => Float32Array.from(points.flatMap(([x, y]) => [x, y, 0]));

describe('compileGroundContextAttributes (outside-world §10–16, §21; master §53)', () => {
  const scene = sceneWith(
    [feature('own-fairway', 'fairway', square(0, 0, 20))],
    [feature('ctx-fairway', 'fairway', square(100, 0, 20)), feature('ctx-bunker', 'bunker', square(100, 40, 5))],
    [
      zone('z-field', 'open_field', square(0, 100, 20)),
      zone('z-parking', 'parking', square(100, 100, 20)),
      zone('z-uncertain', 'rough_secondary', square(200, 100, 20), 'uncertain'),
      zone('z-donut', 'rough_native', square(200, 0, 30), 'source', [square(200, 0, 10)]),
    ],
  );
  const blend = MERIDIAN_STYLE.roughHierarchy.groundZoneBlendM;

  it('marks vertices on a neighbouring hole\'s features as context and nothing else', () => {
    const points: PointM[] = [[100, 0], [100, 40], [0, 0], [60, 0], [119.9, 0]];
    const out = compileGroundContextAttributes(scene, positionsOf(points), new Uint8Array([FAIRWAY, ROUGH, FAIRWAY, ROUGH, FAIRWAY]));
    expect([...out.context]).toEqual([1, 1, 0, 0, 1]);
    expect(out.stats.contextVertices).toBe(3);
  });

  it('blends a rough/ground vertex into a painted zone over groundZoneBlendM from the zone\'s own edge, signed by the zone\'s turf switch', () => {
    const points: PointM[] = [[0, 100], [0, 82], [0, 80.5], [100, 100], [100, 82], [0, 100], [0, 100]];
    const classes = new Uint8Array([ROUGH, GROUND, ROUGH, ROUGH, GROUND, FAIRWAY, WOODS]);
    const out = compileGroundContextAttributes(scene, positionsOf(points), classes);
    expect(out.zone[0]).toBe(1); // 20 m inside the open field: full weight
    expect(out.zone[1]).toBeCloseTo(2 / blend, 6); // 2 m inside its edge
    expect(out.zone[2]).toBeCloseTo(0.5 / blend, 6);
    expect(out.zone[3]).toBe(-1); // parking is not turf: negative
    expect(out.zone[4]).toBeCloseTo(-2 / blend, 6);
    expect(out.zone[5]).toBe(0); expect(out.zone[6]).toBe(0); // only rough/ground vertices take a zone (V1)
    expect(out.zoneSurface.slice(0, 5)).toEqual(['open_field', 'open_field', 'open_field', 'parking', 'parking']);
    expect(out.zoneSurface[5]).toBe('fairway'); expect(out.zoneSurface[6]).toBe('woods');
    expect(out.stats).toMatchObject({ zoneVertices: 5, zoneClasses: { open_field: 3, parking: 2 }, skippedUncertain: 1 });
  });

  it('paints nothing for an uncertain zone, and measures a donut zone\'s edge from its hole as well as its outline', () => {
    const points: PointM[] = [[200, 100], [200, 12], [200, 28], [200, 0]];
    const out = compileGroundContextAttributes(scene, positionsOf(points), new Uint8Array([ROUGH, ROUGH, ROUGH, ROUGH]));
    expect(out.zone[0]).toBe(0); // uncertain: honestly unexplained
    expect(out.zone[1]).toBeCloseTo(2 / blend, 6); // 2 m outside the hole ring
    expect(out.zone[2]).toBeCloseTo(2 / blend, 6); // 2 m inside the outline
    expect(out.zone[3]).toBe(0); // inside the hole: not in the zone
    expect(paintedGroundZones(scene).map(z => z.zone.id)).toEqual(['z-parking', 'z-field', 'z-donut']); // V1's priority order, uncertain dropped
  });

  it('answers all zeros without context features or zones', () => {
    const bare = sceneWith([feature('own-fairway', 'fairway', square(0, 0, 20))], [], []);
    const out = compileGroundContextAttributes(bare, positionsOf([[0, 0], [50, 50]]), new Uint8Array([FAIRWAY, ROUGH]));
    expect([...out.context]).toEqual([0, 0]); expect([...out.zone]).toEqual([0, 0]);
  });
});

describe('compileGroundContextAttributes on the Upper holes', () => {
  const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  function load(key: string) {
    const fileName = manifest.holes[key]!.fileName;
    const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
    const mesh = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    return { mesh, scene: buildHoleScene(pkg, key, [], mesh, context) };
  }

  it('finds context vertices on hole 7 (neighbouring fairways in its context mesh) and leaves its own fairway alone', () => {
    const { mesh, scene } = load('peek-n-peak-upper-07');
    const base = compileBaseDisplayLod0(mesh);
    const triangles = { indices: base.indices, triangleFeatures: base.triangleFeatures, featureIds: mesh.featureIds };
    const out = compileGroundContextAttributes(scene, base.positions, base.surfaceClass, MERIDIAN_STYLE, triangles);
    expect(scene.contextFeatures?.length ?? 0).toBeGreaterThan(0);
    expect(out.stats.contextVertices).toBeGreaterThan(100);
    // By identity (V1 contextOnly): every context triangle's corners are 1,
    // and an own triangle only ever touches a 1 on an outline it shares.
    const contextIds = new Set(scene.contextFeatures!.map(f => f.id));
    const contextVertices = new Set<number>();
    for (let t = 0; t < base.triangleCount; t++) if (contextIds.has(mesh.featureIds[base.triangleFeatures[t]!]!)) for (let k = 0; k < 3; k++) contextVertices.add(base.indices[t * 3 + k]!);
    for (let v = 0; v < base.vertexCount; v++) expect(out.context[v]).toBe(contextVertices.has(v) ? 1 : 0);
    expect(contextVertices.size).toBeLessThan(base.vertexCount / 2); // a neighbour's surfaces, not the hole
    // The polygon fallback (a hero patch's rule) agrees on the neighbouring fairways and never marks own woods.
    const spatial = compileGroundContextAttributes(scene, base.positions, base.surfaceClass);
    const woods = SURFACE_CLASS_IDS.indexOf('woods');
    let fairwayAgree = 0, fairwayTotal = 0;
    for (let t = 0; t < base.triangleCount; t++) {
      const id = mesh.featureIds[base.triangleFeatures[t]!]!;
      if (!contextIds.has(id) || mesh.featureKinds[base.triangleFeatures[t]!] !== 'fairway') continue;
      for (let k = 0; k < 3; k++) { fairwayTotal++; if (spatial.context[base.indices[t * 3 + k]!] === 1) fairwayAgree++; }
    }
    expect(fairwayTotal).toBeGreaterThan(0);
    expect(fairwayAgree / fairwayTotal).toBeGreaterThan(.7); // the rest are the outline vertices themselves (float32 positions on the ring)
    let ownWoodsMarked = 0;
    for (let v = 0; v < base.vertexCount; v++) if (base.surfaceClass[v] === woods && spatial.context[v] === 1 && out.context[v] === 0) ownWoodsMarked++;
    expect(ownWoodsMarked).toBe(0);
  });

  it('paints the ski-slope zones the Upper context layer carries where a hole\'s mesh reaches them', () => {
    const holes = ['peek-n-peak-upper-07', 'peek-n-peak-upper-01', 'peek-n-peak-upper-05', 'peek-n-peak-upper-18'];
    let painted = 0;
    for (const key of holes) {
      const { mesh, scene } = load(key);
      const base = compileBaseDisplayLod0(mesh);
      const out = compileGroundContextAttributes(scene, base.positions, base.surfaceClass);
      painted += out.stats.zoneVertices;
      for (const w of out.zone) { expect(w).toBeGreaterThanOrEqual(-1); expect(w).toBeLessThanOrEqual(1); }
      expect(Object.keys(out.stats.zoneClasses).every(cls => cls === 'ski_slope')).toBe(true); // the only ground class in this layer
    }
    expect(painted).toBeGreaterThan(0);
  });
});
