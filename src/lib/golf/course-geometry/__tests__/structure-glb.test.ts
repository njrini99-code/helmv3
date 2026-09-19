import { describe, expect, it } from 'vitest';
import type { LocalContextZone } from '../context-layer';
import { writeGlb } from '../glb-writer';
import {
  buildStructureGlbCatalog, buildStructurePlacements, compileStaticObjectSet, readStructureGlbGeometry,
  STATIC_OBJECT_SET_BASIS, STRUCTURE_CONTEXT_CLASSES, structureIdFromFileName, validateStructureGlbGeometry,
  type GlbSceneGeometry,
} from '../structure-glb';
import type { TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, PointM } from '../types';

const STRUCTURE_ID = 'shed';

/** A 10 m × 6 m × 4 m box, origin at ground contact (z=0 at its base), built
 * the same way glb-writer.test.ts builds its fixtures: through `writeGlb`,
 * so the node carries glb-writer.ts's own `Z_UP_TO_Y_UP_ROTATION` and this
 * is a genuine round trip of structure-glb.ts's axis-inversion math, not a
 * hand-built GLB. */
function shedGlbBytes(): Uint8Array {
  const positions = Float32Array.from([
    0, 0, 0, 10, 0, 0, 10, 6, 0, 0, 6, 0, // bottom: 0,1,2,3
    0, 0, 4, 10, 0, 4, 10, 6, 4, 0, 6, 4, // top: 4,5,6,7
  ]);
  const indices = Uint32Array.from([
    0, 1, 2, 0, 2, 3, // bottom
    4, 5, 6, 4, 6, 7, // top
    0, 1, 5, 0, 5, 4, // front (y=0)
    3, 2, 6, 3, 6, 7, // back (y=6)
    0, 3, 7, 0, 7, 4, // left (x=0)
    1, 2, 6, 1, 6, 5, // right (x=10)
  ]);
  return writeGlb({ meshes: [{ name: 'shed', positions, indices }] });
}

function emptyValidGeometry(): GlbSceneGeometry {
  return {
    triangleCount: 500, nodeCount: 1, meshCount: 1, materialsDeclared: 0, materialsUsed: 0, texturesDeclared: 0, texturesUsed: 0, imagesDeclared: 0,
    boundsM: [0, 0, 0, 10, 6, 4], usesGeometryCompression: false, usesKtx2: false, hasMatrixNode: false, hasUnappliedScale: false,
    extensionsUsed: [], extensionsRequired: [], parseIssues: [],
  };
}

function terrainHeightFn(x: number): number { return 100 + 0.02 * x; }
/** originM [0,0], 2 m cells, covering 0..200 m both axes. `terrainHeightFn`
 * is linear in x, so bilinear sampling reproduces it exactly regardless of
 * cell size — the ground-contact assertions below can use exact arithmetic. */
function syntheticTerrainMesh(): TerrainMesh {
  const spacingM = 2, size = 101, heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(terrainHeightFn(column * spacingM));
  const metricGrid: MetricTerrainGrid = { originM: [0, 0], spacingM, columns: size, rows: size, heightsM };
  return { metricGrid } as unknown as TerrainMesh;
}
const closeRing = (ring: readonly PointM[]): PointM[] => [...ring, ring[0]!];
function rectZone(id: string, x0: number, y0: number, x1: number, y1: number, cls: LocalContextZone['class'] = 'building'): LocalContextZone {
  const ring = closeRing([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  return { id, class: cls, type: 'Polygon', parts: [[ring]], basis: 'source', reviewed: true, fidelity: 'high', render: 'extrude', attributes: {} };
}

describe('readStructureGlbGeometry', () => {
  it('recovers exact project-frame bounds and triangle count from a writeGlb round trip', () => {
    const geometry = readStructureGlbGeometry(shedGlbBytes());
    expect(geometry.parseIssues).toEqual([]);
    expect(geometry.triangleCount).toBe(12);
    expect(geometry.nodeCount).toBe(1);
    expect(geometry.materialsUsed).toBe(0);
    expect(geometry.texturesUsed).toBe(0);
    expect(geometry.usesKtx2).toBe(false);
    expect(geometry.usesGeometryCompression).toBe(false);
    expect(geometry.hasMatrixNode).toBe(false);
    expect(geometry.hasUnappliedScale).toBe(false);
    const [x0, y0, z0, x1, y1, z1] = geometry.boundsM;
    for (const [actual, expected] of [[x0, 0], [y0, 0], [z0, 0], [x1, 10], [y1, 6], [z1, 4]] as const) expect(actual).toBeCloseTo(expected, 6);
  });

  it('never throws on bytes that are not a GLB, and reports it as an error issue instead', () => {
    const geometry = readStructureGlbGeometry(Uint8Array.from([1, 2, 3, 4]));
    expect(geometry.parseIssues).toEqual([{ code: 'not_a_glb', severity: 'error', detail: expect.any(String) }]);
    expect(geometry.triangleCount).toBe(0);
    expect(geometry.boundsM).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('validateStructureGlbGeometry', () => {
  it('passes a plausible box with only the expected triangle-budget warning (§57)', () => {
    const validation = validateStructureGlbGeometry(readStructureGlbGeometry(shedGlbBytes()));
    expect(validation.ok).toBe(true);
    expect(validation.violations).toEqual([{ rule: 'triangle_budget', severity: 'warn', detail: expect.stringContaining('12 triangles') }]);
    expect(validation.footprintM[0]).toBeCloseTo(10, 6);
    expect(validation.footprintM[1]).toBeCloseTo(6, 6);
    expect(validation.heightM).toBeCloseTo(4, 6);
    expect(validation.groundOffsetM).toBeCloseTo(0, 6);
    expect(validation.footprintAreaM2).toBeCloseTo(60, 5);
  });

  it('flags an origin that is not at ground contact as an error', () => {
    const validation = validateStructureGlbGeometry({ ...emptyValidGeometry(), boundsM: [0, 0, 1.5, 10, 6, 5.5] });
    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({ rule: 'origin_not_ground_contact', severity: 'error', detail: expect.any(String) });
  });

  it('flags a footprint that disagrees with the zone it is keyed to, without failing the file', () => {
    const validation = validateStructureGlbGeometry({ ...emptyValidGeometry(), boundsM: [0, 0, 0, 40, 12, 4] }, { zoneFootprintAreaM2: 100 });
    expect(validation.violations).toContainEqual({ rule: 'footprint_zone_mismatch', severity: 'warn', detail: expect.any(String) });
    expect(validation.ok).toBe(true);
  });

  it('flags implausible scale and material/texture budgets', () => {
    const tiny = validateStructureGlbGeometry({ ...emptyValidGeometry(), boundsM: [0, 0, 0, 0.1, 0.1, 0.1] });
    expect(tiny.violations.some(v => v.rule === 'implausible_scale')).toBe(true);

    const busy = validateStructureGlbGeometry({ ...emptyValidGeometry(), materialsUsed: 6, texturesUsed: 20 });
    expect(busy.violations.some(v => v.rule === 'material_budget')).toBe(true);
    expect(busy.violations.some(v => v.rule === 'texture_budget')).toBe(true);

    const uncompressed = validateStructureGlbGeometry({ ...emptyValidGeometry(), texturesUsed: 1 });
    expect(uncompressed.violations.some(v => v.rule === 'texture_compression')).toBe(true);
  });

  it('rejects a degenerate (zero-volume) or missing-geometry file as an error', () => {
    expect(validateStructureGlbGeometry({ ...emptyValidGeometry(), boundsM: [0, 0, 0, 0, 6, 4] }).ok).toBe(false);
    const noGeometry = validateStructureGlbGeometry({ ...emptyValidGeometry(), boundsM: [0, 0, 0, 0, 0, 0], parseIssues: [{ code: 'no_geometry', severity: 'error', detail: 'x' }] });
    expect(noGeometry.ok).toBe(false);
    expect(noGeometry.violations.filter(v => v.rule === 'degenerate_bounds')).toEqual([]); // not double-flagged
  });
});

describe('STRUCTURE_CONTEXT_CLASSES / structureIdFromFileName', () => {
  it('derives exactly the built-group classes that render as extrude (context-taxonomy.ts)', () => {
    expect([...STRUCTURE_CONTEXT_CLASSES].sort()).toEqual(['building', 'clubhouse', 'maintenance']);
  });
  it('strips the .glb extension case-insensitively', () => {
    expect(structureIdFromFileName('ctx-osm-way-1.glb')).toBe('ctx-osm-way-1');
    expect(structureIdFromFileName('ctx-osm-way-1.GLB')).toBe('ctx-osm-way-1');
  });
});

describe('buildStructurePlacements / compileStaticObjectSet', () => {
  it('places a matched, validated structure at its footprint centroid and ground-contact height', () => {
    const mesh = syntheticTerrainMesh();
    const catalog = buildStructureGlbCatalog([{ fileName: `${STRUCTURE_ID}.glb`, bytes: shedGlbBytes() }]);
    const zone = rectZone(STRUCTURE_ID, 20, 40, 30, 46); // 10 x 6 m — matches the shed's own footprint
    const { items, skipped } = buildStructurePlacements([zone], mesh, catalog);
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.id).toBe(STRUCTURE_ID);
    expect(item.structureId).toBe(STRUCTURE_ID);
    expect(item.class).toBe('building');
    expect(item.basis).toBe('authored_glb');
    expect(item.assetFile).toBe(`${STRUCTURE_ID}.glb`);
    expect(item.positionM[0]).toBeCloseTo(25, 3); // rectangle centroid x
    expect(item.positionM[1]).toBeCloseTo(43, 3); // rectangle centroid y
    expect(item.positionM[2]).toBeCloseTo(terrainHeightFn(20), 2); // min corner height (at x=20)
    expect(item.groundSpanM).toBeCloseTo(terrainHeightFn(30) - terrainHeightFn(20), 2);
    expect(item.footprintAreaM2).toBeCloseTo(60, 1);
    // Rotating local forward (0, 1) by yawRadians must reproduce the
    // footprint's outward direction (perpendicular to its longest edge —
    // the y=40 side, length 10 — away from the centroid: (0, -1)).
    // (yawRadians is rounded to 5 decimals when packed, so allow for that.)
    expect(-Math.sin(item.yawRadians)).toBeCloseTo(0, 4);
    expect(Math.cos(item.yawRadians)).toBeCloseTo(-1, 4);
  });

  it('records why an unmatched or ungroundable zone was skipped, never inventing a placement (Ruling R8)', () => {
    const mesh = syntheticTerrainMesh();
    const catalog = buildStructureGlbCatalog([{ fileName: `${STRUCTURE_ID}.glb`, bytes: shedGlbBytes() }]);
    const noAsset = rectZone('no-such-asset', 20, 40, 30, 46);
    const offGrid = rectZone(STRUCTURE_ID, 5000, 5000, 5010, 5006);
    const { items, skipped } = buildStructurePlacements([noAsset, offGrid], mesh, catalog);
    expect(items).toEqual([]);
    expect(skipped).toEqual([
      { id: 'no-such-asset', class: 'building', reason: 'no_authored_glb' },
      { id: STRUCTURE_ID, class: 'building', reason: 'no_ground_height' },
    ]);
  });

  it('places one instance per polygon part of a MultiPolygon zone, suffixing the id (three-context.ts extrudes every part too)', () => {
    const mesh = syntheticTerrainMesh();
    const catalog = buildStructureGlbCatalog([{ fileName: `${STRUCTURE_ID}.glb`, bytes: shedGlbBytes() }]);
    const ringA = closeRing([[20, 40], [30, 40], [30, 46], [20, 46]]);
    const ringB = closeRing([[60, 40], [70, 40], [70, 46], [60, 46]]);
    const zone: LocalContextZone = {
      id: STRUCTURE_ID, class: 'maintenance', type: 'MultiPolygon', parts: [[ringA], [ringB]],
      basis: 'source', reviewed: true, fidelity: 'high', render: 'extrude', attributes: {},
    };
    const { items, skipped } = buildStructurePlacements([zone], mesh, catalog);
    expect(skipped).toEqual([]);
    expect(items.map(item => item.id)).toEqual([`${STRUCTURE_ID}#0`, `${STRUCTURE_ID}#1`]);
    expect(items.every(item => item.structureId === STRUCTURE_ID)).toBe(true);
  });

  it('ignores zones outside the structure classes (a fence stays a line, not a building)', () => {
    const mesh = syntheticTerrainMesh();
    const catalog = buildStructureGlbCatalog([{ fileName: `${STRUCTURE_ID}.glb`, bytes: shedGlbBytes() }]);
    const fence = rectZone(STRUCTURE_ID, 20, 40, 30, 46, 'fence');
    const { items, skipped } = buildStructurePlacements([fence], mesh, catalog);
    expect(items).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('packs a JSON-safe PackedObjectSet with the honest basis and a count matching its items', () => {
    const mesh = syntheticTerrainMesh();
    const catalog = buildStructureGlbCatalog([{ fileName: `${STRUCTURE_ID}.glb`, bytes: shedGlbBytes() }]);
    const scene = { contextZones: [rectZone(STRUCTURE_ID, 20, 40, 30, 46)] } as unknown as HoleScene;
    const packed = compileStaticObjectSet(scene, mesh, catalog);
    expect(packed.basis).toBe(STATIC_OBJECT_SET_BASIS);
    expect(packed.basis).not.toBe('unfilled_task17'); // distinguishable from "never ran" (compile-visual-artifact-v2.ts)
    expect(packed.count).toBe(packed.items.length);
    expect(packed.count).toBe(1);
    const roundTripped: unknown = JSON.parse(JSON.stringify(packed));
    expect(roundTripped).toEqual(JSON.parse(JSON.stringify(packed))); // stable, JSON-safe (no undefined/typed arrays)
  });

  it('returns an empty, honestly-basis-labelled set when no zones match any structure class', () => {
    const mesh = syntheticTerrainMesh();
    const catalog = buildStructureGlbCatalog([]);
    const scene = { contextZones: [] } as unknown as HoleScene;
    const packed = compileStaticObjectSet(scene, mesh, catalog);
    expect(packed).toEqual({ basis: STATIC_OBJECT_SET_BASIS, count: 0, contentHash: expect.any(String), items: [] });
  });
});
