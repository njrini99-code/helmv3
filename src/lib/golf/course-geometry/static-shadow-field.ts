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
  /** The crowns actually drawn (forest-edge-v2.ts instances: ground x/y/z,
   * crown radius `scale`, `heightM`), when the caller has them — then the
   * bake shadows exactly those trees instead of V1's canopy symbols. */
  crowns?: readonly { x: number; y: number; z: number; scale: number; heightM: number }[] | null;
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
  for (const h of grid.heightsM) if (h != null && Number.isFinite(h) && h > top) top = h;
  // The march samples the grid millions of times per hole: this is
  // `sampleMetricTerrain` inlined (same arithmetic, same null rules) without
  // the per-call point tuple, which was most of the compile's garbage.
  const { columns, rows, spacingM, heightsM } = grid, ox = grid.originM[0], oy = grid.originM[1];
  const sample = (x: number, y: number): number | null => {
    const gx = (x - ox) / spacingM, gy = (y - oy) / spacingM;
    if (gx < 0 || gy < 0 || gx > columns - 1 || gy > rows - 1) return null;
    const ix = Math.min(Math.floor(gx), columns - 2), iy = Math.min(Math.floor(gy), rows - 2);
    const fx = gx - ix, fy = gy - iy, i = iy * columns + ix;
    const a = heightsM[i], b = heightsM[i + 1], c = heightsM[i + columns], d = heightsM[i + columns + 1];
    if (a == null || b == null || c == null || d == null) return null;
    return (1 - fx) * ((1 - fy) * a + fy * c) + fx * ((1 - fy) * b + fy * d);
  };
  for (let row = 0; row < layout.rows; row++) for (let column = 0; column < layout.columns; column++) {
    const x0 = layout.originM[0] + column * layout.spacingM, y0 = layout.originM[1] + row * layout.spacingM;
    const z0 = sample(x0, y0);
    if (z0 == null) continue;
    for (let s = 1; s <= steps; s++) {
      const d = s * step, z = z0 + rise * d;
      if (z > top) break;
      const ground = sample(x0 + dx * d, y0 + dy * d);
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
  if (options.crowns) {
    // The drawn crown (three-world-v2-objects.ts): centre at .64 h, radius
    // as placed — the same sphere the renderer's own silhouette fills.
    for (const c of options.crowns) crowns.push({ x: c.x, y: c.y, z: c.z + c.heightM * .64, r: c.scale });
  } else for (const feature of [...scene.features, ...(scene.contextFeatures ?? [])]) {
    if (feature.kind !== 'woods') continue;
    canopySymbols(feature, scene).forEach((point, index) => {
      const ground = sampleMetricTerrain(grid, point);
      if (ground == null) return;
      const r = options.crownBaseRadiusM * crownScale(index);
      crowns.push({ x: point[0], y: point[1], z: ground + options.crownLiftRatio * r, r });
    });
  }
  if (!crowns.length) return { shadow: out, crowns: 0 };
  // Bucket crowns by the ground cells their shadow can reach. A node is
  // shadowed only if its sun ray meets the sphere, so the footprint of a
  // crown's shadow is a strip running down-sun from the crown: at most
  // (crown top − lowest ground) / tan(elevation) long plus the radius, and
  // no wider than the radius either side. (Heights are absolute metres, so
  // the earlier "(z + r) / tan" reach was the whole hole and every node
  // tested every crown.) The strip is a conservative bound, so the
  // per-node test below sees every crown that can shadow it.
  const horizontal = Math.hypot(sun[0], sun[1]), elevation = Math.atan2(sun[2], horizontal);
  let lowest = Infinity;
  for (const h of grid.heightsM) if (h != null && h < lowest) lowest = h;
  if (!Number.isFinite(lowest)) return { shadow: out, crowns: crowns.length };
  const hx = sun[0] / horizontal, hy = sun[1] / horizontal, tanElevation = Math.tan(elevation);
  const cell = Math.max(layout.spacingM, 4), cols = Math.ceil(layout.columns * layout.spacingM / cell) + 1, rowsB = Math.ceil(layout.rows * layout.spacingM / cell) + 1;
  const buckets = new Map<number, number[]>();
  const stamp = new Int32Array(cols * rowsB).fill(-1);
  crowns.forEach((c, i) => {
    const along = Math.max(0, c.z - lowest + c.r) / tanElevation + c.r, half = c.r + cell;
    for (let s = 0; ; s += cell / 2) {
      const d = Math.min(s, along), px = c.x - hx * d, py = c.y - hy * d;
      const x0 = Math.max(0, Math.floor((px - half - layout.originM[0]) / cell)), x1 = Math.min(cols - 1, Math.floor((px + half - layout.originM[0]) / cell));
      const y0 = Math.max(0, Math.floor((py - half - layout.originM[1]) / cell)), y1 = Math.min(rowsB - 1, Math.floor((py + half - layout.originM[1]) / cell));
      for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) {
        const key = by * cols + bx;
        if (stamp[key] === i) continue;
        stamp[key] = i;
        const list = buckets.get(key);
        if (list) list.push(i); else buckets.set(key, [i]);
      }
      if (s >= along) break;
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
