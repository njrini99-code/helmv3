/** Meridian V2 static shadow bake (V2 plan §68, §71; Task 16).
 *
 * The sun is fixed (TERRAIN_LIGHT_DIRECTION), the terrain and the woods are
 * static, so their broad shadow influence is baked once per hole into an R8
 * ground field and the dynamic shadow map is left to near trees, structures
 * and hero objects (§72). Two occluder categories, one node grid (the metric
 * grid's own layout, or a finer one over the tactical bounds):
 *
 *   terrainShadow  a ray from each node toward the sun, marched over the
 *                  metric grid; the node is lit when the ray clears the
 *                  ground until the grid edge or `reachM`;
 *   canopyShadow   every canopy crown (canopy.ts symbols: the same stylized
 *                  crowns the landscape draws, never individual tree
 *                  observations) as a sphere of stylized radius and height,
 *                  ray–sphere tested along the sun from each node;
 *   combined       their product, blurred with a world-space radius (§71.3).
 *
 * §71: "art-directed static shading — do not call it physically exact".
 * Visual only (constraint 6), deterministic from grid + scene (13); no Z is
 * moved (4). */
import { canopySymbols, crownScale } from './canopy';
import { TERRAIN_LIGHT_DIRECTION, type TerrainMesh } from './terrain';
import { sampleMetricTerrain, type MetricTerrainGrid } from './terrain-source';
import type { HoleScene } from './types';

export interface StaticShadowOptions {
  /** Node spacing in metres (null = the metric grid's own). */
  spacingM: number | null;
  /** How far a terrain ray marches before it counts as lit. */
  reachM: number;
  /** World-space blur radius (§71.3). */
  blurM: number;
  /** Stylized crown: radius = crownBaseRadiusM × crownScale(seed), sphere centre at crownLiftM × radius above ground. */
  crownBaseRadiusM: number;
  crownLiftRatio: number;
}
export const STATIC_SHADOW_OPTIONS: Readonly<StaticShadowOptions> = Object.freeze({ spacingM: null, reachM: 160, blurM: 1.5, crownBaseRadiusM: 4.5, crownLiftRatio: 1.6 });

export interface StaticShadowField {
  originM: readonly [number, number];
  spacingM: number;
  columns: number;
  rows: number;
  /** 0 = shadowed, 255 = lit, node grid row-major from originM. */
  terrainShadow: Uint8Array;
  canopyShadow: Uint8Array;
  combined: Uint8Array;
  sunDirection: readonly [number, number, number];
  crowns: number;
  stats: { shadowedShare: number; canopyShare: number; ms: number };
  basis: 'art_directed_static';
}

/** Terrain self-shadow: 1 lit / 0 shadowed per node, marched along the sun over the source grid. */
function terrainOcclusion(grid: MetricTerrainGrid, layout: { originM: readonly [number, number]; spacingM: number; columns: number; rows: number }, sun: readonly [number, number, number], reachM: number): Uint8Array {
  const out = new Uint8Array(layout.columns * layout.rows).fill(1);
  const horizontal = Math.hypot(sun[0], sun[1]);
  if (horizontal < 1e-6) return out;
  const dx = sun[0] / horizontal, dy = sun[1] / horizontal, rise = sun[2] / horizontal;
  const step = layout.spacingM / 2, steps = Math.ceil(reachM / step);
  let top = -Infinity;
  for (const h of grid.heightsM) if (Number.isFinite(h) && h > top) top = h;
  for (let row = 0; row < layout.rows; row++) for (let column = 0; column < layout.columns; column++) {
    const x0 = layout.originM[0] + column * layout.spacingM, y0 = layout.originM[1] + row * layout.spacingM;
    const z0 = sampleMetricTerrain(grid, [x0, y0]);
    if (z0 == null) continue;
    for (let s = 1; s <= steps; s++) {
      const d = s * step, z = z0 + rise * d;
      if (z > top) break;
      const ground = sampleMetricTerrain(grid, [x0 + dx * d, y0 + dy * d]);
      if (ground == null) break;
      if (ground > z + 0.02) { out[row * layout.columns + column] = 0; break; }
    }
  }
  return out;
}
/** Canopy shadow: a node is shadowed when its sun ray meets any crown sphere. */
function canopyOcclusion(scene: HoleScene, grid: MetricTerrainGrid, layout: { originM: readonly [number, number]; spacingM: number; columns: number; rows: number }, sun: readonly [number, number, number], options: StaticShadowOptions): { shadow: Uint8Array; crowns: number } {
  const out = new Uint8Array(layout.columns * layout.rows).fill(1);
  const crowns: { x: number; y: number; z: number; r: number }[] = [];
  for (const feature of [...scene.features, ...(scene.contextFeatures ?? [])]) {
    if (feature.kind !== 'woods') continue;
    canopySymbols(feature, scene).forEach((point, index) => {
      const ground = sampleMetricTerrain(grid, point);
      if (ground == null) return;
      const r = options.crownBaseRadiusM * crownScale(index);
      crowns.push({ x: point[0], y: point[1], z: ground + options.crownLiftRatio * r, r });
    });
  }
  if (!crowns.length) return { shadow: out, crowns: 0 };
  // Bucket crowns by the ground cell their shadow can reach: a crown at
  // height h throws its shadow up to (h + r) / tan(elevation) away.
  const horizontal = Math.hypot(sun[0], sun[1]), elevation = Math.atan2(sun[2], horizontal);
  const reach = Math.max(...crowns.map(c => (c.z + c.r) / Math.tan(elevation))) + Math.max(...crowns.map(c => c.r));
  const cell = Math.max(layout.spacingM, 4), cols = Math.ceil(layout.columns * layout.spacingM / cell) + 1, rowsB = Math.ceil(layout.rows * layout.spacingM / cell) + 1;
  const buckets = new Map<number, number[]>();
  crowns.forEach((c, i) => {
    const cx = Math.floor((c.x - layout.originM[0]) / cell), cy = Math.floor((c.y - layout.originM[1]) / cell);
    const span = Math.ceil(reach / cell);
    for (let by = cy - span; by <= cy + span; by++) for (let bx = cx - span; bx <= cx + span; bx++) {
      if (bx < 0 || by < 0 || bx >= cols || by >= rowsB) continue;
      const key = by * cols + bx, list = buckets.get(key);
      if (list) list.push(i); else buckets.set(key, [i]);
    }
  });
  for (let row = 0; row < layout.rows; row++) for (let column = 0; column < layout.columns; column++) {
    const x = layout.originM[0] + column * layout.spacingM, y = layout.originM[1] + row * layout.spacingM;
    const z = sampleMetricTerrain(grid, [x, y]);
    if (z == null) continue;
    const list = buckets.get(Math.floor(row * layout.spacingM / cell) * cols + Math.floor(column * layout.spacingM / cell));
    if (!list) continue;
    for (const i of list) {
      const c = crowns[i]!;
      // Ray p(t) = node + t·sun, t ≥ 0; distance from the sphere centre to the ray.
      const ox = c.x - x, oy = c.y - y, oz = c.z - z, t = ox * sun[0] + oy * sun[1] + oz * sun[2];
      if (t < 0) continue;
      const px = ox - t * sun[0], py = oy - t * sun[1], pz = oz - t * sun[2];
      if (px * px + py * py + pz * pz <= c.r * c.r) { out[row * layout.columns + column] = 0; break; }
    }
  }
  return { shadow: out, crowns: crowns.length };
}
/** Separable box blur with a world-space radius, in place on a 0–1 float copy. */
function blur(values: Uint8Array, columns: number, rows: number, radiusNodes: number): Uint8Array {
  if (radiusNodes < 1) return values;
  const a = Float32Array.from(values, v => v / 255), b = new Float32Array(a.length);
  const pass = (src: Float32Array, dst: Float32Array, dc: number, dr: number) => {
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      let sum = 0, count = 0;
      for (let k = -radiusNodes; k <= radiusNodes; k++) {
        const c = column + k * dc, r = row + k * dr;
        if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
        sum += src[r * columns + c]!; count++;
      }
      dst[row * columns + column] = sum / count;
    }
  };
  pass(a, b, 1, 0); pass(b, a, 0, 1);
  return Uint8Array.from(a, v => Math.round(v * 255));
}

export function compileStaticShadowField(mesh: TerrainMesh, scene: HoleScene, options: Partial<StaticShadowOptions> = {}): StaticShadowField {
  const opts = { ...STATIC_SHADOW_OPTIONS, ...options }, began = performance.now();
  const grid = mesh.metricGrid;
  if (!grid) throw new Error('Static shadow field needs the metric terrain grid');
  const sun = TERRAIN_LIGHT_DIRECTION;
  const spacingM = opts.spacingM ?? grid.spacingM;
  const columns = Math.floor((grid.columns - 1) * grid.spacingM / spacingM) + 1, rows = Math.floor((grid.rows - 1) * grid.spacingM / spacingM) + 1;
  const layout = { originM: grid.originM, spacingM, columns, rows };
  const terrain = terrainOcclusion(grid, layout, sun, opts.reachM);
  const canopy = canopyOcclusion(scene, grid, layout, sun, opts);
  const radiusNodes = Math.round(opts.blurM / spacingM);
  const terrainShadow = blur(Uint8Array.from(terrain, v => v * 255), columns, rows, radiusNodes);
  const canopyShadow = blur(Uint8Array.from(canopy.shadow, v => v * 255), columns, rows, radiusNodes);
  const combined = new Uint8Array(columns * rows);
  for (let i = 0; i < combined.length; i++) combined[i] = Math.round(terrainShadow[i]! * canopyShadow[i]! / 255);
  let shadowed = 0, canopyShade = 0;
  for (let i = 0; i < combined.length; i++) { shadowed += 1 - combined[i]! / 255; canopyShade += 1 - canopyShadow[i]! / 255; }
  return {
    originM: layout.originM, spacingM, columns, rows, terrainShadow, canopyShadow, combined, sunDirection: sun, crowns: canopy.crowns,
    stats: { shadowedShare: shadowed / combined.length, canopyShare: canopyShade / combined.length, ms: performance.now() - began }, basis: 'art_directed_static',
  };
}
/** Bilinear sample of a shadow layer, 0–1 (1 lit); null outside the field. */
export function sampleStaticShadow(field: StaticShadowField, x: number, y: number, layer: 'combined' | 'terrainShadow' | 'canopyShadow' = 'combined'): number | null {
  const fx = (x - field.originM[0]) / field.spacingM, fy = (y - field.originM[1]) / field.spacingM;
  const c0 = Math.floor(fx), r0 = Math.floor(fy);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= field.columns || r0 + 1 >= field.rows) return null;
  const values = field[layer], tx = fx - c0, ty = fy - r0;
  const v = (c: number, r: number) => values[r * field.columns + c]! / 255;
  return (v(c0, r0) * (1 - tx) + v(c0 + 1, r0) * tx) * (1 - ty) + (v(c0, r0 + 1) * (1 - tx) + v(c0 + 1, r0 + 1) * tx) * ty;
}
/** A field-atlas layer description for Task 10: R8, 1 = lit. */
export function staticShadowLayer(field: StaticShadowField): { name: 'static_shadow'; originM: readonly [number, number]; spacingM: number; columns: number; rows: number; values: Uint8Array; basis: 'art_directed_static' } {
  return { name: 'static_shadow', originM: field.originM, spacingM: field.spacingM, columns: field.columns, rows: field.rows, values: field.combined, basis: 'art_directed_static' };
}
export function assertStaticShadowField(field: StaticShadowField): void {
  const n = field.columns * field.rows, problems: string[] = [];
  if (field.terrainShadow.length !== n || field.canopyShadow.length !== n || field.combined.length !== n) problems.push('layer sizes');
  if (!(field.spacingM > 0) || field.columns < 2 || field.rows < 2) problems.push('layout');
  if (!(field.stats.shadowedShare >= 0 && field.stats.shadowedShare <= 1)) problems.push('share');
  if (Math.abs(Math.hypot(...field.sunDirection) - 1) > 1e-3) problems.push('sun');
  if (problems.length) throw new Error(`Static shadow field failed: ${problems.join('; ')}`);
}
