// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type * as ThreeModule from 'three';
import { createThreeTerrainRuntime } from '../three-renderer';
import { fitTerrainCamera, parseTerrainMesh, TERRAIN_PRESETS, type TerrainCamera } from '../terrain';
import { illustrativeScene, pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

/** Meridian V2 Tasks 20–21 (§72): shader precompile timing and shadow-bake
 * discipline, driven through `createThreeTerrainRuntime`'s real public API.
 *
 * jsdom has no real WebGL2: `new THREE.WebGLRenderer(...)` throws "Error
 * creating WebGL context" here regardless of test project (confirmed against
 * both `unit`'s node environment and a jsdom one — neither resolves a webgl2
 * context, and the optional `canvas` package only backs 2D). three-landscape
 * .test.ts already works around this for code that merely needs a
 * renderer-shaped value, by casting a plain object; this file replaces only
 * the `WebGLRenderer` export via `vi.mock`, so every other THREE class
 * (Scene, DirectionalLight, BufferGeometry, materials, …) stays real. That
 * runs the genuine setCamera/fitSun/dataset-write code path — it just never
 * touches a GPU, so it cannot see whether pixels are actually shadowed; the
 * browser harness under src/test/fixtures/course-geometry/browser/ is the
 * only thing that can. */

const { FakeWebGLRenderer } = vi.hoisted(() => {
  class FakeWebGLRenderer {
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
    debug: { checkShaderErrors: boolean; onShaderError: (() => void) | null } = { checkShaderErrors: false, onShaderError: null };
    capabilities = { maxTextureSize: 16_384 };
    extensions = { has: () => false };
    info = { render: { calls: 0, triangles: 0 } };
    getContext() { return { getExtension: () => null, isContextLost: () => false }; }
    setPixelRatio() {}
    setSize() {}
    async compileAsync() {}
    // Mirrors three.js consuming both `needsUpdate` flags once a bake runs.
    render() { this.shadowMap.needsUpdate = false; }
    dispose() {}
    forceContextLoss() {}
  }
  return { FakeWebGLRenderer };
});

vi.mock('three', async importOriginal => ({
  ...(await importOriginal<typeof ThreeModule>()),
  WebGLRenderer: FakeWebGLRenderer as unknown as typeof ThreeModule.WebGLRenderer,
}));

const mesh = parseTerrainMesh(source, pilotPackage), scene = illustrativeScene();
const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.top);

describe('three-renderer shadow-bake and precompile discipline (Tasks 20–21, §72)', () => {
  it('bakes the shadow once per relevant camera change, never on a repeat, and records the precompile time', async () => {
    const host = document.createElement('div'), canvas = document.createElement('canvas');
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.append(canvas, overlay);
    document.body.append(host);
    const runtime = createThreeTerrainRuntime({ canvas, overlay, overlayId: 'discipline-test', scene, mesh, camera,
      width: 390, height: 640, quality: 'standard', onUnavailable: () => {} });
    try {
      await runtime.ready;
      // §20: the dataset carries the precompile time alongside every other metric.
      expect(Number(canvas.dataset.shaderCompileMs)).toBeGreaterThanOrEqual(0);
      // The first ready both re-fits the sun (exaggeration read from its NaN
      // sentinel) and swaps in the initial crown LOD — two triggers inside
      // one setCamera call, but only one counted bake.
      expect(canvas.dataset.shadowUpdates).toBe('1');

      runtime.setCamera(camera, 390, 640);
      expect(canvas.dataset.shadowUpdates).toBe('1');

      const tilted: TerrainCamera = { ...camera, exaggeration: camera.exaggeration + .5 };
      runtime.setCamera(tilted, 390, 640);
      expect(canvas.dataset.shadowUpdates).toBe('2');

      runtime.setCamera(tilted, 390, 640);
      expect(canvas.dataset.shadowUpdates).toBe('2');
    } finally {
      runtime.dispose();
      host.remove();
    }
  });

  it('rebuilds the whole V1 landscape when the V2 world falls back (R7), so the fallback is not a flat, treeless hole', async () => {
    // This fixture carries no metric grid, so `assembleV2World` declines and
    // the V1 terrain is what the player sees. The fast build under V2 skips
    // the shading texture and every crown; the runtime must notice and build
    // the real landscape, reporting the whole cost as `landscapeBuildMs`.
    const host = document.createElement('div'), canvas = document.createElement('canvas');
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.append(canvas, overlay);
    document.body.append(host);
    const v1 = createThreeTerrainRuntime({ canvas, overlay, overlayId: 'fallback-v1', scene, mesh, camera, width: 390, height: 640, quality: 'standard', onUnavailable: () => {} });
    let trees = 0;
    try { await v1.ready; trees = Number(canvas.dataset.terrainTrees); } finally { v1.dispose(); }
    expect(trees).toBeGreaterThan(0);
    const runtime = createThreeTerrainRuntime({ canvas, overlay, overlayId: 'fallback-v2', scene, mesh, camera, width: 390, height: 640, quality: 'standard', world: 'v2', onUnavailable: () => {} });
    try {
      await runtime.ready;
      expect(canvas.dataset.renderWorld).toBe('v2');
      expect(canvas.dataset.v2BuildMs).toBe('');
      expect(Number(canvas.dataset.terrainTrees)).toBe(trees);
      expect(Number(canvas.dataset.landscapeBuildMs)).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
      host.remove();
    }
  });
});
