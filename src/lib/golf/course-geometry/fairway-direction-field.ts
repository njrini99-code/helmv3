/** Meridian V2 fairway directional material — field half (V2 plan §43–47;
 * Task 12). A per-node mow-line direction and stripe phase over the metric
 * grid, for the played hole's own fairway and tee surfaces (never a context
 * copy — mirrors visual-artifact.ts's own `!contextOnly` mowing gate),
 * derived from the hole's route frame: the same nearest-segment s/t
 * projection visual-artifact.ts's private `RouteFrame` performs,
 * reimplemented here since that class is not exported (this module stays
 * three-free regardless — R12).
 *
 * §43 defines a route tangent `t` and a grazing response
 * `g = pow(1 − |v·t|, p)`; §44 layers a periodic band signal on route-local
 * coordinates, `m(s,t) = sin(2π(s + α·t)/W)`. The plan reuses the symbol `t`
 * for two different things four lines apart — the tangent vector in §43, the
 * lateral coordinate in §44. Resolved here per V1's own working code
 * (three-landscape.ts: `golfPhase = (vGolfRouteST.y + vGolfRouteST.x * skew)
 * / bandWidthM`, i.e. `(t + skew·s)/W` — iso-phase lines run ALONG the
 * route, not across it) and per the SDD ledger ("12 | mowing bands | EXTEND
 * ... keep band frame"): the stored direction is the physical mow-LINE
 * direction, so the grazing axis and the stripe axis are the same line, as
 * real mown grass requires, and the periodic coordinate is `(t + skew·s)/W`.
 *
 * `D = T − skew·B` (T = unit route tangent, B = unit lateral, left positive
 * — visual-artifact.ts's own sign convention) is that mow-line direction; at
 * skew = 0, `D = T` exactly. Only its ANGLE is stored (mod π: a mow line has
 * no forward/back sense), one Uint8 per node; the periodic phase
 * `frac((t + skew·s)/W)` is a second Uint8, exact at the node's own
 * position. §43's sheen therefore reads literally as `g = pow(1 − |v·t|, p)`
 * with `t = D`: a consequence, not a bug. With `v` unit and `t` horizontal,
 * `|v·t| → 0` as `v` becomes vertical, so this stylized response is
 * STRONGEST from directly overhead and vanishes looking down the mow line —
 * backwards from a physical grazing sheen, but it is what the plan's formula
 * gives, it matches the plan's own "cheap stylized response" framing, and it
 * is the only reading under which the checklist's "Top-view moiré test"
 * item makes sense (moiré is a top-view-only concern if the pattern is
 * strongest there).
 *
 * Deliberately out of scope (left to a later wiring task):
 *   • Edge fade (plan checklist item): this module carries no boundary
 *     distance of its own (only route s/t and polygon containment). A
 *     wiring task already has one — the vertex `mowingWeight` attribute, or
 *     the field atlas's own fairway SDF weight (field-atlas.ts,
 *     ground-shader-v2.ts's `classifySurfaceFromAtlas`) — and should gate
 *     this module's output with it rather than have this module duplicate it.
 *   • The boundary texel: with no active-mask channel in the exported layer
 *     (below) and NEAREST-filtered sampling, a fairway fragment whose
 *     nearest texel happens to be an inactive (rough) node reads angle 0 /
 *     phase 0 — a stray value right at the edge. Not patched by dilating
 *     `active` into neighbours (that would make bordering rough nodes stop
 *     reading as untouched, contradicting this task's own contract); a
 *     wiring task's own edge weight already fades toward the boundary and
 *     should mask this the same way it already masks other boundary seams.
 *   • Surface tilt (§43's full `b = normalize(n×t)`): the direction stored
 *     is the ground-plane route tangent only. One Uint8 angle cannot
 *     represent a tilted 3-D tangent anyway (that needs two components, an
 *     octahedral pair as bunker-normal-field.ts uses for real normals); a
 *     fairway's slope is gentle enough that the flat approximation holds,
 *     and the task asks for exactly one direction byte.
 *
 * Constraint 15 (nothing invented): a node outside the hole's own fairway/
 * tee, or a hole with no route feature at all, gets `active = 0` and
 * `directionAngle = stripePhase = 0` — never a guessed direction. A texel
 * pair whose true mow direction sits within one quantization step of the
 * 0/π wrap (route heading within ~0.7° of due east–west) can reconstruct
 * opposite cross-stripe directions and show a faint seam there; narrow and
 * rare enough for a subtle effect not to warrant a different encoding.
 *
 * `fairwayDirectionLayer`'s two channels are both WRAPPED quantities (angle
 * mod π, phase mod 1); a consumer must bind the packed texture with NEAREST
 * filtering — bilinear across a wrap seam averages to a meaningless value (a
 * visible streak), the same hazard octahedral-normal encodings avoid by
 * storing components instead of an angle. This module stores a raw angle
 * anyway because the task calls for one packed byte, not two.
 *
 * `fairwayDirectionShaderChunk`'s GLSL reconstructs a screen-space-
 * continuous phase (not just the raw per-texel sample) before feeding it to
 * `fwidth()`, so the top-view moiré guard measures the field's true rate of
 * change rather than a texel-boundary step — see the function's own comment
 * for the closed form and the uniform contract
 * (`golfV2FairwayDirectionFrame` / `golfV2FairwayDirectionTexelM`) a wiring
 * task must satisfy. `fairwayGrainAt` mirrors the same reconstruction on the
 * CPU, minus the `fwidth` fade, which has no CPU equivalent (a screen-space
 * derivative) — it is the unfaded reference value.
 *
 * Visual only (constraint 6); canonical geometry untouched; deterministic
 * from the scene + mesh + options alone (13); three-free (R12). */
import { inFeature } from './spatial';
import type { TerrainMesh } from './terrain';
import type { HoleScene, LocalFeature, PointM } from './types';
import { MERIDIAN_STYLE, type MeridianStyle } from './visual-style';

export interface FairwayDirectionOptions {
  /** Node spacing in metres (null = the metric grid's own — mirrors static-shadow-field.ts). */
  spacingM: number | null;
  /** §44 `W`: the stripe period, metres. Reuses V1's own fairway band width so the two systems agree on scale. */
  periodWM: number;
  /** §44 `α`: the skew that keeps the bands from reading as a ruler. Reuses V1's own mowing skew. */
  skew: number;
  /** §43 `p` in `g = pow(1 − |v·t|, p)`. The plan leaves `p` unspecified; a gentle default. */
  sheenPower: number;
  /** §44 "albedo ±1–2%", expressed as a multiplier amplitude. */
  albedoAmplitude: number;
  /** §44 "roughness ±0.02–0.04", expressed as an additive amplitude. */
  roughnessAmplitude: number;
}
export const FAIRWAY_DIRECTION_OPTIONS: Readonly<FairwayDirectionOptions> = Object.freeze({
  spacingM: null,
  periodWM: MERIDIAN_STYLE.mowing.bandWidthM,
  skew: MERIDIAN_STYLE.mowing.skew,
  sheenPower: 2,
  albedoAmplitude: 0.015,
  roughnessAmplitude: 0.03,
});

export interface FairwayDirectionField {
  originM: readonly [number, number];
  spacingM: number;
  columns: number;
  rows: number;
  /** 1 where this node lies inside the played hole's own fairway or tee (never a context copy), 0 elsewhere. */
  active: Uint8Array;
  /** Mow-line direction, quantized 0–255 over [0, π) — a line, not a ray (file header). 0 where inactive. */
  directionAngle: Uint8Array;
  /** Stripe phase at this node's exact position, quantized 0–255 over the fractional part of `(t + skew·s) / periodWM`. 0 where inactive. */
  stripePhase: Uint8Array;
  /** The options this field (and any sampler of it) was built with, so `fairwayGrainAt` is never called with mismatched constants. */
  periodWM: number;
  skew: number;
  sheenPower: number;
  albedoAmplitude: number;
  roughnessAmplitude: number;
  stats: { activeShare: number; ms: number };
  basis: 'illustrative_style';
}

/** Cumulative arc length at each vertex of a route polyline. `Math.sqrt`,
 * not `Math.hypot` — visual-artifact.ts's own `RouteFrame` carries the same
 * choice with the same reason: hypot is not correctly rounded, and a
 * one-ulp engine difference would change a downstream hash. */
function cumulativeLengths(line: readonly PointM[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < line.length; i++) {
    const dx = line[i]![0] - line[i - 1]![0], dy = line[i]![1] - line[i - 1]![1];
    cumulative.push(cumulative[i - 1]! + Math.sqrt(dx * dx + dy * dy));
  }
  return cumulative;
}
/** Nearest-segment route-local projection — mirrors visual-artifact.ts's
 * private `RouteFrame.at`, plus the segment's own unit tangent (which that
 * class does not return). `t` signed, left of the tangent positive (same
 * convention: `t = ux·(y − ay) − uy·(x − ax)`). */
function projectToRoute(line: readonly PointM[], cumulative: readonly number[], point: PointM): { sM: number; tM: number; tangent: readonly [number, number] } {
  let bestD2 = Infinity, sM = 0, tM = 0, tangent: readonly [number, number] = [1, 0];
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1]![0], ay = line[i - 1]![1], bx = line[i]![0], by = line[i]![1];
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    if (length2 === 0) continue;
    const u = Math.min(1, Math.max(0, ((point[0] - ax) * dx + (point[1] - ay) * dy) / length2));
    const px = ax + dx * u, py = ay + dy * u, d2 = (point[0] - px) ** 2 + (point[1] - py) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      const length = Math.sqrt(length2), ux = dx / length, uy = dy / length;
      sM = cumulative[i - 1]! + u * length;
      tM = ux * (point[1] - ay) - uy * (point[0] - ax);
      tangent = [ux, uy];
    }
  }
  return { sM, tM, tangent };
}

/** Compile the fairway/tee mow-direction field over `mesh.metricGrid`
 * (throws if the hole carries none — mirrors static-shadow-field.ts).
 * Deterministic from `scene` + `mesh` + `options` alone. A hole with no
 * route feature, or no fairway/tee feature of its own, compiles a fully
 * inactive field (constraint 15: unsupported, never invented). */
export function compileFairwayDirectionField(mesh: TerrainMesh, scene: HoleScene, options: Partial<FairwayDirectionOptions> = {}): FairwayDirectionField {
  const opts = { ...FAIRWAY_DIRECTION_OPTIONS, ...options }, began = performance.now();
  const grid = mesh.metricGrid;
  if (!grid) throw new Error('Fairway direction field needs the metric terrain grid');
  const spacingM = opts.spacingM ?? grid.spacingM;
  const columns = Math.floor((grid.columns - 1) * grid.spacingM / spacingM) + 1, rows = Math.floor((grid.rows - 1) * grid.spacingM / spacingM) + 1;
  const originM = grid.originM;

  const active = new Uint8Array(columns * rows), directionAngle = new Uint8Array(columns * rows), stripePhase = new Uint8Array(columns * rows);
  const rings: LocalFeature[] = scene.features.filter(f => f.kind === 'fairway' || f.kind === 'tee');
  const routeFeature = scene.hole.routeFeatureId ? scene.features.find(f => f.id === scene.hole.routeFeatureId) : undefined;
  const line = routeFeature?.parts[0]?.[0];

  let activeCount = 0;
  // `line` (not a derived boolean) gates the loop, so TS narrows it to
  // `PointM[]` for `cumulativeLengths`/`projectToRoute` below — a hole with
  // no route feature, or fewer than 2 route points, compiles fully inactive
  // (constraint 15).
  if (line && line.length >= 2 && rings.length) {
    const cumulative = cumulativeLengths(line);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const point: PointM = [originM[0] + column * spacingM, originM[1] + row * spacingM];
      if (!rings.some(feature => inFeature(point, feature))) continue;
      const { sM, tM, tangent } = projectToRoute(line, cumulative, point);
      const [tx, ty] = tangent;
      // D = T − skew·B, B = (−ty, tx): D = (tx + skew·ty, ty − skew·tx).
      const dx = tx + opts.skew * ty, dy = ty - opts.skew * tx;
      let angle = Math.atan2(dy, dx) % Math.PI;
      if (angle < 0) angle += Math.PI;
      const phase = (tM + opts.skew * sM) / opts.periodWM, frac = phase - Math.floor(phase);
      const i = row * columns + column;
      active[i] = 1;
      directionAngle[i] = Math.min(255, Math.max(0, Math.round(angle / Math.PI * 255)));
      stripePhase[i] = Math.min(255, Math.max(0, Math.round(frac * 255)));
      activeCount++;
    }
  }
  return {
    originM, spacingM, columns, rows, active, directionAngle, stripePhase,
    periodWM: opts.periodWM, skew: opts.skew, sheenPower: opts.sheenPower, albedoAmplitude: opts.albedoAmplitude, roughnessAmplitude: opts.roughnessAmplitude,
    stats: { activeShare: activeCount / (columns * rows), ms: performance.now() - began }, basis: 'illustrative_style',
  };
}

/** Gates: buffer lengths agree with the grid, layout and period are sane,
 * every inactive node truly carries no invented angle/phase. */
export function assertFairwayDirectionField(field: FairwayDirectionField): void {
  const n = field.columns * field.rows, problems: string[] = [];
  if (field.active.length !== n || field.directionAngle.length !== n || field.stripePhase.length !== n) problems.push('layer sizes');
  if (!(field.spacingM > 0) || field.columns < 1 || field.rows < 1) problems.push('layout');
  if (!(field.periodWM > 0)) problems.push('periodWM');
  if (!(field.stats.activeShare >= 0 && field.stats.activeShare <= 1)) problems.push('activeShare');
  for (let i = 0; i < n; i++) {
    if (!field.active[i] && (field.directionAngle[i] !== 0 || field.stripePhase[i] !== 0)) { problems.push(`node ${i}: inactive but non-zero`); break; }
  }
  if (problems.length) throw new Error(`Fairway direction field failed: ${problems.join('; ')}`);
}

export interface FairwayDirectionLayer {
  name: 'fairway_direction';
  originM: readonly [number, number];
  spacingM: number;
  columns: number;
  rows: number;
  /** Interleaved per node: R = directionAngle, G = stripePhase. Both wrapped
   * (mod π, mod 1) — bind NEAREST, never bilinear/mipmapped (file header). */
  values: Uint8Array;
  basis: 'illustrative_style';
}
/** A field-atlas layer description for a later wiring task, shaped like
 * static-shadow-field.ts's `staticShadowLayer`. */
export function fairwayDirectionLayer(field: FairwayDirectionField): FairwayDirectionLayer {
  const n = field.columns * field.rows, values = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { values[i * 2] = field.directionAngle[i]!; values[i * 2 + 1] = field.stripePhase[i]!; }
  return { name: 'fairway_direction', originM: field.originM, spacingM: field.spacingM, columns: field.columns, rows: field.rows, values, basis: field.basis };
}

export interface FairwayGrainSample { albedo: number; roughness: number }
const NEUTRAL_GRAIN: FairwayGrainSample = { albedo: 1, roughness: 0 };
/** CPU mirror of the GLSL `golfV2FairwayGrain` (`fairwayDirectionShaderChunk`):
 * nearest-node sample (never bilinear — file header), the same continuous-
 * phase reconstruction, the same §43 sheen. `viewDir` must already be unit
 * length; only its horizontal part matters (file header: the effect peaks
 * looking straight down). No `fwidth` equivalent exists on the CPU, so this
 * omits the GLSL's screen-space fade — the unfaded reference value. */
export function fairwayGrainAt(field: FairwayDirectionField, x: number, y: number, viewDir: readonly [number, number, number]): FairwayGrainSample {
  const gx = (x - field.originM[0]) / field.spacingM, gy = (y - field.originM[1]) / field.spacingM;
  if (gx < 0 || gy < 0 || gx > field.columns - 1 || gy > field.rows - 1) return NEUTRAL_GRAIN;
  const column = Math.round(gx), row = Math.round(gy), i = row * field.columns + column;
  if (!field.active[i]) return NEUTRAL_GRAIN;
  const angle = field.directionAngle[i]! / 255 * Math.PI, dirX = Math.cos(angle), dirY = Math.sin(angle);
  const crossX = -dirY, crossY = dirX;
  const nodeX = field.originM[0] + column * field.spacingM, nodeY = field.originM[1] + row * field.spacingM;
  const kappa = Math.sqrt(1 + field.skew * field.skew) / field.periodWM;
  const deltaPhase = ((x - nodeX) * crossX + (y - nodeY) * crossY) * kappa;
  let phase = field.stripePhase[i]! / 255 + deltaPhase;
  phase -= Math.floor(phase);
  const sheen = Math.pow(Math.max(0, 1 - Math.abs(viewDir[0] * dirX + viewDir[1] * dirY)), field.sheenPower);
  const band = Math.sin(2 * Math.PI * phase), wave = sheen * band;
  return { albedo: 1 + wave * field.albedoAmplitude, roughness: wave * field.roughnessAmplitude };
}

export const FAIRWAY_DIRECTION_UNIFORMS = Object.freeze({
  sampler: 'golfV2FairwayDirection',
  frame: 'golfV2FairwayDirectionFrame',
  texelM: 'golfV2FairwayDirectionTexelM',
});
export interface FairwayDirectionShaderChunk {
  /** Self-contained: only golfV2-prefixed names, so a later wiring task can
   * append this after `groundShaderV2Chunks`'s own `fragmentHead` with no
   * collision, then call `golfV2FairwayGrain(worldXY, viewDirWS)` wherever
   * it already knows the fragment is fairway/tee class (this module has no
   * class gate or view-vector varying of its own — see the file header's
   * "deliberately out of scope" note on edge fade). */
  glsl: string;
  uniforms: typeof FAIRWAY_DIRECTION_UNIFORMS;
}
/** Build the GLSL for the one V2 fairway/tee mow-grain function. `style`
 * supplies the §44 anti-alias fade thresholds V1 already tuned for this
 * exact periodic signal (`style.mowing.fadeFwidth`); `options` supplies the
 * numeric contract (`periodWM`/`skew`/`sheenPower`/amplitudes) that MUST
 * match whatever options compiled the bound texture — both default to
 * `FAIRWAY_DIRECTION_OPTIONS`, and neither is a per-hole number (§77): only
 * the texture's own texels vary per hole. */
export function fairwayDirectionShaderChunk(style: MeridianStyle = MERIDIAN_STYLE, options: Partial<FairwayDirectionOptions> = {}): FairwayDirectionShaderChunk {
  const opts = { ...FAIRWAY_DIRECTION_OPTIONS, ...options };
  const { sampler, frame, texelM } = FAIRWAY_DIRECTION_UNIFORMS;
  const [fade0 = 0, fade1 = 1] = style.mowing.fadeFwidth;
  const kappa = (Math.sqrt(1 + opts.skew * opts.skew) / opts.periodWM).toFixed(8);
  const sheenPower = opts.sheenPower.toFixed(3), albedoAmp = opts.albedoAmplitude.toFixed(4), roughAmp = opts.roughnessAmplitude.toFixed(4);
  const glsl = `uniform sampler2D ${sampler};
uniform vec4 ${frame};
uniform vec2 ${texelM};
// Meridian V2 fairway/tee mow-grain (V2 plan §43–44; Task 12). ${sampler}'s
// R = mow-line direction angle (code/255 * π — a line, not a ray), G =
// stripe phase (code/255, the fractional (t + skew·s)/W at that texel's own
// centre — fairway-direction-field.ts's frame). Bind NEAREST: both channels
// wrap (mod π, mod 1) and bilinear across the seam is meaningless.
// ${frame} maps world XY to this texture's UV (xy = the world position at
// uv (0,0), zw = 1 / its own full extent in metres — matches
// golfV2SdfFrame's convention); ${texelM} is that same bound texture's OWN
// texel size in world metres (it may differ from this field's compiled
// spacing if a wiring task resampled it). For a direct, unresampled upload
// of this layer's own arrays, ${frame}.xy = originM − 0.5 × spacingM (a
// texel's centre, not its edge, must land on uv (0,0) + 0.5/resolution —
// standard GPU texel-centre sampling) and ${texelM} = spacingM.
vec2 golfV2FairwayGrain(vec2 golfFwWorldXY, vec3 golfFwViewDirWS) {
  vec2 golfFwUv = (golfFwWorldXY - ${frame}.xy) * ${frame}.zw;
  vec4 golfFwTexel = texture2D(${sampler}, golfFwUv);
  float golfFwAngle = golfFwTexel.r * 3.14159265359;
  vec2 golfFwDir = vec2(cos(golfFwAngle), sin(golfFwAngle));
  vec2 golfFwCross = vec2(-golfFwDir.y, golfFwDir.x);
  // The stored phase is exact at this texel's own centre; extend it
  // linearly along the cross-stripe direction so the reconstructed phase is
  // continuous across texels — fwidth() below then reads the field's true
  // screen-space rate of change, not a texel-boundary step.
  vec2 golfFwTexelIndex = floor((golfFwWorldXY - ${frame}.xy) / ${texelM});
  vec2 golfFwTexelCentre = ${frame}.xy + (golfFwTexelIndex + 0.5) * ${texelM};
  float golfFwK = ${kappa};
  float golfFwPhase = golfFwTexel.g + dot(golfFwWorldXY - golfFwTexelCentre, golfFwCross) * golfFwK;
  // §43: g = pow(1 − |v·t|, p) — deliberately strongest looking straight
  // down (a unit view vector's horizontal part shrinks to 0 there) and
  // weakest looking along the mow line; a stylized response, not a physical
  // BRDF (the plan's own word: "cheap"). golfFwViewDirWS must be unit length.
  float golfFwSheen = pow(max(0.0, 1.0 - abs(golfFwViewDirWS.x * golfFwDir.x + golfFwViewDirWS.y * golfFwDir.y)), ${sheenPower});
  float golfFwBand = sin(golfFwPhase * 6.283185307179586);
  float golfFwFade = 1.0 - smoothstep(${fade0.toFixed(3)}, ${fade1.toFixed(3)}, fwidth(golfFwPhase));
  float golfFwWave = golfFwSheen * golfFwBand * golfFwFade;
  return vec2(1.0 + golfFwWave * ${albedoAmp}, golfFwWave * ${roughAmp});
}`;
  return { glsl, uniforms: FAIRWAY_DIRECTION_UNIFORMS };
}
