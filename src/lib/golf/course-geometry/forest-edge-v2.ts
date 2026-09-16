/** Meridian V2 forest edge (V2 plan §59–68, §121 "STRATEGIC FOREST EDGE";
 * Task 15). Pure data: which crowns, understory shrubs and interior mass
 * lobes stand where, and where each woods boundary runs, so a renderer
 * (three-world-v2.ts) can instance authored geometry without repeating any
 * of this placement or classification logic.
 *
 * Inputs are canonical woods features (`scene.features` / `contextFeatures`,
 * kind `woods`, `reviewed`) and the outside-world context layer's woodland
 * classes (`context-taxonomy.ts` §5, §33–34: `woodland_edge`, `tree_belt`,
 * `forest_mass`, `forest_interior`, `isolated_tree`, `tree_cluster`,
 * `understory`), read only. Nothing here invents a tree, a species or a
 * landcover region that is not already one of those shapes (constraint 14):
 * an unreviewed woods polygon and an `uncertain` context zone contribute
 * nothing, and a `forest_mass`/`forest_interior` zone never produces a
 * crown, only the same low-poly mass a reviewed forest's own interior gets
 * (§66). A `LineString` woodland zone (a shelterbelt/tree row) becomes a
 * buffered corridor at its authored width (or `rowWidthM` when the source
 * carries none, the one invented number here, recorded on every instance it
 * produces via `basis: 'context_zone'`); every instance and edge sample
 * still lands only inside that corridor.
 *
 * §59 four structural layers, reduced to what a data compiler (no camera,
 * no THREE) can decide:
 *   edge specimens   `instances` kind `crown`, §60: density highest at the
 *                    boundary and falling off by `forestCrownDensity`
 *                    (`edgeBandM`), never a hard cutoff, so "densest at the
 *                    edge, thinning inward" holds even under budget. A
 *                    bounded pool nearest the golfer's own playing surfaces
 *                    is flagged `hero` (§60–62) with a seeded branch count
 *                    (§61) up to `budgets.hero` — a *candidate* pool: the
 *                    renderer still gates actual branch geometry by
 *                    projected crown radius (§62's >=32px) each frame,
 *                    which this module cannot evaluate without a camera.
 *   edge understory  `instances` kind `shrub`, §64: banded between
 *                    `understoryInnerM` and `understoryOuterM` of the edge.
 *   mid/interior     `instances` kind `mass`, §65–66: gated beyond
 *                    `interiorInsetM` so a belt narrower than that gate
 *                    naturally carries no mass at all, only edge crowns.
 *   transition read  `understory` darkening samples, §65 "mid forest":
 *                    a small grid whose `darken` ramps from 0 at the
 *                    boundary to 1 at `interiorInsetM`, cheap ground/canopy
 *                    tone toward the interior without extra geometry.
 *
 * Every id, seed, offset and accept/reject draw comes from `featureSeed`
 * (FNV-1a + avalanche, `./bunker-profile`, already shared well beyond
 * bunkers — see `visual-artifact.ts`) over a string that names the exact
 * quantity, never `Math.random` (constraint 13: deterministic from
 * package/style hashes). Heights come from `terrainHeight`
 * (`./terrain`), which prefers the metric grid (`sampleMetricTerrain`,
 * O(1)) and falls back to the triangle mesh only when a scene carries no
 * grid, the same source every other placement module in this directory
 * uses (`terrain-canopy.ts`, `three-landscape.ts`); a point the terrain
 * cannot answer for is dropped rather than guessed (no floating trunks,
 * §63). Three-free (R12): this module is consumed by a renderer, never one. */
import { featureSeed, smootherstep } from './bunker-profile';
import { allocateCrowns } from './canopy';
import { CONTEXT_CLASS_GROUPS, type ContextClass } from './context-taxonomy';
import { boundaryDistance } from './display-outline';
import { inFeature } from './spatial';
import { terrainHeight, type TerrainMesh } from './terrain';
import { MERIDIAN_STYLE } from './visual-style';
import type { HoleScene, LocalFeature, PointM } from './types';

export type ForestBasis = 'reviewed_feature' | 'context_zone';
export type ForestInstanceKind = 'crown' | 'shrub' | 'mass';

export interface ForestEdgeV2Options {
  /** §60/62: edge-specimen zone. Reused from the V1 style, not invented. */
  edgeBandM: number;
  /** World-space proxy for §62's projected-radius hero threshold, which a
   * camera-free compiler cannot evaluate: only a crown this close to the
   * edge is even offered as a hero candidate. */
  heroZoneM: number;
  /** §65–66: interior mass starts this far past the edge. Reused from V1. */
  interiorInsetM: number;
  understoryInnerM: number;
  understoryOuterM: number;
  understorySpacingM: number;
  /** Coarse darkening-grid pitch: sparser than the shrub layer on purpose (a "small" grid, §65). */
  darkenGridSpacingM: number;
  crownSpacingM: number;
  massSpacingM: number;
  edgeSampleSpacingM: number;
  /** Default width for a woodland `LineString` zone (a shelterbelt/tree
   * row) whose source carries no width: the one invented number here. */
  rowWidthM: number;
  /** §65: crown density never truly reaches zero in the interior; mass carries the rest. */
  interiorCrownFloor: number;
  crownClearanceM: number;
  shrubClearanceM: number;
  massClearanceM: number;
  /** §61: 2–4 primary branches per hero tree. */
  branchCountRange: readonly [number, number];
  budgets: {
    crowns: number;
    shrubs: number;
    mass: number;
    /** OSM `forest_mass`/`forest_interior` zones outside every reviewed mask (V1 `mass.contextBudget`). */
    contextMass: number;
    /** §62: hard cap regardless of frame. */
    hero: number;
    understoryGrid: number;
  };
  maxCandidatesPerRegion: number;
  maxEdgeSamplesPerRegion: number;
}

const VEGETATION = MERIDIAN_STYLE.vegetation;
export const FOREST_EDGE_V2_OPTIONS: Readonly<ForestEdgeV2Options> = Object.freeze({
  edgeBandM: VEGETATION.edgeBandM, heroZoneM: 12, interiorInsetM: VEGETATION.mass.insetM,
  understoryInnerM: VEGETATION.understory.innerM, understoryOuterM: VEGETATION.understory.bandM,
  understorySpacingM: VEGETATION.understory.spacingM, darkenGridSpacingM: VEGETATION.understory.spacingM * 1.5,
  crownSpacingM: 6, massSpacingM: VEGETATION.mass.spacingM, edgeSampleSpacingM: 6, rowWidthM: 6,
  interiorCrownFloor: .12, crownClearanceM: 2, shrubClearanceM: 1, massClearanceM: 8,
  branchCountRange: [2, 4] as const,
  budgets: Object.freeze({ crowns: VEGETATION.crownBudget, shrubs: VEGETATION.understory.budget,
    mass: VEGETATION.mass.budget, contextMass: VEGETATION.mass.contextBudget, hero: 32, understoryGrid: 240 }),
  maxCandidatesPerRegion: 4000, maxEdgeSamplesPerRegion: 400,
});

export interface ForestEdgeSample { x: number; y: number; z: number; tangentX: number; tangentY: number; bandDepthM: number }
export interface ForestEdge { featureId: string; basis: ForestBasis; samples: ForestEdgeSample[] }
export interface ForestInstance {
  id: string; featureId: string; basis: ForestBasis; kind: ForestInstanceKind;
  x: number; y: number; z: number;
  /** Metres: crown/shrub/lobe radius applied to a unit-radius authored asset (`tree-assets.ts`). */
  scale: number;
  heightM: number;
  rotationRadians: number;
  /** 0–1, the same draw the id itself hashes to: cheap per-instance variation for the renderer. */
  seed: number;
  edgeDistanceM: number;
  /** §60–62: a hero *candidate*; see the header note on projected-size gating. */
  hero?: true;
  branchSeed?: number;
  branchCount?: number;
}
export interface UnderstorySample { featureId: string; x: number; y: number; z: number; edgeDistanceM: number; darken: number }
export interface ForestEdgeV2Budget {
  instances: { used: number; target: number };
  hero: { used: number; cap: number };
  understory: { used: number; target: number };
}
export interface ForestEdgeV2Result {
  basis: 'canonical_woods_and_context';
  edges: ForestEdge[];
  instances: ForestInstance[];
  understory: UnderstorySample[];
  budget: ForestEdgeV2Budget;
}

/** A canonical woods feature or a woodland context zone, normalized to one
 * polygon shape so `inFeature`/`boundaryDistance` apply to either without a
 * branch. `context_zone` regions are never `heroEligible` (§62 "important
 * near trees" means the golfer's own reviewed hole, not an OSM extract). */
interface ForestRegion extends LocalFeature {
  basis: ForestBasis;
  crownEligible: boolean;
  shrubEligible: boolean;
  /** `understory`-class zones: shrubs everywhere in the zone, not band-gated. */
  shrubUngated: boolean;
  massEligible: boolean;
  /** `forest_mass`/`forest_interior`-class zones: mass everywhere, not inset-gated. */
  massUngated: boolean;
  heroEligible: boolean;
}
const WOODLAND_CLASSES: ReadonlySet<ContextClass> = new Set(CONTEXT_CLASS_GROUPS.woodland);
const MASS_ONLY_CLASSES: ReadonlySet<ContextClass> = new Set(['forest_mass', 'forest_interior']);
const UNDERSTORY_ONLY_CLASSES: ReadonlySet<ContextClass> = new Set(['understory']);

/** A polyline's per-vertex offset ring (left side forward, right side back).
 * Adequate for the shallow curvature of an authored tree row/shelterbelt;
 * it is not a robust miter buffer and is not asked to be one. */
function bufferPolyline(points: readonly PointM[], halfWidthM: number): PointM[][] {
  if (points.length < 2 || !(halfWidthM > 0)) return [];
  const left: PointM[] = [], right: PointM[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length * halfWidthM, ny = dx / length * halfWidthM, [x, y] = points[i]!;
    const l: PointM = [x + nx, y + ny], r: PointM = [x - nx, y - ny];
    left.push(l); right.push(r);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]!);
  return [ring];
}

/** Every region a hole scene offers this compiler: reviewed canonical woods
 * (own + context features, own winning on a shared id) plus woodland context
 * zones, `uncertain` ones excluded (§39/outside-world review gate). */
function collectForestRegions(scene: HoleScene, options: ForestEdgeV2Options): ForestRegion[] {
  const merged = new Map<string, LocalFeature>();
  for (const feature of scene.contextFeatures ?? []) merged.set(feature.id, feature);
  for (const feature of scene.features) merged.set(feature.id, feature);
  const regions: ForestRegion[] = [];
  for (const feature of merged.values()) {
    if (feature.kind !== 'woods' || !feature.reviewed) continue;
    regions.push({ ...feature, basis: 'reviewed_feature',
      crownEligible: true, shrubEligible: true, shrubUngated: false, massEligible: true, massUngated: false, heroEligible: true });
  }
  for (const zone of scene.contextZones ?? []) {
    if (!WOODLAND_CLASSES.has(zone.class) || zone.basis === 'uncertain') continue;
    const parts = zone.type === 'LineString'
      ? zone.parts.map(component => bufferPolyline(component[0] ?? [], (zone.attributes.widthM ?? options.rowWidthM) / 2)).filter(buffered => buffered.length > 0)
      : zone.parts;
    if (!parts.length || !parts.some(component => component.some(ring => ring.length >= 4))) continue;
    const massOnly = MASS_ONLY_CLASSES.has(zone.class), understoryOnly = UNDERSTORY_ONLY_CLASSES.has(zone.class);
    regions.push({ id: zone.id, kind: 'woods', type: parts.length > 1 ? 'MultiPolygon' : 'Polygon', parts, reviewed: false,
      basis: 'context_zone', crownEligible: !massOnly && !understoryOnly, shrubEligible: !massOnly,
      shrubUngated: understoryOnly, massEligible: !understoryOnly, massUngated: massOnly, heroEligible: false });
  }
  return regions;
}

/** Distance to the region's own boundary, every ring (outer and holes: a
 * clearing cut into a forest is an edge too, not deep interior). */
function edgeDistanceM(point: PointM, region: ForestRegion): number {
  let min = Infinity;
  for (const component of region.parts) for (const ring of component) min = Math.min(min, boundaryDistance(point, ring));
  return min;
}

/** §65: crowns are densest at the boundary and thin inward, but never to
 * zero (mass carries the rest, §66) — an explicit rule so the gradient
 * holds whether or not a hole's candidate count ever reaches budget. */
export function forestCrownDensity(edgeM: number, options: ForestEdgeV2Options = FOREST_EDGE_V2_OPTIONS): number {
  const depth = Math.max(0, Math.min(1, edgeM / options.edgeBandM));
  return options.interiorCrownFloor + (1 - options.interiorCrownFloor) * (1 - smootherstep(depth));
}

/** Deterministic offset grid over a region's own bounding box: alternating
 * row offsets plus a seeded sub-cell jitter, exactly the scatter
 * `three-landscape.ts` uses for its mass/understory grids, so the pattern
 * reads as scattered rather than gridded. Spacing widens on a very large
 * region so candidate count stays bounded (mirrors `canopy.ts`). */
function scatterGrid(region: ForestRegion, spacingM: number, maxCandidates: number): PointM[] {
  const vertices = region.parts.flat(2);
  if (!vertices.length) return [];
  const xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1]);
  const minX0 = Math.min(...xs), maxX = Math.max(...xs), minY0 = Math.min(...ys), maxY = Math.max(...ys);
  const area = Math.max(1, (maxX - minX0) * (maxY - minY0));
  const spacing = Math.max(spacingM, Math.sqrt(area / maxCandidates));
  const minX = Math.floor(minX0 / spacing) * spacing, minY = Math.floor(minY0 / spacing) * spacing;
  const points: PointM[] = [];
  for (let y = minY, row = 0; y <= maxY && points.length < maxCandidates; y += spacing, row++) {
    for (let x = minX + (row % 2 ? spacing / 2 : 0); x <= maxX && points.length < maxCandidates; x += spacing) {
      const cell = `${region.id}:${Math.round(x)}:${Math.round(y)}`;
      const point: PointM = [x + (featureSeed(`${cell}:jx`) - .5) * spacing * .7, y + (featureSeed(`${cell}:jy`) - .5) * spacing * .7];
      if (inFeature(point, region)) points.push(point);
    }
  }
  return points;
}

/** §60/64/66 band depth at one boundary sample: how far a point can move
 * inward along the local normal before it would leave the region, capped at
 * `maxM`. A belt narrower than `maxM` reports its own half-width here
 * instead of a fabricated full-width band (constraint 14). */
function inwardBandDepth(point: PointM, tangent: PointM, region: ForestRegion, maxM: number): number {
  const candidateNormals: PointM[] = [[-tangent[1], tangent[0]], [tangent[1], -tangent[0]]];
  const probe = Math.max(maxM * .02, .05);
  const normal = candidateNormals.find(([nx, ny]) => inFeature([point[0] + nx * probe, point[1] + ny * probe], region)) ?? candidateNormals[0]!;
  const at = (d: number): PointM => [point[0] + normal[0] * d, point[1] + normal[1] * d];
  if (inFeature(at(maxM), region)) return maxM;
  let lo = 0, hi = maxM;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (inFeature(at(mid), region)) lo = mid; else hi = mid; }
  return lo;
}

/** One region's boundary, every ring, resampled at `edgeSampleSpacingM`
 * (widened on a very long boundary so the sample count stays bounded). */
function ringEdgeSamples(region: ForestRegion, ring: readonly PointM[], mesh: TerrainMesh, options: ForestEdgeV2Options): ForestEdgeSample[] {
  let perimeter = 0;
  for (let i = 1; i < ring.length; i++) perimeter += Math.hypot(ring[i]![0] - ring[i - 1]![0], ring[i]![1] - ring[i - 1]![1]);
  if (!(perimeter > 0)) return [];
  const spacing = Math.max(options.edgeSampleSpacingM, perimeter / options.maxEdgeSamplesPerRegion);
  const samples: ForestEdgeSample[] = [];
  let travelled = 0, next = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!, b = ring[i]!, segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segment > 0) {
      const tangent: PointM = [(b[0] - a[0]) / segment, (b[1] - a[1]) / segment];
      for (; next <= travelled + segment; next += spacing) {
        const t = (next - travelled) / segment, point: PointM = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const z = terrainHeight(mesh, point);
        if (z != null) samples.push({ x: point[0], y: point[1], z, tangentX: tangent[0], tangentY: tangent[1],
          bandDepthM: inwardBandDepth(point, tangent, region, options.edgeBandM) });
      }
    }
    travelled += segment;
  }
  return samples;
}

interface Draft { region: ForestRegion; point: PointM; edgeM: number }

/** Meridian V2 forest edge (§59–68; Task 15). Derives edge polylines, tree/
 * shrub/mass instances and a small interior-darkening grid for one hole
 * scene, from canonical woods features and the context layer only. */
export function compileForestEdgeV2(scene: HoleScene, mesh: TerrainMesh, options: ForestEdgeV2Options = FOREST_EDGE_V2_OPTIONS): ForestEdgeV2Result {
  const regions = collectForestRegions(scene, options);
  const idPrefix = `${scene.packageHash.slice(0, 12)}:${scene.physicalHoleKey}`;
  const instanceId = (kind: ForestInstanceKind, region: ForestRegion, point: PointM) =>
    `${kind}:${idPrefix}:${region.id}:${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}`;

  // Playing surfaces (never woods/route) stay clear of every instance, and
  // rank hero candidates by nearness to them: "important near trees" (§60)
  // means trees beside the hole the golfer plays, not deep in a shared mask.
  const allFeatures = new Map<string, LocalFeature>();
  for (const feature of scene.contextFeatures ?? []) allFeatures.set(feature.id, feature);
  for (const feature of scene.features) allFeatures.set(feature.id, feature);
  const playFeatures = [...allFeatures.values()].filter(f => f.kind !== 'woods' && f.kind !== 'route');
  const playRings = playFeatures.flatMap(f => f.parts.flat());
  const isClear = (point: PointM, clearanceM: number) =>
    !playFeatures.some(f => inFeature(point, f)) && !playRings.some(ring => boundaryDistance(point, ring) < clearanceM);
  const nearnessToPlay = (point: PointM) => playRings.reduce((min, ring) => Math.min(min, boundaryDistance(point, ring)), Infinity);

  const draftsFor = (predicate: (region: ForestRegion) => boolean, spacingM: number, clearanceM: number, gate: (draft: Draft) => boolean): Draft[][] =>
    regions.filter(predicate).map(region => scatterGrid(region, spacingM, options.maxCandidatesPerRegion)
      .map((point): Draft => ({ region, point, edgeM: edgeDistanceM(point, region) }))
      .filter(draft => isClear(draft.point, clearanceM) && gate(draft)));

  // Crowns (§60/65): every region offers candidates everywhere inside it; the
  // explicit accept draw below is what makes the edge denser than the
  // interior, not the budget trim that follows.
  const crownDrafts = draftsFor(region => region.crownEligible, options.crownSpacingM, options.crownClearanceM, draft =>
    featureSeed(`${instanceId('crown', draft.region, draft.point)}:accept`) < forestCrownDensity(draft.edgeM, options));
  const crownAllocated = allocateCrowns(crownDrafts, options.budgets.crowns, draft => draft.edgeM).flat();

  const shrubDrafts = draftsFor(region => region.shrubEligible, options.understorySpacingM, options.shrubClearanceM, draft =>
    draft.region.shrubUngated || (draft.edgeM >= options.understoryInnerM && draft.edgeM <= options.understoryOuterM));
  const shrubAllocated = allocateCrowns(shrubDrafts, options.budgets.shrubs, draft => draft.edgeM).flat();

  const massDrafts = draftsFor(region => region.massEligible && !region.massUngated, options.massSpacingM, options.massClearanceM, draft => draft.edgeM >= options.interiorInsetM);
  const contextMassDrafts = draftsFor(region => region.massEligible && region.massUngated, options.massSpacingM, options.massClearanceM, () => true);
  const massAllocated = [...allocateCrowns(massDrafts, options.budgets.mass, draft => draft.edgeM).flat(),
    ...allocateCrowns(contextMassDrafts, options.budgets.contextMass, draft => draft.edgeM).flat()];

  // `heightOf` takes each instance's own drawn radius so a big crown also
  // stands taller, rather than drawing height independently of scale.
  const toInstance = (kind: ForestInstanceKind, draft: Draft, radiusRange: readonly [number, number], heightOf: (scale: number, id: string) => number): ForestInstance | null => {
    const z = terrainHeight(mesh, draft.point);
    if (z == null) return null;
    const id = instanceId(kind, draft.region, draft.point);
    const scale = radiusRange[0] + (radiusRange[1] - radiusRange[0]) * featureSeed(`${id}:radius`);
    return { id, featureId: draft.region.id, basis: draft.region.basis, kind, x: draft.point[0], y: draft.point[1], z,
      scale, heightM: heightOf(scale, id), rotationRadians: featureSeed(`${id}:yaw`) * Math.PI * 2, seed: featureSeed(id), edgeDistanceM: draft.edgeM };
  };
  // §61 crown height as a seeded 2.0–3.2x multiple of its own radius (the
  // authored crown atlas's own family ratios span roughly this range).
  const crownHeightOf = (scale: number, id: string) => scale * (2 + featureSeed(`${id}:heightRatio`) * 1.2);
  const rangeHeightOf = (range: readonly [number, number]) => (_scale: number, id: string) => range[0] + (range[1] - range[0]) * featureSeed(`${id}:height`);
  const crownInstances = crownAllocated.map(draft => toInstance('crown', draft, [2.7, 4.8], crownHeightOf)).filter((instance): instance is ForestInstance => instance != null);
  const shrubInstances = shrubAllocated.map(draft => toInstance('shrub', draft, VEGETATION.understory.radiusM, rangeHeightOf(VEGETATION.understory.heightM))).filter((instance): instance is ForestInstance => instance != null);
  const massInstances = massAllocated.map(draft => toInstance('mass', draft, VEGETATION.mass.lobeRadiusM, rangeHeightOf(VEGETATION.mass.canopyHeightM))).filter((instance): instance is ForestInstance => instance != null);

  // §60–62 hero pool: reviewed edge crowns nearest the played hole's own
  // surfaces, hard-capped, with a seeded branch count for the ones chosen.
  const heroPool = crownInstances.filter(instance => instance.basis === 'reviewed_feature' && instance.edgeDistanceM < options.heroZoneM)
    .map(instance => ({ instance, rank: nearnessToPlay([instance.x, instance.y]) }))
    .sort((a, b) => a.rank - b.rank || (a.instance.id < b.instance.id ? -1 : 1))
    .slice(0, options.budgets.hero);
  const heroIds = new Set(heroPool.map(entry => entry.instance.id));
  const finalCrownInstances = crownInstances.map(instance => {
    if (!heroIds.has(instance.id)) return instance;
    const branchSeed = featureSeed(`${instance.id}:branches`);
    const branchCount = options.branchCountRange[0] + Math.round(branchSeed * (options.branchCountRange[1] - options.branchCountRange[0]));
    return { ...instance, hero: true as const, branchSeed, branchCount };
  });
  const instances = [...finalCrownInstances, ...shrubInstances, ...massInstances];

  const edges: ForestEdge[] = regions.filter(region => region.crownEligible)
    .map((region): ForestEdge => ({ featureId: region.id, basis: region.basis,
      samples: region.parts.flatMap(component => component.flatMap(ring => ringEdgeSamples(region, ring, mesh, options))) }))
    .filter(edge => edge.samples.length > 0);

  // §65 "mid forest" transition read: a small darkening grid, 0 at the
  // boundary ramping to 1 by `interiorInsetM` (where mass takes over the read).
  const understoryGroups = regions.filter(region => region.crownEligible).map(region =>
    scatterGrid(region, options.darkenGridSpacingM, options.maxCandidatesPerRegion)
      .map((point): Draft => ({ region, point, edgeM: edgeDistanceM(point, region) }))
      .filter(draft => draft.edgeM <= options.interiorInsetM && isClear(draft.point, 0)));
  const understory: UnderstorySample[] = allocateCrowns(understoryGroups, options.budgets.understoryGrid, draft => draft.edgeM).flat()
    .map(draft => {
      const z = terrainHeight(mesh, draft.point);
      return z == null ? null : { featureId: draft.region.id, x: draft.point[0], y: draft.point[1], z, edgeDistanceM: draft.edgeM,
        darken: smootherstep(Math.max(0, Math.min(1, draft.edgeM / options.interiorInsetM))) };
    }).filter((sample): sample is UnderstorySample => sample != null);

  const contextMassTarget = regions.some(region => region.massUngated) ? options.budgets.contextMass : 0;
  return {
    basis: 'canonical_woods_and_context', edges, instances,
    understory,
    budget: {
      instances: { used: instances.length, target: options.budgets.crowns + options.budgets.shrubs + options.budgets.mass + contextMassTarget },
      hero: { used: heroPool.length, cap: options.budgets.hero },
      understory: { used: understory.length, target: options.budgets.understoryGrid },
    },
  };
}

/** §60–68 gates: every instance and understory sample lands inside the
 * woods feature or context band that owns it (`featureId`), every numeric
 * field is finite, a hero instance only ever comes from a reviewed feature
 * with a §61 branch count, and neither the hero pool nor the instance/
 * understory totals exceed their budgets. Determinism is a caller-side
 * check (compile twice, compare); this only validates one result. */
export function assertForestEdgeV2(result: ForestEdgeV2Result, scene: HoleScene, options: ForestEdgeV2Options = FOREST_EDGE_V2_OPTIONS): void {
  const regions = new Map(collectForestRegions(scene, options).map(region => [region.id, region] as const));
  const problems: string[] = [];
  const finite = (...values: number[]) => values.every(Number.isFinite);

  for (const instance of result.instances) {
    if (!finite(instance.x, instance.y, instance.z, instance.scale, instance.heightM, instance.rotationRadians, instance.seed, instance.edgeDistanceM)) {
      problems.push(`${instance.id}: non-finite field`); continue;
    }
    const region = regions.get(instance.featureId);
    if (!region) { problems.push(`${instance.id}: unknown feature ${instance.featureId}`); continue; }
    if (!inFeature([instance.x, instance.y], region)) problems.push(`${instance.id}: outside its woods feature or context band`);
    if (instance.hero) {
      if (instance.basis !== 'reviewed_feature') problems.push(`${instance.id}: hero flag outside a reviewed feature`);
      if (instance.branchSeed == null || !finite(instance.branchSeed)) problems.push(`${instance.id}: hero missing a branch seed`);
      if (instance.branchCount == null || instance.branchCount < options.branchCountRange[0] || instance.branchCount > options.branchCountRange[1]) problems.push(`${instance.id}: hero branch count out of range`);
    }
  }
  for (const edge of result.edges) {
    const region = regions.get(edge.featureId);
    if (!region) { problems.push(`${edge.featureId}: edge has no matching region`); continue; }
    for (const sample of edge.samples) {
      if (!finite(sample.x, sample.y, sample.z, sample.tangentX, sample.tangentY, sample.bandDepthM)) { problems.push(`${edge.featureId}: non-finite edge sample`); continue; }
      if (sample.bandDepthM < 0 || sample.bandDepthM > options.edgeBandM + 1e-6) problems.push(`${edge.featureId}: band depth ${sample.bandDepthM} outside [0, ${options.edgeBandM}]`);
      if (!inFeature([sample.x, sample.y], region)) problems.push(`${edge.featureId}: edge sample outside its own region`);
    }
  }
  for (const sample of result.understory) {
    if (!finite(sample.x, sample.y, sample.z, sample.edgeDistanceM, sample.darken)) { problems.push(`${sample.featureId}: non-finite understory sample`); continue; }
    if (sample.darken < 0 || sample.darken > 1) problems.push(`${sample.featureId}: understory darken ${sample.darken} outside [0, 1]`);
    const region = regions.get(sample.featureId);
    if (!region) { problems.push(`${sample.featureId}: understory sample has no matching region`); continue; }
    if (!inFeature([sample.x, sample.y], region)) problems.push(`${sample.featureId}: understory sample outside its region`);
  }

  const heroCount = result.instances.filter(instance => instance.hero).length;
  if (heroCount !== result.budget.hero.used) problems.push(`hero used ${result.budget.hero.used} does not match ${heroCount} flagged instances`);
  if (heroCount > result.budget.hero.cap) problems.push(`${heroCount} hero trees exceed the ${result.budget.hero.cap} cap`);
  if (result.instances.length !== result.budget.instances.used) problems.push('instances.used does not match instances.length');
  if (result.instances.length > result.budget.instances.target) problems.push('instance count exceeds its budget target');
  if (result.understory.length !== result.budget.understory.used) problems.push('understory.used does not match understory.length');
  if (result.understory.length > result.budget.understory.target) problems.push('understory count exceeds its budget target');

  if (problems.length) throw new Error(`Forest edge V2 failed: ${problems.join('; ')}`);
}
