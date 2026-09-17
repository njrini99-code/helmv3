/** Meridian V2 light-probe experiment (V2 plan §74 "Light probe grids —
 * experiment only", compared against §70 "Bent-sky ambient"; Part XXI
 * Task 23; ruling R9).
 *
 * §74 names `LightProbeGridWebGL` and asks whether a position-dependent L2
 * spherical-harmonic irradiance grid earns its cost over the sky
 * visibility/bent normal ambient this codebase already ships
 * (terrain-sky-field.ts). Ruling R9 records that three 0.186 "has no
 * LightProbeGrid" and directs this task to build a MANUAL grid from
 * `THREE.LightProbe` + `LightProbeGenerator` instead. That premise does not
 * hold for the three version actually installed here: `LightProbeGridWebGL`
 * (`three/examples/jsm/lighting/LightProbeGridWebGL.js`) exists, documents
 * itself as WebGLRenderer-compatible, and is wired end to end in
 * `WebGLRenderer.js` (`pushLightProbeGrid` during scene traversal,
 * `findLightProbeGrid` per object at draw time, the `USE_LIGHT_PROBES_GRID`
 * chunk in `lights_fragment_begin.glsl.js`) — it lights any material with
 * `needsLights` (`MeshStandardMaterial` included) with NO app-side shader
 * wiring. See this task's report for the full correction; this module still
 * builds the MANUAL grid the task names, because R9's conclusion (build one,
 * measure it, it may be rejected) does not depend on the wrong premise, and
 * a manual grid surfaces the exact hazard §74 does not mention: a plain
 * `THREE.LightProbe` has no spatial selectivity at all — `WebGLLights.js`
 * SUMS every active LightProbe's SH into one global term
 * (`state.probe[j].addScaledVector(light.sh.coefficients[j], intensity)`),
 * so adding every grid cell to a scene at once would not approximate a
 * spatial grid, it would blur every cell together. `attachNearestProbe`
 * below exists to make that failure mode impossible to reintroduce by
 * accident.
 *
 * Test scene: a synthetic six-tree cluster plus one structure box, not real
 * hole 7 canopy/structure instances. forest-edge-v2.ts (real hero canopy
 * placement) is owned by a concurrent task in this wave; a follow-up can
 * rerun `estimateProbeAtPosition`/`buildLightProbeGrid` against its real
 * instance transforms once both land. The bounding box IS hole 7's real
 * `renderProfile.tacticalBoundsM` (src/test/fixtures/course-geometry/
 * compiled-peek-n-peak-upper/…, hole `peek-n-peak-upper-07`), so grid
 * spacing and probe count are the real ones a hero hole would get — only
 * the occluders inside it are illustrative.
 *
 * Coordinate convention: like the rest of this V2 render layer
 * (three-world-v2.ts writes canonical `metricTerrainNormal()` triples
 * straight into a `BufferAttribute` with no root rotation), this module
 * keeps canonical Z as vertical throughout; `(0, 0, 1)` is up, matching
 * `SkyField.bentXY`'s "z = sqrt(1 − x² − y²), 0,0 straight up" convention.
 *
 * Headless-safe / guarded split: everything except `captureLightProbeFromScene`
 * is plain data and math — buildable and testable under `--project unit`
 * (node, no DOM, no WebGL). The default per-probe SH comes from
 * `estimateProbeAtPosition`, a deterministic quasi-Monte-Carlo SH projection
 * over a fixed Fibonacci-sphere direction set (closed-form, no seed needed,
 * no `Math.random`/`Date`) with analytic ray/sphere and ray/box occlusion —
 * the same L2 SH accumulate-then-normalize integral `LightProbeGenerator`
 * uses (https://www.ppsloan.org/publications/StupidSH36.pdf), evaluated
 * without rendering anything. `captureLightProbeFromScene` is the literal
 * "small cube render" path §74/this task describe — a real `THREE.CubeCamera`
 * capture converted via `LightProbeGenerator.fromCubeRenderTarget` — but it
 * is guarded: called with no `THREE.WebGLRenderer` (the default; every path
 * in this module and its test takes) it resolves to `null` and touches no
 * GPU/DOM API. */
import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import { compileSkyField, type SkyField } from '@/lib/golf/course-geometry/terrain-sky-field';
import type { MetricTerrainGrid } from '@/lib/golf/course-geometry/terrain-source';
import { hexToRgb, MERIDIAN_STYLE, srgbToLinear } from '@/lib/golf/course-geometry/visual-style';

// ---------------------------------------------------------------------------
// Synthetic wooded/structure test scene (analytic occluders, no geometry).
// ---------------------------------------------------------------------------

/** Hole 7's real tactical bounds (see module header); only the box is real,
 * the occluders placed inside it below are not. */
export const HOLE7_TACTICAL_BOUNDS_M: readonly [number, number, number, number] = [-640, 956, -288, 1168];

export interface TreeOccluder {
  readonly positionM: readonly [number, number];
  readonly canopyRadiusM: number;
  readonly canopyCenterZM: number;
}
export interface StructureOccluder {
  readonly centerM: readonly [number, number, number];
  readonly halfExtentsM: readonly [number, number, number];
}
export interface WoodedStructureScene {
  readonly boundsM: readonly [number, number, number, number];
  readonly trees: readonly TreeOccluder[];
  readonly structure: StructureOccluder;
}

/** A minimal illustrative forest edge (6 canopies, ~18×24 m footprint) and
 * one small structure (10×8 m footprint, 6 m tall), both well inside
 * `boundsM` and well separated from each other so the two occluder kinds
 * can be exercised independently. Trunks are not modelled: at the probe
 * heights and ranges this experiment samples, a canopy sphere is what
 * occludes sky, and a 0.3–0.4 m trunk contributes negligible solid angle. */
export function buildWoodedStructureScene(boundsM: readonly [number, number, number, number] = HOLE7_TACTICAL_BOUNDS_M): WoodedStructureScene {
  const [x0, y0] = boundsM;
  const trees: TreeOccluder[] = [
    { positionM: [x0 + 60, y0 + 40], canopyRadiusM: 4.2, canopyCenterZM: 7.5 },
    { positionM: [x0 + 66, y0 + 50], canopyRadiusM: 4.6, canopyCenterZM: 8.0 },
    { positionM: [x0 + 58, y0 + 56], canopyRadiusM: 4.0, canopyCenterZM: 7.0 },
    { positionM: [x0 + 72, y0 + 46], canopyRadiusM: 4.4, canopyCenterZM: 7.8 },
    { positionM: [x0 + 64, y0 + 64], canopyRadiusM: 4.3, canopyCenterZM: 7.6 },
    { positionM: [x0 + 76, y0 + 58], canopyRadiusM: 4.1, canopyCenterZM: 7.2 },
  ];
  const structure: StructureOccluder = { centerM: [x0 + 240, y0 + 150, 3], halfExtentsM: [5, 4, 3] };
  return { boundsM, trees, structure };
}

// ---------------------------------------------------------------------------
// Deterministic direction sampling and analytic occlusion.
// ---------------------------------------------------------------------------

/** `count` directions spread quasi-uniformly over the unit sphere by the
 * golden-angle spiral. Closed-form and order-stable: no seed, no
 * `Math.random`, no `Date` — the same `count` always returns the same
 * array (constraint 13). */
export function fibonacciSphereDirections(count: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const z = count > 1 ? 1 - (2 * i) / (count - 1) : 1;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = goldenAngle * i;
    points.push(new THREE.Vector3(radius * Math.cos(theta), radius * Math.sin(theta), z));
  }
  return points;
}

function raySphereHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, radiusM: number): number | null {
  const ocx = ox - cx, ocy = oy - cy, ocz = oz - cz;
  const b = ocx * dx + ocy * dy + ocz * dz;
  const c = ocx * ocx + ocy * ocy + ocz * ocz - radiusM * radiusM;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const t = -b - Math.sqrt(discriminant);
  return t > 1e-6 ? t : null;
}

function rayAabbHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, box: StructureOccluder): number | null {
  const [cx, cy, cz] = box.centerM, [hx, hy, hz] = box.halfExtentsM;
  const axes: readonly (readonly [number, number, number, number])[] = [[ox, dx, cx, hx], [oy, dy, cy, hy], [oz, dz, cz, hz]];
  let tMin = -Infinity, tMax = Infinity;
  for (const [o, d, c, h] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < c - h || o > c + h) return null; continue; }
    let t1 = (c - h - o) / d, t2 = (c + h - o) / d;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin > 1e-6 ? tMin : tMax > 1e-6 ? tMax : null;
}

export type OccluderHit = 'sky' | 'ground' | 'canopy' | 'structure';

/** Nearest hit along `direction` (must be unit length) from `originM`
 * against every canopy sphere and the structure box. No hit: `'sky'` when
 * the ray points up (`direction.z >= 0`), `'ground'` when it points down —
 * the open-hemisphere/downward split `estimateProbeAtPosition` uses to
 * report an openness fraction comparable to `SkyField.visibility`. */
export function castOccluderRay(scene: WoodedStructureScene, originM: readonly [number, number, number], direction: THREE.Vector3): OccluderHit {
  const [ox, oy, oz] = originM, { x: dx, y: dy, z: dz } = direction;
  let nearestM = Infinity, hit: 'canopy' | 'structure' | null = null;
  for (const tree of scene.trees) {
    const t = raySphereHit(ox, oy, oz, dx, dy, dz, tree.positionM[0], tree.positionM[1], tree.canopyCenterZM, tree.canopyRadiusM);
    if (t != null && t < nearestM) { nearestM = t; hit = 'canopy'; }
  }
  const structureT = rayAabbHit(ox, oy, oz, dx, dy, dz, scene.structure);
  if (structureT != null && structureT < nearestM) { nearestM = structureT; hit = 'structure'; }
  if (hit) return hit;
  return dz >= 0 ? 'sky' : 'ground';
}

// Reuse the production sky/ground swatches (visual-style.ts) so the sky term
// this experiment measures against is the one bent-sky ambient already
// assumes, not an arbitrarily different color. Canopy/structure tones are
// illustrative placeholders — no authored canopy-interior or structure-wall
// swatch exists yet.
const linearFromHex = (hex: string): THREE.Color => { const [r, g, b] = hexToRgb(hex); return new THREE.Color(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)); };
const SKY_ZENITH = linearFromHex(MERIDIAN_STYLE.sky.zenith);
const SKY_HORIZON = linearFromHex(MERIDIAN_STYLE.sky.horizon);
const GROUND_COLOR = linearFromHex(MERIDIAN_STYLE.light.groundColor);
const CANOPY_COLOR = new THREE.Color(0.05, 0.09, 0.04);
const STRUCTURE_COLOR = new THREE.Color(0.24, 0.22, 0.19);

/** Linear-space radiance sample for one direction's hit. `direction.z` only
 * matters for the sky gradient (`'sky'` is never returned for `z < 0`). */
export function sampleRadiance(hit: OccluderHit, direction: THREE.Vector3): THREE.Color {
  if (hit === 'canopy') return CANOPY_COLOR.clone();
  if (hit === 'structure') return STRUCTURE_COLOR.clone();
  if (hit === 'ground') return GROUND_COLOR.clone();
  return SKY_HORIZON.clone().lerp(SKY_ZENITH, Math.max(0, direction.z));
}

// ---------------------------------------------------------------------------
// Per-probe SH projection (headless-safe default).
// ---------------------------------------------------------------------------

export const DEFAULT_DIRECTION_SAMPLES = 128;

export interface ProbeEstimate {
  readonly sh: THREE.SphericalHarmonics3;
  /** Fraction of upward-hemisphere samples (`direction.z > 0`) that reached
   * open sky rather than a canopy or the structure — the same 0–1 "how much
   * sky can this point see" quantity as `SkyField.visibility`, from a
   * different construction (ray-vs-occluder here; horizon-elevation-per-
   * azimuth over a height field there). Comparable in magnitude, not the
   * same algorithm. */
  readonly openFraction: number;
}

/** L2 SH irradiance probe at `positionM` plus its open-sky fraction, from
 * one pass over `fibonacciSphereDirections(directionCount)`: accumulate
 * `sampleRadiance(hit, direction) * SphericalHarmonics3.getBasisAt(direction)`
 * per direction, then scale by `4π / directionCount` (the equal-solid-angle
 * quasi-MC normalization — see the module header for the reference this
 * mirrors from `LightProbeGenerator`). */
export function estimateProbeAtPosition(scene: WoodedStructureScene, positionM: readonly [number, number, number], directionCount = DEFAULT_DIRECTION_SAMPLES): ProbeEstimate {
  const directions = fibonacciSphereDirections(directionCount);
  const sh = new THREE.SphericalHarmonics3();
  const basis: number[] = new Array(9).fill(0);
  let upward = 0, open = 0;
  for (const direction of directions) {
    const hit = castOccluderRay(scene, positionM, direction);
    const color = sampleRadiance(hit, direction);
    THREE.SphericalHarmonics3.getBasisAt(direction, basis);
    for (let i = 0; i < 9; i++) {
      const coefficient = sh.coefficients[i]!;
      coefficient.x += basis[i]! * color.r;
      coefficient.y += basis[i]! * color.g;
      coefficient.z += basis[i]! * color.b;
    }
    if (direction.z > 0) { upward++; if (hit === 'sky') open++; }
  }
  sh.scale((4 * Math.PI) / directionCount);
  return { sh, openFraction: upward > 0 ? open / upward : 1 };
}

// ---------------------------------------------------------------------------
// The grid (§74 "low-resolution grid"; task text "e.g. 8×8").
// ---------------------------------------------------------------------------

export const DEFAULT_PROBE_HEIGHT_M = 2.5;

export interface ManualLightProbeGridOptions {
  columns?: number;
  rows?: number;
  heightM?: number;
  directionSamples?: number;
}
export interface ManualLightProbeGridSample {
  readonly positionM: readonly [number, number, number];
  readonly probe: THREE.LightProbe;
  readonly openFraction: number;
}
/** Named `Manual…` (not `LightProbeGrid`) on purpose: three itself exports a
 * class with that name (`three/examples/jsm/lighting/LightProbeGrid(WebGL)`,
 * see the module header) and this is not it. */
export interface ManualLightProbeGrid {
  readonly boundsM: readonly [number, number, number, number];
  readonly columns: number;
  readonly rows: number;
  readonly heightM: number;
  readonly samples: readonly ManualLightProbeGridSample[];
  readonly basis: 'synthetic_experiment_scene';
}

/** Builds `columns × rows` probes evenly spaced over `scene.boundsM` at
 * `heightM`, each an `estimateProbeAtPosition` sample wrapped as a real
 * `THREE.LightProbe`. Pure and headless-safe: no renderer, no DOM, no
 * randomness — the same `scene`/options always produce the same grid. */
export function buildLightProbeGrid(scene: WoodedStructureScene, options: ManualLightProbeGridOptions = {}): ManualLightProbeGrid {
  const columns = Math.max(2, Math.round(options.columns ?? 8));
  const rows = Math.max(2, Math.round(options.rows ?? 8));
  const heightM = options.heightM ?? DEFAULT_PROBE_HEIGHT_M;
  const directionSamples = options.directionSamples ?? DEFAULT_DIRECTION_SAMPLES;
  const [x0, y0, x1, y1] = scene.boundsM;
  const samples: ManualLightProbeGridSample[] = [];
  for (let row = 0; row < rows; row++) {
    const y = y0 + (y1 - y0) * (row / (rows - 1));
    for (let column = 0; column < columns; column++) {
      const x = x0 + (x1 - x0) * (column / (columns - 1));
      const positionM: readonly [number, number, number] = [x, y, heightM];
      const { sh, openFraction } = estimateProbeAtPosition(scene, positionM, directionSamples);
      samples.push({ positionM, probe: new THREE.LightProbe(sh, 1), openFraction });
    }
  }
  return { boundsM: scene.boundsM, columns, rows, heightM, samples, basis: 'synthetic_experiment_scene' };
}

/** Nearest grid sample to `positionM` by XY distance (linear scan — a grid
 * this small, ≤ a few hundred cells, never needs a spatial index). */
export function nearestProbeSample(grid: ManualLightProbeGrid, positionM: readonly [number, number, number]): ManualLightProbeGridSample {
  let best = grid.samples[0]!, bestDistanceSq = Infinity;
  for (const sample of grid.samples) {
    const dx = sample.positionM[0] - positionM[0], dy = sample.positionM[1] - positionM[1];
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) { bestDistanceSq = distanceSq; best = sample; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Applying a probe (the WebGLLights summing hazard is real — see header).
// ---------------------------------------------------------------------------

export const LIGHT_PROBE_EXPERIMENT_TAG = 'golfV2LightProbeExperiment';

/** Adds the grid cell nearest `positionM` to `scene` as the scene's ONLY
 * managed `THREE.LightProbe`, removing any probe a previous call attached
 * (tagged via `LIGHT_PROBE_EXPERIMENT_TAG`). Three sums every active
 * `LightProbe`'s SH into one global term (module header); adding all 64
 * grid cells at once would average them into meaningless mush, not
 * interpolate spatially. This is the one function in this module that
 * should ever call `scene.add()` with a probe from a `ManualLightProbeGrid`. */
export function attachNearestProbe(scene: THREE.Scene, grid: ManualLightProbeGrid, positionM: readonly [number, number, number]): THREE.LightProbe {
  detachManagedProbe(scene);
  const { probe } = nearestProbeSample(grid, positionM);
  probe.userData[LIGHT_PROBE_EXPERIMENT_TAG] = true;
  scene.add(probe);
  return probe;
}

/** Removes every probe this module previously attached to `scene`. */
export function detachManagedProbe(scene: THREE.Scene): void {
  for (const child of [...scene.children]) {
    if ((child as Partial<THREE.LightProbe>).isLightProbe && child.userData[LIGHT_PROBE_EXPERIMENT_TAG]) scene.remove(child);
  }
}

/** CPU-only irradiance readout for headless measurement/tests — not a
 * production material API. `normal` defaults to straight up in this
 * module's Z-up convention. */
export function probeIrradiance(probe: THREE.LightProbe, normal: THREE.Vector3 = new THREE.Vector3(0, 0, 1)): THREE.Color {
  const target = new THREE.Vector3();
  probe.sh.getIrradianceAt(normal, target);
  return new THREE.Color(target.x, target.y, target.z);
}

// ---------------------------------------------------------------------------
// Cost.
// ---------------------------------------------------------------------------

/** `LightProbe.sh.toArray()` is 9 `Vector3` coefficients flattened, i.e. 27
 * floats. */
export const SH_FLOATS_PER_PROBE = 27;
export const SH_BYTES_PER_PROBE = SH_FLOATS_PER_PROBE * 4;

export interface LightProbeGridCost {
  readonly probeCount: number;
  readonly bytesPerProbe: number;
  readonly totalShBytes: number;
  readonly columns: number;
  readonly rows: number;
}

/** Exact SH payload cost only — no fabricated per-instance JS/GPU overhead
 * number. See this task's doc/report for why bytes are not the objection. */
export function reportLightProbeGridCost(grid: ManualLightProbeGrid): LightProbeGridCost {
  const probeCount = grid.samples.length;
  return { probeCount, bytesPerProbe: SH_BYTES_PER_PROBE, totalShBytes: probeCount * SH_BYTES_PER_PROBE, columns: grid.columns, rows: grid.rows };
}

// ---------------------------------------------------------------------------
// Comparison against terrain-sky-field.ts's bent-sky ambient (§70).
// ---------------------------------------------------------------------------

/** A flat (`heightsM` all 0) `MetricTerrainGrid` spanning `boundsM` plus a
 * margin, for `compileSkyField`. Flat is deliberate: it isolates what a
 * light-probe grid can see that bent-sky cannot (standing canopy/structure
 * occlusion) from ordinary terrain relief, which bent-sky already handles
 * and which a synthetic hill here would only muddy. Not a claim about real
 * hole 7 terrain (which does have relief; `terrain-sky-field.ts` already
 * covers that from the real DEM). */
export function flatComparisonTerrainGrid(boundsM: readonly [number, number, number, number], spacingM = 20): MetricTerrainGrid {
  const [x0, y0, x1, y1] = boundsM, marginM = spacingM * 2;
  const columns = Math.max(2, Math.ceil((x1 - x0 + marginM * 2) / spacingM) + 1);
  const rows = Math.max(2, Math.ceil((y1 - y0 + marginM * 2) / spacingM) + 1);
  return { originM: [x0 - marginM, y0 - marginM], spacingM, columns, rows, heightsM: new Array<number | null>(columns * rows).fill(0) };
}

/** `compileSkyField` over `flatComparisonTerrainGrid(boundsM)` — the bent-sky
 * baseline this module's probes are compared against. */
export function buildFlatBentSkyBaseline(boundsM: readonly [number, number, number, number], spacingM = 20): { terrain: MetricTerrainGrid; sky: SkyField } {
  const terrain = flatComparisonTerrainGrid(boundsM, spacingM);
  return { terrain, sky: compileSkyField(terrain) };
}

function nearestGridIndex(grid: MetricTerrainGrid, x: number, y: number): number {
  const gx = Math.min(Math.max(Math.round((x - grid.originM[0]) / grid.spacingM), 0), grid.columns - 1);
  const gy = Math.min(Math.max(Math.round((y - grid.originM[1]) / grid.spacingM), 0), grid.rows - 1);
  return gy * grid.columns + gx;
}

export interface BentSkyComparisonSample {
  readonly positionM: readonly [number, number, number];
  readonly probeOpenFraction: number;
  readonly bentSkyVisibility: number;
}

/** Pairs each grid probe's geometric `openFraction` with bent-sky's
 * `visibility` at the same XY (nearest terrain-grid node) — both a 0–1
 * "fraction of sky this point can see", so the gap between them is
 * comparable independent of any color choice (advisor guidance: report the
 * occlusion-fraction gap, not an irradiance-magnitude delta that rides on
 * the illustrative canopy/structure colors above). */
export function compareToBentSky(grid: ManualLightProbeGrid, terrain: MetricTerrainGrid, sky: SkyField): BentSkyComparisonSample[] {
  return grid.samples.map(sample => ({
    positionM: sample.positionM,
    probeOpenFraction: sample.openFraction,
    bentSkyVisibility: sky.visibility[nearestGridIndex(terrain, sample.positionM[0], sample.positionM[1])] ?? 1,
  }));
}

// ---------------------------------------------------------------------------
// Guarded real capture path — optional, never called by the grid/tests above.
// ---------------------------------------------------------------------------

export interface CubeCaptureOptions { cubemapSize?: number; near?: number; far?: number }

/** The literal "small cube render" §74/this task describe: a real
 * `THREE.CubeCamera` capture of `scene` from `positionM`, converted to a
 * `THREE.LightProbe` via `LightProbeGenerator.fromCubeRenderTarget`. Guarded:
 * with no `renderer` (or a non-WebGL one), resolves to `null` and never
 * touches the GPU or DOM — this is the only way this module is allowed to
 * try. `scene` is any real `THREE.Scene` (not `WoodedStructureScene`), so a
 * later caller can point this at real hole 7 forest-edge-v2 instances
 * without changing this function. */
export async function captureLightProbeFromScene(renderer: THREE.WebGLRenderer | null | undefined, scene: THREE.Scene, positionM: readonly [number, number, number], options: CubeCaptureOptions = {}): Promise<THREE.LightProbe | null> {
  if (!renderer || !(renderer instanceof THREE.WebGLRenderer)) return null;
  const { cubemapSize = 8, near = 0.1, far = 200 } = options;
  const target = new THREE.WebGLCubeRenderTarget(cubemapSize, { format: THREE.RGBAFormat, type: THREE.HalfFloatType });
  const cubeCamera = new THREE.CubeCamera(near, far, target);
  cubeCamera.position.set(positionM[0], positionM[1], positionM[2]);
  cubeCamera.update(renderer, scene);
  try {
    return await LightProbeGenerator.fromCubeRenderTarget(renderer, target);
  } finally {
    target.dispose();
  }
}
