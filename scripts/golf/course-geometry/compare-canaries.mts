#!/usr/bin/env -S node_modules/.bin/tsx
/**
 * Meridian V2 canary comparator (V2 plan §109, §111–112, §116–117; Task 26).
 *
 * Prints the §117 "before/after numbers" table (draw calls, triangles,
 * frame P95, shadow updates, artifact hash) plus a per-capture pixel-diff
 * (mirroring `diff-visual-canaries.py`) for two `canaries.json` runs, or the
 * V1/V2 halves of one combined run written by `capture-v2-canaries.cjs`.
 * Evaluates every candidate capture against `v2-budgets.ts` (see
 * `canary-compare.ts` for exactly which §-numbered rules a runtime capture
 * can check) and exits 1 if any is error-severity — the same convention as
 * its sibling `validate-v2-budgets.mts`.
 *
 * Two files:
 *   node_modules/.bin/tsx scripts/golf/course-geometry/compare-canaries.mts \
 *     --baseline output/.../v1-label/canaries.json --candidate output/.../v2-label/canaries.json \
 *     [--tier phone|desktop] [--tolerance 24] [--images true|false] [--gate candidate|baseline|both|none]
 *
 * One combined run (capture-v2-canaries.cjs writes both worlds into one file):
 *   node_modules/.bin/tsx scripts/golf/course-geometry/compare-canaries.mts \
 *     --run output/.../combined-label/canaries.json [--baseline-world v1] [--candidate-world v2] [...same flags]
 *
 * `--tier` is an override, not a default: omit it (the normal case, since a
 * run mixes phone/desktop viewports) and every capture is gated at the tier
 * its own viewport implies (`canary-compare.ts`'s `tierForViewport`).
 *
 * A decoupled `capture-v2-canaries.cjs --quality=<tier>` run (forcing a
 * quality tier onto a viewport it does not normally pair with) still writes
 * the *viewport's* label into `viewport`, and `tierForViewport` derives its
 * gating tier from that label alone — never from `metadata.qualityTier`
 * (the recorded ground truth for what quality actually ran). The dangerous
 * direction is `--viewports=desktop --quality=standard`: those rows still
 * derive `'desktop'`, whose §93 draw-call budget is `undefined`, so the
 * check is silently *skipped* even though the capture ran at the one tier
 * §93 states numbers for — a worse failure than the harmless-but-mislabeled
 * `--viewports=phone --quality=high` direction. Comparing any decoupled run
 * must pass this script's own `--tier` explicitly, matching the `--quality`
 * actually used rather than the viewport label.
 *
 * This file also exports `decodePng`, the minimal from-scratch PNG decoder
 * that reads Playwright's screenshots (`canary-compare.ts` stays three-free
 * and Node-I/O-free by taking already-decoded RGBA buffers — see its module
 * header). `decodePng` and the `--images` file-reading loop are the only
 * places in this whole module that touch `node:zlib`/`node:fs`; nothing
 * else here does image work. Exit codes match `validate-v2-budgets.mts`:
 * 2 for bad args / nothing to compare, 1 for an error-severity violation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  compareCanaryRuns, matchCanaryCaptures, type CanaryCapture, type CanaryComparisonReport, type CanaryRunFile, type CanaryWorld, type DecodedImage, type MetricDelta,
} from '../../../src/lib/golf/course-geometry/canary-compare';
import type { V2BudgetTier } from '../../../src/lib/golf/course-geometry/v2-budgets';

// ---------------------------------------------------------------------------
// Minimal PNG decoder — 8-bit, non-interlaced truecolor (colorType 2) or
// truecolor+alpha (colorType 6) only. That is exactly what Chromium's
// `page.screenshot()`/`locator.screenshot()` writes; anything else (16-bit,
// palette, grayscale, Adam7 interlace) throws rather than guess.
// ---------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer: Buffer): DecodedImage {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let sawIhdr = false;
  const idatChunks: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8); colorType = data.readUInt8(9);
      const compression = data.readUInt8(10), filter = data.readUInt8(11);
      interlace = data.readUInt8(12);
      if (compression !== 0 || filter !== 0) throw new Error(`unsupported PNG compression/filter method (${compression}/${filter})`);
      sawIhdr = true;
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // skip the 4-byte CRC; this decoder does not verify it
  }
  if (!sawIhdr || !width || !height) throw new Error('missing or empty IHDR chunk');
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (only 8-bit is supported)`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG color type ${colorType} (only truecolor/truecolor+alpha is supported)`);
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * channels;
  if (raw.length < height * (1 + rowBytes)) throw new Error('truncated PNG scanline data');
  const unfiltered = new Uint8Array(height * rowBytes);
  let pos = 0;
  let previousRow: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const filterType = raw[pos]!;
    pos += 1;
    const row = unfiltered.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[pos + i]!;
      const a = i >= channels ? row[i - channels]! : 0;
      const b = previousRow ? previousRow[i]! : 0;
      const c = previousRow && i >= channels ? previousRow[i - channels]! : 0;
      let value: number;
      switch (filterType) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + Math.floor((a + b) / 2); break;
        case 4: value = x + paethPredictor(a, b, c); break;
        default: throw new Error(`unsupported PNG filter type ${filterType}`);
      }
      row[i] = value & 0xff;
    }
    pos += rowBytes;
    previousRow = row;
  }
  if (channels === 4) return { width, height, data: unfiltered };
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = unfiltered[p * 3]!;
    rgba[p * 4 + 1] = unfiltered[p * 3 + 1]!;
    rgba[p * 4 + 2] = unfiltered[p * 3 + 2]!;
    rgba[p * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function readRun(path: string): CanaryRunFile {
  if (!existsSync(path)) { console.error(`no canaries.json at ${path}`); process.exit(2); }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CanaryRunFile;
  if (!Array.isArray(parsed.captures)) { console.error(`${path} has no "captures" array — not a canaries.json`); process.exit(2); }
  return parsed;
}
function splitByWorld(captures: CanaryCapture[], world: CanaryWorld): CanaryCapture[] {
  return captures.filter(capture => (capture.world ?? 'v1') === world);
}
const shortHash = (hash: string | null): string => (hash ? hash.slice(0, 10) : '·');
function fmtMetric(delta: MetricDelta, digits = 0): string {
  if (delta.baseline == null && delta.candidate == null) return '·';
  const b = delta.baseline == null ? '·' : delta.baseline.toFixed(digits);
  const c = delta.candidate == null ? '·' : delta.candidate.toFixed(digits);
  const pct = delta.percentChange == null ? '' : ` (${delta.percentChange >= 0 ? '+' : ''}${delta.percentChange.toFixed(1)}%)`;
  return `${b}→${c}${pct}`;
}

/** Parses a numeric CLI flag value, returning `null` (never `NaN`) when it
 * is not a finite number. A bare `Number('bogus-tolerance')` is `NaN`, and
 * `canary-compare.ts`'s `diffPixels` does `Math.max(dr, dg, db) > tolerance`
 * — a comparison against `NaN` is *always* `false` (mirroring Python's own
 * `x > float('nan')`), so an un-validated `--tolerance` typo would silently
 * report every pixel as unchanged instead of erroring, the opposite of
 * every other bad-arg case `main()` below already guards (`--tier`,
 * `--gate`). Pure and exported so `canary-compare.test.ts` can exercise the
 * bad-input path directly, without spawning this file as a subprocess. */
export function parseFiniteNumber(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1]! : fallback; };
  const runPath = option('run', '');
  const baselinePath = option('baseline', '');
  const candidatePath = option('candidate', '');
  // No default: a real Task 26 run mixes phone and desktop viewports in one
  // canaries.json, so forcing one tier onto every row would either gate a
  // desktop capture against a budget the plan never states for it, or (the
  // worse direction) skip a genuine phone-tier §93 breach because the same
  // call also covered a desktop row. Omitting --tier lets
  // `compareCanaryRuns` derive each row's tier from its own viewport
  // (`tierForViewport`) instead — see `canary-compare.ts`'s module header.
  const tierArg = option('tier', '');
  if (tierArg && tierArg !== 'phone' && tierArg !== 'desktop') { console.error(`--tier must be "phone" or "desktop", got "${tierArg}"`); process.exit(2); }
  const tier = tierArg ? (tierArg as V2BudgetTier) : undefined;
  const toleranceArg = option('tolerance', '24');
  const tolerance = parseFiniteNumber(toleranceArg);
  if (tolerance == null) { console.error(`--tolerance must be a finite number, got "${toleranceArg}"`); process.exit(2); }
  const readImages = option('images', 'true') !== 'false';
  const gate = option('gate', 'candidate') as 'baseline' | 'candidate' | 'both' | 'none';
  if (!['baseline', 'candidate', 'both', 'none'].includes(gate)) { console.error(`--gate must be baseline|candidate|both|none, got "${gate}"`); process.exit(2); }

  let baselineCaptures: CanaryCapture[], candidateCaptures: CanaryCapture[], baselineDir: string, candidateDir: string, label: string;
  if (runPath) {
    if (baselinePath || candidatePath) { console.error('pass either --run, or --baseline/--candidate, not both'); process.exit(2); }
    const run = readRun(runPath);
    const baselineWorld = option('baseline-world', 'v1') as CanaryWorld;
    const candidateWorld = option('candidate-world', 'v2') as CanaryWorld;
    baselineCaptures = splitByWorld(run.captures, baselineWorld);
    candidateCaptures = splitByWorld(run.captures, candidateWorld);
    baselineDir = candidateDir = dirname(runPath);
    label = `${run.label ?? runPath} (${baselineWorld} vs ${candidateWorld})`;
  } else if (baselinePath && candidatePath) {
    const baselineRun = readRun(baselinePath), candidateRun = readRun(candidatePath);
    baselineCaptures = baselineRun.captures; candidateCaptures = candidateRun.captures;
    baselineDir = dirname(baselinePath); candidateDir = dirname(candidatePath);
    label = `${baselineRun.label ?? baselinePath} vs ${candidateRun.label ?? candidatePath}`;
  } else {
    console.error('usage: compare-canaries.mts --run <canaries.json> | --baseline <canaries.json> --candidate <canaries.json>');
    process.exit(2);
  }

  const images = new Map<string, { baseline: DecodedImage; candidate: DecodedImage }>();
  if (readImages) {
    const { matched } = matchCanaryCaptures(baselineCaptures, candidateCaptures);
    for (const pair of matched) {
      const baselineFile = join(baselineDir, pair.baseline.file), candidateFile = join(candidateDir, pair.candidate.file);
      try {
        images.set(pair.key, { baseline: decodePng(readFileSync(baselineFile)), candidate: decodePng(readFileSync(candidateFile)) });
      } catch (error) {
        console.warn(`pixel diff skipped for ${pair.key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const report: CanaryComparisonReport = compareCanaryRuns(baselineCaptures, candidateCaptures, { tier, tolerance, images, gate });
  if (!report.rows.length) { console.error(`nothing to compare: ${label} — 0 matched (hole, preset, viewport) captures`); process.exit(2); }

  console.log(`${label} · tier ${report.tier} · gate ${gate} · ${report.rows.length} matched captures`);
  if (report.duplicateBaselineKeys.length) console.warn(`duplicate baseline keys (kept the first occurrence): ${report.duplicateBaselineKeys.join(', ')}`);
  if (report.duplicateCandidateKeys.length) console.warn(`duplicate candidate keys (kept the first occurrence): ${report.duplicateCandidateKeys.join(', ')}`);
  if (report.baselineOnly.length) console.log(`baseline-only (no candidate match): ${report.baselineOnly.map(c => `${c.hole}:${c.preset}:${c.viewport}`).join(', ')}`);
  if (report.candidateOnly.length) console.log(`candidate-only (no baseline match): ${report.candidateOnly.map(c => `${c.hole}:${c.preset}:${c.viewport}`).join(', ')}`);

  console.table(report.rows.map(row => ({
    hole: row.hole, preset: row.preset, viewport: row.viewport,
    drawCalls: fmtMetric(row.metrics.drawCalls), triangles: fmtMetric(row.metrics.renderTriangles),
    frameP95Ms: fmtMetric(row.metrics.frameP95Ms, 2), shadowUpdates: fmtMetric(row.metrics.shadowUpdates),
    baselineHash: shortHash(row.metrics.baselineArtifactHash), candidateHash: shortHash(row.metrics.candidateArtifactHash),
    pixelMismatch: row.pixelDiff ? `${(row.pixelDiff.mismatch * 100).toFixed(2)}%` : '·',
    bbox: row.pixelDiff?.bbox ? row.pixelDiff.bbox.join(',') : (row.pixelDiff?.sizeMismatch ? 'size mismatch' : '·'),
    violations: row.violations.length,
  })));
  console.log(`worst pixel mismatch: ${report.worstMismatch != null ? `${(report.worstMismatch * 100).toFixed(2)}%` : 'not computed (no images)'}`);

  if (report.violations.length) {
    console.log(`\n${report.violations.length} violation(s):`);
    console.table(report.violations);
  } else {
    console.log('\nno budget violations');
  }
  const errorCount = report.violations.filter(v => v.severity === 'error').length;
  if (errorCount) { console.error(`\n${errorCount} error-severity violation(s)`); process.exit(1); }
}

// Runnable as a CLI (`tsx compare-canaries.mts ...`) and importable for its
// exports (`decodePng`, for `canary-compare.test.ts`'s PNG-decoding tests)
// without the import itself parsing argv, reading files or exiting.
if (import.meta.url === `file://${process.argv[1]}`) main();
