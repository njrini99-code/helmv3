/** Headless install/remove-leak coverage for three-csm-benchmark.ts (Meridian
 * V2 Task 22, plan §69–73). Runs under `--project unit` (Node, no DOM/GL): a
 * fake `{ shadowMap: {...} }` renderer stands in for `THREE.WebGLRenderer`,
 * the same pattern three-landscape.test.ts already uses for
 * `installTerrainDebugView`. This proves scene-graph, material and global
 * `THREE.ShaderChunk` hygiene across install/remove cycles; it does NOT (and
 * cannot, without a real GL context) prove shadow-map render-target
 * lifecycle beyond calling `LightShadow.dispose()` — no bake ever happens
 * here, so `shadow.map` stays `null` the whole test and that dispose call is
 * exercised but not itself observable. */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { installCsmBenchmark, removeCsmBenchmark, type CsmBenchmarkHandle } from './three-csm-benchmark';

function fakeRenderer(): THREE.WebGLRenderer {
  return { shadowMap: { enabled: true, needsUpdate: false } } as THREE.WebGLRenderer;
}
function perspectiveCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(30, 16 / 9, 1, 2000);
}
/** Mirrors three-renderer.ts's own sun setup: a shadow-casting light plus
 * its required target, both added to the scene. */
function addExistingSun(scene: THREE.Scene): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xffcc88, 2.5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.position.set(0, 0, 10);
  light.target.position.set(0, 0, 0);
  scene.add(light, light.target);
  return light;
}
function addMesh<M extends THREE.Material>(scene: THREE.Scene, material: M): THREE.Mesh<THREE.BufferGeometry, M> {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(mesh);
  return mesh;
}

describe('installCsmBenchmark / removeCsmBenchmark', () => {
  it('installs cascade lights in place of the existing shadow light and reports compatible/incompatible materials', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const sun = addExistingSun(scene);
    const turf = addMesh(scene, new THREE.MeshStandardMaterial({ vertexColors: true }));
    const debugOverlay = addMesh(scene, new THREE.MeshBasicMaterial());
    const baseline = scene.children.length;
    const originalIncompatibleCompile = debugOverlay.material.onBeforeCompile;

    const handle = installCsmBenchmark(scene, camera, renderer);
    expect(handle.stats.cascades).toBe(2); // §73 default, not three's own addon default of 3
    expect(handle.csm.lights).toHaveLength(2);
    expect(scene.children.length).toBe(baseline + handle.csm.lights.length * 2); // + light + target each
    expect(sun.visible).toBe(false);
    expect(handle.stats.disabledLights).toBe(1);
    expect(handle.stats.materialsPatched).toBe(1);
    expect(handle.stats.materialsSkipped).toBe(1);
    expect(handle.stats.shadowMapEnabled).toBe(true);
    expect((turf.material.defines as Record<string, unknown> | undefined)?.USE_CSM).toBe(1);
    // The incompatible (MeshBasicMaterial) mesh is never touched.
    expect(debugOverlay.material.onBeforeCompile).toBe(originalIncompatibleCompile);
    expect((debugOverlay.material.defines as Record<string, unknown> | undefined)?.USE_CSM).toBeUndefined();

    removeCsmBenchmark(handle);
  });

  it('restores a pre-existing onBeforeCompile shader injection exactly (attachTurfStyle-style materials)', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    addExistingSun(scene);
    const material = new THREE.MeshStandardMaterial();
    const originalCompile = vi.fn();
    material.onBeforeCompile = originalCompile;
    addMesh(scene, material);
    const baseline = scene.children.length;

    const handle = installCsmBenchmark(scene, camera, renderer);
    expect(material.onBeforeCompile).not.toBe(originalCompile); // CSM's own callback took over

    removeCsmBenchmark(handle);
    expect(material.onBeforeCompile).toBe(originalCompile); // exact restore, not `Material.prototype`'s no-op
    expect((material.defines as Record<string, unknown> | undefined)?.USE_CSM).toBeUndefined();
    expect(scene.children.length).toBe(baseline);
  });

  it('restores THREE.ShaderChunk globals exactly, and un-hides the light it hid', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const sun = addExistingSun(scene);
    addMesh(scene, new THREE.MeshStandardMaterial());
    const originalFragment = THREE.ShaderChunk.lights_fragment_begin, originalPars = THREE.ShaderChunk.lights_pars_begin;

    const handle = installCsmBenchmark(scene, camera, renderer);
    expect(THREE.ShaderChunk.lights_fragment_begin).not.toBe(originalFragment);
    expect(THREE.ShaderChunk.lights_pars_begin).not.toBe(originalPars);

    removeCsmBenchmark(handle);
    expect(THREE.ShaderChunk.lights_fragment_begin).toBe(originalFragment);
    expect(THREE.ShaderChunk.lights_pars_begin).toBe(originalPars);
    expect(sun.visible).toBe(true);
  });

  it('repeats cleanly across install/remove cycles without accumulating global state', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    addExistingSun(scene);
    addMesh(scene, new THREE.MeshStandardMaterial());
    const baseline = scene.children.length;
    const originalFragment = THREE.ShaderChunk.lights_fragment_begin;

    for (let cycle = 0; cycle < 2; cycle++) {
      const handle = installCsmBenchmark(scene, camera, renderer);
      expect(scene.children.length).toBeGreaterThan(baseline);
      removeCsmBenchmark(handle);
      expect(scene.children.length).toBe(baseline);
      expect(THREE.ShaderChunk.lights_fragment_begin).toBe(originalFragment);
    }
  });

  it('refuses a second install on a scene that already has one', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    addExistingSun(scene);
    const handle = installCsmBenchmark(scene, camera, renderer);
    expect(() => installCsmBenchmark(scene, camera, renderer)).toThrow(/already installed/);
    removeCsmBenchmark(handle);
  });

  it('removeCsmBenchmark is idempotent on an already-removed handle', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const sun = addExistingSun(scene);
    const handle = installCsmBenchmark(scene, camera, renderer);
    removeCsmBenchmark(handle);
    expect(() => removeCsmBenchmark(handle)).not.toThrow();
    expect(sun.visible).toBe(true); // not re-toggled by the second, no-op call
  });

  it('rejects a non-positive cascade count', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    expect(() => installCsmBenchmark(scene, camera, renderer, { cascades: 0 })).toThrow();
  });

  it('works with no existing shadow-casting light in the scene', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    addMesh(scene, new THREE.MeshStandardMaterial());
    const baseline = scene.children.length;

    const handle = installCsmBenchmark(scene, camera, renderer, { cascades: 3 });
    expect(handle.stats.disabledLights).toBe(0);
    expect(handle.csm.lights).toHaveLength(3);
    expect(handle.csm.lightDirection.length()).toBeCloseTo(1, 5); // a real, normalized default direction

    removeCsmBenchmark(handle);
    expect(scene.children.length).toBe(baseline);
  });

  it('derives lightDirection from the replaced light (position → target), not the reverse', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    addExistingSun(scene); // position (0,0,10) -> target (0,0,0): direction of travel is -Z
    const handle = installCsmBenchmark(scene, camera, renderer);
    expect(handle.csm.lightDirection.x).toBeCloseTo(0, 5);
    expect(handle.csm.lightDirection.y).toBeCloseTo(0, 5);
    expect(handle.csm.lightDirection.z).toBeCloseTo(-1, 5);
    removeCsmBenchmark(handle);
  });

  it('reports shadow memory as cascades × shadowMapSize² × 4 bytes', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const handle = installCsmBenchmark(scene, camera, renderer, { cascades: 3, shadowMapSize: 1024 });
    expect(handle.stats.estimatedShadowMemoryBytes).toBe(3 * 1024 * 1024 * 4);
    removeCsmBenchmark(handle);
  });

  it('lets a hand-rolled ShaderMaterial opt in via userData.csmCompatible', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const material = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4(0.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' });
    material.userData.csmCompatible = true;
    addMesh(scene, material);

    const handle = installCsmBenchmark(scene, camera, renderer);
    expect(handle.stats.materialsPatched).toBe(1);
    expect(handle.stats.materialsSkipped).toBe(0);
    expect((material.defines as Record<string, unknown> | undefined)?.USE_CSM).toBe(1);
    removeCsmBenchmark(handle);
  });

  it('requestShadowUpdate marks the renderer and every cascade shadow dirty (§72 parity)', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const handle = installCsmBenchmark(scene, camera, renderer);
    for (const light of handle.csm.lights) expect(light.shadow.autoUpdate).toBe(false); // event-driven, like the fitted map it replaces

    handle.requestShadowUpdate();
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    for (const light of handle.csm.lights) expect(light.shadow.needsUpdate).toBe(true);
    removeCsmBenchmark(handle);
  });

  it('update() delegates to CSM without throwing', () => {
    const scene = new THREE.Scene(), camera = perspectiveCamera(), renderer = fakeRenderer();
    const handle: CsmBenchmarkHandle = installCsmBenchmark(scene, camera, renderer);
    expect(() => handle.update()).not.toThrow();
    removeCsmBenchmark(handle);
  });
});
