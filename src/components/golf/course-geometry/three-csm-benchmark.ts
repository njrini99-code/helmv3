/** Meridian V2 Task 22 — cascaded shadow maps, high-tier benchmark (plan Part
 * XIII §69–73, Part XXI Task 22). "Do not enable standard": this module is an
 * isolated, install/remove-able experiment, never wired into the standard
 * (phone) render path. §73's own recommendation is what this file installs —
 * "high = benchmark 2-cascade CSM" — against three 0.186's shipped
 * `examples/jsm/csm` addon (verified present; `@types/three` 0.186.0 ships
 * matching declarations for it, so this import needs no local shim).
 *
 * `installCsmBenchmark` swaps three's addon in "in place of" this app's
 * current single fitted shadow map (three-renderer.ts: one `DirectionalLight`
 * whose shadow camera is fitted to the visible package every relevant camera
 * change, §72). It does three things the addon does not do safely on its
 * own, all required for a clean A/B toggle rather than a one-way experiment:
 *
 * 1. Hides (does not remove) every existing shadow-casting `DirectionalLight`
 *    already in the scene while CSM is installed, restoring visibility on
 *    removal. CSM's cascades occupy `directionalLights[i]` slots by index in
 *    its own patched fragment chunk (see 2); leaving the original light
 *    lit alongside them would double-count illumination and misassign one
 *    cascade's depth mask to the wrong light.
 * 2. `CSM`'s constructor unconditionally overwrites the *global*
 *    `THREE.ShaderChunk.lights_fragment_begin`/`lights_pars_begin` (every
 *    material compiled anywhere in the process while CSM is installed reads
 *    the patched chunk, not three's default), and neither `csm.remove()` nor
 *    `csm.dispose()` ever restores it — a real, permanent global leak this
 *    module snapshots before construction and restores on removal.
 * 3. `csm.setupMaterial(material)` replaces `material.onBeforeCompile` with
 *    its own callback, and `csm.dispose()` `delete`s it back to
 *    `Material.prototype`'s no-op — not back to whatever the material had
 *    before. The turf/crown/trunk/mass ground materials in
 *    three-landscape.ts (`attachTurfStyle`, `MeshStandardMaterial`) install
 *    their own `onBeforeCompile` for DEM shading and `customProgramCacheKey`;
 *    an install/remove cycle without this fix would silently and permanently
 *    strip that shader injection. This module snapshots and restores the
 *    exact prior callback per material instead.
 *
 * Only materials three's own lighting chunk system natively drives —
 * `MeshStandardMaterial` (covers `MeshPhysicalMaterial`, its subclass),
 * `MeshPhongMaterial`, `MeshLambertMaterial` — are patched. A hand-rolled
 * `ShaderMaterial`/`RawShaderMaterial` (the eventual V2 ground material:
 * ground-shader-v2.ts's `groundShaderV2Chunks` are plain GLSL text spliced
 * together by a later wiring task, not three's `#include <lights_*>` chunk
 * system) is left untouched and counted in `stats.materialsSkipped` unless
 * it opts in with `material.userData.csmCompatible = true` — a forward
 * extension point for whenever that wiring task's shader actually contains
 * the matching `#include`s, not a claim that it does today.
 *
 * §72's shadow-update discipline (`shadow.autoUpdate = false`, explicit
 * `needsUpdate` bakes; this app never runs a continuous render loop) is
 * extended to every cascade light, so a benchmark A/B measures the same
 * event-driven cost model on both sides — CSM lights left at three's default
 * `autoUpdate = true` would rebake every render regardless of whether
 * anything changed, biasing the "cost" side of the comparison upward for a
 * reason that has nothing to do with cascades.
 *
 * Camera: CSM's frustum splitting is a perspective-only construction (near/
 * far percentage splits of `camera.projectionMatrix`); this module accepts
 * only `THREE.PerspectiveCamera`, matching §73's own framing ("sharper
 * shadows over long whole-hole perspective") and this app's `perspectiveView`
 * camera (three-renderer.ts) — never the orthographic Top view.
 *
 * This module imports no lib module and knows nothing about `HoleScene`,
 * `TerrainMesh` or any compiler: it operates purely on the THREE objects it
 * is handed, so it can be pointed at any scene/camera/renderer, including a
 * synthetic one in a headless test. */
import * as THREE from 'three';
import { CSM, type CSMParameters } from 'three/examples/jsm/csm/CSM.js';

/** `CSM`'s own `'custom'` mode requires a `customSplitsCallback`; this
 * benchmark only exercises the three built-in split schemes the plan itself
 * never names a preference between, so 'custom' is left out on purpose. */
export type CsmSplitMode = 'practical' | 'uniform' | 'logarithmic';

export interface CsmBenchmarkOptions {
  /** §73: "benchmark 2-cascade CSM" — default 2. Pass 3+ to compare against
   * three's own addon default (`data.cascades || 3`) in the same harness. */
  cascades?: number;
  mode?: CsmSplitMode;
  /** Defaults to the replaced light's own `shadow.mapSize.width` (falling
   * back to CSM's default 2048) so a benchmark run changes cascade count
   * without also confounding the comparison with a resolution change. */
  shadowMapSize?: number;
  shadowBias?: number;
  maxFar?: number;
  lightNear?: number;
  lightFar?: number;
  lightMargin?: number;
  /** CSM's constructor ignores `data.fade` (reads a hardcoded `false`
   * instead — verified against the addon source); this module applies it
   * correctly after construction via `csm.fade` + `csm.updateFrustums()`. */
  fade?: boolean;
  /** Defaults to the direction from the replaced light's position to its
   * target (three's own `lightDirection` convention: "the direction the
   * light travels"), or CSM's own default when no existing light is found. */
  lightDirection?: THREE.Vector3;
  lightIntensity?: number;
  lightColor?: THREE.ColorRepresentation;
  /** Explicit material list, bypassing the scene traversal below. */
  materials?: readonly THREE.Material[];
  /** Explicit lights to disable in place of the auto-detected ones (every
   * visible, shadow-casting `DirectionalLight` currently in the scene). */
  existingShadowLights?: readonly THREE.DirectionalLight[];
}

export interface CsmBenchmarkStats {
  cascades: number;
  mode: CsmSplitMode;
  shadowMapSize: number;
  /** `cascades * shadowMapSize² * 4` bytes — the same "size² × 4 bytes/
   * texel" estimate three-renderer.ts's own `shadowMemoryMb` dataset field
   * already uses for the single fitted map, kept identical here so the two
   * numbers are comparable rather than independently "more correct" and
   * therefore incommensurable (§71's own "do not call it physically exact"
   * spirit, applied to memory accounting instead of shading). */
  estimatedShadowMemoryBytes: number;
  materialsPatched: number;
  materialsSkipped: number;
  /** Existing shadow-casting lights hidden for the duration of the install. */
  disabledLights: number;
  /** Diagnostic: a benchmark run against a renderer whose shadow map is
   * disabled would otherwise silently report "no difference" for the wrong
   * reason. */
  shadowMapEnabled: boolean;
}

export interface CsmBenchmarkHandle {
  readonly scene: THREE.Scene;
  /** Escape hatch for anything this module does not itself wrap (e.g.
   * `updateFrustums()` after a camera fov/near/far change). */
  readonly csm: CSM;
  readonly stats: CsmBenchmarkStats;
  /** Call once per frame before `renderer.render(...)` while CSM is
   * installed — CSM's own required per-frame maintenance (repositions each
   * cascade's light to follow the camera). */
  update(): void;
  /** §72 parity: marks every cascade's shadow (and the renderer's shadow
   * pass) dirty, exactly like the `dirtyShadow` bake in three-renderer.ts's
   * `setCamera` — call it wherever that call site would have set
   * `sun.shadow.needsUpdate`. */
  requestShadowUpdate(): void;
}

const DEFAULT_CASCADES = 2;
const DEFAULT_MODE: CsmSplitMode = 'practical';
const DEFAULT_SHADOW_MAP_SIZE = 2048;
/** Matches three-renderer.ts's own `shadowMemoryMb` estimate (RGBA8, 4
 * bytes/texel) — see `CsmBenchmarkStats.estimatedShadowMemoryBytes`. */
const SHADOW_MEMORY_BYTES_PER_TEXEL = 4;

function findExistingShadowLights(scene: THREE.Scene): THREE.DirectionalLight[] {
  const found: THREE.DirectionalLight[] = [];
  scene.traverse(object => { if (object instanceof THREE.DirectionalLight && object.visible && object.castShadow) found.push(object); });
  return found;
}

/** Three's own lighting chunk system (`#include <lights_pars_begin>` /
 * `<lights_fragment_begin>`, the two chunks CSM patches) only drives these
 * material classes plus anything that explicitly opts in — see file header. */
function isCsmCompatibleMaterial(material: THREE.Material): boolean {
  return material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial
    || material instanceof THREE.MeshLambertMaterial || material.userData.csmCompatible === true;
}

function collectMaterials(scene: THREE.Scene, explicit?: readonly THREE.Material[]): THREE.Material[] {
  const seen = new Set<THREE.Material>();
  if (explicit) { for (const material of explicit) seen.add(material); return [...seen]; }
  scene.traverse(object => {
    const material = (object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
    if (!material) return;
    if (Array.isArray(material)) material.forEach(entry => seen.add(entry)); else seen.add(material);
  });
  return [...seen];
}

/** Scene → its live benchmark handle, both to refuse a nested install onto a
 * scene that already has one (CSM's constructor would clobber the global
 * `ShaderChunk` a second time with no way to unwind back to the true
 * original) and so `removeCsmBenchmark` on an already-removed or foreign
 * handle is a safe no-op, matching this codebase's `dispose()` convention
 * (three-renderer.ts: `if (disposed) return;`) rather than throwing twice. */
const activeInstalls = new WeakMap<THREE.Scene, CsmBenchmarkHandle>();
const cleanups = new WeakMap<CsmBenchmarkHandle, () => void>();

/** Installs three's CSM addon on `scene`/`camera`/`renderer` in place of
 * whatever single fitted `DirectionalLight` shadow is currently active
 * there. Safe to call repeatedly across independent scenes; refuses a second
 * install on the same scene until `removeCsmBenchmark` has run. */
export function installCsmBenchmark(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer,
  options: CsmBenchmarkOptions = {}): CsmBenchmarkHandle {
  if (activeInstalls.has(scene)) throw new Error('installCsmBenchmark: CSM is already installed on this scene — call removeCsmBenchmark first.');
  const cascades = options.cascades ?? DEFAULT_CASCADES;
  if (!Number.isInteger(cascades) || cascades < 1) throw new Error(`installCsmBenchmark: cascades must be a positive integer, got ${cascades}.`);
  const mode = options.mode ?? DEFAULT_MODE;

  const existingLights = options.existingShadowLights ? [...options.existingShadowLights] : findExistingShadowLights(scene);
  const priorVisibility = existingLights.map(light => light.visible);
  for (const light of existingLights) light.visible = false;
  const reference = existingLights[0];

  const lightDirection = options.lightDirection ? options.lightDirection.clone().normalize()
    : reference ? new THREE.Vector3().subVectors(reference.target.position, reference.position).normalize() : undefined;
  const shadowMapSize = options.shadowMapSize ?? reference?.shadow.mapSize.width ?? DEFAULT_SHADOW_MAP_SIZE;

  const priorLightsFragmentBegin = THREE.ShaderChunk.lights_fragment_begin;
  const priorLightsParsBegin = THREE.ShaderChunk.lights_pars_begin;

  const parameters: CSMParameters = {
    camera, parent: scene, cascades, mode, shadowMapSize,
    shadowBias: options.shadowBias, maxFar: options.maxFar,
    lightDirection, lightIntensity: options.lightIntensity ?? reference?.intensity,
    lightNear: options.lightNear, lightFar: options.lightFar, lightMargin: options.lightMargin,
  };
  const csm = new CSM(parameters);
  // CSM's constructor ignores `data.fade` (see the type above) — apply it
  // for real, then recompute the frustums it affects.
  if (options.fade) { csm.fade = true; csm.updateFrustums(); }

  const lightColor = options.lightColor !== undefined ? new THREE.Color(options.lightColor) : reference?.color.clone();
  for (const light of csm.lights) {
    if (lightColor) light.color.copy(lightColor);
    // §72 parity — see the file header and `requestShadowUpdate` below.
    light.shadow.autoUpdate = false;
  }

  const materials = collectMaterials(scene, options.materials);
  const priorOnBeforeCompile = new Map<THREE.Material, THREE.Material['onBeforeCompile']>();
  let materialsPatched = 0, materialsSkipped = 0;
  for (const material of materials) {
    if (!isCsmCompatibleMaterial(material)) { materialsSkipped++; continue; }
    priorOnBeforeCompile.set(material, material.onBeforeCompile);
    csm.setupMaterial(material);
    materialsPatched++;
  }

  const stats: CsmBenchmarkStats = {
    cascades, mode, shadowMapSize, estimatedShadowMemoryBytes: cascades * shadowMapSize * shadowMapSize * SHADOW_MEMORY_BYTES_PER_TEXEL,
    materialsPatched, materialsSkipped, disabledLights: existingLights.length, shadowMapEnabled: renderer.shadowMap.enabled,
  };

  const handle: CsmBenchmarkHandle = {
    scene, csm, stats,
    update() { csm.update(); },
    requestShadowUpdate() { renderer.shadowMap.needsUpdate = true; for (const light of csm.lights) light.shadow.needsUpdate = true; },
  };

  cleanups.set(handle, () => {
    csm.remove(); // detaches every cascade light + its target from `scene`
    // Beyond what `csm.remove()` does: each cascade's shadow map render
    // target (allocated lazily on its first real bake) is never disposed by
    // the addon itself — a genuine GPU leak on repeated install/remove
    // cycles that this module closes explicitly.
    for (const light of csm.lights) light.shadow.dispose();
    csm.dispose(); // clears USE_CSM/CSM_CASCADES/CSM_FADE defines + uniforms, flags patched materials for recompile
    for (const [material, original] of priorOnBeforeCompile) material.onBeforeCompile = original;
    THREE.ShaderChunk.lights_fragment_begin = priorLightsFragmentBegin;
    THREE.ShaderChunk.lights_pars_begin = priorLightsParsBegin;
    existingLights.forEach((light, index) => { light.visible = priorVisibility[index]!; });
  });
  activeInstalls.set(scene, handle);
  return handle;
}

/** Reverses `installCsmBenchmark` completely: removes CSM's lights, restores
 * every material's original `onBeforeCompile`, restores the global
 * `THREE.ShaderChunk` entries CSM patched, and un-hides whatever shadow
 * light this benchmark hid. A no-op on a handle already removed (or foreign
 * to this module) — see the `activeInstalls`/`cleanups` comment above. */
export function removeCsmBenchmark(handle: CsmBenchmarkHandle): void {
  const cleanup = cleanups.get(handle);
  if (!cleanup) return;
  cleanup();
  cleanups.delete(handle);
  activeInstalls.delete(handle.scene);
}
