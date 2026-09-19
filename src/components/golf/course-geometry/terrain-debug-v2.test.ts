import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseContextLayer } from '@/lib/golf/course-geometry/context-layer';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { SURFACE_DISTANCE_LAYERS } from '@/lib/golf/course-geometry/surface-distance-field';
import { parseTerrainMesh, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { installTerrainDebugView, TERRAIN_DEBUG_LABELS, TERRAIN_DEBUG_VIEWS, type TerrainDebugView } from './terrain-debug';
import { buildThreeLandscape, type ThreeLandscape } from './three-landscape';

// Task 24: every V2 field debug view added to terrain-debug.ts, checked on
// the same real hole-7 fixture three-world-v2.test.ts uses (a green complex
// owning three greenside bunkers plus three standalone fairway bunkers —
// compileHeroPatches always returns exactly 4 patches for it). Unlike that
// file's own loadHole7, this one also loads the real context layer (cart
// paths + woods polygons): buildHoleScene's `features` (green/bunker/
// fairway/tee, which drive hero-patch count) come only from the course
// package, so adding a context layer only adds `contextZones`/
// `contextFeatures` — v2-path-ribbon and v2-forest-edge need those to have
// anything real to draw, and every other view is unaffected.
//
// `fairway-direction-field.ts` did not exist when Task 24 was dispatched
// ("add it if it exists by the time you get there; otherwise skip and say
// so"); it exists now, so v2-fairway-direction is covered here too.
//
// `v2-sky-bent` was added on review: plan Part XX §109 lists "Bent Normal"
// as its own required debug view, distinct from "Sky Visibility" — both
// read `compileSkyField`'s output, one channel each.
//
// One Task 24 checklist/§109 item is NOT covered by any view here: "Screen
// Error" (§12's e_px ≈ f_px·e_w/z needs a per-triangle world-space error
// bound plus a camera-relative projection; no lib module produces that
// world-space error yet, so there is nothing for a debug view to paint —
// a missing upstream producer, not a view omitted from this file).
const fixtures = new URL('../../../test/fixtures/course-geometry/', import.meta.url);
function loadHole7(): { mesh: TerrainMesh; scene: HoleScene } {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const mesh = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
  const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], mesh, context);
  return { mesh, scene };
}

const STUB_RENDERER = { shadowMap: { enabled: false } } as THREE.WebGLRenderer;
const V2_FIELD_MODES: readonly TerrainDebugView[] = [
  'v2-atlas-class', 'v2-atlas-curvature', 'v2-sky', 'v2-sky-bent', 'v2-static-shadow',
  'v2-bunker-normals', 'v2-path-ribbon', 'v2-forest-edge', 'v2-fairway-direction',
];

/** A fresh scene/landscape per call — `installTerrainDebugView` hides every
 * non-terrain child of `landscape.group` on install and never restores their
 * visibility on cleanup (only `landscape.terrain.visible` itself), so a
 * landscape reused across install/release cycles would carry that over into
 * the next one; a fresh build isolates each check instead. */
function setup(): { world: THREE.Scene; landscape: ThreeLandscape; mesh: TerrainMesh; scene: HoleScene } {
  const { mesh, scene } = loadHole7();
  const world = new THREE.Scene();
  const landscape = buildThreeLandscape(scene, mesh);
  world.add(landscape.group);
  return { world, landscape, mesh, scene };
}

/** The shared contract every view below must meet: hides the real terrain,
 * strictly grows `landscape.group`'s children, records a truthy `debugV2`
 * info payload (checked further by `checkInfo`), then on release restores
 * the terrain, removes every object it added — leaving the children count
 * exactly where it started — and disposes at least one geometry and one
 * material (loose: a count, not an exact figure, since which/how many
 * meshes a view builds is that view's own business). */
function expectCleanInstallRelease(mode: TerrainDebugView, checkInfo?: (info: Record<string, unknown>) => void): void {
  const { world, landscape, mesh, scene } = setup();
  const before = landscape.group.children.length;
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');

  const release = installTerrainDebugView(world, landscape, mesh, mode, STUB_RENDERER, scene);
  expect(landscape.terrain.visible).toBe(false);
  expect(landscape.group.children.length).toBeGreaterThan(before);
  const info = landscape.terrain.userData.debugV2 as Record<string, unknown> | undefined;
  expect(info).toBeTruthy();
  checkInfo?.(info!);

  release();
  expect(landscape.terrain.visible).toBe(true);
  expect(landscape.group.children.length).toBe(before);
  expect(geometryDispose).toHaveBeenCalled();
  expect(materialDispose).toHaveBeenCalled();

  geometryDispose.mockRestore();
  materialDispose.mockRestore();
  landscape.dispose();
}

describe('Task 24: V2 field debug views (terrain-debug.ts)', () => {
  it('registers every field view this task adds, with a label for each', () => {
    for (const mode of V2_FIELD_MODES) {
      expect(TERRAIN_DEBUG_VIEWS).toContain(mode);
      expect(TERRAIN_DEBUG_LABELS[mode]).toBeTruthy();
    }
  });

  it("v2-atlas-class: paints the field atlas's own nearest-surface class, tagging unsampleable points instead of guessing", () => {
    expectCleanInstallRelease('v2-atlas-class', info => {
      expect(info.classes).toEqual(['none', ...SURFACE_DISTANCE_LAYERS]);
      const [w, h] = info.atlasSize as [number, number];
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(info.noData as number).toBeGreaterThanOrEqual(0);
    });
  });

  it("v2-atlas-curvature: paints the field atlas's own curvature channel", () => {
    expectCleanInstallRelease('v2-atlas-curvature', info => {
      expect(info.noData as number).toBeGreaterThanOrEqual(0);
    });
  });

  it("v2-sky: paints the bent-sky field's own open-sky visibility, carrying the options it compiled with", () => {
    expectCleanInstallRelease('v2-sky', info => {
      expect(info.options).toBeTruthy();
      expect(typeof info.options).toBe('object');
      expect(info.noData as number).toBeGreaterThanOrEqual(0);
    });
  });

  it("v2-sky-bent: paints the bent-sky field's own bent-normal channel, distinct from v2-sky's visibility (plan §109)", () => {
    expectCleanInstallRelease('v2-sky-bent', info => {
      expect(info.options).toBeTruthy();
      expect(typeof info.options).toBe('object');
      expect(info.noData as number).toBeGreaterThanOrEqual(0);
    });
  });

  it("v2-static-shadow: paints the static shadow field's own combined lit fraction", () => {
    expectCleanInstallRelease('v2-static-shadow', info => {
      expect(info.shadowedShare as number).toBeGreaterThanOrEqual(0);
      expect(info.shadowedShare as number).toBeLessThanOrEqual(1);
      expect(info.canopyShare as number).toBeGreaterThanOrEqual(0);
      expect(info.canopyShare as number).toBeLessThanOrEqual(1);
    });
  });

  it("v2-bunker-normals: paints every one of hole 7's 4 hero patches with its own analytic normal field", () => {
    expectCleanInstallRelease('v2-bunker-normals', info => {
      expect(info.patches).toBe(4);
      // Hole 7's green complex absorbs all 3 greenside bunkers (profiles.length
      // = 3) and 3 standalone fairway bunkers each carry 1: every one of the 4
      // hero patches has at least one bunker profile, not just 3 of 4.
      expect(info.bunkerPatches).toBe(4);
    });
  });

  it('v2-path-ribbon: paints hole 7\'s real cart-path ribbon over a neutral base (path-ribbon.ts is being re-tuned elsewhere, so only loose bounds here)', () => {
    expectCleanInstallRelease('v2-path-ribbon', info => {
      expect(info.triangles as number).toBeGreaterThan(0);
      expect(info.runs as number).toBeGreaterThan(0);
      expect(info.droppedTriangles as number).toBeGreaterThanOrEqual(0);
      expect(info.surfaceFallbacks as number).toBeGreaterThanOrEqual(0);
    });
  });

  it('v2-forest-edge: draws one InstancedMesh marker batch per placed kind and disposes every marker on release', () => {
    const { world, landscape, mesh, scene } = setup();
    const before = landscape.group.children.length;
    const instancedDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');

    const release = installTerrainDebugView(world, landscape, mesh, 'v2-forest-edge', STUB_RENDERER, scene);
    expect(landscape.group.children.length).toBeGreaterThan(before);
    const info = landscape.terrain.userData.debugV2 as Record<string, unknown>;
    expect(info.instances as number).toBeGreaterThan(0);
    expect(info.hero as number).toBeGreaterThan(0);
    expect(info.hero as number).toBeLessThanOrEqual(32); // forest-edge-v2.ts's fixed hero crown cap

    release();
    expect(landscape.group.children.length).toBe(before);
    expect(instancedDispose).toHaveBeenCalled();
    instancedDispose.mockRestore();
    landscape.dispose();
  });

  it("v2-fairway-direction: paints hole 7's real fairway/tee mow-direction field", () => {
    expectCleanInstallRelease('v2-fairway-direction', info => {
      expect(info.activeShare as number).toBeGreaterThan(0);
      expect(info.activeShare as number).toBeLessThanOrEqual(1);
      expect(info.periodWM as number).toBeGreaterThan(0);
      expect(info.noData as number).toBeGreaterThanOrEqual(0);
    });
  });

  it('is a silent no-op (R7 fallback) with no scene, matching v2-world\'s own convention', () => {
    const { world, landscape, mesh } = setup();
    const before = landscape.group.children.length;
    for (const mode of V2_FIELD_MODES) {
      const release = installTerrainDebugView(world, landscape, mesh, mode, STUB_RENDERER, undefined);
      expect(landscape.group.children.length).toBe(before);
      release();
      expect(landscape.group.children.length).toBe(before);
    }
    landscape.dispose();
  });

  it('is a silent no-op (R7 fallback) with no metricGrid, matching v2-world\'s own convention', () => {
    const { world, landscape, mesh, scene } = setup();
    const stripped: TerrainMesh = { ...mesh, metricGrid: undefined };
    const before = landscape.group.children.length;
    for (const mode of V2_FIELD_MODES) {
      const release = installTerrainDebugView(world, landscape, stripped, mode, STUB_RENDERER, scene);
      expect(landscape.group.children.length).toBe(before);
      release();
      expect(landscape.group.children.length).toBe(before);
    }
    landscape.dispose();
  });
});
