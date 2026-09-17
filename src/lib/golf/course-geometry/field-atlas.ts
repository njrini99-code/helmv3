/** Meridian V2 field atlas packer (V2 plan §16–19, §108; Task 10).
 *
 * A field atlas is one grid of shading fields over a hole's context bounds,
 * resampled from the source-derived per-node fields (terrain-curvature.ts,
 * terrain-sky-field.ts) and the semantic boundary distances
 * (surface-distance-field.ts) onto one shared texel grid, so the ground
 * shader (Task 11) can sample every field at the same (x, y) with one set of
 * texture coordinates. Layers, per §18:
 *
 *   reliefRGBA16F  R = dz/dx, G = dz/dy (terrain gradient, m/m)
 *                  B = landform curvature, normalized −1…+1 (terrain-curvature.ts)
 *                  A = sky visibility, 0…1 (terrain-sky-field.ts)
 *   bentRGBA8      R,G = bent-normal XY, −1…+1 (terrain-sky-field.ts)
 *                  B   = exposure, 0…1 (terrain-sky-field.ts)
 *                  A   = static shadow, 0…1; packed 1 (no shadow) until
 *                        Task 16 supplies a field (progress ledger note)
 *   semanticRGBA8  R = which tracked surface contains this texel: 0 none
 *                  (open ground/rough), else 1 + SURFACE_DISTANCE_LAYERS
 *                  index (green/bunker/fairway/path/water), ties broken by
 *                  that array's order
 *                  G = nearest tracked boundary: SURFACE_DISTANCE_LAYERS index
 *                  of whichever of the five has the smallest |distance|
 *                  B = that nearest boundary's |distance|, metres, 0…16 clamped
 *                  A = 1 outside the hole's own tactical bounds
 *                  (renderProfile.tacticalBoundsM), 0 inside — a context mask,
 *                  not a material id
 *   sdfLayers      the same five signed-distance fields
 *                  (surface-distance-field.ts), one Uint16 layer each, so a
 *                  fragment can blend a crisp edge Task 11's semantic R/G/B
 *                  only approximates at texel resolution
 *
 * Encoding contract (read this before wiring a DataTexture or a shader):
 * every array here is fixed-point, NOT an IEEE half float, despite
 * `reliefRGBA16F`'s name inherited from the plan's texture-format shorthand
 * (§18) — hand-rolled half-float bit-twiddling is a correctness risk this
 * packer does not take. Decode with `sampleFieldAtlas`, or by hand:
 *   16-bit signed  code 1…65535, zero at 32768, ±rangeM at the ends
 *                  (identical convention to surface-distance-field.ts's
 *                  SDF_ZERO/quantizeSignedDistance): value = (code − 32768) × rangeM / 32767
 *   16-bit unsigned code 0…65535 over 0…maxValue: value = code / 65535 × maxValue
 *   8-bit signed   code 1…255, zero at 128: value = (code − 128) × rangeM / 127
 *   8-bit unsigned code 0…255 over 0…maxValue: value = code / 255 × maxValue
 *   semantic R/G   raw small integers (0…5), not scaled — a category id, not a fraction
 * Ranges: relief dz/dx, dz/dy → RELIEF_SLOPE_RANGE_M (±8 m/m); curvature →
 * ±1 (already normalized); sky visibility, exposure, static shadow, context
 * mask → 0…1; bent XY → ±1; semantic boundary distance → BOUNDARY_DISTANCE_RANGE_M
 * (16 m); sdf layers → SDF_RANGE_M (64 m, surface-distance-field.ts).
 *
 * Resampling: dz/dx and dz/dy are recomputed per texel by central difference
 * on the metric grid at the grid's own spacing (mirrors
 * `metricTerrainNormal`'s step; a finer step would only re-interpolate the
 * same bilinear patch, not add resolution). Curvature, sky visibility, bent
 * XY and exposure are bilinear-resampled from their own grid-shaped arrays.
 * A texel the metric grid cannot answer (outside its extent) reads 0 for
 * every relief/bent channel — unsupported, never invented (constraint 15).
 *
 * Only the whole-hole atlas is built here (`fields.wholeHole`); hero field
 * atlases (`fields.heroes`, §17's finer per-patch grids) are deliberately
 * left `[]` by compile-visual-artifact-v2.ts — nothing has content for them
 * yet (Task 9's bunker gradient is the first candidate) and packing one per
 * hero patch today would multiply an already phone-budget-reported artifact
 * for no consumer. `compileFieldAtlas` takes any bounds, so a later task
 * fills `fields.heroes` by calling it again per patch.
 *
 * Visual only (constraint 6): every layer shades; nothing here is picked,
 * measured or fed to lie truth or analytics. Deterministic from the scene
 * and mesh alone (13); three-free (R12). */
import { buildSurfaceDistanceLayers, quantizeSignedDistance, dequantizeSignedDistance, SDF_RANGE_M, type SurfaceDistanceLayer } from './surface-distance-field';
import { compileCurvatureFields, type CurvatureFields } from './terrain-curvature';
import { compileSkyField, type SkyField } from './terrain-sky-field';
import { sampleMetricTerrain, type MetricTerrainGrid } from './terrain-source';
import type { TerrainMesh } from './terrain';
import type { HoleScene } from './types';
import { MAX_FIELD_ATLAS_SIZE, type PackedFieldAtlas } from './visual-artifact-v2';

export interface FieldAtlasOptions {
  /** Target texel count along the longer bound axis (§17 ≈512); the other
   * axis follows the same texel size, capped at MAX_FIELD_ATLAS_SIZE. */
  targetSize: number;
}
export const FIELD_ATLAS_OPTIONS: Readonly<FieldAtlasOptions> = Object.freeze({ targetSize: 512 });
export const RELIEF_SLOPE_RANGE_M = 8;
export const BOUNDARY_DISTANCE_RANGE_M = 16;

export type FieldAtlasChannel = 'dzdx' | 'dzdy' | 'curvature' | 'skyVisibility' | 'bentX' | 'bentY' | 'exposure' | 'staticShadow'
  | 'surfaceClass' | 'nearestBoundaryClass' | 'boundaryDistance' | 'contextMask' | SurfaceDistanceLayer;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const encodeSigned16 = (value: number, rangeM: number): number => Math.max(1, Math.min(65535, Math.round(32768 + clamp(value, -rangeM, rangeM) * 32767 / rangeM)));
const decodeSigned16 = (code: number, rangeM: number): number => (code - 32768) * rangeM / 32767;
const encodeUnsigned16 = (value: number, maxValue: number): number => Math.max(0, Math.min(65535, Math.round(clamp(value, 0, maxValue) / maxValue * 65535)));
const decodeUnsigned16 = (code: number, maxValue: number): number => code / 65535 * maxValue;
const encodeSigned8 = (value: number, rangeM: number): number => Math.max(1, Math.min(255, Math.round(128 + clamp(value, -rangeM, rangeM) * 127 / rangeM)));
const decodeSigned8 = (code: number, rangeM: number): number => (code - 128) * rangeM / 127;
const encodeUnsigned8 = (value: number, maxValue: number): number => Math.max(0, Math.min(255, Math.round(clamp(value, 0, maxValue) / maxValue * 255)));
const decodeUnsigned8 = (code: number, maxValue: number): number => code / 255 * maxValue;

/** Texel grid dimensions for `boundsM` at `targetSize` texels along the
 * longer axis, uniform texel size on both axes, capped at MAX_FIELD_ATLAS_SIZE. */
function atlasSize(boundsM: readonly [number, number, number, number], targetSize: number): { width: number; height: number } {
  const width = boundsM[2] - boundsM[0], height = boundsM[3] - boundsM[1], scale = targetSize / Math.max(1e-6, Math.max(width, height));
  return { width: Math.min(MAX_FIELD_ATLAS_SIZE, Math.max(1, Math.round(width * scale))), height: Math.min(MAX_FIELD_ATLAS_SIZE, Math.max(1, Math.round(height * scale))) };
}
/** One component of an interleaved grid-shaped array (terrain-sky-field.ts's `bentXY`). */
function componentOf(interleaved: Float32Array, stride: number, index: number): Float32Array {
  const count = interleaved.length / stride, out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = interleaved[i * stride + index]!;
  return out;
}
/** Bilinear sample of a grid-shaped field aligned 1:1 with `grid` (same
 * columns/rows/spacing/origin — terrain-curvature.ts and terrain-sky-field.ts
 * both produce these). null outside the grid's own extent. */
function sampleGridField(grid: MetricTerrainGrid, field: Float32Array, x: number, y: number): number | null {
  const gx = (x - grid.originM[0]) / grid.spacingM, gy = (y - grid.originM[1]) / grid.spacingM;
  if (gx < 0 || gy < 0 || gx > grid.columns - 1 || gy > grid.rows - 1) return null;
  const ix = Math.min(Math.floor(gx), grid.columns - 2), iy = Math.min(Math.floor(gy), grid.rows - 2);
  const fx = gx - ix, fy = gy - iy, i = iy * grid.columns + ix;
  const a = field[i]!, b = field[i + 1]!, c = field[i + grid.columns]!, d = field[i + grid.columns + 1]!;
  return (1 - fx) * ((1 - fy) * a + fy * c) + fx * ((1 - fy) * b + fy * d);
}
/** Raw terrain gradient at a point (mirrors `metricTerrainNormal`'s central
 * difference at the grid's own spacing, returning dz/dx, dz/dy rather than
 * the normalized normal). null where the grid cannot answer. */
function terrainGradient(grid: MetricTerrainGrid, x: number, y: number): readonly [number, number] | null {
  const step = grid.spacingM, z = sampleMetricTerrain(grid, [x, y]);
  if (z == null) return null;
  const l = sampleMetricTerrain(grid, [x - step, y]), r = sampleMetricTerrain(grid, [x + step, y]);
  const b = sampleMetricTerrain(grid, [x, y - step]), t = sampleMetricTerrain(grid, [x, y + step]);
  const dzdx = l != null && r != null ? (r - l) / (2 * step) : r != null ? (r - z) / step : l != null ? (z - l) / step : null;
  const dzdy = b != null && t != null ? (t - b) / (2 * step) : t != null ? (t - z) / step : b != null ? (z - b) / step : null;
  return dzdx == null || dzdy == null ? null : [dzdx, dzdy];
}

/** Precomputed source fields, so `compileVisualArtifactV2` can build several
 * atlases (whole-hole, later per-patch) from one curvature/sky compile. */
export interface FieldAtlasSources { curvature?: CurvatureFields | null; sky?: SkyField | null }

/** Compile the field atlas over `boundsM` (plan §17: the whole-hole atlas
 * uses the hole's context bounds; a future per-patch atlas would pass the
 * patch's own `boundsM`). Deterministic from `scene` + `mesh` + `boundsM`. */
export function compileFieldAtlas(scene: HoleScene, mesh: TerrainMesh, boundsM: readonly [number, number, number, number],
  options: Partial<FieldAtlasOptions> = {}, sources: FieldAtlasSources = {}): PackedFieldAtlas {
  const opts = { ...FIELD_ATLAS_OPTIONS, ...options };
  const [x0, y0, x1, y1] = boundsM;
  if (!(x1 > x0 && y1 > y0)) throw new Error('Field atlas needs ordered, nondegenerate bounds');
  const { width, height } = atlasSize(boundsM, opts.targetSize), texels = width * height;
  const texelM: [number, number] = [(x1 - x0) / width, (y1 - y0) / height];
  const at = (col: number, row: number): [number, number] => [x0 + (col + .5) * texelM[0], y0 + (row + .5) * texelM[1]];

  const sdf = buildSurfaceDistanceLayers(scene, { boundsM: [x0, y0, x1, y1] }, { width, height }, SDF_RANGE_M);
  const sdfData = new Uint16Array(texels * sdf.layers.length);
  sdf.layers.forEach((layer, k) => sdfData.set(quantizeSignedDistance(layer.distanceM, SDF_RANGE_M), k * texels));

  const clip = mesh.renderProfile?.tacticalBoundsM;
  const semanticRGBA8 = new Uint8Array(texels * 4);
  for (let n = 0; n < texels; n++) {
    let bestClass = 0, bestClassD = -Infinity, bestNear = 0, bestNearD = Infinity;
    for (let k = 0; k < sdf.layers.length; k++) {
      const d = sdf.layers[k]!.distanceM[n]!;
      if (d > bestClassD) { bestClassD = d; bestClass = k + 1; }
      if (Math.abs(d) < bestNearD) { bestNearD = Math.abs(d); bestNear = k; }
    }
    const [x, y] = at(n % width, Math.floor(n / width));
    const outside = clip ? !(x >= clip[0]! && y >= clip[1]! && x <= clip[2]! && y <= clip[3]!) : false;
    semanticRGBA8[n * 4] = bestClassD > 0 ? bestClass : 0;
    semanticRGBA8[n * 4 + 1] = bestNear;
    semanticRGBA8[n * 4 + 2] = encodeUnsigned8(bestNearD, BOUNDARY_DISTANCE_RANGE_M);
    semanticRGBA8[n * 4 + 3] = outside ? 255 : 0;
  }

  const grid = mesh.metricGrid;
  const curvature = sources.curvature !== undefined ? sources.curvature : grid ? compileCurvatureFields(grid) : null;
  const sky = sources.sky !== undefined ? sources.sky : grid ? compileSkyField(grid) : null;
  const bentXField = sky ? componentOf(sky.bentXY, 2, 0) : null, bentYField = sky ? componentOf(sky.bentXY, 2, 1) : null;
  const reliefRGBA16F = new Uint16Array(texels * 4), bentRGBA8 = new Uint8Array(texels * 4);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const n = row * width + col, [x, y] = at(col, row);
    let dzdx = 0, dzdy = 0, curv = 0, visibility = 1, bentX = 0, bentY = 0, exposure = 0;
    if (grid) {
      const gradient = terrainGradient(grid, x, y);
      if (gradient) { dzdx = gradient[0]; dzdy = gradient[1]; }
      if (curvature) curv = sampleGridField(grid, curvature.landformNormalized, x, y) ?? 0;
      if (sky) {
        visibility = sampleGridField(grid, sky.visibility, x, y) ?? 1;
        exposure = sampleGridField(grid, sky.exposure, x, y) ?? 0;
        bentX = sampleGridField(grid, bentXField!, x, y) ?? 0;
        bentY = sampleGridField(grid, bentYField!, x, y) ?? 0;
      }
    }
    reliefRGBA16F[n * 4] = encodeSigned16(dzdx, RELIEF_SLOPE_RANGE_M);
    reliefRGBA16F[n * 4 + 1] = encodeSigned16(dzdy, RELIEF_SLOPE_RANGE_M);
    reliefRGBA16F[n * 4 + 2] = encodeSigned16(curv, 1);
    reliefRGBA16F[n * 4 + 3] = encodeUnsigned16(visibility, 1);
    bentRGBA8[n * 4] = encodeSigned8(bentX, 1);
    bentRGBA8[n * 4 + 1] = encodeSigned8(bentY, 1);
    bentRGBA8[n * 4 + 2] = encodeUnsigned8(exposure, 1);
    bentRGBA8[n * 4 + 3] = 255; // static shadow: no field until Task 16.
  }

  return { width, height, boundsM: [x0, y0, x1, y1], reliefRGBA16F, bentRGBA8, semanticRGBA8, sdfLayers: { layerNames: [...sdf.layerNames], data: sdfData }, basis: 'source_derived_visual' };
}

interface ChannelSource { data: ArrayLike<number>; stride: number; offset: number; decode: (code: number) => number }
function channelSource(atlas: PackedFieldAtlas, channel: FieldAtlasChannel): ChannelSource | null {
  switch (channel) {
    case 'dzdx': return { data: atlas.reliefRGBA16F, stride: 4, offset: 0, decode: c => decodeSigned16(c, RELIEF_SLOPE_RANGE_M) };
    case 'dzdy': return { data: atlas.reliefRGBA16F, stride: 4, offset: 1, decode: c => decodeSigned16(c, RELIEF_SLOPE_RANGE_M) };
    case 'curvature': return { data: atlas.reliefRGBA16F, stride: 4, offset: 2, decode: c => decodeSigned16(c, 1) };
    case 'skyVisibility': return { data: atlas.reliefRGBA16F, stride: 4, offset: 3, decode: c => decodeUnsigned16(c, 1) };
    case 'bentX': return { data: atlas.bentRGBA8, stride: 4, offset: 0, decode: c => decodeSigned8(c, 1) };
    case 'bentY': return { data: atlas.bentRGBA8, stride: 4, offset: 1, decode: c => decodeSigned8(c, 1) };
    case 'exposure': return { data: atlas.bentRGBA8, stride: 4, offset: 2, decode: c => decodeUnsigned8(c, 1) };
    case 'staticShadow': return { data: atlas.bentRGBA8, stride: 4, offset: 3, decode: c => decodeUnsigned8(c, 1) };
    case 'surfaceClass': return { data: atlas.semanticRGBA8, stride: 4, offset: 0, decode: c => c };
    case 'nearestBoundaryClass': return { data: atlas.semanticRGBA8, stride: 4, offset: 1, decode: c => c };
    case 'boundaryDistance': return { data: atlas.semanticRGBA8, stride: 4, offset: 2, decode: c => decodeUnsigned8(c, BOUNDARY_DISTANCE_RANGE_M) };
    case 'contextMask': return { data: atlas.semanticRGBA8, stride: 4, offset: 3, decode: c => decodeUnsigned8(c, 1) };
    default: {
      const layers = atlas.sdfLayers, index = layers?.layerNames.indexOf(channel) ?? -1;
      if (!layers || index < 0) return null;
      const texels = atlas.width * atlas.height;
      return { data: layers.data.subarray(index * texels, (index + 1) * texels), stride: 1, offset: 0, decode: c => dequantizeSignedDistance(c, SDF_RANGE_M) };
    }
  }
}
/** Bilinear sample of one decoded channel at world point (x, y); null outside
 * `atlas.boundsM`. Texel centres follow surface-distance-field.ts's own
 * convention ((col + .5) × texelWidth from the west bound), so a field atlas
 * and its sdf layers agree on where a texel sits. For tests and the runtime
 * (three-free: the runtime samples this from CPU-side data before a
 * DataTexture exists, or to check a shader's numbers against ground truth). */
export function sampleFieldAtlas(atlas: PackedFieldAtlas, channel: FieldAtlasChannel, x: number, y: number): number | null {
  const [x0, y0, x1, y1] = atlas.boundsM;
  if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return null;
  const source = channelSource(atlas, channel);
  if (!source) return null;
  const { width, height } = atlas, texelW = (x1 - x0) / width, texelH = (y1 - y0) / height;
  const gx = (x - x0) / texelW - .5, gy = (y - y0) / texelH - .5;
  const ix0 = Math.min(Math.max(Math.floor(gx), 0), width - 1), iy0 = Math.min(Math.max(Math.floor(gy), 0), height - 1);
  const ix1 = Math.min(ix0 + 1, width - 1), iy1 = Math.min(iy0 + 1, height - 1);
  // Weights relative to the CLAMPED cell (GPU clamp-to-edge bilinear): at
  // the first texel's centre a rounding hair below 0 (gx = -5e-14) must
  // read texel 0, not — via floor(gx) = -1 and a weight of ~1 — texel 1.
  const fx = clamp(gx - ix0, 0, 1), fy = clamp(gy - iy0, 0, 1);
  const texel = (ix: number, iy: number) => source.data[(iy * width + ix) * source.stride + source.offset]!;
  const code = (1 - fx) * ((1 - fy) * texel(ix0, iy0) + fy * texel(ix0, iy1)) + fx * ((1 - fy) * texel(ix1, iy0) + fy * texel(ix1, iy1));
  return source.decode(code);
}
/** One whole channel decoded per texel, in the atlas's own row-major texel
 * order (row 0 = the south bound, `sampleFieldAtlas`'s convention) — the
 * exact numbers that function bilinearly interpolates, before any
 * interpolation. For a runtime uploading a channel as a texture
 * (three-world-v2.ts's relief texture): the packed codes are fixed-point
 * (`encodeSigned16`/`encodeUnsigned16` above), not IEEE half floats, so a
 * texture must carry the decoded values, never the raw `Uint16Array`.
 * null for an SDF layer the atlas never packed. */
export function fieldAtlasChannelTexels(atlas: PackedFieldAtlas, channel: FieldAtlasChannel): Float32Array | null {
  const source = channelSource(atlas, channel);
  if (!source) return null;
  const texels = atlas.width * atlas.height, out = new Float32Array(texels);
  for (let n = 0; n < texels; n++) out[n] = source.decode(source.data[n * source.stride + source.offset]!);
  return out;
}
/** Total packed bytes of an atlas (the §94 texture budget line). */
export function fieldAtlasBytes(atlas: PackedFieldAtlas): number {
  return atlas.reliefRGBA16F.byteLength + atlas.bentRGBA8.byteLength + atlas.semanticRGBA8.byteLength + (atlas.sdfLayers?.data.byteLength ?? 0);
}
