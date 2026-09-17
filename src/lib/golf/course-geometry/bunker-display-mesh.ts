/** Meridian V2 bunker hero displacement (V2 plan §35–39, §107, §113, §115;
 * Task 8). A bunker's V2 mesh is the Task 7 subdivision of the region that
 * owns its triangles — a standalone bunker region, or the green complex
 * that absorbed it — with two hooks from this module:
 *
 *   • §35 ring density as a spacing cap by signed distance to the canonical
 *     outline (lip band and rim finest, wall next, floor coarser), so the
 *     canonical outline stays an exact edge chain (R14, §15) and no offset
 *     ring can self-intersect on a pot or a thin neck;
 *   • §37–39 bowl and lip as a render-only displacement carried in
 *     `visualOffsetMm`: inside, z − D(p)·S(d/R) with the quintic S and the
 *     §38 shape field D(p) (elongation axis, downhill tilt, seeded
 *     variation, clamped); outside within the lip band W, +L·sin²(πq/W).
 *     Both are zero on the outline and beyond W, so the region rim (≥ W
 *     from any outline) carries no displacement (gated).
 *
 * Class, family, seeded depth/lip and bowl radius are the V1 numbers
 * (bunker-profile.ts, constants in visual-style.ts): no fork. Nothing here
 * implies measured bunker depth (constraint 16): canonical heights stay in
 * `canonicalHeightReference` and the profile says `visual_only`.
 * Deterministic from scene + mesh (13); three-free (R12). */
import type { DisplayMesh } from './display-mesh-v2';
import { compileRegionPatch, type CompiledHeroPatch, type RegionPatchOptions } from './green-display-mesh';
import { bboxDistance, bunkerProfileNumbers, featureRings, featureSeed, nearestRingDistance, smootherstep, type BunkerProfileNumbers, type Ring } from './bunker-profile';
import type { HeroRegion, HeroRegionPlan } from './hero-patches';
import { inRing } from './spatial';
import type { TerrainMesh } from './terrain';
import { sampleMetricTerrainAt } from './terrain-source';
import type { HoleScene, LocalFeature, PointM } from './types';
import { MERIDIAN_STYLE, type MeridianStyle } from './visual-style';

/** §35 ring density as spacing caps by signed distance to the outline
 * (metres; negative = outside). The outer band covers the lip (W = 0.7 m). */
export interface BunkerRingSpacing {
  outerBandM: number; outerSpacingM: number;
  rimBandM: number; rimSpacingM: number;
  wallBandM: number; wallSpacingM: number;
  floorSpacingM: number;
  /** §38 shape field amplitudes and clamp. */
  elongation: number; downhill: number; variation: number; shapeMin: number; shapeMax: number;
}
export const BUNKER_RING_SPACING: Readonly<BunkerRingSpacing> = Object.freeze({
  outerBandM: .9, outerSpacingM: .3, rimBandM: .35, rimSpacingM: .25, wallBandM: 1.6, wallSpacingM: .5, floorSpacingM: .9,
  elongation: .12, downhill: .06, variation: .08, shapeMin: .75, shapeMax: 1.25,
});

/** One bunker's render-only profile inside a hero region. */
export interface BunkerHeroProfile extends BunkerProfileNumbers {
  featureId: string;
  rings: Ring[];
  centroid: PointM;
  /** Elongation axis angle (radians) and downhill direction of the terrain under the centroid. */
  axisAngle: number;
  downhill: PointM | null;
  inradiusM: number;
  /** Seeded phases of the §38 variation field. */
  variationSeed: [number, number, number];
  basis: 'visual_only';
}

/** True inradius of the outline (deepest interior point), sampled on a fine grid; deterministic. */
export function outlineInradius(rings: readonly Ring[]): number {
  const outer = rings[0];
  if (!outer) return 0;
  const { minX, minY, maxX, maxY } = outer.box;
  const step = Math.max(.1, Math.min(maxX - minX, maxY - minY) / 60);
  let best = 0;
  for (let y = minY + step / 2; y < maxY; y += step) for (let x = minX + step / 2; x < maxX; x += step) {
    const point: PointM = [x, y];
    if (!inRing(point, outer.ring) || rings.slice(1).some(hole => inRing(point, hole.ring))) continue;
    best = Math.max(best, nearestRingDistance(point, rings, Infinity));
  }
  return best;
}
/** Principal axis of a ring, length-weighted over its segments. */
function elongationAxis(ring: readonly PointM[], centroid: PointM): number {
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!, b = ring[i]!, w = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2 - centroid[0], my = (a[1] + b[1]) / 2 - centroid[1];
    sxx += w * mx * mx; sxy += w * mx * my; syy += w * my * my;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** Profiles for the played bunkers a region owns (its `featureIds` of kind bunker). */
export function bunkerHeroProfiles(scene: HoleScene, mesh: TerrainMesh, region: HeroRegion, style: MeridianStyle = MERIDIAN_STYLE): BunkerHeroProfile[] {
  const contextIds = new Set(scene.contextFeatures?.map(f => f.id));
  const byId = new Map<string, LocalFeature>();
  for (const f of [...scene.features, ...(scene.contextFeatures ?? [])]) byId.set(f.id, f);
  const greenRings = [...scene.features, ...(scene.contextFeatures ?? [])].filter(f => f.kind === 'green').flatMap(f => featureRings(f));
  const profiles: BunkerHeroProfile[] = [];
  for (const id of region.featureIds) {
    const feature = byId.get(id);
    if (!feature || feature.kind !== 'bunker' || feature.type === 'LineString') continue;
    const rings = featureRings(feature), outer = rings[0];
    if (!outer || outer.ring.length < 4) continue;
    const centroid: PointM = [outer.ring.reduce((s, q) => s + q[0], 0) / outer.ring.length, outer.ring.reduce((s, q) => s + q[1], 0) / outer.ring.length];
    const inradiusM = outlineInradius(rings);
    const numbers = bunkerProfileNumbers(feature, style, { contextOnly: contextIds.has(id), greenRings, inradiusM });
    let downhill: PointM | null = null;
    const grid = mesh.metricGrid;
    if (grid) {
      const h = grid.spacingM, zx0 = sampleMetricTerrainAt(grid, centroid[0] - h, centroid[1]), zx1 = sampleMetricTerrainAt(grid, centroid[0] + h, centroid[1]);
      const zy0 = sampleMetricTerrainAt(grid, centroid[0], centroid[1] - h), zy1 = sampleMetricTerrainAt(grid, centroid[0], centroid[1] + h);
      if (zx0 != null && zx1 != null && zy0 != null && zy1 != null) {
        const gx = (zx1 - zx0) / (2 * h), gy = (zy1 - zy0) / (2 * h), slope = Math.hypot(gx, gy);
        if (slope > 1e-3) downhill = [-gx / slope, -gy / slope];
      }
    }
    profiles.push({ ...numbers, featureId: id, rings, centroid, axisAngle: elongationAxis(outer.ring, centroid), downhill, inradiusM,
      variationSeed: [featureSeed(`${id}:shape-a`), featureSeed(`${id}:shape-b`), featureSeed(`${id}:shape-c`)], basis: 'visual_only' });
  }
  return profiles;
}

/** Signed distance to a bunker outline: positive inside the sand. */
export function bunkerSignedDistance(point: PointM, profile: BunkerHeroProfile): number {
  const outer = profile.rings[0]!;
  const inside = inRing(point, outer.ring) && !profile.rings.slice(1).some(hole => inRing(point, hole.ring));
  const distance = nearestRingDistance(point, profile.rings, Infinity);
  return inside ? distance : -distance;
}
/** §38 shape multiplier: elongation, downhill tilt and seeded variation, clamped. Visual only. */
export function bunkerShape(point: PointM, profile: BunkerHeroProfile, spacing: BunkerRingSpacing = BUNKER_RING_SPACING): number {
  const dx = point[0] - profile.centroid[0], dy = point[1] - profile.centroid[1], phi = Math.atan2(dy, dx);
  const [sa, sb, sc] = profile.variationSeed;
  const wavelength = 3 + 2 * sc;
  const q = Math.sin((point[0] * Math.cos(sa * Math.PI) + point[1] * Math.sin(sa * Math.PI)) * 2 * Math.PI / wavelength + sb * 2 * Math.PI);
  let shape = 1 + spacing.elongation * Math.cos(2 * (phi - profile.axisAngle)) + spacing.variation * q;
  if (profile.downhill) shape += spacing.downhill * (dx * profile.downhill[0] + dy * profile.downhill[1]) / Math.max(.5, Math.hypot(dx, dy));
  return Math.min(spacing.shapeMax, Math.max(spacing.shapeMin, shape));
}
/** Whether `point` is at least `bandM` outside every ring's bounding box
 * of every profile — then it is outside every bunker by at least that
 * much (a box is never farther than its ring), and a caller whose answer
 * is fixed beyond the band can give it without a signed distance. The
 * micron covers the box distance rounding an ulp above the ring's. */
function beyondBand(point: PointM, profiles: readonly BunkerHeroProfile[], bandM: number): boolean {
  for (const profile of profiles) for (const ring of profile.rings) if (bboxDistance(point, ring.box) < bandM + 1e-6) return false;
  return true;
}
/** Render-only displacement at a point from the nearest of the region's bunkers (metres). */
export function bunkerDisplacement(point: PointM, profiles: readonly BunkerHeroProfile[], style: MeridianStyle = MERIDIAN_STYLE, spacing: BunkerRingSpacing = BUNKER_RING_SPACING): number {
  // Beyond the lip band outside every bunker the displacement is 0.
  if (profiles.length && beyondBand(point, profiles, style.bunker.lipBandM)) return 0;
  let best: BunkerHeroProfile | null = null, bestD = -Infinity;
  for (const profile of profiles) {
    const d = bunkerSignedDistance(point, profile);
    if (best == null || d > bestD) { best = profile; bestD = d; }
  }
  if (!best) return 0;
  if (bestD > 0) {
    const u = Math.min(1, bestD / best.bowlRadiusM);
    return -best.depthM * bunkerShape(point, best, spacing) * smootherstep(u);
  }
  const q = -bestD, w = style.bunker.lipBandM;
  if (q <= 0 || q >= w) return 0;
  const s = Math.sin(Math.PI * q / w);
  return best.lipM * s * s;
}
/** §35 spacing cap by band: finest on the rim, then the lip and wall bands, then the floor; none beyond the lip outside. */
export function bunkerSpacingCap(point: PointM, profiles: readonly BunkerHeroProfile[], spacing: BunkerRingSpacing = BUNKER_RING_SPACING): number {
  // Beyond the outer band outside every bunker no band caps the spacing.
  if (beyondBand(point, profiles, spacing.outerBandM)) return Infinity;
  let cap = Infinity;
  for (const profile of profiles) {
    const d = bunkerSignedDistance(point, profile), a = Math.abs(d);
    const band = a <= spacing.rimBandM ? spacing.rimSpacingM : d < 0 ? (a <= spacing.outerBandM ? spacing.outerSpacingM : Infinity) : a <= spacing.wallBandM ? spacing.wallSpacingM : spacing.floorSpacingM;
    cap = Math.min(cap, band);
  }
  return cap;
}

/** Hooks for a region that owns bunkers (empty when it owns none). */
export function bunkerPatchHooks(profiles: readonly BunkerHeroProfile[], style: MeridianStyle = MERIDIAN_STYLE, spacing: BunkerRingSpacing = BUNKER_RING_SPACING): Pick<RegionPatchOptions, 'spacingCap' | 'displacement'> {
  if (!profiles.length) return {};
  return {
    spacingCap: (x, y) => bunkerSpacingCap([x, y], profiles, spacing),
    displacement: (x, y) => bunkerDisplacement([x, y], profiles, style, spacing),
  };
}

export interface CompiledBunkerPatch extends CompiledHeroPatch { profiles: BunkerHeroProfile[] }
/** Compile a bunker-owning region (standalone bunker or green complex) with the bunker hooks. */
export function compileBunkerAwarePatch(scene: HoleScene, mesh: TerrainMesh, base: DisplayMesh, region: HeroRegion, style: MeridianStyle = MERIDIAN_STYLE, options: Pick<RegionPatchOptions, 'curvature'> = {}): CompiledBunkerPatch {
  const profiles = bunkerHeroProfiles(scene, mesh, region, style);
  return { ...compileRegionPatch(mesh, base, region, { ...bunkerPatchHooks(profiles, style), ...options }), profiles };
}
/** Every green-complex and bunker region of a plan, bunker hooks applied
 * where the region owns bunkers. `options.curvature` (the grid's default
 * curvature fields) is shared by every patch instead of recompiled per
 * patch. */
export function compileHeroPatches(scene: HoleScene, mesh: TerrainMesh, base: DisplayMesh, plan: HeroRegionPlan, style: MeridianStyle = MERIDIAN_STYLE, options: Pick<RegionPatchOptions, 'curvature'> = {}): CompiledBunkerPatch[] {
  return plan.regions.filter(r => r.kind === 'green_complex' || r.kind === 'bunker').map(r => compileBunkerAwarePatch(scene, mesh, base, r, style, options));
}

/** §37–39 gates on a compiled bunker-owning patch: zero on every outline
 * and rim vertex, bowl reaching its class depth, lip peaking and closing
 * inside the band, and the sign never crossing the outline. */
export function assertBunkerPatch(compiled: CompiledBunkerPatch, style: MeridianStyle = MERIDIAN_STYLE, spacing: BunkerRingSpacing = BUNKER_RING_SPACING): void {
  const { patch, profiles } = compiled, problems: string[] = [];
  const w = style.bunker.lipBandM;
  for (const profile of profiles) {
    let deepest = 0, lipPeak = 0, outlineOffset = 0, beyondBand = 0, wrongSign = 0;
    for (let v = 0; v < patch.positions.length / 3; v++) {
      const point: PointM = [patch.positions[v * 3]!, patch.positions[v * 3 + 1]!], offset = patch.visualOffsetMm[v]! / 1000;
      const d = bunkerSignedDistance(point, profile);
      // Only this bunker's own vertices: another bunker may be nearer.
      if (profiles.some(other => other !== profile && bunkerSignedDistance(point, other) > d)) continue;
      if (Math.abs(d) < 1e-3) outlineOffset = Math.max(outlineOffset, Math.abs(offset));
      else if (d > 0) { deepest = Math.min(deepest, offset); if (offset > 0) wrongSign++; }
      else { if (-d >= w) beyondBand = Math.max(beyondBand, Math.abs(offset)); else { lipPeak = Math.max(lipPeak, offset); if (offset < 0) wrongSign++; } }
    }
    // The deepest vertex sits within half a floor spacing of the inradius
    // point, so a pot (R ≈ inradius) bottoms out short of S(1); 60 % of the
    // class depth is the floor for the smallest bunker the style allows.
    const expectedDepth = profile.depthM * spacing.shapeMin, expectedLip = profile.lipM;
    if (outlineOffset > 0) problems.push(`${profile.featureId}: ${outlineOffset} m displacement on the outline`);
    if (!(deepest <= -expectedDepth * .8)) problems.push(`${profile.featureId}: bowl reaches ${-deepest} m of ${expectedDepth} m`);
    if (deepest < -profile.depthM * spacing.shapeMax - 1e-3) problems.push(`${profile.featureId}: bowl ${-deepest} m exceeds the shape clamp`);
    if (!(lipPeak >= expectedLip * .7)) problems.push(`${profile.featureId}: lip peaks at ${lipPeak} m of ${expectedLip} m`);
    if (lipPeak > expectedLip + 1e-3) problems.push(`${profile.featureId}: lip ${lipPeak} m exceeds ${expectedLip} m`);
    if (beyondBand > 0) problems.push(`${profile.featureId}: ${beyondBand} m displacement beyond the lip band`);
    if (wrongSign) problems.push(`${profile.featureId}: ${wrongSign} vertices displaced against the outline side`);
  }
  if (problems.length) throw new Error(`Bunker patch ${patch.id} failed: ${problems.join('; ')}`);
}
