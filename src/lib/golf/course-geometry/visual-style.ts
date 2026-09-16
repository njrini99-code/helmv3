/** Meridian visual kit (§112–114): every renderer constant that is a taste
 * decision, in one frozen object. Changing a value here changes `styleHash`,
 * which is part of the visual artifact key, the residency cache path, and
 * every capture's telemetry. Nothing in this module describes a measured
 * surface condition; it is art direction only. The prose reference is
 * docs/design/meridian-visual-language.md. */

export const MERIDIAN_STYLE_VERSION = 'meridian-v6';

export type MeridianPaletteKey = 'ground' | 'rough' | 'fairway' | 'green' | 'tee' | 'bunker' | 'water' | 'woods' |
  'surround' | 'fringe' | 'tree' | 'treeLight' | 'treeHighlight' | 'treeShadow' | 'sandEdge' | 'sandHighlight';

/** sRGB surface albedos, separate from Fairway's application UI tokens. No
 * directional illumination is baked into these colours (§56 hierarchy:
 * green → tee → fairway → fringe → surround → rough/ground → woods). */
export const MERIDIAN_PALETTE: Readonly<Record<MeridianPaletteKey, string>> = Object.freeze({
  ground: '#607D3D', rough: '#607D3D', surround: '#73964A', fringe: '#82A552',
  fairway: '#83A849', tee: '#88AD55', green: '#9DBB61', bunker: '#DED1AA',
  water: '#3B6C77', woods: '#29482B', tree: '#59852E', treeLight: '#6D9D37',
  treeHighlight: '#83B542', treeShadow: '#29482B',
  sandEdge: '#B3A079', sandHighlight: '#F0E4C7',
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
    woods: 1, bunker: .82, water: .9 }), collarMix: .5, woodsUnderstoryMix: .78 }),
  /** §53: context features keep their real surface but drop toward rough and
   * lose saturation; nearer context loses less than far context. */
  context: Object.freeze({ roughMix: .58, desaturate: .15, weightNear: .6, weightFar: .4 }),
  /** §28–32: render-only bunker bowl. Depth by size class (metres, chosen
   * deterministically inside the range per feature id); the bowl reaches full
   * depth at `bowlRadiusFraction` of the bunker's inradius, clamped to
   * `bowlRadiusM`; context bunkers are shallower; the floor darkens a little
   * with depth and the turf within `contactBandM` of the rim darkens too. */
  bunker: Object.freeze({ depthM: Object.freeze({ small: [.30, .45] as const, medium: [.45, .70] as const, large: [.60, .90] as const }),
    smallAreaM2: 60, largeAreaM2: 260, bowlRadiusM: [.6, 3.5] as const, bowlRadiusFraction: .85, contextDepthScale: .6,
    floorShade: .08, contactBandM: .6, contactShade: .22, sandGrainM: [.15, .35] as const, sandGrainAmplitude: .015 }),
  /** §35–41 */
  vegetation: Object.freeze({ families: 7, trunkBandM: 150, crownBudget: 720, tileM: 64 }),
  /** §42–45, §51 */
  water: Object.freeze({ shorelineM: .75, fresnelPower: 3.2, color: '#3B6C77', deepColor: '#2E5561' }),
  haze: Object.freeze({ color: '#C9D8E6', startM: 180, endM: 900, maxMix: .28 }),
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
}

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
