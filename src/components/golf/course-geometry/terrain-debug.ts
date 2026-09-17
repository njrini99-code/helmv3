import * as THREE from 'three';
import { attachTurfStyle, type ThreeLandscape } from './three-landscape';
import { assembleV2World, buildV2World, type V2WorldInput } from './three-world-v2';
import { buildV2Objects } from './three-world-v2-objects';
import { compileHeroPatches } from '@/lib/golf/course-geometry/bunker-display-mesh';
import { compileBunkerNormalField } from '@/lib/golf/course-geometry/bunker-normal-field';
import { compileBaseDisplayLods, weldAndCleanTerrainMesh, type DisplayLodName } from '@/lib/golf/course-geometry/display-mesh-v2';
import { compileFairwayDirectionField, type FairwayDirectionField } from '@/lib/golf/course-geometry/fairway-direction-field';
import { sampleFieldAtlas } from '@/lib/golf/course-geometry/field-atlas';
import { compileForestEdgeV2, type ForestInstanceKind } from '@/lib/golf/course-geometry/forest-edge-v2';
import { compileHeroRegions } from '@/lib/golf/course-geometry/hero-patches';
import { compilePathRibbon } from '@/lib/golf/course-geometry/path-ribbon';
import { compileStaticShadowField, sampleStaticShadow } from '@/lib/golf/course-geometry/static-shadow-field';
import { SURFACE_DISTANCE_LAYERS } from '@/lib/golf/course-geometry/surface-distance-field';
import { sourceVertexNormals, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { compileSkyField } from '@/lib/golf/course-geometry/terrain-sky-field';
import { metricTerrainNormal, type MetricTerrainGrid } from '@/lib/golf/course-geometry/terrain-source';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { SURFACE_CLASS_IDS } from '@/lib/golf/course-geometry/visual-artifact';

/** Faceting debug kit (Meridian §14). Every view is a diagnostic material or
 * vertex-colour substitution on the same display geometry: source positions
 * are never modified, and none of these views ship to a player route. */
export const TERRAIN_DEBUG_VIEWS = [
  'final',
  'unlit', 'unlit-white', 'albedo', 'vertex-color',
  'wireframe-elevation',
  'normals', 'source-normals', 'display-normals', 'flat-normals', 'slope', 'curvature',
  'lit-no-shadows', 'no-shadow', 'shadows', 'shadow-only',
  'feature-ids', 'triangle-ids', 'material-ids', 'crop', 'context-mask', 'bunker-depth',
  'v2-lod0', 'v2-lod1', 'v2-lod2', 'v2-hero', 'v2-world',
  'v2-atlas-class', 'v2-atlas-curvature', 'v2-sky', 'v2-sky-bent', 'v2-static-shadow', 'v2-bunker-normals', 'v2-path-ribbon', 'v2-forest-edge', 'v2-fairway-direction',
] as const;
export type TerrainDebugView = typeof TERRAIN_DEBUG_VIEWS[number];
export const TERRAIN_DEBUG_LABELS: Record<TerrainDebugView, string> = {
  final: 'Final', unlit: 'Unlit green', 'unlit-white': 'Unlit white', albedo: 'Albedo only (turf style, no light)',
  'vertex-color': 'Vertex colour only', 'wireframe-elevation': 'Wireframe + elevation', normals: 'Display normals',
  'source-normals': 'Source normals', 'display-normals': 'Display normals', 'flat-normals': 'Flat (face) normals',
  slope: 'Slope', curvature: 'Curvature', 'lit-no-shadows': 'Lit, no shadow', 'no-shadow': 'Lit, no shadow',
  shadows: 'Shadow only', 'shadow-only': 'Shadow only', 'feature-ids': 'Feature IDs', 'triangle-ids': 'Triangle IDs',
  'material-ids': 'Material IDs', crop: 'Context mask', 'context-mask': 'Context mask', 'bunker-depth': 'Bunker bowl depth (render-only)',
  'v2-lod0': 'V2 base LOD0 (refined) + wire', 'v2-lod1': 'V2 base LOD1 (welded canonical) + wire', 'v2-lod2': 'V2 base LOD2 (simplified) + wire',
  'v2-hero': 'V2 base LOD0 + green/bunker hero patches (purple wire, bowl shaded)',
  'v2-world': 'V2 ground shader (lit, shadowed, one material)',
  'v2-atlas-class': 'V2 field atlas — nearest tracked surface (green/bunker/fairway/path/water)',
  'v2-atlas-curvature': 'V2 field atlas — landform curvature',
  'v2-sky': 'V2 bent-sky field — open-sky visibility',
  'v2-sky-bent': 'V2 bent-sky field — bent normal (direction of open sky)',
  'v2-static-shadow': 'V2 static shadow field (terrain x canopy, combined)',
  'v2-bunker-normals': 'V2 bunker analytic normal field (hero patches)',
  'v2-path-ribbon': 'V2 cart-path ribbon (edge feather tinted)',
  'v2-forest-edge': 'V2 forest edge instances (crown/shrub/mass, hero gold)',
  'v2-fairway-direction': 'V2 fairway/tee mow-direction field (hue = direction, banding = stripe phase)',
};
const V2_LOD_VIEWS: Partial<Record<TerrainDebugView, DisplayLodName>> = { 'v2-lod0': 'lod0', 'v2-lod1': 'lod1', 'v2-lod2': 'lod2' };
/** Diagnostic surface-class tints for the V2 LOD views (not the Meridian palette). */
const V2_CLASS_COLORS: Partial<Record<typeof SURFACE_CLASS_IDS[number], string>> = {
  ground: '#6B8E5A', rough: '#7FA05C', fairway: '#8FC46A', tee: '#A6D07A', green: '#B9E68A', fringe: '#A3D97A', surround: '#93B96A',
  bunker: '#E3D3A1', water: '#6FA8DC', woods: '#3E6B3F',
};

function hashColor(index: number, color: THREE.Color): THREE.Color {
  let n = Math.imul(index ^ (index >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return color.setHSL(((n >>> 0) % 360) / 360, .7, .55);
}

const MATERIAL_COLORS = ['#3F7A3A', '#D8B45B', '#E6E9F0', '#8E5BB7', '#3A9AD0'];

/** Task 24 (plan Part XX §109; Task 24 checklist): one lib compiler's own
 * field per view, painted (vertex colour, never a material swap on the real
 * ground shader) over the same base LOD0 + hero patches `assembleV2World`/
 * `buildV2World` compile for `v2-world` above — so a field can be inspected
 * even where `ground-shader-v2.ts` does not (yet) sample it, and without
 * touching that file or three-world-v2.ts while another agent edits both. */
const V2_FIELD_VIEWS = new Set<TerrainDebugView>(['v2-atlas-class', 'v2-atlas-curvature', 'v2-sky', 'v2-sky-bent', 'v2-static-shadow', 'v2-bunker-normals', 'v2-path-ribbon', 'v2-forest-edge', 'v2-fairway-direction']);
/** A point neither `sampleGridField` nor `sampleStaticShadow`/`sampleFieldAtlas`
 * can answer (past the source grid or atlas bounds) — the same "flag it, do
 * not guess" convention as `source-normals`' `#FF00AA` below, so a hole
 * literally has no such point painted, missing data does not read as a real
 * (and plausible-looking) field value. */
const V2_FIELD_NO_DATA_COLOR = '#FF00AA';
/** Diagnostic palette for the field atlas's own semantic classes (§108 R
 * channel: none, then `SURFACE_DISTANCE_LAYERS` order) — saturated and
 * distinct from `V2_CLASS_COLORS` (the real ground palette) so nobody
 * mistakes a raw atlas texel boundary for the shaded material boundary. */
/** One entry per `['none', ...SURFACE_DISTANCE_LAYERS]` (none, green, bunker, fairway, path, water, tee). */
const ATLAS_CLASS_COLORS: readonly string[] = ['#5B6B57', '#3DDC5A', '#E0A93D', '#B8E23D', '#8A5A2B', '#3D9BE0', '#E86FB5'];
const FOREST_KIND_COLORS: Record<ForestInstanceKind, string> = { crown: '#2F6B3A', shrub: '#8FA23E', mass: '#1F4A29' };
const FOREST_HERO_COLOR = '#D4A017';

/** Bilinear sample of a grid-shaped field aligned with `grid` (the layout
 * terrain-curvature.ts/terrain-sky-field.ts arrays share): field-atlas.ts
 * keeps an identical helper private, reproduced here rather than exported
 * from a module this task does not own. `null` past the grid's own extent.
 * `stride`/`offset` read one component of an interleaved multi-component
 * field (e.g. `SkyField.bentXY`'s x, y pairs) in place without a copy;
 * both default to a plain single-component field. */
function sampleGridField(grid: MetricTerrainGrid, field: Float32Array, x: number, y: number, stride = 1, offset = 0): number | null {
  const gx = (x - grid.originM[0]) / grid.spacingM, gy = (y - grid.originM[1]) / grid.spacingM;
  if (gx < 0 || gy < 0 || gx > grid.columns - 1 || gy > grid.rows - 1) return null;
  const ix = Math.min(Math.floor(gx), grid.columns - 2), iy = Math.min(Math.floor(gy), grid.rows - 2);
  const fx = gx - ix, fy = gy - iy, i = (iy * grid.columns + ix) * stride + offset, row = grid.columns * stride;
  const a = field[i]!, b = field[i + stride]!, c = field[i + row]!, d = field[i + row + stride]!;
  return (1 - fx) * ((1 - fy) * a + fy * c) + fx * ((1 - fy) * b + fy * d);
}
/** Nearest-node sample of `compileFairwayDirectionField`'s own layout — its
 * angle/phase channels are wrapped quantities (mod π, mod 1) that must never
 * be bilinearly interpolated (that module's own file header), so this
 * mirrors its `fairwayGrainAt`'s NEAREST lookup instead of `sampleGridField`'s
 * bilinear one. `null` only past the field's own grid extent ("nothing
 * invented"); an in-extent but inactive node is a real value (outside this
 * hole's own fairway/tee), not missing data, and comes back `active: 0`. */
function sampleFairwayNode(field: FairwayDirectionField, x: number, y: number): { active: number; directionAngle: number; stripePhase: number } | null {
  const gx = (x - field.originM[0]) / field.spacingM, gy = (y - field.originM[1]) / field.spacingM;
  if (gx < 0 || gy < 0 || gx > field.columns - 1 || gy > field.rows - 1) return null;
  const column = Math.round(gx), row = Math.round(gy), i = row * field.columns + column;
  return { active: field.active[i]!, directionAngle: field.directionAngle[i]!, stripePhase: field.stripePhase[i]! };
}

interface PaintedField { object: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material }
/** One flat-shaded diagnostic mesh over `positions`/`indices` (a packed
 * display mesh, hero patch or ribbon — all three share this shape), vertex
 * tinted by `colorAt(x, y, z, vertex, color)`. The shared geometry builder
 * every Task 24 field view below uses instead of hand-rolling its own. */
function paintField(positions: Float32Array, indices: Uint32Array, colorAt: (x: number, y: number, z: number, vertex: number, color: THREE.Color) => void): PaintedField {
  const vertexCount = positions.length / 3;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const colors = new Float32Array(vertexCount * 3), color = new THREE.Color();
  for (let v = 0; v < vertexCount; v++) {
    colorAt(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!, v, color);
    colors.set([color.r, color.g, color.b], v * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  return { object: new THREE.Mesh(geometry, material), geometry, material };
}
/** `paintField` over the whole V2 world `assembleV2World` compiled — the
 * base LOD0 plus every hero patch, same `colorAt` for both, since a field is
 * defined over the whole ground and a patch replaces its footprint of the
 * base entirely (§107, and the progress ledger's Task 10/11 note: a patch
 * carries no surface class of its own, so a ground-level field must cover
 * it the same way the base does). */
function paintV2World(input: V2WorldInput, colorAt: (x: number, y: number, z: number, vertex: number, color: THREE.Color) => void): PaintedField[] {
  return [paintField(input.base.positions, input.base.indices, colorAt), ...input.patches.map(compiled => paintField(compiled.patch.positions, compiled.patch.indices, colorAt))];
}
/** Flattens painted fields into what `installV2FieldView` wants: the meshes
 * to add, and every geometry/material to dispose on cleanup. */
function flattenPainted(fields: readonly PaintedField[]): { objects: THREE.Mesh[]; disposables: { dispose(): void }[] } {
  return { objects: fields.map(f => f.object), disposables: fields.flatMap(f => [f.geometry, f.material]) };
}
/** Common install/cleanup for a Task 24 field view: hides the real terrain,
 * adds every object to the landscape group, records `info` on the same
 * `debugV2` slot the LOD/hero/world views above use, and returns the paired
 * disposer — the "same install/cleanup pattern as the existing v2-* views",
 * factored out once since every field view below repeats it identically.
 * `disposables` is duck-typed (`{ dispose(): void }`) so a `BufferGeometry`,
 * a `Material` and an `InstancedMesh` (forest-edge's markers) all fit one list. */
function installV2FieldView(landscape: ThreeLandscape, objects: readonly THREE.Object3D[], disposables: readonly { dispose(): void }[], info: Record<string, unknown>): () => void {
  landscape.terrain.visible = false;
  landscape.group.add(...objects);
  landscape.terrain.userData.debugV2 = info;
  return () => {
    landscape.group.remove(...objects);
    landscape.terrain.visible = true;
    for (const disposable of disposables) disposable.dispose();
  };
}

/** Diagnostic-only material substitution. Source positions are never modified.
 * AO/skirt passes do not exist in this renderer; the crop view exposes context. */
export function installTerrainDebugView(world: THREE.Scene, landscape: ThreeLandscape, mesh: TerrainMesh,
  mode: TerrainDebugView, renderer: THREE.WebGLRenderer, scene?: HoleScene): () => void {
  if (mode === 'final') return () => {};
  const owned: THREE.Material[] = [];
  const override = (material: THREE.Material) => { owned.push(material); world.overrideMaterial = material; };
  const shadowMode = mode === 'shadows' || mode === 'shadow-only';
  if (!shadowMode) for (const child of landscape.group.children) if (child !== landscape.terrain) child.visible = false;
  renderer.shadowMap.enabled = shadowMode;
  const v2Lod = V2_LOD_VIEWS[mode] ?? (mode === 'v2-hero' ? 'lod0' : undefined);
  if (v2Lod) {
    // V2 plan Task 5b: the base display LOD compiled now from the same
    // canonical mesh, tinted by surface class with its wire on top, in place
    // of the V1 terrain. Source Z, no relief exaggeration, diagnostic only.
    // Tasks 7–8 (`v2-hero`): the hero regions are planned too, the base is
    // drawn with every patched footprint excluded, and the compiled patches
    // (green complexes, bunkers) are drawn in their place with a purple wire.
    const hero = mode === 'v2-hero' && scene ? (() => {
      const base = weldAndCleanTerrainMesh(mesh), plan = compileHeroRegions(scene, mesh, base);
      return { plan, patches: compileHeroPatches(scene, mesh, base, plan) };
    })() : null;
    const compiled = compileBaseDisplayLods(mesh, hero ? { heroPlan: { triangleRegion: hero.plan.triangleRegion, regionIds: hero.plan.regionIds } } : {}), packed = compiled[v2Lod];
    const lodGeometry = new THREE.BufferGeometry();
    lodGeometry.setAttribute('position', new THREE.BufferAttribute(packed.positions, 3));
    lodGeometry.setIndex(new THREE.BufferAttribute(packed.indices, 1));
    const patched = new Set(hero?.patches.map(c => c.patch.id));
    if (hero && packed.heroRanges?.length) {
      // Index groups: everything before the first region, then each run of a
      // region that has no patch yet (bunkers, water, paths await Tasks 8–14).
      lodGeometry.addGroup(0, packed.heroRanges[0]!.start * 3, 0);
      for (const range of packed.heroRanges) if (!patched.has(range.id)) lodGeometry.addGroup(range.start * 3, range.count * 3, 0);
    }
    const tints = new Float32Array(packed.vertexCount * 3), tint = new THREE.Color();
    for (let v = 0; v < packed.vertexCount; v++) {
      tint.set(V2_CLASS_COLORS[SURFACE_CLASS_IDS[packed.surfaceClass[v]!]!] ?? '#9AA39A');
      tints.set([tint.r, tint.g, tint.b], v * 3);
    }
    lodGeometry.setAttribute('color', new THREE.BufferAttribute(tints, 3));
    const fill = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const wireMaterial = new THREE.MeshBasicMaterial({ color: '#1B2A1E', wireframe: true, transparent: true, opacity: .6 });
    owned.push(fill, wireMaterial);
    const surface = new THREE.Mesh(lodGeometry, hero ? [fill] : fill), wire = new THREE.Mesh(lodGeometry, hero ? [wireMaterial] : wireMaterial);
    wire.renderOrder = 1;
    const patchMeshes: THREE.Mesh[] = [], patchGeometries: THREE.BufferGeometry[] = [];
    if (hero) {
      const patchFill = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const patchWire = new THREE.MeshBasicMaterial({ color: '#5B2E91', wireframe: true, transparent: true, opacity: .75 });
      owned.push(patchFill, patchWire);
      for (const { patch, triangleClass } of hero.patches) {
        // Flat per-triangle class tint, darkened by the render-only bowl
        // depth and lightened by the lip, so the patch is de-indexed here
        // (diagnostic copy; the packed patch is indexed).
        const count = patch.indices.length, flat = new Float32Array(count * 3), flatTint = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const vertex = patch.indices[i]!;
          flat.set(patch.positions.subarray(vertex * 3, vertex * 3 + 3), i * 3);
          const offset = patch.visualOffsetMm[vertex]! / 1000;
          tint.set(V2_CLASS_COLORS[SURFACE_CLASS_IDS[triangleClass[Math.floor(i / 3)]!]!] ?? '#9AA39A').offsetHSL(0, 0, .12 + Math.max(-.35, Math.min(.2, offset * .6)));
          flatTint.set([tint.r, tint.g, tint.b], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(flatTint, 3));
        const patchSurface = new THREE.Mesh(geometry, patchFill), patchWireMesh = new THREE.Mesh(geometry, patchWire);
        patchWireMesh.renderOrder = 2;
        patchGeometries.push(geometry); patchMeshes.push(patchSurface, patchWireMesh);
      }
    }
    landscape.terrain.visible = false; landscape.group.add(surface, wire, ...patchMeshes);
    const { lods, weld, pass } = compiled.report;
    landscape.terrain.userData.debugV2 = { lod: v2Lod, triangles: packed.triangleCount, vertices: packed.vertexCount, withinBudget: lods[v2Lod].withinBudget,
      sliverTriangles: weld.sliverTriangles, needles: weld.needles, gates: pass ? 'pass' : 'fail',
      ...(hero ? { heroRegions: hero.plan.regions.length, patches: hero.patches.map(c => ({ id: c.patch.id, triangles: c.report.triangles, vertices: c.report.vertices, greenSpacingM: c.report.greenSpacingM, seamHeightMaxM: c.report.seamHeightMaxM, pass: c.report.topology.pass })) } : {}) };
    return () => {
      landscape.group.remove(surface, wire, ...patchMeshes);
      landscape.terrain.visible = true;
      lodGeometry.dispose();
      for (const geometry of patchGeometries) geometry.dispose();
      for (const material of owned) material.dispose();
    };
  }
  if (mode === 'v2-world') {
    // Task 11: the actual V2 render world — one ground material, lit and
    // shadowed like `final`, in place of the whole V1 terrain. R7 fallback:
    // no scene, no metricGrid, or any compiler step throwing leaves the V1
    // terrain visible and this view a no-op, exactly like a real V1/V2
    // runtime switch would.
    // Tasks 14/15/18: the V2 objects (one path-ribbon draw, batched crowns,
    // instanced shrubs/mass/trunks) replace V1's canopy while the view is on;
    // the forest compiles first so the ground's static shadow bake (Task 16)
    // shadows exactly the crowns drawn.
    // Master plan Task 20: the whole synchronous compile (forest, assembly,
    // ground, objects) is the first-frame hitch a phone pays at mount; it is
    // reported as `buildMs` (canvas `data-v2-build-ms`) so a capture can
    // record it per hole instead of guessing from the ready latency.
    const started = performance.now();
    const forest = scene ? compileForestEdgeV2(scene, mesh) : null;
    const input = scene ? assembleV2World(scene, mesh, { forest }) : null;
    if (!input) return () => {};
    const built = buildV2World(input);
    const base = weldAndCleanTerrainMesh(mesh);
    const objects = buildV2Objects({ ribbon: compilePathRibbon(scene!, mesh, base), forest, scene: scene!, mesh, focusBoundsM: mesh.renderProfile?.tacticalBoundsM });
    const v1Canopy = landscape.group.children.filter(child => child.name.startsWith('source-canopy') || child.name === 'source-forest-mass');
    for (const child of v1Canopy) child.visible = false;
    landscape.terrain.visible = false;
    landscape.group.add(built.group, objects.group);
    const objectDraws = Object.values(objects.stats.draws).reduce((sum, n) => sum + n, 0);
    landscape.terrain.userData.debugV2 = { view: 'world', draws: built.stats.draws + objectDraws, triangles: built.stats.triangles + objects.stats.triangles, patches: built.stats.patches, objects: objects.stats, forest: objects.forestStats, buildMs: Math.round(performance.now() - started) };
    return () => {
      landscape.group.remove(built.group, objects.group);
      for (const child of v1Canopy) child.visible = true;
      landscape.terrain.visible = true;
      built.dispose(); objects.dispose();
    };
  }
  if (V2_FIELD_VIEWS.has(mode)) {
    // Task 24: every view below reads one lib compiler's own output over the
    // same `assembleV2World` bundle `v2-world` renders (never touching
    // ground-shader-v2.ts / three-world-v2.ts, edited concurrently). R7-style
    // fallback: no scene, no metricGrid, or the V2 pipeline throwing leaves
    // the V1 terrain visible and the view a no-op, exactly like `v2-world`.
    if (!scene) return () => {};
    const input = assembleV2World(scene, mesh);
    if (!input) return () => {};
    switch (mode) {
      case 'v2-atlas-class': {
        const atlas = input.atlas;
        if (!atlas) return () => {}; // no field atlas compiled for this hole (three-world-v2.ts's own fallback)
        let noData = 0;
        const colorAt = (x: number, y: number, _z: number, _vertex: number, color: THREE.Color) => {
          // §108 R channel is a category id (0 none, else 1 + SURFACE_DISTANCE_LAYERS
          // index), bilinear-sampled like every other atlas channel — rounded only
          // for the colour index, so a class boundary blends between the two
          // neighbouring texels' colours instead of one hard edge, showing the
          // atlas's own texel resolution honestly rather than hiding it.
          const raw = sampleFieldAtlas(atlas, 'surfaceClass', x, y);
          if (raw == null) { noData++; color.set(V2_FIELD_NO_DATA_COLOR); return; }
          color.set(ATLAS_CLASS_COLORS[Math.max(0, Math.min(ATLAS_CLASS_COLORS.length - 1, Math.round(raw)))]!);
        };
        const { objects, disposables } = flattenPainted(paintV2World(input, colorAt));
        return installV2FieldView(landscape, objects, disposables, { view: 'atlas-class', classes: ['none', ...SURFACE_DISTANCE_LAYERS], atlasSize: [atlas.width, atlas.height], noData });
      }
      case 'v2-atlas-curvature': {
        const atlas = input.atlas;
        if (!atlas) return () => {};
        let noData = 0;
        const colorAt = (x: number, y: number, _z: number, _vertex: number, color: THREE.Color) => {
          // Same diverging scheme as the base 'curvature' view below: concave blue, convex red.
          const raw = sampleFieldAtlas(atlas, 'curvature', x, y);
          if (raw == null) { noData++; color.set(V2_FIELD_NO_DATA_COLOR); return; }
          const t = Math.max(-1, Math.min(1, raw));
          color.setRGB(.5 + .5 * Math.max(0, t), .5 - .5 * Math.abs(t) * .6, .5 + .5 * Math.max(0, -t));
        };
        const { objects, disposables } = flattenPainted(paintV2World(input, colorAt));
        return installV2FieldView(landscape, objects, disposables, { view: 'atlas-curvature', noData });
      }
      case 'v2-sky': {
        const grid = mesh.metricGrid!; // assembleV2World already required one to return non-null
        const sky = compileSkyField(grid);
        let noData = 0;
        const colorAt = (x: number, y: number, _z: number, _vertex: number, color: THREE.Color) => {
          const visibility = sampleGridField(grid, sky.visibility, x, y);
          if (visibility == null) { noData++; color.set(V2_FIELD_NO_DATA_COLOR); return; }
          color.setHSL(.58, .55, .1 + .8 * Math.max(0, Math.min(1, visibility))); // dark enclosed blue -> pale open sky
        };
        const { objects, disposables } = flattenPainted(paintV2World(input, colorAt));
        return installV2FieldView(landscape, objects, disposables, { view: 'sky', options: sky.options, noData });
      }
      case 'v2-sky-bent': {
        // Sec.109: "Bent Normal" is its own required view, distinct from
        // "Sky Visibility" above — same field, its other channel.
        const grid = mesh.metricGrid!; // assembleV2World already required one to return non-null
        const sky = compileSkyField(grid);
        let noData = 0;
        const colorAt = (x: number, y: number, _z: number, _vertex: number, color: THREE.Color) => {
          const bx = sampleGridField(grid, sky.bentXY, x, y, 2, 0), by = sampleGridField(grid, sky.bentXY, x, y, 2, 1);
          if (bx == null || by == null) { noData++; color.set(V2_FIELD_NO_DATA_COLOR); return; }
          // Bilinear interpolation of the two stored components can push
          // x²+y² slightly past 1 near a sharp change in bent direction;
          // renormalize before reconstructing z (file header: unit bent
          // normal, z = sqrt(1 − x² − y²); 0, 0 straight up).
          let nx = bx, ny = by;
          const len2 = nx * nx + ny * ny;
          if (len2 > 1) { const inv = 1 / Math.sqrt(len2); nx *= inv; ny *= inv; }
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          // Same n·.5+.5 encoding as 'normals'/'source-normals'/'v2-bunker-normals'.
          color.setRGB(nx * .5 + .5, ny * .5 + .5, nz * .5 + .5);
        };
        const { objects, disposables } = flattenPainted(paintV2World(input, colorAt));
        return installV2FieldView(landscape, objects, disposables, { view: 'sky-bent', options: sky.options, noData });
      }
      case 'v2-static-shadow': {
        const shadow = compileStaticShadowField(mesh, scene);
        let noData = 0;
        const colorAt = (x: number, y: number, _z: number, _vertex: number, color: THREE.Color) => {
          const lit = sampleStaticShadow(shadow, x, y, 'combined');
          if (lit == null) { noData++; color.set(V2_FIELD_NO_DATA_COLOR); return; }
          const v = .08 + .92 * lit; // 0 shadowed (near-black) -> 1 lit (white)
          color.setRGB(v, v, v);
        };
        const { objects, disposables } = flattenPainted(paintV2World(input, colorAt));
        return installV2FieldView(landscape, objects, disposables, { view: 'static-shadow', shadowedShare: shadow.stats.shadowedShare, canopyShare: shadow.stats.canopyShare, noData });
      }
      case 'v2-bunker-normals': {
        const neutral = new THREE.Color('#4B5A46');
        const base = paintField(input.base.positions, input.base.indices, (_x, _y, _z, _vertex, color) => color.copy(neutral));
        const patches = input.patches.map(compiled => {
          const field = compileBunkerNormalField(compiled, mesh);
          // Same n·.5+.5 encoding as the 'normals'/'source-normals' views below.
          return paintField(compiled.patch.positions, compiled.patch.indices, (_x, _y, _z, vertex, color) =>
            color.setRGB(field.normals[vertex * 3]! * .5 + .5, field.normals[vertex * 3 + 1]! * .5 + .5, field.normals[vertex * 3 + 2]! * .5 + .5));
        });
        const { objects, disposables } = flattenPainted([base, ...patches]);
        return installV2FieldView(landscape, objects, disposables, { view: 'bunker-normals', patches: input.patches.length, bunkerPatches: input.patches.filter(c => c.profiles.length > 0).length });
      }
      case 'v2-path-ribbon': {
        const ribbon = compilePathRibbon(scene, mesh, weldAndCleanTerrainMesh(mesh));
        if (!ribbon) return () => {}; // hole carries no mobility zones (no context layer, or none near it)
        const neutral = new THREE.Color('#5C6B57'), pathColor = new THREE.Color('#3A322B'), mix = new THREE.Color();
        const context = paintV2World(input, (_x, _y, _z, _vertex, color) => color.copy(neutral));
        const ribbonField = paintField(ribbon.positions, ribbon.indices, (_x, _y, _z, vertex, color) => color.copy(mix.copy(pathColor).lerp(neutral, ribbon.edge[vertex]!)));
        ribbonField.object.renderOrder = 1;
        const { objects, disposables } = flattenPainted([...context, ribbonField]);
        return installV2FieldView(landscape, objects, disposables,
          { view: 'path-ribbon', triangles: ribbon.triangleCount, runs: ribbon.runs.length, droppedTriangles: ribbon.droppedTriangles, surfaceFallbacks: ribbon.surfaceFallbacks });
      }
      case 'v2-forest-edge': {
        const forest = compileForestEdgeV2(scene, mesh);
        const neutral = new THREE.Color('#5C6B57');
        const { objects, disposables } = flattenPainted(paintV2World(input, (_x, _y, _z, _vertex, color) => color.copy(neutral)));
        // Instances are pure placement data (forest-edge-v2.ts is three-free),
        // drawn here as one InstancedMesh per kind — a stand-in marker, not the
        // authored crown/shrub/mass geometry a later task will instance instead.
        const markerGeometry = new THREE.SphereGeometry(1, 6, 4), markerMaterials: THREE.Material[] = [], markers: THREE.InstancedMesh[] = [];
        const matrix = new THREE.Matrix4(), instanceColor = new THREE.Color();
        for (const kind of ['mass', 'crown', 'shrub'] as const) {
          const instances = forest.instances.filter(instance => instance.kind === kind);
          if (!instances.length) continue;
          const material = new THREE.MeshBasicMaterial({ vertexColors: true });
          markerMaterials.push(material);
          const batch = new THREE.InstancedMesh(markerGeometry, material, instances.length);
          instances.forEach((instance, i) => {
            const halfHeight = Math.max(.2, instance.heightM / 2);
            matrix.makeScale(instance.scale, instance.scale, halfHeight);
            matrix.setPosition(instance.x, instance.y, instance.z + halfHeight);
            batch.setMatrixAt(i, matrix);
            batch.setColorAt(i, instanceColor.set(instance.hero ? FOREST_HERO_COLOR : FOREST_KIND_COLORS[kind]));
          });
          batch.instanceMatrix.needsUpdate = true;
          if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
          markers.push(batch);
        }
        const allObjects: THREE.Object3D[] = [...objects, ...markers];
        const allDisposables: { dispose(): void }[] = [...disposables, markerGeometry, ...markerMaterials, ...markers];
        return installV2FieldView(landscape, allObjects, allDisposables, { view: 'forest-edge', instances: forest.instances.length, hero: forest.budget.hero.used });
      }
      case 'v2-fairway-direction': {
        // Task 12's field: metricGrid is guaranteed present here (assembleV2World
        // returned non-null above), so this cannot throw for the one reason it does.
        const field = compileFairwayDirectionField(mesh, scene);
        let noData = 0;
        const colorAt = (x: number, y: number, _z: number, _vertex: number, color: THREE.Color) => {
          const node = sampleFairwayNode(field, x, y);
          if (!node) { noData++; color.set(V2_FIELD_NO_DATA_COLOR); return; }
          if (!node.active) { color.set('#2E332C'); return; } // outside this hole's own fairway/tee — a real value, not missing data
          // mod-π line (not a ray): directionAngle is already quantized over
          // [0, π) (fairway-direction-field.ts), one full hue turn, so 0 and
          // 255 (angle 0 and π — the same undirected line) both land on
          // HSL's own red-to-red wrap (hue 0 ≡ hue 1) and read as one colour.
          const hue = node.directionAngle / 255;
          const phase = node.stripePhase / 255;
          // Stripe banding exaggerated far past the real ~1–3% render amplitude (file header) — a diagnostic, not the shaded material.
          color.setHSL(hue, .75, .35 + .3 * Math.sin(2 * Math.PI * phase));
        };
        const { objects, disposables } = flattenPainted(paintV2World(input, colorAt));
        return installV2FieldView(landscape, objects, disposables, { view: 'fairway-direction', activeShare: field.stats.activeShare, periodWM: field.periodWM, noData });
      }
      default: return () => {};
    }
  }
  const geometry = landscape.terrain.geometry;
  const positions = geometry.getAttribute('position');
  const originalColor = geometry.getAttribute('color');
  const colors = new Float32Array(mesh.vertices.length);
  const zs = mesh.vertices.filter((_, i) => i % 3 === 2), low = Math.min(...zs), high = Math.max(...zs);
  const paintTriangles = (paint: (triangle: number, color: THREE.Color) => void) => {
    const color = new THREE.Color();
    for (let i = 0; i < mesh.triangleFeatures.length; i++) {
      paint(i, color);
      for (let c = 0; c < 3; c++) colors.set([color.r, color.g, color.b], i * 9 + c * 3);
    }
  };
  const paintVertices = (paint: (vertex: number, color: THREE.Color) => void) => {
    const color = new THREE.Color();
    for (let v = 0; v < positions.count; v++) { paint(v, color); colors.set([color.r, color.g, color.b], v * 3); }
  };
  const applyVertexColors = () => {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    override(new THREE.MeshBasicMaterial({ vertexColors: true }));
  };
  switch (mode) {
    case 'unlit': override(new THREE.MeshBasicMaterial({ color: '#9BBB61' })); break;
    case 'unlit-white': override(new THREE.MeshBasicMaterial({ color: '#FFFFFF' })); break;
    case 'vertex-color': override(new THREE.MeshBasicMaterial({ vertexColors: true })); break;
    case 'albedo': {
      // The production colour pipeline without lighting: vertex albedo plus
      // the mowing/turf style, exactly as the lit material composes it.
      const material = new THREE.MeshBasicMaterial({ vertexColors: true });
      attachTurfStyle(material, landscape.artifact.seed);
      override(material);
      break;
    }
    case 'normals': case 'display-normals': override(new THREE.MeshNormalMaterial()); break;
    case 'flat-normals': override(new THREE.MeshNormalMaterial({ flatShading: true })); break;
    case 'source-normals': {
      // Landscape construction rewinds clockwise triangles; match that order.
      const source = sourceVertexNormals(mesh);
      paintTriangles((_, color) => color.set('#FF00AA'));
      if (source) for (let t = 0; t < mesh.triangleFeatures.length; t++) {
        const offset = t * 9, v = mesh.vertices;
        const winding = (v[offset + 3]! - v[offset]!) * (v[offset + 7]! - v[offset + 1]!) - (v[offset + 6]! - v[offset]!) * (v[offset + 4]! - v[offset + 1]!);
        const order = winding < 0 ? [0, 2, 1] : [0, 1, 2];
        for (let corner = 0; corner < 3; corner++) {
          const from = offset + order[corner]! * 3, to = offset + corner * 3;
          colors.set([source[from]! * .5 + .5, source[from + 1]! * .5 + .5, source[from + 2]! * .5 + .5], to);
        }
      }
      landscape.terrain.userData.debugSourceNormals = mesh.sourceNormals ? 'source' : source ? 'metric_grid' : 'missing';
      applyVertexColors();
      break;
    }
    case 'slope': {
      // Slope angle of the display normal: green (flat) → yellow (10°) → red (25°+).
      const normals = geometry.getAttribute('normal');
      paintVertices((vertex, color) => {
        const degrees = Math.acos(Math.max(-1, Math.min(1, normals.getZ(vertex)))) * 180 / Math.PI;
        color.setHSL(Math.max(0, .33 - .33 * Math.min(1, degrees / 25)), .85, .5);
      });
      applyVertexColors();
      break;
    }
    case 'curvature': {
      // Signed Laplacian of the source grid at each vertex (concave blue,
      // convex red); without a grid, the angle between the vertex's display
      // normal and its face normal (magnitude only, grey → orange).
      const grid = mesh.metricGrid;
      if (grid) paintVertices((vertex, color) => {
        const x = positions.getX(vertex), y = positions.getY(vertex), s = grid.spacingM;
        const n = metricTerrainNormal(grid, [x, y]);
        const left = metricTerrainNormal(grid, [x - s, y]), right = metricTerrainNormal(grid, [x + s, y]);
        const down = metricTerrainNormal(grid, [x, y - s]), up = metricTerrainNormal(grid, [x, y + s]);
        if (!n || !left || !right || !down || !up) { color.set('#444444'); return; }
        const divergence = (right[0] - left[0]) / (2 * s) + (up[1] - down[1]) / (2 * s);
        const t = Math.max(-1, Math.min(1, divergence * 40));
        color.setRGB(.5 + .5 * Math.max(0, t), .5 - .5 * Math.abs(t) * .6, .5 + .5 * Math.max(0, -t));
      });
      else {
        const normals = geometry.getAttribute('normal');
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), n = new THREE.Vector3();
        paintVertices((vertex, color) => {
          const first = vertex - vertex % 3;
          a.fromBufferAttribute(positions, first); b.fromBufferAttribute(positions, first + 1); c.fromBufferAttribute(positions, first + 2);
          face.copy(b).sub(a).cross(c.sub(a)).normalize();
          n.fromBufferAttribute(normals, vertex);
          const degrees = Math.acos(Math.max(-1, Math.min(1, Math.abs(face.dot(n))))) * 180 / Math.PI;
          color.setHSL(.08, Math.min(1, degrees / 8), .35 + .3 * Math.min(1, degrees / 8));
        });
      }
      applyVertexColors();
      break;
    }
    case 'lit-no-shadows': case 'no-shadow': override(new THREE.MeshStandardMaterial({ color: '#9BBB61', roughness: 1 })); break;
    case 'shadows': case 'shadow-only': override(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })); break;
    case 'feature-ids':
      paintTriangles((t, color) => color.setHSL((mesh.triangleFeatures[t]! * .173 + mesh.triangleMaterials[t]! * .07) % 1, .75, .55));
      applyVertexColors();
      break;
    case 'triangle-ids': paintTriangles((t, color) => hashColor(t + 1, color)); applyVertexColors(); break;
    case 'material-ids': paintTriangles((t, color) => color.set(MATERIAL_COLORS[mesh.triangleMaterials[t]!] ?? '#000000')); applyVertexColors(); break;
    case 'crop': case 'context-mask':
      paintTriangles((t, color) => color.set(mesh.featureKinds[mesh.triangleFeatures[t]!] === 'ground' ? '#DF2CAB' : '#DBE2DA'));
      applyVertexColors();
      break;
    case 'bunker-depth': {
      // Render-only bowl depth: sand (0) → deep umber (1 m); turf grey.
      const depth = geometry.getAttribute('golfBunkerDepth');
      paintVertices((vertex, color) => {
        const d = depth ? depth.getX(vertex) : 0;
        if (d <= 0) color.set('#6E7A66'); else color.setHSL(.09, .6, .78 - .55 * Math.min(1, d));
      });
      applyVertexColors();
      break;
    }
    case 'wireframe-elevation': {
      paintVertices((vertex, color) => color.setHSL(.68 - .6 * (positions.getZ(vertex) - low) / Math.max(.001, high - low), .7, .5));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const colorMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
      const wireMaterial = new THREE.MeshBasicMaterial({ color: '#243A27', wireframe: true });
      owned.push(colorMaterial, wireMaterial);
      // One extra diagnostic-only wire draw using the same geometry.
      const surface = new THREE.Mesh(geometry, colorMaterial);
      const wire = new THREE.Mesh(geometry, wireMaterial);
      landscape.terrain.visible = false; landscape.group.add(surface, wire);
      break;
    }
  }
  return () => {
    world.overrideMaterial = null;
    if (originalColor) geometry.setAttribute('color', originalColor);
    for (const material of owned) material.dispose();
  };
}
