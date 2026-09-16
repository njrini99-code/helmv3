/** Meridian visual kit (§112–114): every renderer constant that is a taste
 * decision, in one frozen object. Changing a value here changes `styleHash`,
 * which is part of the visual artifact key, the residency cache path, and
 * every capture's telemetry. Nothing in this module describes a measured
 * surface condition; it is art direction only. The prose reference is
 * docs/design/meridian-visual-language.md. */

export const MERIDIAN_STYLE_VERSION = 'meridian-v8';

export type MeridianPaletteKey = 'ground' | 'rough' | 'fairway' | 'green' | 'tee' | 'bunker' | 'water' | 'woods' |
  'surround' | 'fringe' | 'tree' | 'treeLight' | 'treeHighlight' | 'treeShadow' | 'sandEdge' | 'sandHighlight' |
  'roughSecondary' | 'roughOuter' | 'native' | 'apron' | 'openField' | 'wetland' | 'parking' | 'skiSlope' | 'recreation' | 'bufferGrass';

/** sRGB surface albedos, separate from Fairway's application UI tokens. No
 * directional illumination is baked into these colours (§56 hierarchy:
 * green → tee → fairway → fringe → surround → rough/ground → woods). */
export const MERIDIAN_PALETTE: Readonly<Record<MeridianPaletteKey, string>> = Object.freeze({
  ground: '#607D3D', rough: '#607D3D', surround: '#73964A', fringe: '#82A552',
  fairway: '#83A849', tee: '#88AD55', green: '#9DBB61', bunker: '#DED1AA',
  water: '#3B6C77', woods: '#29482B', tree: '#59852E', treeLight: '#6D9D37',
  treeHighlight: '#83B542', treeShadow: '#29482B',
  sandEdge: '#B3A079', sandHighlight: '#F0E4C7',
  // Rough hierarchy (outside-world §21) and classified ground zones (§10–12,
  // §16): every non-playing region gets a named tone instead of one green.
  roughSecondary: '#5A7638', roughOuter: '#526D35', native: '#7B8748', apron: '#86AA4E',
  openField: '#6C8A44', wetland: '#4E6A44', parking: '#7E7C77', skiSlope: '#6E8E4B', recreation: '#6F8E48', bufferGrass: '#65813E',
});

export const MERIDIAN_STYLE = Object.freeze({
  version: MERIDIAN_STYLE_VERSION,
  palette: MERIDIAN_PALETTE,
  /** §46–49: one world sun. Direction lives in terrain.ts (it is also the
   * vector-fallback light); intensity, colour and sky are style. */
  light: Object.freeze({ sunColor: '#FFF4E2', sunIntensity: 2.05, skyColor: '#CFE0FF', groundColor: '#5C7050',
    hemisphereIntensity: 1.05, exposure: 1.02, sunElevationDeg: 45 }),
  shadow: Object.freeze({ mapSize: 2048, bias: -.00008, normalBias: .18, radius: 2, type: 'pcf' as const }),
  /** §17–21: world-space turf variation. Wavelengths in metres; amplitudes are
   * fractions of albedo luminance. Macro never exceeds 3%, micro 1.2%. */
  turf: Object.freeze({
    macro: Object.freeze({ wavelengthsM: [28, 44, 66] as const, amplitude: .025 }),
    micro: Object.freeze({ wavelengthsM: [.4, 1.2] as const, amplitude: .012 }),
    /** Micro detail fades once its phase changes faster than this per pixel. */
    microFadeFwidth: [.35, .9] as const,
    /** Greens keep a tighter, quieter micro field (§23) and never show macro at Top. */
    greenMicroScale: .55, greenMacroScale: .4,
  }),
  /** §22: mowing bands run along the play line in route-local coordinates
   * (s along the route, t lateral); a small skew keeps them from reading as a
   * ruler. Bands fade before the fairway edge (§22.3). */
  mowing: Object.freeze({ bandWidthM: 6.5, amplitude: .03, skew: .16, edgeFadeM: 3.5, fadeFwidth: [.3, .7] as const }),
  /** §25: boundary softness. A short albedo lip inside every feature edge so
   * a colour step never lands on one pixel; ribbons (§25.1) keep their
   * compiler width, fields (§25.2) soften over `fieldM`. */
  boundary: Object.freeze({ fieldM: .6, shade: .05, sandShade: .12 }),
  /** §23–24: per-surface roughness (MeshStandard) and collar blend. */
  surface: Object.freeze({ roughness: Object.freeze({ green: .78, tee: .88, fairway: .92, fringe: .93, surround: .95, rough: .97, ground: .97,
    // Water keeps a rough, glare-free surface until the V5 static-Fresnel material.
    woods: 1, bunker: .82, water: .32,
    rough_secondary: .97, rough_outer: .98, native: .98, apron: .92, open_field: .97, wetland: .9, parking: .9, ski_slope: .97, recreation: .95, buffer_grass: .96 }),
    collarMix: .5, woodsUnderstoryMix: .78 }),
  /** Outside-world §21: rough is a hierarchy by distance from the nearest
   * playing surface, never one flat green. Primary rough within `secondaryM`,
   * secondary to `outerM`, outer beyond; albedo blends over `±blendM` so no
   * band edge lands on one pixel. Outer rough carries a larger macro field and
   * steep non-playing ground darkens a little (slope only, never aspect, so no
   * directional light is baked into albedo). */
  roughHierarchy: Object.freeze({ secondaryM: 10, secondaryBlendM: 3, outerM: 28, outerBlendM: 6, outerMacroScale: 1.6,
    slopeDarken: .12, slopeFullAt: .45, groundZoneBlendM: 1.5 }),
  /** §53: context features keep their real surface but drop toward rough and
   * lose saturation; nearer context loses less than far context. */
  context: Object.freeze({ roughMix: .58, desaturate: .15, treeDesaturate: .3, treeDarken: .08, weightNear: .6, weightFar: .4 }),
  /** §28–32: render-only bunker bowl. Depth by size class (metres, chosen
   * deterministically inside the range per feature id); the bowl reaches full
   * depth at `bowlRadiusFraction` of the bunker's inradius, clamped to
   * `bowlRadiusM`; context bunkers are shallower; the floor darkens a little
   * with depth and the turf within `contactBandM` of the rim darkens too. */
  bunker: Object.freeze({ depthM: Object.freeze({ small: [.30, .45] as const, medium: [.45, .70] as const, large: [.60, .90] as const }),
    smallAreaM2: 60, largeAreaM2: 260, bowlRadiusM: [.6, 3.5] as const, bowlRadiusFraction: .85, contextDepthScale: .6,
    floorShade: .08, contactBandM: .6, contactShade: .22, sandGrainM: [.15, .35] as const, sandGrainAmplitude: .015 }),
  /** §35–41: seven silhouette families over the authored crown atlas. Each
   * family sets proportion, colour and where it may stand: `edge` families
   * only within `edgeBandM` of the woods boundary (what a golfer sees),
   * `interior` families only beyond it, `any` everywhere. Trunks are drawn
   * only within `trunkBandM` of the camera focus; beyond the edge band a
   * forest is carried by the mass layer rather than by more crowns. */
  vegetation: Object.freeze({
    crownBudget: 720, tileM: 64, trunkBandM: 150, edgeBandM: 24,
    families: Object.freeze([
      Object.freeze({ id: 'broad-oak', designs: ['staggered-shoulders', 'broad-low-cluster'] as const, weight: 3, placement: 'any' as const,
        radius: [1.15, 1.5] as const, heightRatio: [2.0, 2.4] as const, trunkRatio: .055, base: '#4F7F2C', light: '#79A83C' }),
      Object.freeze({ id: 'maple-dome', designs: ['scalloped-dome', 'offset-crest'] as const, weight: 3, placement: 'any' as const,
        radius: [.9, 1.2] as const, heightRatio: [2.4, 2.8] as const, trunkRatio: .05, base: '#5D8A2E', light: '#8DB544' }),
      Object.freeze({ id: 'tall-poplar', designs: ['stepped-spire'] as const, weight: 1.5, placement: 'any' as const,
        radius: [.65, .85] as const, heightRatio: [3.4, 4.2] as const, trunkRatio: .06, base: '#4C7D33', light: '#6F9E45' }),
      Object.freeze({ id: 'pine-spire', designs: ['stepped-spire', 'asymmetric-tier'] as const, weight: 2, placement: 'any' as const,
        radius: [.8, 1.0] as const, heightRatio: [3.0, 3.6] as const, trunkRatio: .05, base: '#3A6A3A', light: '#4C8046' }),
      Object.freeze({ id: 'young-tree', designs: ['uneven-fork', 'swept-shoulder'] as const, weight: 2, placement: 'edge' as const,
        radius: [.55, .8] as const, heightRatio: [2.2, 2.6] as const, trunkRatio: .06, base: '#6C9A34', light: '#98C34C' }),
      Object.freeze({ id: 'shrub-cluster', designs: ['broad-low-cluster'] as const, weight: 1.5, placement: 'edge' as const,
        radius: [.7, 1.0] as const, heightRatio: [1.2, 1.6] as const, trunkRatio: 0, base: '#5B7E2F', light: '#7FA23C' }),
      Object.freeze({ id: 'forest-body', designs: ['swept-shoulder', 'offset-crest', 'asymmetric-tier'] as const, weight: 3, placement: 'interior' as const,
        radius: [1.2, 1.6] as const, heightRatio: [2.2, 2.6] as const, trunkRatio: .05, base: '#37582C', light: '#4E7335' }),
    ]),
    /** Crowns within this distance of the woods edge lean toward the family's lit colour (§40). */
    edgeLightM: 12, edgeLightMix: .35,
    /** §39: low-poly canopy lobes carry the forest interior beyond the crown
     * budget: one lobe per grid cell inset from the boundary, sunk into the
     * ground so no underside shows. */
    mass: Object.freeze({ insetM: 16, spacingM: 13, lobeRadiusM: [6.5, 10] as const, canopyHeightM: [8, 12] as const,
      color: '#34532F', light: '#446A3A', budget: 420 }),
  }),
  /** §42–45: static water. The interior darkens with distance from the drawn
   * shoreline (`depthBasis: shoreline_distance`, visual only — never a
   * measured depth), a short shoreline band darkens the water edge and the
   * turf contact, a static ripple normal and a Fresnel lift toward the sky
   * colour make it read as water without animation or planar reflection. */
  water: Object.freeze({ shorelineM: .75, shorelineShade: .12, interiorM: 14, deepMix: .55, deepColor: '#2E5561',
    fresnelPower: 3.2, skyMix: .5, skyColor: '#BFD4E8', rippleM: [1.7, 4.3] as const, rippleAmplitude: .025,
    contactBandM: .6, contactShade: .08 }),
  /** §51: distance haze in perspective presets only, capped so the played
   * hole never loses more than this much contrast at `endM`. */
  haze: Object.freeze({ color: '#C9D8E6', startM: 180, endM: 900, maxMix: .28 }),
  /** §52: sky/horizon gradient behind perspective presets; Top keeps the map ground. */
  sky: Object.freeze({ zenith: '#8FB3DA', horizon: '#DCE6EF' }),
  /** §50: analytic contact shading under crowns and forest mass, computed
   * from the seeded placement. No screen-space AO at the base tier. */
  canopyShade: Object.freeze({ amount: .16, crownRadiusScale: 1.15, massRadiusScale: .95, massWeight: .8 }),
  /** Outside-world context objects (player-view spec §13–14, §25): muted
   * mineral ribbons with a darker shoulder, restrained flat-roofed
   * structures, faint lines for fences and lifts. Widths/heights here are
   * fallbacks behind the zone's own attributes. */
  contextObjects: Object.freeze({
    ribbons: Object.freeze({
      cart_path: Object.freeze({ color: '#B6AF9F', shoulder: '#8F8A7C', widthM: 2.5, roughness: .88 }),
      service_path: Object.freeze({ color: '#A4A197', shoulder: '#7F7D75', widthM: 3.5, roughness: .9 }),
      road: Object.freeze({ color: '#86847F', shoulder: '#6A6864', widthM: 6, roughness: .92 }),
      crossing: Object.freeze({ color: '#B6AF9F', shoulder: '#8F8A7C', widthM: 2.5, roughness: .88 }),
      bridge: Object.freeze({ color: '#9A8F80', shoulder: '#6E655A', widthM: 3, roughness: .85 }),
      stream: Object.freeze({ color: '#3E5F66', shoulder: '#4E6A58', widthM: 1.5, roughness: .45 }),
      drainage: Object.freeze({ color: '#4F6A55', shoulder: '#566E52', widthM: 1, roughness: .8 }),
    }),
    structures: Object.freeze({
      building: Object.freeze({ wall: '#D3CBBE', roof: '#8C8377', heightM: 4.5 }),
      clubhouse: Object.freeze({ wall: '#E1D8C7', roof: '#7E7468', heightM: 7 }),
      maintenance: Object.freeze({ wall: '#C4BFB4', roof: '#7A7670', heightM: 5 }),
    }),
    lines: Object.freeze({ fence: 1.2, wall: 1, lift_line: 6 }),
    lineColor: '#5C5A56',
  }),
});
/** Structural (widened) style type so a variant style, such as a lab
 * experiment or a test, can carry different values under the same shape. */
type Widen<T> = T extends number ? number : T extends string ? string : T extends boolean ? boolean
  : T extends readonly (infer U)[] ? readonly Widen<U>[] : T extends object ? { readonly [K in keyof T]: Widen<T[K]> } : T;
export type MeridianStyle = Widen<typeof MERIDIAN_STYLE>;

/** Runtime amplitude overrides for the lab inspector (§95). Absent keys keep
 * the style value; the artifact and its hash never change under an override. */
export interface MeridianStyleOverrides {
  macro?: number; micro?: number; mowing?: number; boundary?: number; context?: number;
  /** Build-time multipliers for the lab (§95): crown budget and forest mass (0 hides). */
  crowns?: number; mass?: number;
  /** V5 (§42–52): water sky/interior mix, haze strength (renderer) and canopy contact shade. */
  water?: number; haze?: number; shade?: number;
}
export type TreeFamily = typeof MERIDIAN_STYLE.vegetation.families[number];

/** FNV-1a over the canonical JSON of the style. Synchronous so the cache key
 * exists before any async boundary; collisions here only cost a recompile. */
export function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const MERIDIAN_STYLE_JSON = canonicalJson(MERIDIAN_STYLE);
export function styleHash(style: MeridianStyle = MERIDIAN_STYLE): string {
  return `${style.version}-${fnv1a(canonicalJson(style))}`;
}
export const MERIDIAN_STYLE_HASH = styleHash();

/** sRGB → linear (IEC 61966-2-1). Shared by the compiler and the renderer so
 * both agree without importing Three into the compiler. */
export function srgbToLinear(channel: number): number {
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
export function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  return .2126 * srgbToLinear(r) + .7152 * srgbToLinear(g) + .0722 * srgbToLinear(b);
}
