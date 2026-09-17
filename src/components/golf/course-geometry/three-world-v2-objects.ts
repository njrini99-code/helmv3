/**
 * Meridian V2 world objects (plan §52–54 cart-path ribbons, §55–62 forest
 * edge, Task 18 batching): the THREE side of `path-ribbon.ts` and
 * `forest-edge-v2.ts`. One draw for every cart path of the hole, one
 * batched draw per forest kind (crown / shrub / mass) reusing V1's authored
 * crown art (`tree-assets.ts`), plus one batched draw of trunks, re-LODed
 * per camera by `setDetail` (V1's projected-radius rule, §37/§68). Nothing
 * here places or invents anything: positions, radii, heights and rotations
 * come from the compilers, which derive them from the reviewed woods outlines
 * and the context layer. Everything is event-driven (built once, disposed
 * once); the batching planner (`v2-batching.ts`) is the accounting of what
 * this file draws.
 */
import * as THREE from 'three';
import type { ForestEdgeV2Result, ForestInstance } from '@/lib/golf/course-geometry/forest-edge-v2';
import type { PathRibbon } from '@/lib/golf/course-geometry/path-ribbon';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { buildThreeContext } from './three-context';
import { projectedCrownPx, type PerspectiveLodView } from './three-landscape';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { MERIDIAN_STYLE, type MeridianStyle } from '@/lib/golf/course-geometry/visual-style';
import { createForestMassGeometry, createTreeAssetAtlas, type TreeAssetAtlas } from './tree-assets';

export interface V2ObjectStats {
  draws: { paths: number; crowns: number; shrubs: number; mass: number; trunks: number; context: number };
  triangles: number;
  instances: { crown: number; shrub: number; mass: number; trunks: number };
  pathRuns: number;
  /** Task 17 (R8): V1's footprint extrusions and context lines, drawn until
   * authored models exist; 0 when no `mesh` was given. */
  structures: number;
}
export interface V2Objects {
  group: THREE.Group; stats: V2ObjectStats; forestStats: ForestObjectStats | null;
  /** Re-LOD the forest for a view (`ForestObjects.setDetail`); `stats` and
   * `forestStats` follow. `false` when nothing changed (or there is no forest). */
  setDetail: ForestObjects['setDetail'];
  dispose(): void;
}

const RIBBON_LIFT_M = 0.02;

/** Cart paths, roads and service paths as one indexed mesh: the ribbon
 * compiler already batches every zone into one buffer with per-zone runs,
 * so colour is a vertex attribute (per run, from the style's ribbon table)
 * and the whole hole is a single draw. */
export function buildPathRibbonMesh(ribbon: PathRibbon, scene: HoleScene, style: MeridianStyle = MERIDIAN_STYLE): { mesh: THREE.Mesh; triangles: number; dispose(): void } {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(ribbon.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = ribbon.positions[i]! + (i % 3 === 2 ? RIBBON_LIFT_M : 0);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
  geometry.setAttribute('uv', new THREE.BufferAttribute(ribbon.uv, 2));
  const vertexCount = positions.length / 3, color = new Float32Array(vertexCount * 3), edge = ribbon.edge;
  const classOf = new Map(scene.contextZones?.map(zone => [zone.id, zone.class] as const) ?? []);
  const ribbons = style.contextObjects.ribbons as Record<string, { color: string; shoulder: string }>;
  const owner = new Uint32Array(vertexCount);
  for (const run of ribbon.runs) for (let t = run.start; t < run.start + run.count; t++) for (let k = 0; k < 3; k++) owner[ribbon.indices[t * 3 + k]!] = ribbon.runs.indexOf(run) + 1;
  const linear = (hex: string) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] as const; };
  const cache = new Map<string, { top: readonly [number, number, number]; shoulder: readonly [number, number, number] }>();
  for (let v = 0; v < vertexCount; v++) {
    const run = ribbon.runs[owner[v]! - 1];
    const zoneClass = run ? classOf.get(run.zoneId) ?? 'cart_path' : 'cart_path';
    const entry = cache.get(zoneClass) ?? (() => { const s = ribbons[zoneClass] ?? ribbons.cart_path!; const e = { top: linear(s.color), shoulder: linear(s.shoulder) }; cache.set(zoneClass, e); return e; })();
    const f = edge[v] ?? 0;
    for (let n = 0; n < 3; n++) color[v * 3 + n] = entry.top[n]! * (1 - f) + entry.shoulder[n]! * f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'v2-path-ribbons'; mesh.receiveShadow = true; mesh.frustumCulled = true;
  return { mesh, triangles: ribbon.indices.length / 3, dispose: () => { geometry.dispose(); material.dispose(); } };
}

/** V1's integer hash (`three-landscape.ts` `variation`): several
 * independent 0–1 draws from one instance seed, so a crown's family, art,
 * colour, aspect and lean never correlate. */
function variation(seed: number): number {
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
const draw = (inst: ForestInstance, k: number) => variation((Math.floor(inst.seed * 0x7fffffff) | 0) + k * 7919);

/** Crown self-occlusion (§50), the same injection V1's canopy material
 * carries: the atlas's per-vertex `crownOcclusion` ramp darkens the base and
 * undersides of every crown and mass lobe by the style's `canopyShade.self`.
 * Lighting still makes the highlights. */
function attachCrownShade(material: THREE.MeshStandardMaterial, style: MeridianStyle): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.golfCrownShade = { value: style.canopyShade.self };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float crownOcclusion;
varying float vCrownOcclusion;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vCrownOcclusion = crownOcclusion;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform float golfCrownShade;
varying float vCrownOcclusion;`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 - golfCrownShade * vCrownOcclusion;`);
  };
  material.customProgramCacheKey = () => `golf-v2-crown-shade-${style.canopyShade.self}`;
  material.userData.selfShade = { basis: 'analytic_height_and_underside', amount: style.canopyShade.self };
}

export type CrownLod = 'near' | 'distant' | 'far';
export type TrunkLod = 'near' | 'distant' | 'hidden';
/** The V2 forest's screen-size LOD thresholds (CSS px of projected crown
 * radius) — V1's rule (`vegetation.lodScreenPx`) retuned for the 2–3× phone
 * the V2 world is built for, and kept here so V1's numbers stay its own:
 * the mid crown's minor lobes and the mass outline's shoulders are
 * 20-triangle icosahedra whose facets read on a phone from about 8 px of
 * radius (hole 7's tee stands most crowns and its mid-hole mass clusters at
 * 9–15 px), so `near` is 8 not 16 and the mass lifts at 8 not 28; the
 * budget, not the threshold, bounds cost, and 240 lets the hero tee view
 * keep every crown it can see in the picture whole — hole 7 phone tee
 * 593 k render triangles, inside V1's established phone loads (master §39). */
export const V2_CROWN_LOD_SCREEN_PX = Object.freeze({ near: 8, distant: 6, nearBudget: 240, mass: 8 });
export interface ForestObjectOptions {
  /** World-XY rectangle the view reads (the hole's tactical bounds): the
   * build's split puts the crowns nearest it in the near LOD and hides
   * trunks beyond twice `nearBandM`; `setDetail` re-judges it per camera. */
  focusBoundsM?: readonly [number, number, number, number];
  /** Near crowns granted, nearest the focus (or largest in the picture) first (`V2_CROWN_LOD_SCREEN_PX.nearBudget`). */
  nearBudget?: number;
  /** Metres from the focus inside which a crown may be near (`vegetation.trunkBandM`). */
  nearBandM?: number;
  /** Projected-radius thresholds for `setDetail` (`V2_CROWN_LOD_SCREEN_PX`). */
  screenPx?: { near: number; distant: number; mass: number };
}
export interface ForestObjectStats {
  crownLod: Record<CrownLod, number>;
  massLod: { near: number; far: number };
  /** What judged the split drawn now: the build's focus bands, or a camera's
   * projected radii once `setDetail` has run with a lens (§37/§68). */
  crownLodBasis: 'focus_bands' | 'screen_px';
}
export interface ForestObjects {
  group: THREE.Group; stats: V2ObjectStats; forestStats: ForestObjectStats;
  /** Re-LOD every crown, trunk and mass lobe for a view — V1's `setDetail`
   * rule (`three-landscape.ts`) with V2's thresholds (`V2_CROWN_LOD_SCREEN_PX`).
   * With a lens: by projected crown radius — the `nearBudget` largest crowns
   * clearing `near` keep the full crown and 7-sided trunk, those clearing
   * `distant` the silhouette and 3-sided trunk, the rest the far card and no
   * trunk; a mass lobe keeps its full cluster while it projects at least
   * `mass`. Without one: by distance from `focusM` in the build's bands.
   * `next === 'distant'` (a tier without near crowns) grants no near LOD at
   * all. Returns whether anything changed. */
  setDetail(next: 'distant' | 'near', focusM?: readonly [number, number], view?: PerspectiveLodView): boolean;
  dispose(): void;
}

function rectDistance(x: number, y: number, r: readonly [number, number, number, number]): number {
  const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]);
  return Math.hypot(dx, dy);
}

interface PlacedCrown { inst: ForestInstance; crownId: number; trunkId: number; assetId: string; lod: CrownLod; trunkLod: TrunkLod }
interface PlacedLobe { inst: ForestInstance; id: number; lod: 'near' | 'far' }

/** Forest edge: crowns in ONE BatchedMesh (every authored variant at all
 * three LODs, each instance pointing at the geometry for its own LOD — V1's
 * canopy structure), trunks in one BatchedMesh (7-sided near, 3-sided
 * distant, hidden under far crowns, §37), shrubs one batched draw and the
 * interior mass one batched draw holding both cluster builds. Families,
 * art, colour, aspect and lean are V1's authored vegetation style
 * (`vegetation.families`, §20/§40), chosen by each instance's seed;
 * positions, radii and heights are the compiler's. The build's LOD split is
 * by focus distance (no camera yet); `setDetail` re-judges it per view. */
export function buildForestEdgeObjects(forest: ForestEdgeV2Result, style: MeridianStyle = MERIDIAN_STYLE, atlas?: TreeAssetAtlas, options: ForestObjectOptions = {}): ForestObjects {
  const group = new THREE.Group(); group.name = 'v2-forest-edge';
  const ownAtlas = atlas ?? createTreeAssetAtlas();
  const vegetation = style.vegetation;
  const nearBudget = options.nearBudget ?? V2_CROWN_LOD_SCREEN_PX.nearBudget;
  const nearBandM = options.nearBandM ?? vegetation.trunkBandM;
  const screenPx = options.screenPx ?? V2_CROWN_LOD_SCREEN_PX;
  const focus = options.focusBoundsM;
  const distanceOf = (inst: ForestInstance) => focus ? rectDistance(inst.x, inst.y, focus) : 0;
  const crownMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  crownMaterial.name = 'v2-canopy'; attachCrownShade(crownMaterial, style);
  const massMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  massMaterial.name = 'v2-forest-mass'; attachCrownShade(massMaterial, style);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: style.palette.treeShadow, roughness: 1, metalness: 0 });
  trunkMaterial.name = 'v2-canopy-trunk';
  const disposables: { dispose(): void }[] = [crownMaterial, massMaterial, trunkMaterial];
  const stats: V2ObjectStats = { draws: { paths: 0, crowns: 0, shrubs: 0, mass: 0, trunks: 0, context: 0 }, triangles: 0, instances: { crown: 0, shrub: 0, mass: 0, trunks: 0 }, pathRuns: 0, structures: 0 };
  const forestStats: ForestObjectStats = { crownLod: { near: 0, distant: 0, far: 0 }, massLod: { near: 0, far: 0 }, crownLodBasis: 'focus_bands' };
  const byKind = { crown: [] as ForestInstance[], shrub: [] as ForestInstance[], mass: [] as ForestInstance[] };
  for (const inst of forest.instances) byKind[inst.kind].push(inst);
  const triangleCount = (geometry: THREE.BufferGeometry) => (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  const assetById = new Map(ownAtlas.variants.map(v => [v.id, v] as const));

  // Focus bands (the build, and any view without a lens): nearest the focus
  // first (ties by id, so the split is deterministic), near within the band
  // up to the budget, distant to twice the band, far beyond.
  const bandLods = (distance: (inst: ForestInstance) => number, next: 'distant' | 'near') => {
    const lods = new Map<ForestInstance, CrownLod>();
    const ranked = [...byKind.crown].sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : 1));
    ranked.forEach((inst, rank) => {
      const d = distance(inst);
      lods.set(inst, next === 'near' && rank < nearBudget && d <= nearBandM ? 'near' : d <= nearBandM * 2 ? 'distant' : 'far');
    });
    return lods;
  };
  const lodOf = bandLods(distanceOf, 'near');

  // §20/§40: family by weight among those allowed where the crown stands
  // (edge families near the woods boundary, interior ones deep inside);
  // art from the family's designs, half of them mirrored (§20.1).
  const families = vegetation.families.filter(f => f.trunkRatio > 0);
  const pickFamily = (inst: ForestInstance) => {
    const atEdge = inst.edgeDistanceM <= vegetation.edgeBandM;
    const allowed = families.filter(f => f.placement === 'any' || (atEdge ? f.placement === 'edge' : f.placement === 'interior'));
    const total = allowed.reduce((sum, f) => sum + f.weight, 0);
    let pick = draw(inst, 1) * total;
    for (const f of allowed) { pick -= f.weight; if (pick <= 0) return f; }
    return allowed[allowed.length - 1]!;
  };
  const transform = new THREE.Matrix4(), translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const tilt = new THREE.Quaternion(), leanAxis = new THREE.Vector3(), up = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  /** Crown and trunk share one yaw and one lean about the ground point (§20). */
  const orient = (inst: ForestInstance, lean: number, leanYaw: number) => {
    rotation.setFromAxisAngle(zAxis, inst.rotationRadians);
    if (lean > 0) {
      leanAxis.set(Math.cos(leanYaw), Math.sin(leanYaw), 0);
      tilt.setFromAxisAngle(leanAxis, lean); rotation.premultiply(tilt);
      up.set(0, 0, 1).applyQuaternion(tilt);
    } else up.set(0, 0, 1);
  };
  const place = (inst: ForestInstance, lift: number, sx: number, sy: number, sz: number) => {
    translation.set(inst.x + up.x * lift, inst.y + up.y * lift, inst.z + up.z * lift);
    scale.set(sx, sy, sz);
    return transform.compose(translation, rotation, scale);
  };

  const placed: PlacedCrown[] = [];
  let crowns: THREE.BatchedMesh | null = null, trunks: THREE.BatchedMesh | null = null;
  let geometryIds: Map<string, Record<CrownLod, number>> | null = null, trunkIds: Record<'near' | 'distant', number> | null = null;
  const trunkTriangles: Record<TrunkLod, number> = { near: 0, distant: 0, hidden: 0 };
  if (byKind.crown.length) {
    const lods: CrownLod[] = ['near', 'distant', 'far'];
    const crownGeometries = ownAtlas.variants.flatMap(v => lods.map(lod => v[lod]));
    crowns = new THREE.BatchedMesh(byKind.crown.length, crownGeometries.reduce((n, g) => n + g.getAttribute('position').count, 0),
      crownGeometries.reduce((n, g) => n + (g.getIndex()?.count ?? 0), 0), crownMaterial);
    crowns.name = 'v2-crowns'; crowns.castShadow = true; crowns.receiveShadow = true; crowns.frustumCulled = true;
    geometryIds = new Map(ownAtlas.variants.map(v => [v.id, { near: crowns!.addGeometry(v.near), distant: crowns!.addGeometry(v.distant), far: crowns!.addGeometry(v.far) }] as const));
    // Trunks sized for every crown: a far crown's trunk is hidden, not
    // absent, so it stands up again when the camera comes near (§37).
    const trunkGeometry = { near: new THREE.CylinderGeometry(.7, 1, 1, 7, 1), distant: new THREE.CylinderGeometry(.7, 1, 1, 3, 1) };
    for (const g of Object.values(trunkGeometry)) { g.rotateX(Math.PI / 2); disposables.push(g); }
    trunks = new THREE.BatchedMesh(byKind.crown.length, trunkGeometry.near.getAttribute('position').count + trunkGeometry.distant.getAttribute('position').count,
      (trunkGeometry.near.getIndex()?.count ?? 0) + (trunkGeometry.distant.getIndex()?.count ?? 0), trunkMaterial);
    trunkIds = { near: trunks.addGeometry(trunkGeometry.near), distant: trunks.addGeometry(trunkGeometry.distant) };
    trunkTriangles.near = triangleCount(trunkGeometry.near); trunkTriangles.distant = triangleCount(trunkGeometry.distant);
    trunks.name = 'v2-trunks'; trunks.castShadow = true; trunks.frustumCulled = true;
    const color = new THREE.Color();
    for (const inst of byKind.crown) {
      const lod = lodOf.get(inst)!, family = pickFamily(inst);
      const design = family.designs[Math.floor(draw(inst, 2) * family.designs.length) % family.designs.length]!;
      const asset = (draw(inst, 3) < .5 ? assetById.get(`${design}-mirror`) : null) ?? assetById.get(design) ?? ownAtlas.variants[0]!;
      const height = inst.heightM, radius = inst.scale, aspect = .84 + draw(inst, 4) * .16;
      // §20: a seeded lean only well inside the woods, never over a fairway edge.
      const lean = inst.edgeDistanceM > vegetation.lean.clearanceM ? vegetation.lean.maxDegrees * Math.PI / 180 * draw(inst, 5) : 0;
      orient(inst, lean, draw(inst, 6) * Math.PI * 2);
      const id = crowns.addInstance(geometryIds.get(asset.id)![lod]);
      crowns.setMatrixAt(id, place(inst, height * .64, radius, radius * aspect, height * .72));
      // §40: family base → light by seed, lifted toward the lit colour at the woods edge.
      const edgeLift = Math.max(0, 1 - inst.edgeDistanceM / vegetation.edgeLightM) * vegetation.edgeLightMix;
      crowns.setColorAt(id, color.set(family.base).lerp(new THREE.Color(family.light), Math.min(1, draw(inst, 7) * .6 + edgeLift)));
      stats.triangles += asset.triangleCounts[lod]; forestStats.crownLod[lod]++;
      const trunkRadius = Math.max(.12, radius * family.trunkRatio), trunkLod: TrunkLod = lod === 'far' ? 'hidden' : lod;
      const trunkId = trunks.addInstance(trunkIds[trunkLod === 'hidden' ? 'distant' : trunkLod]);
      trunks.setMatrixAt(trunkId, place(inst, height * .18, trunkRadius, trunkRadius, height * .36));
      trunks.setVisibleAt(trunkId, trunkLod !== 'hidden');
      stats.triangles += trunkTriangles[trunkLod]; if (trunkLod !== 'hidden') stats.instances.trunks++;
      placed.push({ inst, crownId: id, trunkId, assetId: asset.id, lod, trunkLod });
    }
    crowns.computeBoundingBox(); crowns.computeBoundingSphere();
    trunks.computeBoundingBox(); trunks.computeBoundingSphere();
    group.add(crowns, trunks); disposables.push({ dispose: () => { crowns!.dispose(); trunks!.dispose(); } });
    stats.draws.crowns = 1; stats.instances.crown = byKind.crown.length;
    stats.draws.trunks = stats.instances.trunks > 0 ? 1 : 0;
  }
  // One geometry, many instances, as a BatchedMesh rather than an
  // InstancedMesh: same single draw, but three culls each instance against
  // the frustum (§11 close frame — an InstancedMesh draws every interior
  // mass cluster behind the camera at the green).
  const batched = (items: ForestInstance[], geometries: THREE.BufferGeometry[], material: THREE.Material, name: string) => {
    const mesh = new THREE.BatchedMesh(items.length, geometries.reduce((n, g) => n + g.getAttribute('position').count, 0), geometries.reduce((n, g) => n + (g.getIndex()?.count ?? 0), 0), material);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = true; mesh.perObjectFrustumCulled = true; mesh.sortObjects = false;
    group.add(mesh); disposables.push({ dispose: () => mesh.dispose() });
    return mesh;
  };
  if (byKind.shrub.length) {
    // Understory: the shrub family's low cluster art at its far silhouette,
    // hugging the ground (no trunk), squat and varied in aspect like V1's.
    const shrubFamily = vegetation.families.find(f => f.trunkRatio === 0) ?? vegetation.families[0]!;
    const asset = assetById.get(shrubFamily.designs[0]!) ?? ownAtlas.variants[0]!;
    const base = new THREE.Color(shrubFamily.base), light = new THREE.Color(shrubFamily.light);
    const shrubs = batched(byKind.shrub, [asset.far], crownMaterial, 'v2-shrubs');
    const geometryId = shrubs.addGeometry(asset.far);
    for (const inst of byKind.shrub) {
      const id = shrubs.addInstance(geometryId);
      orient(inst, 0, 0); shrubs.setMatrixAt(id, place(inst, inst.heightM * .45, inst.scale, inst.scale * (.8 + draw(inst, 4) * .3), inst.heightM * .9));
      shrubs.setColorAt(id, base.clone().lerp(light, draw(inst, 7) * .7));
    }
    shrubs.computeBoundingBox(); shrubs.computeBoundingSphere();
    stats.triangles += asset.triangleCounts.far * byKind.shrub.length;
    stats.draws.shrubs = 1; stats.instances.shrub = byKind.shrub.length;
  }
  const lobes: PlacedLobe[] = [];
  let mass: THREE.BatchedMesh | null = null, massIds: Record<'near' | 'far', number> | null = null;
  const massTriangles = { near: 0, far: 0 };
  if (byKind.mass.length) {
    // §39 / redesign §10: the interior as authored five-lobe clusters, the
    // 400-triangle build inside the near band and the 220-triangle build
    // beyond, sunk so no lobe belly shows from the side (V1's placement).
    // Both builds live in the one draw; `setDetail` moves a lobe between them.
    const near = createForestMassGeometry('near'), far = createForestMassGeometry('far'); disposables.push(near, far);
    massTriangles.near = triangleCount(near); massTriangles.far = triangleCount(far);
    mass = batched(byKind.mass, [near, far], massMaterial, 'v2-forest-mass');
    massIds = { near: mass.addGeometry(near), far: mass.addGeometry(far) };
    const massBase = new THREE.Color(vegetation.mass.color), massLight = new THREE.Color(vegetation.mass.light);
    for (const inst of byKind.mass) {
      const lod = distanceOf(inst) <= nearBandM ? 'near' : 'far';
      const id = mass.addInstance(massIds[lod]);
      orient(inst, 0, 0); mass.setMatrixAt(id, place(inst, inst.heightM * .38, inst.scale, inst.scale * (.8 + draw(inst, 4) * .3), inst.heightM * .62));
      mass.setColorAt(id, massBase.clone().lerp(massLight, draw(inst, 7) * .7));
      stats.triangles += massTriangles[lod]; forestStats.massLod[lod]++;
      lobes.push({ inst, id, lod });
    }
    mass.computeBoundingBox(); mass.computeBoundingSphere();
    stats.draws.mass = 1; stats.instances.mass = byKind.mass.length;
  }

  let disposed = false;
  function setDetail(next: 'distant' | 'near', focusM?: readonly [number, number], view?: PerspectiveLodView): boolean {
    if (disposed) return false;
    let changed = false;
    const distance = focusM ? (inst: ForestInstance) => Math.hypot(inst.x - focusM[0], inst.y - focusM[1]) : distanceOf;
    // Perspective (§37/§68, V1's rule): the projected crown radius decides;
    // the near band goes to the `nearBudget` largest crowns clearing the near
    // threshold, so the cost of a view stays bounded whatever the camera does.
    // With a frame, a crown outside the picture projects 0 px and leaves the
    // budget to the trees in view.
    const projected = view ? placed.map(p => projectedCrownPx(view, p.inst.x, p.inst.y, p.inst.z + p.inst.heightM * .64, p.inst.scale)) : null;
    let lodAt: (index: number) => CrownLod;
    if (projected) {
      const nearSet = new Set<number>();
      if (next === 'near') {
        const candidates = projected.map((px, index) => [px, index] as const).filter(([px]) => px >= screenPx.near);
        candidates.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        for (const [, index] of candidates.slice(0, nearBudget)) nearSet.add(index);
      }
      lodAt = index => nearSet.has(index) ? 'near' : projected[index]! >= screenPx.distant ? 'distant' : 'far';
    } else {
      const bands = bandLods(distance, next);
      lodAt = index => bands.get(placed[index]!.inst)!;
    }
    placed.forEach((p, index) => {
      const lod = lodAt(index);
      if (p.lod !== lod) {
        crowns!.setGeometryIdAt(p.crownId, geometryIds!.get(p.assetId)![lod]);
        const counts = assetById.get(p.assetId)!.triangleCounts;
        stats.triangles += counts[lod] - counts[p.lod];
        forestStats.crownLod[p.lod]--; forestStats.crownLod[lod]++;
        p.lod = lod; changed = true;
      }
      const trunkLod: TrunkLod = lod === 'far' ? 'hidden' : lod;
      if (p.trunkLod === trunkLod) return;
      if (trunkLod !== 'hidden') trunks!.setGeometryIdAt(p.trunkId, trunkIds![trunkLod]);
      trunks!.setVisibleAt(p.trunkId, trunkLod !== 'hidden');
      stats.triangles += trunkTriangles[trunkLod] - trunkTriangles[p.trunkLod];
      stats.instances.trunks += (trunkLod === 'hidden' ? 0 : 1) - (p.trunkLod === 'hidden' ? 0 : 1);
      p.trunkLod = trunkLod; changed = true;
    });
    // Forest mass (§39): the full cluster only where a lobe projects at least
    // `screenPx.mass` (perspective) or stands inside the near band
    // (orthographic), and only when the tier grants near detail at all.
    let massChanged = false;
    for (const lobe of lobes) {
      let lod: 'near' | 'far';
      if (view) {
        const px = projectedCrownPx(view, lobe.inst.x, lobe.inst.y, lobe.inst.z + lobe.inst.heightM * .38, lobe.inst.scale);
        lod = next === 'near' && px >= screenPx.mass ? 'near' : 'far';
      } else lod = next === 'near' && distance(lobe.inst) <= nearBandM ? 'near' : 'far';
      if (lobe.lod === lod) continue;
      mass!.setGeometryIdAt(lobe.id, massIds![lod]);
      stats.triangles += massTriangles[lod] - massTriangles[lobe.lod];
      forestStats.massLod[lobe.lod]--; forestStats.massLod[lod]++;
      lobe.lod = lod; massChanged = true;
    }
    forestStats.crownLodBasis = view ? 'screen_px' : 'focus_bands';
    if (massChanged) { mass!.computeBoundingBox(); mass!.computeBoundingSphere(); changed = true; }
    if (changed) {
      crowns?.computeBoundingBox(); crowns?.computeBoundingSphere();
      trunks?.computeBoundingBox(); trunks?.computeBoundingSphere();
      stats.draws.trunks = stats.instances.trunks > 0 ? 1 : 0;
    }
    return changed;
  }
  return { group, stats, forestStats, setDetail, dispose: () => { disposed = true; for (const d of disposables) d.dispose(); if (!atlas) ownAtlas.dispose(); } };
}

/** Everything object-like for one hole in one group; `stats` is what the
 * batching planner should agree with. */
export function buildV2Objects(input: { ribbon: PathRibbon | null; forest: ForestEdgeV2Result | null; scene: HoleScene; mesh?: TerrainMesh | null; focusBoundsM?: readonly [number, number, number, number] }, style: MeridianStyle = MERIDIAN_STYLE): V2Objects {
  const group = new THREE.Group(); group.name = 'v2-objects';
  const disposables: { dispose(): void }[] = [];
  const stats: V2ObjectStats = { draws: { paths: 0, crowns: 0, shrubs: 0, mass: 0, trunks: 0, context: 0 }, triangles: 0, instances: { crown: 0, shrub: 0, mass: 0, trunks: 0 }, pathRuns: 0, structures: 0 };
  let forestStats: ForestObjectStats | null = null;
  let setDetail: ForestObjects['setDetail'] = () => false;
  if (input.mesh) {
    // Structures and lines come from V1's context builder unchanged (R8:
    // footprint extrusions until models are authored); its path ribbons are
    // dropped because the V2 ribbon above already draws every ribbon class.
    const context = buildThreeContext(input.scene, input.mesh);
    // The builder leaves every vertex at ground Z; walls and roofs only rise
    // once the (exaggeration, reference) pass applies their lift. V2 draws
    // source Z, so exaggeration 1 with any reference is the identity.
    context.setExaggeration(1, 0);
    for (const child of [...context.group.children]) if (child.name.startsWith('context-ribbons-')) context.group.remove(child);
    let triangles = 0;
    context.group.traverse(o => { if (o instanceof THREE.Mesh) { const index = o.geometry.index; triangles += index ? index.count / 3 : o.geometry.getAttribute('position').count / 3; } });
    group.add(context.group); disposables.push(context);
    stats.draws.context = context.group.children.length; stats.triangles += triangles; stats.structures = context.counts.structures;
  }
  if (input.ribbon && input.ribbon.indices.length) {
    const paths = buildPathRibbonMesh(input.ribbon, input.scene, style);
    group.add(paths.mesh); disposables.push(paths);
    stats.draws.paths = 1; stats.triangles += paths.triangles; stats.pathRuns = input.ribbon.runs.length;
  }
  if (input.forest && input.forest.instances.length) {
    const forest = buildForestEdgeObjects(input.forest, style, undefined, { focusBoundsM: input.focusBoundsM });
    group.add(forest.group); disposables.push(forest);
    const staticTriangles = stats.triangles;
    stats.draws.crowns = forest.stats.draws.crowns; stats.draws.shrubs = forest.stats.draws.shrubs; stats.draws.mass = forest.stats.draws.mass; stats.draws.trunks = forest.stats.draws.trunks;
    stats.instances = forest.stats.instances; stats.triangles += forest.stats.triangles; forestStats = forest.forestStats;
    setDetail = (next, focusM, view) => {
      if (!forest.setDetail(next, focusM, view)) return false;
      stats.draws.trunks = forest.stats.draws.trunks; stats.triangles = staticTriangles + forest.stats.triangles;
      return true;
    };
  }
  return { group, stats, forestStats, setDetail, dispose: () => { for (const d of disposables) d.dispose(); } };
}
