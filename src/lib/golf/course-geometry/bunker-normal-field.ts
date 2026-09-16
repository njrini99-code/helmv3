/** Meridian V2 bunker analytic normal field (V2 plan §37–40; Task 9). A
 * bunker hero patch (Task 8, bunker-display-mesh.ts) carries its bowl/lip
 * displacement only as a height offset (`visualOffsetMm`); this module
 * supplies the *shading* normal that height field implies, in closed form,
 * so the renderer/field atlas (Task 10) never has to differentiate the
 * packed mesh itself:
 *
 *   • terrain slope from central differences of the same source grid the
 *     patch interpolated (terrain-source.ts `sampleMetricTerrain`), zero
 *     where the grid — or a sample near its edge — is unavailable;
 *   • the §37 bowl and §39 lip are each, near any one point, a 1-D profile
 *     of distance to the nearest bunker outline point (`bunker-profile.ts`
 *     `nearestOnRings`), so the analytic slope is that profile's own
 *     derivative (§37 `smootherstepSlope`, §39 the sin² derivative) along
 *     the unit direction to/from the nearest outline point — the same
 *     nearest bunker `bunkerDisplacement` (Task 8) would pick. Per the
 *     plan, the §38 shape factor is held locally constant: its own spatial
 *     derivative is not part of this closed form (measured residual against
 *     the true displacement field: bunker-normal-field.test.ts);
 *   • §40 "no faceted fan normals": the piecewise profile has zero *value*
 *     at both seams (the outline, and the lip band's outer edge) but not a
 *     continuous *curvature* there (the quintic bowl ties in flat on both
 *     ends; the lip's sin² does not), so within a narrow band of each seam
 *     the field fades its own slope contribution to zero — i.e. blends
 *     toward the pure terrain normal — and reports how much of that blend
 *     it applied (`rimBlend`). "Within 0.3 m of the patch rim" (rim
 *     vertices: zero offset and outline distance ≥ the lip band W) reduces,
 *     for this radially-defined field, to "outline distance within 0.3 m of
 *     W approaching from inside the band" (distance to the always-zero
 *     region measured along the same nearest-outline direction is exactly
 *     W − q): that needs only the scalar exterior distance, not a search
 *     over the patch's own topology for literal rim vertices.
 *
 * `gradient` reports the raw, *unblended* analytic slope, so a consumer can
 * always recover what the sculpting itself did; the §40 fade is applied
 * only when composing `normals`, and `rimBlend` is how much of it a vertex
 * received.
 *
 * Render-only (constraint 6); canonical heights untouched; deterministic
 * from the compiled patch and the terrain grid (13); three-free (R12). */
import { BUNKER_RING_SPACING, bunkerShape, bunkerSignedDistance, type BunkerHeroProfile, type BunkerRingSpacing, type CompiledBunkerPatch } from './bunker-display-mesh';
import { nearestOnRings, smootherstepSlope } from './bunker-profile';
import type { TerrainMesh } from './terrain';
import { sampleMetricTerrain, type MetricTerrainGrid } from './terrain-source';
import type { PointM } from './types';
import { MERIDIAN_STYLE, type MeridianStyle } from './visual-style';

export interface BunkerNormalFieldOptions {
  style?: MeridianStyle;
  spacing?: BunkerRingSpacing;
  /** §40 blend half-bands, metres: around the outline (the bowl/lip seam at
   * signed distance 0) and around the lip band's outer edge (the seam where
   * the patch settles to its always-zero rim, W = `style.bunker.lipBandM`). */
  outlineBandM?: number;
  rimBandM?: number;
}
export interface BunkerNormalField {
  id: string;
  /** Unit xyz per patch vertex. */
  normals: Float32Array;
  /** d(offset)/dx, d(offset)/dy per vertex, metres per metre — raw, unblended. */
  gradient: Float32Array;
  /** 0–1 terrain-normal blend weight per vertex (§40). */
  rimBlend: Float32Array;
}

/** Terrain slope (dz/dx, dz/dy) by central difference at the source grid's
 * own spacing — the same step `bunkerHeroProfiles`' downhill estimate and
 * `metricTerrainNormal` use, so the derivative reflects the source's native
 * resolution rather than the display mesh's local triangle size. Zero when
 * the grid is absent or any of the four samples falls outside it. */
function terrainSlopeAt(grid: MetricTerrainGrid | null | undefined, point: PointM): readonly [number, number] {
  if (!grid) return [0, 0];
  const h = grid.spacingM;
  const zx0 = sampleMetricTerrain(grid, [point[0] - h, point[1]]), zx1 = sampleMetricTerrain(grid, [point[0] + h, point[1]]);
  const zy0 = sampleMetricTerrain(grid, [point[0], point[1] - h]), zy1 = sampleMetricTerrain(grid, [point[0], point[1] + h]);
  if (zx0 == null || zx1 == null || zy0 == null || zy1 == null) return [0, 0];
  return [(zx1 - zx0) / (2 * h), (zy1 - zy0) / (2 * h)];
}

/** Quintic smootherstep, reused as the §40 blend ramp: 1 at `distance` 0,
 * 0 at `distance` ≥ `band`, C¹ at both ends so the blend itself adds no
 * new seam. */
function smoothBand(distance: number, band: number): number {
  if (band <= 0 || distance >= band) return 0;
  if (distance <= 0) return 1;
  const t = 1 - distance / band;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** §37–39 analytic gradient of the render-only displacement at one point —
 * the same nearest bunker `bunkerDisplacement` (Task 8) would pick — plus
 * the §40 blend weight toward the pure terrain normal. Zero gradient and
 * weight 1 when the patch owns no bunkers. */
function bunkerContribution(point: PointM, profiles: readonly BunkerHeroProfile[], style: MeridianStyle, spacing: BunkerRingSpacing, outlineBandM: number, rimBandM: number): { gx: number; gy: number; weight: number } {
  let best: BunkerHeroProfile | null = null, bestD = -Infinity;
  for (const profile of profiles) {
    const d = bunkerSignedDistance(point, profile);
    if (best == null || d > bestD) { best = profile; bestD = d; }
  }
  if (!best) return { gx: 0, gy: 0, weight: 1 };
  const near = nearestOnRings(point, best.rings).point;
  const dx = point[0] - near[0], dy = point[1] - near[1], length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const w = style.bunker.lipBandM;
  let scalar = 0;
  if (bestD > 0) {
    // §37 bowl: offset = −depth·shape·S(u), u = d/R (clamped): d(offset)/dd = −depth·shape·S'(u)/R.
    const u = Math.min(1, bestD / best.bowlRadiusM);
    scalar = -best.depthM * bunkerShape(point, best, spacing) * smootherstepSlope(u) / best.bowlRadiusM;
  } else {
    // §39 lip: offset = lip·sin²(πq/W), q = −d: d(offset)/dq = lip·(π/W)·sin(2πq/W). No shape factor.
    const q = -bestD;
    if (q > 0 && q < w) scalar = best.lipM * (Math.PI / w) * Math.sin(2 * Math.PI * q / w);
  }
  const outlineWeight = smoothBand(Math.abs(bestD), outlineBandM);
  // Distance to the lip band's outer edge (the "patch rim") measured the
  // same way, only meaningful outside the sand (bestD < 0): W − q.
  const rimWeight = bestD < 0 ? smoothBand(Math.max(0, w + bestD), rimBandM) : 0;
  return { gx: scalar * ux, gy: scalar * uy, weight: Math.max(outlineWeight, rimWeight) };
}

/** Per-vertex normals, raw displacement gradient and §40 rim-blend weight
 * for one compiled bunker-owning hero patch. */
export function compileBunkerNormalField(compiled: CompiledBunkerPatch, mesh: TerrainMesh, options: BunkerNormalFieldOptions = {}): BunkerNormalField {
  const style = options.style ?? MERIDIAN_STYLE, spacing = options.spacing ?? BUNKER_RING_SPACING;
  const outlineBandM = options.outlineBandM ?? .15, rimBandM = options.rimBandM ?? .3;
  const { profiles, patch } = compiled, grid = mesh.metricGrid;
  const vertexCount = patch.positions.length / 3;
  const normals = new Float32Array(vertexCount * 3), gradient = new Float32Array(vertexCount * 2), rimBlend = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const point: PointM = [patch.positions[v * 3]!, patch.positions[v * 3 + 1]!];
    const [tx, ty] = terrainSlopeAt(grid, point);
    const { gx, gy, weight } = bunkerContribution(point, profiles, style, spacing, outlineBandM, rimBandM);
    const nx = -(tx + gx * (1 - weight)), ny = -(ty + gy * (1 - weight)), nz = 1;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[v * 3] = nx / length; normals[v * 3 + 1] = ny / length; normals[v * 3 + 2] = nz / length;
    gradient[v * 2] = gx; gradient[v * 2 + 1] = gy;
    rimBlend[v] = weight;
  }
  return { id: patch.id, normals, gradient, rimBlend };
}

/** Octahedral unit-vector encoding (Cigolle, Donow, Evangelakos, Mara,
 * McGuire, Meyer 2014, "A Survey of Efficient Representations for
 * Independent Unit Vectors"), snorm8x2: 2 bytes per normal instead of 12.
 * Every normal this module produces has a positive z (an upward-facing
 * height field), but the codec is the general one so it round-trips any
 * unit vector — including the pure terrain normals rim-blended vertices
 * carry. */
function octEncode(x: number, y: number, z: number): readonly [number, number] {
  const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let px = x / l1, py = y / l1;
  if (z < 0) {
    const ox = (1 - Math.abs(py)) * (px >= 0 ? 1 : -1), oy = (1 - Math.abs(px)) * (py >= 0 ? 1 : -1);
    px = ox; py = oy;
  }
  return [px, py];
}
function octDecode(ex: number, ey: number): readonly [number, number, number] {
  let x = ex, y = ey;
  const z = 1 - Math.abs(ex) - Math.abs(ey);
  if (z < 0) { const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1), oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1); x = ox; y = oy; }
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}
/** Pack unit xyz triples (as produced by `compileBunkerNormalField`) into
 * snorm8 octahedral pairs, 2 bytes per vertex. */
export function packOctNormals(normals: Float32Array): Int8Array {
  const count = normals.length / 3, packed = new Int8Array(count * 2);
  for (let i = 0; i < count; i++) {
    const [ex, ey] = octEncode(normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!);
    packed[i * 2] = Math.max(-127, Math.min(127, Math.round(ex * 127)));
    packed[i * 2 + 1] = Math.max(-127, Math.min(127, Math.round(ey * 127)));
  }
  return packed;
}
/** Inverse of `packOctNormals`. */
export function unpackOctNormals(packed: Int8Array): Float32Array {
  const count = packed.length / 2, normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = octDecode(packed[i * 2]! / 127, packed[i * 2 + 1]! / 127);
    normals[i * 3] = x; normals[i * 3 + 1] = y; normals[i * 3 + 2] = z;
  }
  return normals;
}

/** Gates on a compiled bunker normal field: buffer lengths agree with the
 * patch's vertex count, every normal is finite and unit length within 1e-3,
 * every gradient component finite, every rim-blend weight inside [0, 1]. */
export function assertBunkerNormalField(field: BunkerNormalField, compiled: CompiledBunkerPatch): void {
  const vertexCount = compiled.patch.positions.length / 3, problems: string[] = [];
  if (field.normals.length !== vertexCount * 3) problems.push(`normals length ${field.normals.length} for ${vertexCount} vertices`);
  if (field.gradient.length !== vertexCount * 2) problems.push(`gradient length ${field.gradient.length} for ${vertexCount} vertices`);
  if (field.rimBlend.length !== vertexCount) problems.push(`rimBlend length ${field.rimBlend.length} for ${vertexCount} vertices`);
  let worstLength = 0;
  for (let v = 0; v < vertexCount; v++) {
    const x = field.normals[v * 3], y = field.normals[v * 3 + 1], z = field.normals[v * 3 + 2];
    if (x == null || y == null || z == null || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { problems.push(`vertex ${v}: non-finite normal`); continue; }
    worstLength = Math.max(worstLength, Math.abs(Math.hypot(x, y, z) - 1));
    const gx = field.gradient[v * 2], gy = field.gradient[v * 2 + 1];
    if (gx == null || gy == null || !Number.isFinite(gx) || !Number.isFinite(gy)) problems.push(`vertex ${v}: non-finite gradient`);
    const weight = field.rimBlend[v];
    if (weight == null || !Number.isFinite(weight) || weight < 0 || weight > 1) problems.push(`vertex ${v}: rim blend ${weight} out of range`);
  }
  if (worstLength > 1e-3) problems.push(`normal length off by up to ${worstLength}`);
  if (problems.length) throw new Error(`Bunker normal field ${field.id} failed: ${problems.slice(0, 8).join('; ')}`);
}
