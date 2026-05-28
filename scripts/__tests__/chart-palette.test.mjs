import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W5B — chart palette + decoration normalization
 * (agent palette).
 *
 * W5A shipped the canonical chart primitives + the five-role CHART_PALETTE.
 * W5B enforces that vocabulary across the player-facing chart components and
 * strips the decorative chrome the audit flagged:
 *
 *   - PuttHeatmap          → the made-putt dot fill is the brand-green TOKEN
 *     (`var(--color-primary-600)`), not the raw emerald `#10b981`.
 *   - PuttMakeChart        → the 9-color green→yellow→orange→red rainbow ramp
 *     (in ProgressStats) is collapsed to a single-hue primary ramp.
 *   - PatternImpactPanel   → the 5-slice lifecycle donut becomes a horizontal
 *     bar via <ChartShell>; no PieChart/Pie/donut chrome remains.
 *   - DispersionStats      → the decorative `repeat: Infinity` pulse circles
 *     are removed (rendered static).
 *   - ProgressStats        → the 10× copy-pasted top-edge gradient dividers are
 *     deleted.
 *
 * This test re-asserts that contract so the targeted chart hardcodes and
 * decorations cannot silently drift back in. It reads file SOURCE (not a
 * runtime render) so it stays fast + dependency-free.
 *
 * ALLOWLIST: a handful of raw values legitimately cannot use a token —
 * <canvas> ctx fills, brand/DB-driven inline styles, Resend email HTML,
 * src/app/globals.css raw declarations, and the SVG green-felt gradient stops
 * inside PuttHeatmap that are part of the illustration (not a data series).
 * Those are NOT `#10b981` and are not asserted against here, so the test still
 * FAILS on any NON-allowlisted reintroduction of the banned patterns.
 *
 * Audit reference: ultra-audit master synthesis A4 (component sprawl) + A2 /
 * §5 (one chart palette, one chart surface, no decorative chrome).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const src = (...parts) => join(REPO_ROOT, 'src', ...parts);

const PUTT_HEATMAP = src('components', 'golf', 'coachhelm', 'v3', 'PuttHeatmap', 'index.tsx');
const PROGRESS_STATS = src('components', 'golf', 'stats', 'ProgressStats.tsx');
const PUTTING_STATS = src('components', 'golf', 'stats', 'sections', 'PuttingStats.tsx');
const DISPERSION_STATS = src('components', 'golf', 'stats', 'sections', 'DispersionStats.tsx');
const PATTERN_IMPACT = src('components', 'golf', 'coachhelm', 'analytics', 'PatternImpactPanel.tsx');

const read = (path) => readFile(path, 'utf8');

test('PuttHeatmap: made-putt fill uses the primary token, not raw #10b981', async () => {
  const code = await read(PUTT_HEATMAP);
  assert.ok(
    !/#10b981/i.test(code),
    'PuttHeatmap must not hardcode #10b981 — use var(--color-primary-600).',
  );
  assert.match(
    code,
    /var\(--color-primary-600\)/,
    'PuttHeatmap must color made-putt dots with var(--color-primary-600).',
  );
});

test('No targeted chart hardcodes #10b981 anywhere in the player chart paths', async () => {
  for (const path of [PUTT_HEATMAP, PROGRESS_STATS, PUTTING_STATS, DISPERSION_STATS, PATTERN_IMPACT]) {
    const code = await read(path);
    assert.ok(
      !/#10b981/i.test(code),
      `${path} must not hardcode #10b981 (emerald) — reach for a token.`,
    );
  }
});

test('PuttMakeChart: 9-color rainbow ramp collapsed to a single-hue primary ramp', async () => {
  const code = await read(PROGRESS_STATS);
  // Isolate the PuttMakeChart data block (the one keyed by `puttMakePct0_3`).
  const start = code.indexOf('puttMakePct0_3');
  assert.ok(start !== -1, 'PuttMakeChart distance buckets must still exist.');
  const block = code.slice(start, start + 1200);

  // The old rainbow hexes (yellow/orange/red ramp) must be gone from the bucket fills.
  for (const banned of ['#fbbf24', '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#22c55e']) {
    assert.ok(
      !block.includes(banned),
      `PuttMakeChart must not use the rainbow-ramp hex ${banned}; use a single-hue primary ramp.`,
    );
  }
  // The single-hue primary ramp uses primary-scale token vars.
  assert.match(
    block,
    /var\(--color-primary-\d00\)/,
    'PuttMakeChart bucket fills must be primary-scale token vars (single-hue ramp).',
  );
  // PRESERVATION: every distance bucket data point is still present.
  for (const key of [
    'puttMakePct0_3', 'puttMakePct3_5', 'puttMakePct5_10', 'puttMakePct10_15',
    'puttMakePct15_20', 'puttMakePct20_25', 'puttMakePct25_30', 'puttMakePct30_35',
    'puttMakePct35Plus',
  ]) {
    assert.ok(block.includes(key), `PuttMakeChart must preserve the ${key} bucket.`);
  }
});

test('PatternImpactPanel: lifecycle distribution is a bar via ChartShell, not a pie/donut', async () => {
  const code = await read(PATTERN_IMPACT);
  // No pie/donut chrome.
  assert.ok(!/\bPieChart\b/.test(code), 'PatternImpactPanel must not render a PieChart.');
  assert.ok(!/<Pie\b/.test(code), 'PatternImpactPanel must not render a <Pie> (donut).');
  assert.ok(
    !/import\s*\{[^}]*\bPie\b[^}]*\}\s*from\s*['"]recharts['"]/.test(code),
    'PatternImpactPanel must not import Pie/PieChart from recharts.',
  );
  // It now renders a (horizontal) bar via ChartShell.
  assert.match(code, /\bChartShell\b/, 'PatternImpactPanel must wrap the distribution chart in ChartShell.');
  assert.match(code, /<BarChart\b/, 'PatternImpactPanel must render a BarChart for the distribution.');
  assert.match(code, /layout="vertical"/, 'The distribution BarChart must be horizontal (layout="vertical").');
  // PRESERVATION: the lifecycle data + per-state Cell colors are kept.
  assert.match(code, /lifecycleChartData/, 'PatternImpactPanel must preserve the lifecycleChartData series.');
  assert.match(code, /<Cell\b/, 'PatternImpactPanel must keep per-state Cell colors.');
});

test('DispersionStats: decorative repeat:Infinity pulse circles are removed', async () => {
  const code = await read(DISPERSION_STATS);
  assert.ok(
    !/repeat:\s*Infinity/.test(code),
    'DispersionStats must not use repeat: Infinity decorative pulses (render the SVG marks static).',
  );
  // PRESERVATION: the point-cloud render + outcome styling stays.
  assert.match(code, /OUTCOME_STYLES/, 'DispersionStats must preserve OUTCOME_STYLES.');
  assert.match(code, /group\.points\.map/, 'DispersionStats must still plot every shot point.');
});

test('ProgressStats: the 10x copy-pasted top-edge gradient dividers are deleted', async () => {
  const code = await read(PROGRESS_STATS);
  assert.ok(
    !code.includes('absolute inset-x-0 top-0 h-px'),
    'ProgressStats must not re-add the copy-pasted top-edge gradient divider divs.',
  );
  assert.ok(
    !code.includes('linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)'),
    'ProgressStats must not re-add the decorative top-edge gradient.',
  );
  // PRESERVATION: the real chart sections are all still here.
  for (const heading of [
    'Scoring Trend', 'Score Distribution', 'Recent Rounds', 'Round Comparison',
    'Putt Make % by Distance', 'GIR % by Hole Type', 'Strokes Gained', 'Key Performance Indicators',
  ]) {
    assert.ok(code.includes(heading), `ProgressStats must preserve the "${heading}" section.`);
  }
});
