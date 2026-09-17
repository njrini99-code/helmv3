/** Meridian V2 green-complex material pass (V2 plan §27–34; Task 13, library
 * half). Per-fragment inputs for the green/fringe/apron/collar treatment,
 * from the field atlas alone — no mesh, no `three`. "Collar" is
 * `ground-shader-v2.ts`'s own umbrella name for the fringe/apron transition
 * zone around a green (see its header); `greenBandsAt`'s `fringe` and
 * `apron` bands together *are* that collar, resolved as two concentric
 * rings instead of that file's single, admittedly-narrow fringe-only slab:
 *
 *   • band classification (§27–33) — how much of `green`, `fringe` or
 *     `apron` a world point reads as, derived from the green/fairway SDF
 *     layers the atlas already carries (field-atlas.ts `sampleFieldAtlas`,
 *     §36 convention: positive inside, negative outside);
 *   • a §31 world-space micro-normal perturbation, independent of the atlas
 *     (a pure function of position, per the plan's own h(x,y) formula);
 *   • a §34 run-off darkening weight, only where the atlas's own slope
 *     (`dzdx`/`dzdy` — resampled by central difference at the source grid's
 *     spacing, mirroring `metricTerrainNormal`'s step exactly per
 *     field-atlas.ts's header) shows the ground actually falling away from
 *     the green in the outward direction; never invented (constraint 15);
 *   • §30 quiet-BRDF roughness per band, read from the same table
 *     (`visual-style.ts` `surface.roughness`) the V1 ground material and
 *     `ground-shader-v2.ts` already use.
 *
 * Band widths are reused, not minted: §18/§28's crisp green edge
 * (`greenComplex.edgeFieldM`) and §33's apron reach from the green and from
 * the fairway (`apronGreenM`, `apronFairwayM`) are the exact numbers
 * Task 7's V1-era `compileGreenComplex` (visual-artifact.ts) already shipped
 * for this same green complex, cited back to the plan there. The plan states
 * no number for the fringe's own width (§32 only describes its feel); rather
 * than mint a new literal this reuses `greenComplex.apronBlendM` (2 m) —
 * already the green complex's own blend/transition scale — as the fringe
 * collar's full width. Verified empirically against hole 7
 * (`peek-n-peak-upper-07`, 2026-09-16): walking outward from the green along
 * its fairway-facing neck, this puts the fringe band's peak confidence
 * almost exactly 1 m outside the green, and the green → fringe → apron →
 * rough sequence §33 describes is what actually happens on that ray (see
 * `__tests__/green-surface-v2.test.ts`).
 *
 * Band dominance: `green`, `fringe` and `apron` each carry a slab-style
 * signed distance and their own 0…1 confidence
 * (`smoothstepEdge(-band/2, band/2, slab)` — the same shape
 * `ground-shader-v2.ts`'s own atlas classifier uses for its cruder,
 * green/fringe-only placeholder, generalized here to three concentric
 * bands); whichever confidence is highest wins, ties favouring the tighter
 * band (green over fringe over apron).
 *
 * Run-off (§34, §39–40 of the V1 fidelity plan) mirrors
 * `visual-artifact.ts`'s `compileGreenComplex` run-off term — same
 * `reachM`/`slopeMin`/`slopeFull`/`awayDot`/`mix` config
 * (`greenComplex.runoff`) — with two adaptations for an atlas-only,
 * per-fragment context: "downhill" comes from the atlas's own relief
 * channels rather than a mesh vertex normal, and "away from the green"
 * comes from the green SDF's own local gradient (a two-tap-per-axis central
 * difference, `GREEN_SDF_GRADIENT_STEP_M`) rather than the direction to the
 * nearest green's centroid — closer to §34's literal "for green boundary
 * point... compute slope direction" than a whole-green average, and it
 * degrades gracefully (no green nearby, or off the atlas entirely) instead
 * of needing ring geometry this module never receives. It is only ever
 * checked once none of green/fringe/apron claim the fragment outright —
 * matching `compileGreenComplex`'s own cascade, where an apron match
 * short-circuits before run-off is ever considered — and, unlike that V1
 * cascade's separate `runoff` *surface class* bolted on top of the same
 * per-vertex loop, it is folded back in here as a fifth resolved `band`
 * (`'runoff'`, confidence = its own strength) rather than a hidden nonzero
 * field on an otherwise-empty `'rough'` sample: `band` is `'rough'` (weight
 * 0, `runoff` 0) only where truly nothing — not even run-off — reaches a
 * point, and `roughness` follows, reusing `apron`'s value on `'runoff'`
 * exactly as `compileGreenComplex` does (visual-style.ts's roughness table
 * has no dedicated `runoff` entry).
 *
 * The GLSL chunk (`greenSurfaceShaderChunk`) is wired into
 * `ground-shader-v2.ts` by that file (bands, roughness and micro-normal in
 * `meridian-ground-v2-5`; run-off in `-6`, once the atlas's own relief
 * channels reached the shader as a texture). Its functions are self-contained,
 * golfV2-prefixed and take already-sampled SDF values / world XY as plain
 * parameters — no `sampler2D`, no uniform/varying reads — so they can be
 * called from anywhere in the fragment stage once the wiring task has those
 * values (§79: SDF edges and the micro normal belong in the fragment
 * stage). They mirror the CPU functions term for term; `GREEN_SURFACE_GLSL_NAMES`
 * gives the exact names both this module and its tests refer to.
 *
 * Visual only (constraint 6): every value here shades; nothing is picked,
 * measured, or fed to lie truth, distance or analytics, and canonical Z is
 * never touched (constraint 4). Deterministic from `atlas`/`x`/`y` alone
 * (13) — no `Math.random`, no clock. Three-free (R12); imports no
 * `ground-shader-v2.ts` (a concurrently-edited file) even though the two
 * mirror the same idea — see the module-boundary note in the task ledger. */
import { sampleFieldAtlas } from './field-atlas';
import type { PackedFieldAtlas } from './visual-artifact-v2';
import { MERIDIAN_STYLE, type MeridianStyle } from './visual-style';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** Clamped Hermite smoothstep (GLSL's own definition); mirrored verbatim in
 * the GLSL chunk below. */
function smoothstepEdge(lo: number, hi: number, x: number): number {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// §27–33 band classification
// ---------------------------------------------------------------------------

export const GREEN_SURFACE_BAND_IDS = ['green', 'fringe', 'apron', 'runoff', 'rough'] as const;
export type GreenBand = typeof GREEN_SURFACE_BAND_IDS[number];

export interface GreenBandSample {
  /** Which band owns this point: §27–33's `green`/`fringe`/`apron`, this
   * module's own §34 `runoff` once the source slope/direction support it
   * (see `runoffWeightAt`), or `rough` once none of the four do. `runoff`
   * and `rough` are mutually exclusive and exhaustive of "not a close-mown
   * band claims this" — a point is never `rough` with a nonzero `runoff`. */
  band: GreenBand;
  /** 0…1 confidence of `band`. For `green`/`fringe`/`apron`: 1 well inside
   * it, fading toward its neighbour, 0 once neither this nor the next band
   * outward reaches here — a caller blends `band`'s own response in by this
   * weight against whatever the surrounding ground already reads as (the
   * same split `ground-shader-v2.ts`'s `mix(rough, classColour, weight)`
   * already uses). For `band: 'runoff'`, `weight` equals `runoff` (there is
   * no separate crossfade — run-off's own strength ramp already is its
   * confidence); for `'rough'` it is always 0. */
  weight: number;
  /** §30 quiet-BRDF roughness for `band` alone (`style.surface.roughness`),
   * unblended — mix it in with `weight` the same way. `runoff` reuses
   * `apron`'s roughness value, mirroring `visual-artifact.ts`'s
   * `compileGreenComplex`, which assigns its own `apronRoughness` to a
   * run-off vertex (there is no dedicated `roughness.runoff` entry in
   * `visual-style.ts` to read instead). */
  roughness: number;
  /** §34 run-off darkening weight, 0…1 — the strength value, independent of
   * `weight`/`band` above except that it is nonzero exactly when
   * `band === 'runoff'` (in which case it equals `weight`). */
  runoff: number;
}

/** Central-difference step for the green SDF's own gradient
 * (`greenSdfAwayDirection`). Small enough to stay inside one bilinear cell
 * of the field atlas at any resolution this pipeline uses (§17's hero atlas
 * is ≈0.2 m/texel), so the difference reads the SDF's local slope rather
 * than averaging across a curved stretch of boundary; not so small that the
 * SDF's own quantisation (≈2 mm at the packed ±64 m range,
 * surface-distance-field.ts) dominates the numerator — at 0.1 m the
 * quantisation noise is under 1% of the two-tap span (0.2 m). Exported so
 * the shader wiring (ground-shader-v2.ts's `GOLF_V2_RELIEF` block) takes its
 * four SDF taps at the same step, keeping the GLSL run-off the exact mirror
 * of `runoffWeightAt`. */
export const GREEN_SDF_GRADIENT_STEP_M = 0.1;

/** The green SDF's own local outward direction at `(x, y)` — `normalize(
 * -∇dGreen)`, i.e. away from whichever green boundary point is nearest, not
 * a whole-green average. `null` where any of the four taps falls outside
 * the atlas (never invented: an unsupported point contributes nothing,
 * mirroring `terrainGradient`'s and `terrainSlopeAt`'s own bail-out). */
function greenSdfAwayDirection(atlas: PackedFieldAtlas, x: number, y: number): readonly [number, number] | null {
  const h = GREEN_SDF_GRADIENT_STEP_M;
  const l = sampleFieldAtlas(atlas, 'green', x - h, y), r = sampleFieldAtlas(atlas, 'green', x + h, y);
  const b = sampleFieldAtlas(atlas, 'green', x, y - h), t = sampleFieldAtlas(atlas, 'green', x, y + h);
  if (l == null || r == null || b == null || t == null) return null;
  const gx = (r - l) / (2 * h), gy = (t - b) / (2 * h), length = Math.hypot(gx, gy);
  return length > 1e-9 ? [-gx / length, -gy / length] : null;
}

/** §34/§39–40 run-off darkening strength at a point none of green/fringe/
 * apron claimed, per the module header: same config as `visual-artifact.ts`'s
 * `compileGreenComplex` (`style.greenComplex.runoff`), slope from the
 * atlas's own relief channels, "away from green" from the green SDF's own
 * gradient. `dGreen` is passed in (the caller already sampled it for the
 * band decision) rather than re-sampled; a positive result becomes
 * `greenBandsAt`'s own `band: 'runoff'`. */
function runoffWeightAt(atlas: PackedFieldAtlas, x: number, y: number, dGreen: number, style: MeridianStyle): number {
  if (dGreen > 0) return 0; // Inside the green: no run-off concept.
  const runoff = style.greenComplex.runoff;
  const outside = -dGreen;
  if (!(runoff.reachM > 0) || outside > runoff.reachM) return 0;
  const dzdx = sampleFieldAtlas(atlas, 'dzdx', x, y), dzdy = sampleFieldAtlas(atlas, 'dzdy', x, y);
  if (dzdx == null || dzdy == null) return 0;
  const slope = Math.hypot(dzdx, dzdy);
  if (slope < runoff.slopeMin) return 0;
  const away = greenSdfAwayDirection(atlas, x, y);
  if (!away) return 0;
  // metricTerrainNormal's own convention: normal.xy = (-dzdx, -dzdy)/len, so
  // the horizontal component's own direction (before the /len it shares
  // with nz) is exactly the downhill direction.
  const downhillX = -dzdx / slope, downhillY = -dzdy / slope;
  const dot = downhillX * away[0] + downhillY * away[1];
  if (dot < runoff.awayDot) return 0;
  const strength = Math.min(1, (slope - runoff.slopeMin) / Math.max(1e-6, runoff.slopeFull - runoff.slopeMin)) * (1 - outside / runoff.reachM);
  return clamp01(strength);
}

/** §30 quiet-BRDF roughness for `band`. `visual-style.ts`'s
 * `surface.roughness` table has no `runoff` entry (it predates this band);
 * `runoff` reuses `apron`'s value, matching `compileGreenComplex`'s own
 * choice (`visual-artifact.ts` `apronRoughness`) rather than inventing one. */
function bandRoughness(band: GreenBand, style: MeridianStyle): number {
  if (band === 'runoff') return style.surface.roughness.apron;
  return style.surface.roughness[band];
}

/** §27–34 per-point green-complex sample: band, its confidence, that band's
 * quiet-BRDF roughness, and the run-off darkening weight. Deterministic from
 * `atlas`/`x`/`y`/`style` alone. `style` defaults to `MERIDIAN_STYLE`, as
 * every sibling V2 compiler's optional style parameter does. */
export function greenBandsAt(atlas: PackedFieldAtlas, x: number, y: number, style: MeridianStyle = MERIDIAN_STYLE): GreenBandSample {
  const dGreen = sampleFieldAtlas(atlas, 'green', x, y);
  if (dGreen == null) return { band: 'rough', weight: 0, roughness: style.surface.roughness.rough, runoff: 0 };
  const dFairway = sampleFieldAtlas(atlas, 'fairway', x, y) ?? -Infinity;
  const cfg = style.greenComplex;
  const edgeM = cfg.edgeFieldM, fringeWidthM = cfg.apronBlendM, apronOuterM = cfg.apronGreenM, blendM = cfg.apronBlendM;

  // §18/§28: the green's own crisp edge.
  const greenWeight = smoothstepEdge(-edgeM / 2, edgeM / 2, dGreen);
  // §32 fringe: a slab over [0, fringeWidthM] outside the green (the same
  // interval-SDF trick `ground-shader-v2.ts`'s cruder placeholder uses).
  const fringeSlab = Math.min(dGreen + fringeWidthM, -dGreen);
  const fringeWeight = smoothstepEdge(-fringeWidthM / 2, fringeWidthM / 2, fringeSlab);
  // §33 apron: the ring from fringeWidthM to apronOuterM outside the green,
  // gated to the fairway-facing neck alone (`fairwayClose`) — apron is a
  // directional "approach" feature, not a uniform collar (§33: "when the
  // course actually supports those distinctions").
  const outside = Math.max(0, -dGreen);
  const apronRingSlab = Math.min(outside - fringeWidthM, apronOuterM - outside);
  const apronRingWeight = smoothstepEdge(-blendM / 2, blendM / 2, apronRingSlab);
  const fairwayClose = clamp01((cfg.apronFairwayM - Math.abs(dFairway)) / blendM);
  const apronWeight = dGreen < 0 ? Math.min(apronRingWeight, fairwayClose) : 0;

  let band: GreenBand, weight: number, runoff = 0;
  if (greenWeight >= fringeWeight && greenWeight >= apronWeight && greenWeight > 0) { band = 'green'; weight = greenWeight; }
  else if (fringeWeight >= apronWeight && fringeWeight > 0) { band = 'fringe'; weight = fringeWeight; }
  else if (apronWeight > 0) { band = 'apron'; weight = apronWeight; }
  else {
    // No close-mown band claims this point outright: §34 run-off is the
    // last check, exactly where `compileGreenComplex`'s own cascade (V1)
    // reaches it only once its apron test has already failed.
    runoff = runoffWeightAt(atlas, x, y, dGreen, style);
    if (runoff > 0) { band = 'runoff'; weight = runoff; }
    else { band = 'rough'; weight = 0; }
  }
  return { band, weight, roughness: bandRoughness(band, style), runoff };
}

/** Finite-value gate on one sample: every field is finite, `weight`/`runoff`
 * lie in [0, 1], `roughness` in (0, 1], `band` a recognised id. Cheap; mirrors
 * the `assert*` gate every sibling V2 module carries. */
export function assertGreenSurfaceSample(sample: GreenBandSample): void {
  const problems: string[] = [];
  if (!GREEN_SURFACE_BAND_IDS.includes(sample.band)) problems.push(`unknown band ${String(sample.band)}`);
  if (!Number.isFinite(sample.weight) || sample.weight < 0 || sample.weight > 1) problems.push(`weight ${sample.weight} out of [0,1]`);
  if (!Number.isFinite(sample.roughness) || sample.roughness <= 0 || sample.roughness > 1) problems.push(`roughness ${sample.roughness} out of (0,1]`);
  if (!Number.isFinite(sample.runoff) || sample.runoff < 0 || sample.runoff > 1) problems.push(`runoff ${sample.runoff} out of [0,1]`);
  if (sample.band === 'runoff') {
    if (!(sample.runoff > 0)) problems.push(`band 'runoff' with runoff ${sample.runoff} <= 0`);
    if (sample.weight !== sample.runoff) problems.push(`band 'runoff' weight ${sample.weight} must equal runoff ${sample.runoff}`);
  } else if (sample.runoff !== 0) problems.push(`runoff ${sample.runoff} set on non-runoff band ${sample.band}`);
  if (problems.length) throw new Error(`Green surface sample failed: ${problems.join('; ')}`);
}

// ---------------------------------------------------------------------------
// §31 micro-normal
// ---------------------------------------------------------------------------

/** §31 micro-normal basis. Wavelengths copy `visual-style.ts`
 * `turf.micro.wavelengthsM`'s *values* (0.4 m, 1.2 m — already inside §31's
 * suggested 0.25–0.45 m / 0.8–1.4 m bands) and the two plane-wave directions
 * plus the second wave's phase copy `ground-shader-v2.ts`'s existing turf
 * micro-albedo field verbatim, both copied by value rather than imported so
 * this field's ridges line up with the existing colour micro-field under the
 * same seed without coupling this module to either (concurrently-edited)
 * file. Amplitudes are new — §31 states only "extremely small" — chosen so
 * the worst-case tilt this field can ever add is provably small
 * (`GREEN_MICRO_NORMAL_MAX_SLOPE`, an analytic bound, not a sampled one):
 * ≈1.14° at these numbers, in the range of a mowing/grain height variation,
 * never a fabricated landform (constraint 15). `lambda` is the plan's own
 * separate blend-strength term (n' = normalize(n + λ·(−h_x, −h_y, 0)));
 * kept at 1 and exposed for a future task that might fade it (e.g. by LOD)
 * without touching the amplitudes. */
export const GREEN_MICRO_NORMAL = Object.freeze({
  wavelengthsM: [0.4, 1.2] as const,
  amplitudesM: [0.0006, 0.002] as const,
  directions: [[0.71, 0.70], [-0.44, 0.90]] as const,
  phase2: 0.7,
  lambda: 1,
});
const GREEN_MICRO_K: readonly [number, number] = [2 * Math.PI / GREEN_MICRO_NORMAL.wavelengthsM[0], 2 * Math.PI / GREEN_MICRO_NORMAL.wavelengthsM[1]];
const vecLength = (v: readonly [number, number]): number => Math.hypot(v[0], v[1]);
/** Analytic upper bound on `|greenMicroNormalAt(...)|` (triangle inequality
 * over the two cosine terms, each bounded by 1, using each direction's own
 * true length rather than assuming a unit vector) — a proven ceiling, not an
 * empirical maximum over sampled points. */
export const GREEN_MICRO_NORMAL_MAX_SLOPE = GREEN_MICRO_NORMAL.lambda * (
  GREEN_MICRO_NORMAL.amplitudesM[0] * GREEN_MICRO_K[0] * vecLength(GREEN_MICRO_NORMAL.directions[0])
  + GREEN_MICRO_NORMAL.amplitudesM[1] * GREEN_MICRO_K[1] * vecLength(GREEN_MICRO_NORMAL.directions[1])
);

export interface GreenMicroNormal {
  /** λ·(−h_x, −h_y): add to a surface normal's xy before renormalizing. */
  dx: number;
  dy: number;
}

/** §31 world-space micro-normal perturbation at `(x, y)`: h(x,y) = A₁·sin(k₁·
 * dir₁·p) + A₂·sin(k₂·dir₂·p + phase₂), returning λ·(−h_x, −h_y). A pure
 * function of position — no atlas, no style — per the plan's own formula, so
 * it needs no boundary data; `seed` (default none) offsets `p` before
 * evaluating, so a caller can align these ridges with a seeded albedo field
 * the way `ground-shader-v2.ts` seeds its own turf fields per package hash.
 * GLSL additionally fades this by `fwidth` at grazing/aliasing angles (§31
 * "Fade by fwidth"); that is screen-space and has no CPU equivalent. */
export function greenMicroNormalAt(x: number, y: number, seed: readonly [number, number] = [0, 0]): GreenMicroNormal {
  const px = x + seed[0], py = y + seed[1];
  const [dir1, dir2] = GREEN_MICRO_NORMAL.directions;
  const [a1, a2] = GREEN_MICRO_NORMAL.amplitudesM;
  const [k1, k2] = GREEN_MICRO_K;
  const phase1 = k1 * (px * dir1[0] + py * dir1[1]);
  const phase2 = k2 * (px * dir2[0] + py * dir2[1]) + GREEN_MICRO_NORMAL.phase2;
  const c1 = a1 * k1 * Math.cos(phase1), c2 = a2 * k2 * Math.cos(phase2);
  const hx = c1 * dir1[0] + c2 * dir2[0], hy = c1 * dir1[1] + c2 * dir2[1];
  return { dx: -GREEN_MICRO_NORMAL.lambda * hx, dy: -GREEN_MICRO_NORMAL.lambda * hy };
}

// ---------------------------------------------------------------------------
// GLSL chunk
// ---------------------------------------------------------------------------

/** Exact GLSL function names the chunk below declares, so a caller (or a
 * test) never retypes the literals. */
export const GREEN_SURFACE_GLSL_NAMES = Object.freeze({
  bands: 'golfV2GreenBands',
  roughness: 'golfV2GreenRoughness',
  microNormal: 'golfV2GreenMicroNormal',
  runoff: 'golfV2GreenRunoff',
});

export interface GreenSurfaceShaderChunk {
  /** Self-contained GLSL: a `GolfV2GreenBand` struct (float band id 0…3 per
   * `GREEN_SURFACE_BAND_IDS`'s order, plus its 0…1 weight) and the four pure
   * functions named in `names`. Each reads only its own parameters — no
   * uniform, varying or sampler — so a later wiring task can drop this
   * source in anywhere in the fragment shader and call them once it already
   * has the SDF samples and world XY (§79). Mirrors `greenBandsAt` /
   * `greenMicroNormalAt` / the run-off weight term for term. */
  source: string;
  names: typeof GREEN_SURFACE_GLSL_NAMES;
}

/** Build the §27–34 GLSL chunk for `style` (default `MERIDIAN_STYLE`). Every
 * style number is baked as a literal (style is art direction, not runtime
 * state — the same choice `ground-shader-v2.ts`'s own `groundShaderV2Chunks`
 * makes for its turf/bunker constants). */
export function greenSurfaceShaderChunk(style: MeridianStyle = MERIDIAN_STYLE): GreenSurfaceShaderChunk {
  const cfg = style.greenComplex;
  const edgeM = cfg.edgeFieldM.toFixed(4), fringeWidthM = cfg.apronBlendM.toFixed(4);
  const apronOuterM = cfg.apronGreenM.toFixed(4), blendM = cfg.apronBlendM.toFixed(4), apronFairwayM = cfg.apronFairwayM.toFixed(4);
  const roughGlsl = (band: GreenBand): string => style.surface.roughness[band].toFixed(5);
  const runoff = cfg.runoff;
  const [dir1, dir2] = GREEN_MICRO_NORMAL.directions, [a1, a2] = GREEN_MICRO_NORMAL.amplitudesM, [k1, k2] = GREEN_MICRO_K;
  const names = GREEN_SURFACE_GLSL_NAMES;

  const source = `
// Meridian V2 green/fringe/apron material (V2 plan §27–34; Task 13).
// Self-contained: every function below reads only its own parameters.
struct GolfV2GreenBand { float band; float weight; };

// §27–33: classify (x, y) from its already-sampled green/fairway SDF values
// alone (band ids: 0 green, 1 fringe, 2 apron, 3 rough). Mirrors greenBandsAt.
GolfV2GreenBand ${names.bands}(float golfDGreen, float golfDFairway) {
  float golfEdge = ${edgeM};
  float golfFringeW = ${fringeWidthM};
  float golfApronOuter = ${apronOuterM};
  float golfBlend = ${blendM};
  float golfApronFairway = ${apronFairwayM};
  float golfGreenT = clamp((golfDGreen + golfEdge * 0.5) / golfEdge, 0.0, 1.0);
  float golfGreenWeight = golfGreenT * golfGreenT * (3.0 - 2.0 * golfGreenT);
  float golfFringeSlab = min(golfDGreen + golfFringeW, -golfDGreen);
  float golfFringeT = clamp((golfFringeSlab + golfFringeW * 0.5) / golfFringeW, 0.0, 1.0);
  float golfFringeWeight = golfFringeT * golfFringeT * (3.0 - 2.0 * golfFringeT);
  float golfOutside = max(0.0, -golfDGreen);
  float golfApronSlab = min(golfOutside - golfFringeW, golfApronOuter - golfOutside);
  float golfApronT = clamp((golfApronSlab + golfBlend * 0.5) / golfBlend, 0.0, 1.0);
  float golfApronRing = golfApronT * golfApronT * (3.0 - 2.0 * golfApronT);
  float golfFairwayClose = clamp((golfApronFairway - abs(golfDFairway)) / golfBlend, 0.0, 1.0);
  float golfApronWeight = golfDGreen < 0.0 ? min(golfApronRing, golfFairwayClose) : 0.0;
  if (golfGreenWeight >= golfFringeWeight && golfGreenWeight >= golfApronWeight && golfGreenWeight > 0.0) return GolfV2GreenBand(0.0, golfGreenWeight);
  if (golfFringeWeight >= golfApronWeight && golfFringeWeight > 0.0) return GolfV2GreenBand(1.0, golfFringeWeight);
  if (golfApronWeight > 0.0) return GolfV2GreenBand(2.0, golfApronWeight);
  return GolfV2GreenBand(3.0, 0.0);
}

// §30 quiet-BRDF roughness per band id (unblended — mix by the band's own weight).
float ${names.roughness}(float golfBand) {
  if (golfBand < 0.5) return ${roughGlsl('green')};
  if (golfBand < 1.5) return ${roughGlsl('fringe')};
  if (golfBand < 2.5) return ${roughGlsl('apron')};
  return ${roughGlsl('rough')};
}

// §31 world-space micro-normal: h(x,y) = A1*sin(k1.dir1.p) + A2*sin(k2.dir2.p + phase2);
// returns lambda*(-hx,-hy) to add to a normal's xy before renormalizing.
// Mirrors greenMicroNormalAt; the caller applies its own fwidth fade (§31 "Fade by fwidth").
vec2 ${names.microNormal}(vec2 golfWorldXY, vec2 golfSeed) {
  vec2 golfP = golfWorldXY + golfSeed;
  vec2 golfDir1 = vec2(${dir1[0]}, ${dir1[1]});
  vec2 golfDir2 = vec2(${dir2[0]}, ${dir2[1]});
  float golfK1 = ${k1.toFixed(6)};
  float golfK2 = ${k2.toFixed(6)};
  float golfA1 = ${a1.toFixed(6)};
  float golfA2 = ${a2.toFixed(6)};
  float golfPhase2 = ${GREEN_MICRO_NORMAL.phase2.toFixed(4)};
  float golfLambda = ${GREEN_MICRO_NORMAL.lambda.toFixed(4)};
  float golfPhase1v = golfK1 * dot(golfP, golfDir1);
  float golfPhase2v = golfK2 * dot(golfP, golfDir2) + golfPhase2;
  float golfC1 = golfA1 * golfK1 * cos(golfPhase1v);
  float golfC2 = golfA2 * golfK2 * cos(golfPhase2v);
  vec2 golfH = golfC1 * golfDir1 + golfC2 * golfDir2;
  return -golfLambda * golfH;
}

// §34 run-off darkening weight: only where golfBand is rough (3; a close-mown
// band already covers the point otherwise), the green is behind us
// (golfDGreen <= 0) and the atlas's own slope (golfSlopeXY = (dz/dx, dz/dy))
// falls away from the green (golfGreenGradXY = the green SDF's own
// unnormalized gradient, both already sampled by the caller). Mirrors runoffWeightAt.
float ${names.runoff}(float golfBand, float golfDGreen, vec2 golfSlopeXY, vec2 golfGreenGradXY) {
  if (golfBand < 2.5) return 0.0;
  if (golfDGreen > 0.0) return 0.0;
  float golfReach = ${runoff.reachM.toFixed(4)};
  float golfSlopeMin = ${runoff.slopeMin.toFixed(4)};
  float golfSlopeFull = ${runoff.slopeFull.toFixed(4)};
  float golfAwayDot = ${runoff.awayDot.toFixed(4)};
  float golfOutside = -golfDGreen;
  if (golfReach <= 0.0 || golfOutside > golfReach) return 0.0;
  float golfSlope = length(golfSlopeXY);
  if (golfSlope < golfSlopeMin) return 0.0;
  float golfGradLen = length(golfGreenGradXY);
  if (golfGradLen < 1e-6) return 0.0;
  vec2 golfAway = -golfGreenGradXY / golfGradLen;
  vec2 golfDownhill = -golfSlopeXY / golfSlope;
  float golfDot = dot(golfDownhill, golfAway);
  if (golfDot < golfAwayDot) return 0.0;
  float golfStrength = clamp((golfSlope - golfSlopeMin) / max(1e-6, golfSlopeFull - golfSlopeMin), 0.0, 1.0) * (1.0 - golfOutside / golfReach);
  return clamp(golfStrength, 0.0, 1.0);
}
`;
  return { source, names };
}
