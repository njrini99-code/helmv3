/** Meridian V2 canary comparison (V2 plan §109 required debug views incl.
 * `final`, §111 canary hole set, §112 visual reference board, §116 screenshot
 * regression, §117 GPU regression; Task 25 `v2-budgets.ts`; Task 26).
 *
 * Pure, three-free comparison over ALREADY-CAPTURED canary data — no file
 * I/O, no PNG decoding, no randomness, no wall-clock reads:
 *
 *  - A `CanaryCapture` is one row `capture-v2-canaries.cjs` (or the legacy
 *    `capture-visual-canaries.cjs`) wrote into a `canaries.json`: render
 *    telemetry read straight off the canvas's `dataset`
 *    (`three-renderer.ts`'s `Object.assign(canvas.dataset, {...})`), which
 *    means every numeric field arrives as a *string* (DOM dataset is
 *    string-valued) or is simply absent. This module owns that parsing and
 *    never coerces a missing value to `0` (constraint 15: nothing invented).
 *  - Pixel comparison (`diffPixels`) takes already-decoded RGBA buffers,
 *    never a PNG file: decoding is format-specific file I/O and lives in the
 *    CLI (`compare-canaries.mts`), which is free to reach for `node:zlib`
 *    however it likes without pulling that into this file's lib boundary
 *    (`visual-boundary.test.ts`/eslint: no `three`, no `@/components`, and by
 *    house style no incidental Node I/O either — see `display-mesh-v2.ts`
 *    and friends).
 *  - §117 "no fidelity PR ships without before/after numbers": that is this
 *    module's job — draw calls, triangles, frame P95, shadow updates and
 *    artifact hash, baseline vs candidate, plus (when the caller supplies
 *    decoded images) a per-capture pixel-difference stat that mirrors
 *    `diff-visual-canaries.py`'s algorithm exactly (same default tolerance,
 *    same "max abs diff over RGB channels" rule, same field names) so the
 *    two tools never disagree about what "changed" means.
 *
 * A real Task 26 run always mixes phone (390×844) and desktop (1440×1000)
 * captures in one `canaries.json` (`capture-v2-canaries.cjs`'s own
 * `--viewports=phone,desktop` default), so the budget tier cannot be one
 * value for the whole comparison: `evaluateCanaryBudgets` derives it per
 * capture from `capture.viewport` (`tierForViewport`) unless the caller
 * passes an explicit override, and `compareCanaryRuns`'s `options.tier` is
 * exactly that override, not a default applied to every row.
 *
 * Budget gating (`evaluateCanaryBudgets`) reuses `v2-budgets.ts`'s numbers —
 * never a second copy of 160/180/90 000/4 — but not its `validateHoleBudgets`
 * function: that function's input is a *compile-time* `HoleDisplayLodsReport`
 * (topology/Hausdorff/hero-patch reports from `compile-display-lods.mts`)
 * that a runtime canary capture cannot produce. Only the budgets a runtime
 * capture can actually measure are checked:
 *   - §93 draw calls — phone tier only, exactly as `V2_BUDGETS` states no
 *     number for "high" (`budgets.drawCalls` is `undefined` on desktop).
 *   - §11 "a close Green frame may reach ~55k–90k visible terrain
 *     triangles" — applied only to a `green`-preset capture (case-insensitive
 *     match), because the plan scopes that ceiling to the green frame
 *     specifically; applying it to a `top`/`approach` shot would invent a
 *     rule the plan never states. This is also a coarser proxy than the
 *     budget's own compile-time reading: `V2_BUDGETS`'s `closeFrameVisible`
 *     is defined over de-duplicated *terrain* triangles only
 *     (`closeFrameTriangles` in `v2-budgets.ts`), while a runtime
 *     `renderTriangles` count is everything the GPU drew that frame —
 *     trees, context, everything. A capture that trips this check is not
 *     automatically a terrain-compiler regression (it may just be a lot of
 *     forest on screen), so the severity is downgraded to `'warn'` here
 *     regardless of the source budget's own `'error'`, and this file says so
 *     at the call site rather than silently borrowing a stricter severity
 *     than the approximation earns.
 * §96 pixel budget and §94/95 texture bytes are *not* gated here: the first
 * has no `severity` field in `V2TierBudgets` at all (`v2-budgets.ts` calls it
 * "never gated, only reported"), and the second needs a compiled artifact
 * summary a runtime capture never carries. Shadow updates and artifact hash
 * are reported, never gated: the plan states no numeric ceiling for either.
 */
import type { V2BudgetTier, Violation } from './v2-budgets';
import { V2_BUDGETS } from './v2-budgets';

export type CanaryWorld = 'v1' | 'v2';

/** One capture's render telemetry, already read off `canvas.dataset` by the
 * capture script. DOM dataset values are always strings (or absent); this
 * type also accepts a plain `number` so hand-built test/lab fixtures don't
 * need to stringify everything. `[key: string]: unknown` keeps every other
 * `METADATA_KEYS` field (see `capture-visual-canaries.cjs`) available to a
 * caller without this module needing to enumerate all of them. */
export interface CanaryMetadata {
  drawCalls?: string | number | null;
  renderTriangles?: string | number | null;
  frameP95Ms?: string | number | null;
  shadowUpdates?: string | number | null;
  visualArtifactHash?: string | null;
  debugView?: string | null;
  bufferWidth?: string | number | null;
  bufferHeight?: string | number | null;
  [key: string]: unknown;
}

export interface CanaryCapture {
  hole: number;
  /** The canary "shot" name (Task 26's set is `top`/`approach`/`green`, the
   * legacy V1 script's is `Top`/`Terrain`/`Side`). This module treats it as
   * an opaque match key everywhere except the §11 green-frame check, which
   * compares case-insensitively against `"green"`. */
  preset: string;
  /** Nominal viewport label the capture script chose (a `WxH` string or a
   * fixture viewport key). Matching is by exact string, so both sides of a
   * comparison must use the same convention — the capture script's job. */
  viewport: string;
  /** Which render pipeline produced this capture. Absent on every
   * `canaries.json` written before Task 26 (`capture-visual-canaries.cjs`
   * never recorded this field): `resolveWorld` treats a missing value as
   * `'v1'`, since every prior canary is a V1 capture. */
  world?: CanaryWorld;
  file: string;
  metadata: CanaryMetadata;
}

/** Loose shape of a `canaries.json` file — only the fields this module
 * reads. Both `capture-visual-canaries.cjs` and `capture-v2-canaries.cjs`
 * write additional top-level fields (`uncertainGate`, `errors`, …) this
 * module does not need and does not model. */
export interface CanaryRunFile {
  label?: string;
  course?: string;
  captures: CanaryCapture[];
}

export function resolveWorld(capture: CanaryCapture): CanaryWorld {
  return capture.world ?? 'v1';
}

export function captureKey(capture: Pick<CanaryCapture, 'hole' | 'preset' | 'viewport'>): string {
  return `${capture.hole}:${capture.preset}:${capture.viewport}`;
}

export interface MatchedCanaryCapture { key: string; hole: number; preset: string; viewport: string; baseline: CanaryCapture; candidate: CanaryCapture }

export interface CanaryMatchResult {
  matched: MatchedCanaryCapture[];
  /** Present in `baseline` with no counterpart in `candidate` — including a
   * second baseline row that collides on the same key as an already-matched
   * one (see `duplicateBaselineKeys`): it is never silently dropped. */
  baselineOnly: CanaryCapture[];
  /** Present in `candidate` with no counterpart in `baseline` — including a
   * second candidate row that collides on the same key as an already-matched
   * one (see `duplicateCandidateKeys`), symmetric with `baselineOnly` above.
   * Only the specific row that actually won the match (the first occurrence,
   * per `duplicateCandidateKeys`'s "kept the first occurrence" convention —
   * see `matchCanaryCaptures`) is excluded here; a same-key row that lost
   * that pairing is never silently dropped either. */
  candidateOnly: CanaryCapture[];
  /** Keys that appear more than once within `baseline` (or `candidate`).
   * A well-formed capture run never produces one — it means the capture
   * script wrote two rows for the same hole/preset/viewport — so a caller
   * should treat a non-empty list here as a capture-script bug, not silently
   * ignore it. */
  duplicateBaselineKeys: string[];
  duplicateCandidateKeys: string[];
}

function findDuplicateKeys(captures: readonly CanaryCapture[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const capture of captures) {
    const key = captureKey(capture);
    if (seen.has(key)) duplicates.add(key); else seen.add(key);
  }
  return [...duplicates];
}

/** Matches by exact (hole, preset, viewport) key. `world` is deliberately not
 * part of the key: the whole point of comparing "V1 vs V2 entries of one
 * run" is that the same hole/preset/viewport was captured under two
 * different worlds, and the caller has already split the run into the two
 * sides it wants compared (see `compare-canaries.mts`). */
export function matchCanaryCaptures(baseline: readonly CanaryCapture[], candidate: readonly CanaryCapture[]): CanaryMatchResult {
  // Index of each key's *first* occurrence in `candidate` — "kept the first
  // occurrence" (see `duplicateCandidateKeys`, printed by `compare-canaries.mts`).
  // Keyed by index rather than by the row object itself so a later filter can
  // tell "the exact row that won the match" apart from "some other row that
  // merely shares its key" without relying on object identity (which would
  // misbehave if the same reference ever appeared twice in `candidate`).
  const candidateIndexByKey = new Map<string, number>();
  candidate.forEach((row, index) => { const key = captureKey(row); if (!candidateIndexByKey.has(key)) candidateIndexByKey.set(key, index); });
  const usedKeys = new Set<string>();
  const matchedIndexes = new Set<number>();
  const matched: MatchedCanaryCapture[] = [];
  const baselineOnly: CanaryCapture[] = [];
  for (const capture of baseline) {
    const key = captureKey(capture);
    const partnerIndex = candidateIndexByKey.get(key);
    if (partnerIndex !== undefined && !usedKeys.has(key)) {
      matched.push({ key, hole: capture.hole, preset: capture.preset, viewport: capture.viewport, baseline: capture, candidate: candidate[partnerIndex]! });
      usedKeys.add(key);
      matchedIndexes.add(partnerIndex);
    } else {
      baselineOnly.push(capture);
    }
  }
  // By index, not by key: a second candidate row colliding on an
  // already-matched key was never the one selected as the match partner
  // (`candidateIndexByKey` only ever recorded the first occurrence), so its
  // index was never added to `matchedIndexes` — it survives into
  // `candidateOnly` here exactly as a second baseline row survives into
  // `baselineOnly` above, instead of vanishing because its *key* (shared with
  // the row that did match) looks used.
  const candidateOnly = candidate.filter((_row, index) => !matchedIndexes.has(index));
  return { matched, baselineOnly, candidateOnly, duplicateBaselineKeys: findDuplicateKeys(baseline), duplicateCandidateKeys: findDuplicateKeys(candidate) };
}

/** `''`/`null`/`undefined`/non-finite all mean "not recorded" — never
 * coerced to `0` (constraint 15: nothing invented). */
function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface CanaryMetrics {
  drawCalls: number | null;
  renderTriangles: number | null;
  frameP95Ms: number | null;
  shadowUpdates: number | null;
  artifactHash: string | null;
  /** `bufferWidth × bufferHeight` when the capture recorded a real backbuffer
   * size (§96); `null` otherwise — never assumed from the nominal viewport. */
  bufferPixels: number | null;
}

export function canaryMetrics(capture: CanaryCapture): CanaryMetrics {
  const metadata = capture.metadata ?? {};
  const width = toNumber(metadata.bufferWidth), height = toNumber(metadata.bufferHeight);
  return {
    drawCalls: toNumber(metadata.drawCalls),
    renderTriangles: toNumber(metadata.renderTriangles),
    frameP95Ms: toNumber(metadata.frameP95Ms),
    shadowUpdates: toNumber(metadata.shadowUpdates),
    artifactHash: metadata.visualArtifactHash ?? null,
    bufferPixels: width != null && height != null ? width * height : null,
  };
}

export interface MetricDelta { baseline: number | null; candidate: number | null; delta: number | null; percentChange: number | null }

function metricDelta(baseline: number | null, candidate: number | null): MetricDelta {
  if (baseline == null || candidate == null) return { baseline, candidate, delta: null, percentChange: null };
  const delta = candidate - baseline;
  return { baseline, candidate, delta, percentChange: baseline !== 0 ? (delta / baseline) * 100 : null };
}

export interface CanaryMetricDiff {
  drawCalls: MetricDelta;
  renderTriangles: MetricDelta;
  frameP95Ms: MetricDelta;
  shadowUpdates: MetricDelta;
  baselineArtifactHash: string | null;
  candidateArtifactHash: string | null;
}

/** §117's "before/after numbers" for one matched capture pair. */
export function diffCanaryMetrics(baseline: CanaryCapture, candidate: CanaryCapture): CanaryMetricDiff {
  const a = canaryMetrics(baseline), b = canaryMetrics(candidate);
  return {
    drawCalls: metricDelta(a.drawCalls, b.drawCalls),
    renderTriangles: metricDelta(a.renderTriangles, b.renderTriangles),
    frameP95Ms: metricDelta(a.frameP95Ms, b.frameP95Ms),
    shadowUpdates: metricDelta(a.shadowUpdates, b.shadowUpdates),
    baselineArtifactHash: a.artifactHash,
    candidateArtifactHash: b.artifactHash,
  };
}

/** Maps Task 26's two required viewport labels to `v2-budgets.ts`'s tiers —
 * the same phone→standard/desktop→high pairing that module documents in its
 * own header, and that `capture-v2-canaries.cjs`'s `QUALITY_FOR_VIEWPORT`
 * forces via `?quality=` so captures are deterministic. Recognizes exactly
 * those two pixel strings; anything else returns `null` rather than
 * guessing which budget applies. */
export function tierForViewport(viewport: string): V2BudgetTier | null {
  if (viewport === '390x844') return 'phone';
  if (viewport === '1440x1000') return 'desktop';
  return null;
}

/** Gates one capture's telemetry against `v2-budgets.ts`. `tier` is an
 * explicit override; omit it — the normal case, since one comparison run
 * mixes phone and desktop captures — and it is derived per capture from
 * `capture.viewport` via `tierForViewport`. A capture whose viewport this
 * module does not recognize skips only the tier-*dependent* rule (§93 draw
 * calls, since desktop has no stated number at all) rather than guessing a
 * tier; the §11 close-frame rule below is tier-*independent*
 * (`V2_BUDGETS.phone.closeFrameVisible` and `.desktop.closeFrameVisible` are
 * the same object by reference — see `v2-budgets.ts`) and always applies.
 * See the module header for exactly which §-numbered rules apply to a
 * runtime capture and why the rest (topology, Hausdorff, hero-patch
 * budgets, texture bytes, pixel budget) do not. `hole` is rendered as
 * `"<ordinal>:<preset>"` in the returned `Violation`s so a table of
 * violations from multiple presets on the same hole stays distinguishable —
 * `v2-budgets.ts`'s own `Violation.hole` is a bare `physicalHoleKey` because
 * it never has more than one report per hole; a canary run has one per
 * (hole, preset, viewport). */
export function evaluateCanaryBudgets(capture: CanaryCapture, tier?: V2BudgetTier): Violation[] {
  const resolvedTier = tier ?? tierForViewport(capture.viewport);
  const metrics = canaryMetrics(capture);
  const hole = `${capture.hole}:${capture.preset}`;
  const out: Violation[] = [];
  const push = (rule: string, value: number | string, limit: number | string, severity: Violation['severity'], section: string) => {
    out.push({ hole, rule, value, limit, severity, section });
  };
  if (resolvedTier) {
    const drawCallsBudget = V2_BUDGETS[resolvedTier].drawCalls;
    if (drawCallsBudget && metrics.drawCalls != null) {
      const { target, hard, section } = drawCallsBudget;
      if (metrics.drawCalls > hard) push('draw-calls', metrics.drawCalls, hard, 'error', section);
      else if (metrics.drawCalls > target) push('draw-calls', metrics.drawCalls, target, 'warn', section);
    }
  }
  if (capture.preset.toLowerCase() === 'green' && metrics.renderTriangles != null) {
    const { max, section } = V2_BUDGETS.phone.closeFrameVisible; // tier-independent, see doc comment above
    // Downgraded to 'warn' regardless of the source budget's own 'error' —
    // see the module header ("coarser proxy than the budget's own
    // compile-time reading").
    if (metrics.renderTriangles > max) push('close-frame-visible-runtime', metrics.renderTriangles, max, 'warn', section);
  }
  return out;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** Tightly packed RGBA, 4 bytes per pixel, row-major, no padding. */
  data: Uint8Array | Uint8ClampedArray;
}

export const DEFAULT_PIXEL_DIFF_TOLERANCE = 24;

export interface PixelDiffStats {
  /** Fraction (0–1) of pixels whose max per-channel RGB difference exceeds
   * `tolerance`. `1` on a dimension mismatch, matching `diff-visual-canaries.py`. */
  mismatch: number;
  changedPixels: number;
  totalPixels: number;
  /** Inclusive `[minX, minY, maxX, maxY]` of changed pixels, or `null` when
   * nothing changed (or the images could not be compared pixel-for-pixel). */
  bbox: readonly [number, number, number, number] | null;
  /** `[[aWidth, aHeight], [bWidth, bHeight]]` on a dimension mismatch —
   * width-first, matching this module's own `DecodedImage.width`/`.height`
   * field order (and `bbox`'s x-before-y order above), *not*
   * `diff-visual-canaries.py`'s numpy-shape `[height, width]` order (its
   * `diff()` prints `list(a.shape[:2])`, where `shape[0]` is rows/height).
   * Diagnostic only — nothing in this module or `compare-canaries.mts`
   * reads the two numbers positionally; see `diffPixels`'s doc comment. */
  sizeMismatch?: readonly [readonly [number, number], readonly [number, number]];
}

/** Mirrors `diff-visual-canaries.py`'s `diff()` bit-for-bit for what
 * "changed" means: alpha is dropped (matching its `.convert('RGB')`), a
 * pixel counts as "changed" when the max absolute difference over R/G/B is
 * *strictly greater than* `tolerance` (never `>=`), `mismatch` is the
 * changed fraction, and a dimension mismatch reports `mismatch: 1` instead
 * of throwing — a resized canary still produces a row instead of aborting
 * the whole comparison. That parity claim is scoped to this detection
 * algorithm only: `sizeMismatch`'s own axis order is this module's
 * `[width, height]`, not the Python tool's numpy `[height, width]` — see
 * that field's doc comment; it is a diagnostic value, not part of what
 * "changed" means. */
export function diffPixels(a: DecodedImage, b: DecodedImage, tolerance: number = DEFAULT_PIXEL_DIFF_TOLERANCE): PixelDiffStats {
  if (a.width !== b.width || a.height !== b.height) {
    return { mismatch: 1, changedPixels: 0, totalPixels: 0, bbox: null, sizeMismatch: [[a.width, a.height], [b.width, b.height]] };
  }
  const { width, height } = a;
  const totalPixels = width * height;
  let changedPixels = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(a.data[i]! - b.data[i]!);
      const dg = Math.abs(a.data[i + 1]! - b.data[i + 1]!);
      const db = Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      if (Math.max(dr, dg, db) > tolerance) {
        changedPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { mismatch: totalPixels ? changedPixels / totalPixels : 0, changedPixels, totalPixels, bbox: changedPixels ? [minX, minY, maxX, maxY] : null };
}

export interface CanaryComparisonRow {
  key: string;
  hole: number;
  preset: string;
  viewport: string;
  metrics: CanaryMetricDiff;
  pixelDiff: PixelDiffStats | null;
  violations: Violation[];
}

export interface CanaryComparisonReport {
  /** The tier every row was gated at, or `'per-viewport'` when no override
   * was given and each row derived its own tier from its viewport
   * (`tierForViewport`) — the normal case for a real Task 26 run. */
  tier: V2BudgetTier | 'per-viewport';
  rows: CanaryComparisonRow[];
  baselineOnly: CanaryCapture[];
  candidateOnly: CanaryCapture[];
  duplicateBaselineKeys: string[];
  duplicateCandidateKeys: string[];
  violations: Violation[];
  worstMismatch: number | null;
}

export interface CompareCanaryRunsOptions {
  /** Forces every row to be gated at this tier. Omit it (the default) to
   * derive each row's tier from its own `viewport` instead
   * (`evaluateCanaryBudgets`/`tierForViewport`) — the correct choice
   * whenever a run mixes phone and desktop captures, which a real Task 26
   * run always does. Only pass this when every capture being compared
   * shares one viewport and forcing a tier is genuinely what is wanted. */
  tier?: V2BudgetTier;
  tolerance?: number;
  /** Pre-decoded RGBA pairs, keyed by `captureKey`. Omit to skip pixel
   * comparison entirely (a metadata-only run) — `compare-canaries.mts`
   * decodes PNGs and builds this map; this module never touches a file. */
  images?: ReadonlyMap<string, { baseline: DecodedImage; candidate: DecodedImage }>;
  /** Which side(s) of a matched pair `evaluateCanaryBudgets` runs against.
   * Default `'candidate'`: in the common case (V1 baseline vs V2 candidate,
   * or an older V2 run vs a newer one) only the new/changed side is worth
   * gating — the baseline already shipped. `'both'` is useful for a
   * regression check where both sides are meant to satisfy the same budget. */
  gate?: 'baseline' | 'candidate' | 'both' | 'none';
}

/** Top-level entry point: loads two canaries.json `captures` arrays (or the
 * V1/V2 halves of one run, already split by the caller) and produces the
 * §117 "before/after" table plus §93/§11 budget violations. Pure — every
 * input is already-parsed JSON and already-decoded pixels. */
export function compareCanaryRuns(baseline: readonly CanaryCapture[], candidate: readonly CanaryCapture[], options: CompareCanaryRunsOptions = {}): CanaryComparisonReport {
  const tolerance = options.tolerance ?? DEFAULT_PIXEL_DIFF_TOLERANCE;
  const gate = options.gate ?? 'candidate';
  const { matched, baselineOnly, candidateOnly, duplicateBaselineKeys, duplicateCandidateKeys } = matchCanaryCaptures(baseline, candidate);
  const rows: CanaryComparisonRow[] = matched.map(pair => {
    const metrics = diffCanaryMetrics(pair.baseline, pair.candidate);
    const image = options.images?.get(pair.key);
    const pixelDiff = image ? diffPixels(image.baseline, image.candidate, tolerance) : null;
    const violations: Violation[] = [];
    if (gate === 'baseline' || gate === 'both') violations.push(...evaluateCanaryBudgets(pair.baseline, options.tier));
    if (gate === 'candidate' || gate === 'both') violations.push(...evaluateCanaryBudgets(pair.candidate, options.tier));
    return { key: pair.key, hole: pair.hole, preset: pair.preset, viewport: pair.viewport, metrics, pixelDiff, violations };
  });
  const violations = rows.flatMap(row => row.violations);
  const mismatches = rows.map(row => row.pixelDiff?.mismatch).filter((value): value is number => value != null);
  return {
    tier: options.tier ?? 'per-viewport', rows, baselineOnly, candidateOnly, duplicateBaselineKeys, duplicateCandidateKeys, violations,
    worstMismatch: mismatches.length ? Math.max(...mismatches) : null,
  };
}
