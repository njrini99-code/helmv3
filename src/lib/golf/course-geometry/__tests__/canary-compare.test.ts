import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  canaryMetrics, captureKey, compareCanaryRuns, diffCanaryMetrics, diffPixels, evaluateCanaryBudgets, matchCanaryCaptures, resolveWorld, tierForViewport,
  type CanaryCapture, type CanaryRunFile, type DecodedImage,
} from '../canary-compare';
// The CLI script, imported only for its pure `decodePng`/`parseFiniteNumber`
// exports (guarded by an `import.meta.url` entry-point check so importing it
// here never parses argv, reads a file or calls `process.exit` — see that
// file's tail).
import { decodePng, parseFiniteNumber } from '../../../../../scripts/golf/course-geometry/compare-canaries.mjs';

/** Builds a `DecodedImage` from a flat list of `[r,g,b,a]` pixels, row-major. */
function image(width: number, height: number, pixels: readonly (readonly [number, number, number, number])[]): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  pixels.forEach((pixel, index) => data.set(pixel, index * 4));
  return { width, height, data };
}
function solid(width: number, height: number, rgba: readonly [number, number, number, number]): DecodedImage {
  return image(width, height, Array.from({ length: width * height }, () => rgba));
}

// --- Tiny PNG encoder, independent of `decodePng`, for the decoder tests
// below. It exists only to build fixtures with a *chosen* filter type per
// row (Sub/Up/Average/Paeth): there is no other way to exercise those code
// paths without a real screenshot or a third-party PNG library. ---
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function paethRef(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // decodePng never checks the CRC
}
function encodeTestPng(width: number, height: number, pixels: Uint8Array, channels: 3 | 4, filterPerRow: readonly number[]): Buffer {
  const rowBytes = width * channels;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  let previousRow: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const filterType = filterPerRow[y] ?? 0;
    const row = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    const outOffset = y * (1 + rowBytes);
    raw[outOffset] = filterType;
    for (let i = 0; i < rowBytes; i++) {
      const x = row[i]!;
      const a = i >= channels ? row[i - channels]! : 0;
      const b = previousRow ? previousRow[i]! : 0;
      const c = previousRow && i >= channels ? previousRow[i - channels]! : 0;
      let filtered: number;
      switch (filterType) {
        case 0: filtered = x; break;
        case 1: filtered = x - a; break;
        case 2: filtered = x - b; break;
        case 3: filtered = x - Math.floor((a + b) / 2); break;
        case 4: filtered = x - paethRef(a, b, c); break;
        default: throw new Error('bad test filter type');
      }
      raw[outOffset + 1 + i] = filtered & 0xff;
    }
    previousRow = row;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(channels === 4 ? 6 : 2, 9); // color type: 6 = truecolor+alpha, 2 = truecolor
  ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12); // compression, filter, interlace
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function capture(overrides: Partial<CanaryCapture> = {}): CanaryCapture {
  return { hole: 7, preset: 'top', viewport: '390x844', file: 'hole-07-top-390x844.png', metadata: {}, ...overrides };
}

describe('captureKey / resolveWorld', () => {
  it('keys on hole, preset and viewport only (world is not part of the match key)', () => {
    expect(captureKey(capture())).toBe('7:top:390x844');
    expect(captureKey(capture({ world: 'v2' }))).toBe(captureKey(capture({ world: 'v1' })));
  });
  it('defaults a missing world to v1 — every pre-Task-26 canaries.json predates the field', () => {
    expect(resolveWorld(capture())).toBe('v1');
    expect(resolveWorld(capture({ world: 'v2' }))).toBe('v2');
  });
});

describe('matchCanaryCaptures', () => {
  const baseline = [capture({ hole: 7, preset: 'top', world: 'v1' }), capture({ hole: 9, preset: 'green', world: 'v1' })];
  const candidate = [capture({ hole: 7, preset: 'top', world: 'v2' }), capture({ hole: 11, preset: 'approach', world: 'v2' })];

  it('matches by (hole, preset, viewport) and reports each side\'s leftovers', () => {
    const result = matchCanaryCaptures(baseline, candidate);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.key).toBe('7:top:390x844');
    expect(result.baselineOnly).toEqual([baseline[1]]);
    expect(result.candidateOnly).toEqual([candidate[1]]);
    expect(result.duplicateBaselineKeys).toEqual([]);
    expect(result.duplicateCandidateKeys).toEqual([]);
  });

  it('flags a duplicate key instead of silently dropping the second row', () => {
    const dupedCandidate = [candidate[0]!, capture({ hole: 7, preset: 'top', world: 'v2', file: 'second.png' })];
    const result = matchCanaryCaptures(baseline, dupedCandidate);
    expect(result.duplicateCandidateKeys).toEqual(['7:top:390x844']);
    // The first candidate row still matches; nothing is thrown away.
    expect(result.matched).toHaveLength(1);
  });

  it('never drops a second baseline row that collides on an already-matched key', () => {
    const dupedBaseline = [baseline[0]!, capture({ hole: 7, preset: 'top', world: 'v1', file: 'second.png' })];
    const result = matchCanaryCaptures(dupedBaseline, candidate);
    expect(result.duplicateBaselineKeys).toEqual(['7:top:390x844']);
    expect(result.matched).toHaveLength(1);
    // dupedBaseline only contains the two hole-7 rows (no hole-9 row in this
    // scenario); the second one has no unmatched candidate left to pair with.
    expect(result.baselineOnly).toEqual([dupedBaseline[1]]);
  });

  it('never drops a second candidate row that collides on an already-matched key (symmetric with the baseline case above)', () => {
    const dupedCandidate = [candidate[0]!, capture({ hole: 7, preset: 'top', world: 'v2', file: 'second.png' })];
    const result = matchCanaryCaptures(baseline, dupedCandidate);
    expect(result.duplicateCandidateKeys).toEqual(['7:top:390x844']);
    expect(result.matched).toHaveLength(1);
    // First occurrence wins the match ("kept the first occurrence", same as
    // duplicateCandidateKeys' own convention) — not the second, later row.
    expect(result.matched[0]!.candidate).toBe(dupedCandidate[0]);
    // The second row is not silently dropped: it was never anyone's match
    // partner, so it surfaces in candidateOnly exactly like a losing
    // duplicate baseline row surfaces in baselineOnly above.
    expect(result.candidateOnly).toEqual([dupedCandidate[1]]);
  });
});

describe('canaryMetrics', () => {
  it('parses dataset-shaped strings (DOM dataset is always string-valued)', () => {
    const metrics = canaryMetrics(capture({ metadata: { drawCalls: '42', renderTriangles: '18000', frameP95Ms: '9.87', shadowUpdates: '3', visualArtifactHash: 'ab12cd34', bufferWidth: '780', bufferHeight: '1688' } }));
    expect(metrics).toEqual({ drawCalls: 42, renderTriangles: 18_000, frameP95Ms: 9.87, shadowUpdates: 3, artifactHash: 'ab12cd34', bufferPixels: 780 * 1_688 });
  });
  it('also accepts plain numbers, for hand-built fixtures that skip stringification', () => {
    expect(canaryMetrics(capture({ metadata: { drawCalls: 42 } })).drawCalls).toBe(42);
  });
  it('treats "", null and undefined as not-recorded, never as 0 (constraint 15)', () => {
    const metrics = canaryMetrics(capture({ metadata: { drawCalls: '', renderTriangles: null, frameP95Ms: undefined } }));
    expect(metrics.drawCalls).toBeNull();
    expect(metrics.renderTriangles).toBeNull();
    expect(metrics.frameP95Ms).toBeNull();
  });
  it('treats a non-finite string as not-recorded rather than throwing or coercing to NaN', () => {
    expect(canaryMetrics(capture({ metadata: { drawCalls: 'not-a-number' } })).drawCalls).toBeNull();
  });
  it('leaves bufferPixels null unless both dimensions were recorded', () => {
    expect(canaryMetrics(capture({ metadata: { bufferWidth: '780' } })).bufferPixels).toBeNull();
  });
});

describe('diffCanaryMetrics', () => {
  it('computes delta and percent change per metric', () => {
    const baseline = capture({ metadata: { drawCalls: 100, renderTriangles: 20_000, frameP95Ms: 10, shadowUpdates: 2, visualArtifactHash: 'v1hash' } });
    const candidate = capture({ metadata: { drawCalls: 120, renderTriangles: 19_000, frameP95Ms: 8, shadowUpdates: 2, visualArtifactHash: 'v2hash' } });
    const diff = diffCanaryMetrics(baseline, candidate);
    expect(diff.drawCalls).toEqual({ baseline: 100, candidate: 120, delta: 20, percentChange: 20 });
    expect(diff.renderTriangles).toEqual({ baseline: 20_000, candidate: 19_000, delta: -1_000, percentChange: -5 });
    expect(diff.shadowUpdates).toEqual({ baseline: 2, candidate: 2, delta: 0, percentChange: 0 });
    expect(diff.baselineArtifactHash).toBe('v1hash');
    expect(diff.candidateArtifactHash).toBe('v2hash');
  });
  it('leaves delta/percentChange null when either side is missing (never divides by a fabricated 0)', () => {
    const diff = diffCanaryMetrics(capture({ metadata: {} }), capture({ metadata: { drawCalls: 120 } }));
    expect(diff.drawCalls).toEqual({ baseline: null, candidate: 120, delta: null, percentChange: null });
  });
  it('reports percentChange as null (not Infinity) off a zero baseline', () => {
    const diff = diffCanaryMetrics(capture({ metadata: { shadowUpdates: 0 } }), capture({ metadata: { shadowUpdates: 4 } }));
    expect(diff.shadowUpdates).toEqual({ baseline: 0, candidate: 4, delta: 4, percentChange: null });
  });
});

describe('tierForViewport', () => {
  it('recognizes Task 26\'s two required viewport labels', () => {
    expect(tierForViewport('390x844')).toBe('phone');
    expect(tierForViewport('1440x1000')).toBe('desktop');
  });
  it('returns null for anything else instead of guessing', () => {
    expect(tierForViewport('768x1024')).toBeNull();
    expect(tierForViewport('phone')).toBeNull();
  });
});

describe('evaluateCanaryBudgets', () => {
  it('derives the tier from the viewport when none is given (a real run always mixes phone and desktop)', () => {
    const phoneCapture = capture({ viewport: '390x844', metadata: { drawCalls: 200 } });
    const desktopCapture = capture({ viewport: '1440x1000', metadata: { drawCalls: 200 } });
    expect(evaluateCanaryBudgets(phoneCapture)).toEqual([{ hole: '7:top', rule: 'draw-calls', value: 200, limit: 180, severity: 'error', section: '§93' }]);
    // Same draw-calls value, desktop viewport: no budget exists for "high" tier, so nothing fires.
    expect(evaluateCanaryBudgets(desktopCapture)).toEqual([]);
  });
  it('skips only the draw-calls rule for an unrecognized viewport, never guessing a tier', () => {
    const unknownViewport = capture({ viewport: '768x1024', preset: 'green', metadata: { drawCalls: 999, renderTriangles: 95_000 } });
    const violations = evaluateCanaryBudgets(unknownViewport);
    expect(violations).toEqual([{ hole: '7:green', rule: 'close-frame-visible-runtime', value: 95_000, limit: 90_000, severity: 'warn', section: '§11' }]);
  });
  it('phone tier: no violation under the §93 target (160)', () => {
    expect(evaluateCanaryBudgets(capture({ metadata: { drawCalls: 150 } }), 'phone')).toEqual([]);
  });
  it('phone tier: warns between target (160) and hard (180)', () => {
    const violations = evaluateCanaryBudgets(capture({ metadata: { drawCalls: 170 } }), 'phone');
    expect(violations).toEqual([{ hole: '7:top', rule: 'draw-calls', value: 170, limit: 160, severity: 'warn', section: '§93' }]);
  });
  it('phone tier: errors over the §93 hard ceiling (180)', () => {
    const violations = evaluateCanaryBudgets(capture({ metadata: { drawCalls: 200 } }), 'phone');
    expect(violations).toEqual([{ hole: '7:top', rule: 'draw-calls', value: 200, limit: 180, severity: 'error', section: '§93' }]);
  });
  it('desktop tier never gates draw calls — the plan states no "high" tier number (V2_BUDGETS.desktop.drawCalls is undefined)', () => {
    expect(evaluateCanaryBudgets(capture({ metadata: { drawCalls: 999 } }), 'desktop')).toEqual([]);
  });
  it('skips the draw-calls rule when the capture never recorded one, instead of gating a fabricated 0', () => {
    expect(evaluateCanaryBudgets(capture({ metadata: {} }), 'phone')).toEqual([]);
  });
  it('warns (not errors) a green-preset capture over the §11 90k close-frame ceiling', () => {
    const violations = evaluateCanaryBudgets(capture({ preset: 'green', metadata: { renderTriangles: 95_000 } }), 'phone');
    expect(violations).toEqual([{ hole: '7:green', rule: 'close-frame-visible-runtime', value: 95_000, limit: 90_000, severity: 'warn', section: '§11' }]);
  });
  it('matches the green preset case-insensitively', () => {
    expect(evaluateCanaryBudgets(capture({ preset: 'Green', metadata: { renderTriangles: 95_000 } }), 'phone')).toHaveLength(1);
  });
  it('never applies the close-frame ceiling to a top/approach shot, however high the triangle count (§11 scopes it to the green frame)', () => {
    expect(evaluateCanaryBudgets(capture({ preset: 'top', metadata: { renderTriangles: 500_000 } }), 'phone')).toEqual([]);
    expect(evaluateCanaryBudgets(capture({ preset: 'approach', metadata: { renderTriangles: 500_000 } }), 'phone')).toEqual([]);
  });
  it('applies the close-frame ceiling on desktop too (closeFrameVisible is shared tier-independent)', () => {
    expect(evaluateCanaryBudgets(capture({ preset: 'green', metadata: { renderTriangles: 95_000 } }), 'desktop')).toHaveLength(1);
  });
});

describe('diffPixels', () => {
  it('reports zero mismatch and a null bbox for identical images', () => {
    const a = solid(4, 4, [10, 20, 30, 255]);
    const b = solid(4, 4, [10, 20, 30, 255]);
    expect(diffPixels(a, b)).toEqual({ mismatch: 0, changedPixels: 0, totalPixels: 16, bbox: null });
  });
  it('ignores the alpha channel, matching the Python tool\'s .convert("RGB")', () => {
    const a = solid(2, 2, [10, 20, 30, 255]);
    const b = solid(2, 2, [10, 20, 30, 0]);
    expect(diffPixels(a, b).mismatch).toBe(0);
  });
  it('treats the tolerance boundary as strictly-greater-than, not >=', () => {
    const a = solid(1, 1, [100, 100, 100, 255]);
    const atTolerance = solid(1, 1, [124, 100, 100, 255]); // diff exactly 24
    const overTolerance = solid(1, 1, [125, 100, 100, 255]); // diff exactly 25
    expect(diffPixels(a, atTolerance, 24).changedPixels).toBe(0);
    expect(diffPixels(a, overTolerance, 24).changedPixels).toBe(1);
  });
  it('reports the inclusive bounding box of a single changed pixel', () => {
    const a = solid(4, 3, [0, 0, 0, 255]);
    const b = image(4, 3, Array.from({ length: 12 }, (_, i) => (i === 6 ? [255, 0, 0, 255] : [0, 0, 0, 255]) as [number, number, number, number]));
    const result = diffPixels(a, b);
    // Pixel index 6 in a 4-wide grid is row 1, column 2.
    expect(result.changedPixels).toBe(1);
    expect(result.bbox).toEqual([2, 1, 2, 1]);
    expect(result.mismatch).toBeCloseTo(1 / 12);
  });
  it('grows the bbox to cover every changed pixel', () => {
    const a = solid(4, 4, [0, 0, 0, 255]);
    const changedIndexes = new Set([0, 15]); // corners: (0,0) and (3,3)
    const b = image(4, 4, Array.from({ length: 16 }, (_, i) => (changedIndexes.has(i) ? [255, 255, 255, 255] : [0, 0, 0, 255]) as [number, number, number, number]));
    expect(diffPixels(a, b).bbox).toEqual([0, 0, 3, 3]);
  });
  it('reports mismatch 1 on a dimension mismatch instead of throwing, exactly like diff-visual-canaries.py', () => {
    const a = solid(4, 4, [0, 0, 0, 255]);
    const b = solid(8, 8, [0, 0, 0, 255]);
    const result = diffPixels(a, b);
    expect(result).toMatchObject({ mismatch: 1, changedPixels: 0, totalPixels: 0, bbox: null });
    expect(result.sizeMismatch).toEqual([[4, 4], [8, 8]]);
  });
  it('orders sizeMismatch as [width, height] pairs (this module\'s own field order) — a square 4x4-vs-8x8 fixture can\'t tell that apart from [height, width], so this uses rectangular images', () => {
    const a = solid(5, 3, [0, 0, 0, 255]); // width 5, height 3
    const b = solid(2, 9, [0, 0, 0, 255]); // width 2, height 9
    expect(diffPixels(a, b).sizeMismatch).toEqual([[5, 3], [2, 9]]);
  });
  it('treats a NaN tolerance as "nothing is ever different" (Math.max(...) > NaN is always false, mirroring Python\'s x > float("nan")) — this is exactly why --tolerance is validated at the CLI boundary (parseFiniteNumber below) rather than guarded inside diffPixels itself', () => {
    const a = solid(1, 1, [0, 0, 0, 255]);
    const b = solid(1, 1, [255, 255, 255, 255]);
    expect(diffPixels(a, b, NaN).changedPixels).toBe(0);
  });
});

describe('compareCanaryRuns', () => {
  /** A hand-built two-file "canaries.json" fixture (Task 26: "test the
   * comparison on synthetic canaries.json fixtures"), round-tripped through
   * JSON so every metadata value really is string-typed the way a real
   * `canvas.dataset` read would be. */
  function syntheticRun(world: 'v1' | 'v2', drawCalls: number, renderTriangles: number, hash: string): CanaryRunFile {
    const raw = {
      label: `fixture-${world}`, course: 'peek-n-peak-upper',
      captures: [
        { hole: 7, preset: 'top', viewport: '390x844', world, file: `hole-07-top-${world}.png`,
          metadata: { drawCalls: String(drawCalls), renderTriangles: String(renderTriangles), frameP95Ms: '9.50', shadowUpdates: '1', visualArtifactHash: hash } },
        { hole: 15, preset: 'green', viewport: '1440x1000', world, file: `hole-15-green-${world}.png`,
          metadata: { drawCalls: String(drawCalls + 10), renderTriangles: String(renderTriangles + 40_000), frameP95Ms: '11.20', shadowUpdates: '2', visualArtifactHash: hash } },
      ],
    };
    return JSON.parse(JSON.stringify(raw)) as CanaryRunFile;
  }
  const baselineRun = syntheticRun('v1', 140, 40_000, 'v1-artifact-hash');
  const candidateRun = syntheticRun('v2', 150, 55_000, 'v2-artifact-hash');

  it('produces one row per matched capture with metrics, no pixel diff when no images are supplied, and gates the candidate by default', () => {
    const report = compareCanaryRuns(baselineRun.captures, candidateRun.captures, { tier: 'phone' });
    expect(report.rows).toHaveLength(2);
    expect(report.baselineOnly).toEqual([]);
    expect(report.candidateOnly).toEqual([]);
    const top = report.rows.find(row => row.preset === 'top')!;
    expect(top.metrics.drawCalls).toEqual({ baseline: 140, candidate: 150, delta: 10, percentChange: (10 / 140) * 100 });
    expect(top.metrics.baselineArtifactHash).toBe('v1-artifact-hash');
    expect(top.metrics.candidateArtifactHash).toBe('v2-artifact-hash');
    expect(top.pixelDiff).toBeNull();
    // hole 15 is a green shot at 55_000 + 40_000 = 95_000 candidate triangles: over the 90k ceiling, warn.
    const green = report.rows.find(row => row.preset === 'green')!;
    expect(green.violations).toEqual([{ hole: '15:green', rule: 'close-frame-visible-runtime', value: 95_000, limit: 90_000, severity: 'warn', section: '§11' }]);
    expect(report.violations).toHaveLength(1);
  });

  it('computes pixel diffs only for capture keys present in the images map', () => {
    const key = captureKey({ hole: 7, preset: 'top', viewport: '390x844' });
    const images = new Map([[key, { baseline: solid(2, 2, [1, 2, 3, 255]), candidate: solid(2, 2, [1, 2, 3, 255]) }]]);
    const report = compareCanaryRuns(baselineRun.captures, candidateRun.captures, { images });
    expect(report.rows.find(row => row.key === key)!.pixelDiff).toEqual({ mismatch: 0, changedPixels: 0, totalPixels: 4, bbox: null });
    expect(report.rows.find(row => row.preset === 'green')!.pixelDiff).toBeNull();
    expect(report.worstMismatch).toBe(0);
  });

  it('respects the gate option: "none" reports metrics with zero violations even over budget', () => {
    const report = compareCanaryRuns(baselineRun.captures, candidateRun.captures, { gate: 'none' });
    expect(report.violations).toEqual([]);
  });

  it('"both" evaluates baseline and candidate independently', () => {
    // Baseline hole 15 is 40_000 + 40_000 = 80_000 (under); candidate is 95_000 (over).
    const report = compareCanaryRuns(baselineRun.captures, candidateRun.captures, { gate: 'both' });
    const green = report.rows.find(row => row.preset === 'green')!;
    expect(green.violations).toHaveLength(1); // only the candidate side is over budget
  });

  it('leaves unmatched captures out of rows but surfaces them on the report', () => {
    const extraCandidate = [...candidateRun.captures, { hole: 18, preset: 'top', viewport: '390x844', world: 'v2' as const, file: 'x.png', metadata: {} }];
    const report = compareCanaryRuns(baselineRun.captures, extraCandidate);
    expect(report.rows).toHaveLength(2);
    expect(report.candidateOnly).toHaveLength(1);
    expect(report.candidateOnly[0]!.hole).toBe(18);
  });

  it('reports tier "per-viewport" when no override is given, and the literal tier when one is', () => {
    expect(compareCanaryRuns(baselineRun.captures, candidateRun.captures).tier).toBe('per-viewport');
    expect(compareCanaryRuns(baselineRun.captures, candidateRun.captures, { tier: 'desktop' }).tier).toBe('desktop');
  });

  it('gates a mixed phone+desktop run per row instead of one tier for everything — the bug a single global tier produces', () => {
    // Same draw-calls value (190, over the §93 hard ceiling of 180) on both
    // a phone-viewport and a desktop-viewport capture. A single global tier
    // would either gate both (desktop has no such budget — false positive)
    // or gate neither (phone genuinely breaches §93 — a silently swallowed
    // regression, the worse failure mode).
    const baseline: CanaryCapture[] = [
      capture({ hole: 1, preset: 'top', viewport: '390x844', world: 'v1', metadata: { drawCalls: 150 } }),
      capture({ hole: 1, preset: 'top', viewport: '1440x1000', world: 'v1', metadata: { drawCalls: 150 } }),
    ];
    const candidate: CanaryCapture[] = [
      capture({ hole: 1, preset: 'top', viewport: '390x844', world: 'v2', metadata: { drawCalls: 190 } }),
      capture({ hole: 1, preset: 'top', viewport: '1440x1000', world: 'v2', metadata: { drawCalls: 190 } }),
    ];
    const report = compareCanaryRuns(baseline, candidate); // no tier override
    const phoneRow = report.rows.find(row => row.viewport === '390x844')!;
    const desktopRow = report.rows.find(row => row.viewport === '1440x1000')!;
    expect(phoneRow.violations).toEqual([{ hole: '1:top', rule: 'draw-calls', value: 190, limit: 180, severity: 'error', section: '§93' }]);
    expect(desktopRow.violations).toEqual([]);
  });
});

describe('decodePng (compare-canaries.mts)', () => {
  it('round-trips a filter-0 (None) RGBA image exactly', () => {
    const width = 3, height = 2;
    const pixels = new Uint8Array([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
      100, 110, 120, 200, 130, 140, 150, 100, 160, 170, 180, 0,
    ]);
    const decoded = decodePng(encodeTestPng(width, height, pixels, 4, [0, 0]));
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(Array.from(decoded.data)).toEqual(Array.from(pixels));
  });

  it('round-trips a truecolor (no alpha) image and fills alpha=255', () => {
    const rgb = new Uint8Array([1, 2, 3, 4, 5, 6]); // two 3-byte pixels
    const decoded = decodePng(encodeTestPng(2, 1, rgb, 3, [0]));
    expect(Array.from(decoded.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('reconstructs the Sub filter (byte-to-the-left prediction)', () => {
    const pixels = new Uint8Array([10, 20, 30, 255, 50, 60, 70, 255, 90, 100, 110, 255]);
    expect(Array.from(decodePng(encodeTestPng(3, 1, pixels, 4, [1])).data)).toEqual(Array.from(pixels));
  });

  it('reconstructs the Up filter (byte-above prediction)', () => {
    const pixels = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 15, 25, 200, 255, 44, 5, 6, 255]);
    expect(Array.from(decodePng(encodeTestPng(2, 2, pixels, 4, [0, 2])).data)).toEqual(Array.from(pixels));
  });

  it('reconstructs the Average filter', () => {
    const pixels = new Uint8Array([10, 200, 30, 255, 250, 5, 60, 255, 15, 25, 210, 255, 44, 250, 6, 255]);
    expect(Array.from(decodePng(encodeTestPng(2, 2, pixels, 4, [0, 3])).data)).toEqual(Array.from(pixels));
  });

  it('reconstructs the Paeth filter — the reconstruction most likely to break in a from-scratch decoder', () => {
    const width = 3, height = 3;
    const pixels = new Uint8Array(width * height * 4);
    // Deterministic non-monotonic values (no fixture RNG — constraint 15)
    // chosen so the Paeth predictor's a/b/c candidates disagree with each other.
    for (let i = 0; i < pixels.length; i += 4) {
      const p = i / 4;
      pixels[i] = (p * 37) % 256; pixels[i + 1] = (p * 91 + 11) % 256; pixels[i + 2] = (255 - p * 53) % 256; pixels[i + 3] = 255;
    }
    expect(Array.from(decodePng(encodeTestPng(width, height, pixels, 4, [0, 4, 4])).data)).toEqual(Array.from(pixels));
  });

  it('reconstructs a PNG that mixes filter types row by row, like a real screenshot', () => {
    const width = 2, height = 4;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17 + 3) % 256;
    expect(Array.from(decodePng(encodeTestPng(width, height, pixels, 4, [0, 1, 2, 4])).data)).toEqual(Array.from(pixels));
  });

  it('rejects a non-PNG buffer', () => {
    expect(() => decodePng(Buffer.from('not a png'))).toThrow(/signature/);
  });

  it('rejects an unsupported bit depth instead of guessing', () => {
    const png = encodeTestPng(1, 1, new Uint8Array([0, 0, 0, 255]), 4, [0]);
    png.writeUInt8(16, 8 + 4 + 4 + 8); // sig(8) + length(4) + type(4) + IHDR bitDepth offset(8)
    expect(() => decodePng(png)).toThrow(/bit depth/);
  });

  it('rejects an unsupported color type (grayscale/palette) instead of guessing', () => {
    const png = encodeTestPng(1, 1, new Uint8Array([0, 0, 0, 255]), 4, [0]);
    png.writeUInt8(0, 8 + 4 + 4 + 9); // IHDR colorType offset
    expect(() => decodePng(png)).toThrow(/color type/);
  });

  it('rejects an interlaced PNG instead of guessing', () => {
    const png = encodeTestPng(1, 1, new Uint8Array([0, 0, 0, 255]), 4, [0]);
    png.writeUInt8(1, 8 + 4 + 4 + 12); // IHDR interlace offset
    expect(() => decodePng(png)).toThrow(/interlac/);
  });
});

describe('parseFiniteNumber (compare-canaries.mts)', () => {
  it('parses a valid numeric string, including 0', () => {
    expect(parseFiniteNumber('24')).toBe(24);
    expect(parseFiniteNumber('0')).toBe(0);
    expect(parseFiniteNumber('3.5')).toBe(3.5);
  });
  it('returns null — never NaN — for a non-finite or non-numeric string, which is what lets main() reject a bad --tolerance with exit(2) instead of silently comparing against NaN', () => {
    expect(parseFiniteNumber('not-a-number')).toBeNull();
    expect(parseFiniteNumber('NaN')).toBeNull();
    expect(parseFiniteNumber('Infinity')).toBeNull();
    expect(parseFiniteNumber('24abc')).toBeNull();
  });
});
