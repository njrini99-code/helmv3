// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W5A — canonical chart primitives (agent chartshell).
 *
 * W5A added the single canonical data-viz surface + chrome:
 *   - src/components/ui/chart-shell.tsx   → <ChartShell> (surface + header +
 *     legend/actions slots + mobile pivot + v3 entrance)
 *   - src/components/ui/chart-tooltip.tsx → <ChartTooltip> (glass tooltip with
 *     per-row swatch+name+value + a number `formatter` prop)
 *   - src/components/ui/chart-legend.tsx  → <ChartLegend> + the canonical
 *     `CHART_PALETTE` data-viz color vocabulary
 *   - src/components/ui/index.ts          → barrel re-exporting all of them
 *
 * This test re-asserts that contract so the chart primitives cannot silently
 * disappear or stop exporting their public API.
 *
 * Audit reference: ultra-audit master synthesis A4 (component sprawl) + A2 /
 * §5 (surface + palette consistency) — one chart surface, one tooltip, one
 * legend, one palette.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const CHART_SHELL = join(REPO_ROOT, 'src', 'components', 'ui', 'chart-shell.tsx');
const CHART_TOOLTIP = join(REPO_ROOT, 'src', 'components', 'ui', 'chart-tooltip.tsx');
const CHART_LEGEND = join(REPO_ROOT, 'src', 'components', 'ui', 'chart-legend.tsx');
const UI_INDEX = join(REPO_ROOT, 'src', 'components', 'ui', 'index.ts');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('chart-shell.tsx exists and exports ChartShell', async () => {
  assert.ok(await exists(CHART_SHELL), `Expected canonical ChartShell at ${CHART_SHELL}`);
  const src = await readFile(CHART_SHELL, 'utf8');
  assert.match(src, /export function ChartShell\b/, 'must export the ChartShell component');
  // The documented public surface: title/subtitle/legend/actions/mobileVariant.
  for (const prop of ['title', 'subtitle', 'legend', 'actions', 'mobileVariant']) {
    assert.match(
      src,
      new RegExp(`\\b${prop}\\b`),
      `ChartShell must accept the "${prop}" prop`,
    );
  }
  // Entrance is driven by the canonical v3 enterVariants motion grammar.
  assert.match(src, /enterVariants/, 'ChartShell entrance must use the v3 enterVariants');
});

test('chart-tooltip.tsx exists and exports ChartTooltip with a formatter prop', async () => {
  assert.ok(await exists(CHART_TOOLTIP), `Expected canonical ChartTooltip at ${CHART_TOOLTIP}`);
  const src = await readFile(CHART_TOOLTIP, 'utf8');
  assert.match(src, /export function ChartTooltip\b/, 'must export the ChartTooltip component');
  // Per-row swatch+name+value + a number formatter prop.
  assert.match(src, /\bformatter\b/, 'ChartTooltip must accept a number `formatter` prop');
  assert.match(src, /\brows\b/, 'ChartTooltip must accept per-row data (`rows`)');
});

test('chart-legend.tsx exists and exports ChartLegend + CHART_PALETTE', async () => {
  assert.ok(await exists(CHART_LEGEND), `Expected canonical ChartLegend at ${CHART_LEGEND}`);
  const src = await readFile(CHART_LEGEND, 'utf8');
  assert.match(src, /export function ChartLegend\b/, 'must export the ChartLegend component');
  assert.match(src, /export const CHART_PALETTE\b/, 'must export CHART_PALETTE');

  // CHART_PALETTE binds the five canonical roles to the canonical token vars.
  const PALETTE_ROLES = {
    you: 'var(--color-primary-600)',
    team: 'var(--color-warm-600)',
    pgaTour: 'var(--color-pga-tour)',
    highlight: 'var(--color-warning)',
    alert: 'var(--color-destructive)',
  };
  for (const [role, value] of Object.entries(PALETTE_ROLES)) {
    assert.match(
      src,
      new RegExp(`${role}\\s*:\\s*['"]${value.replace(/[()]/g, '\\$&')}['"]`),
      `CHART_PALETTE.${role} must equal ${value}`,
    );
  }
});

test('ui/index.ts barrel re-exports the chart primitives + CHART_PALETTE', async () => {
  assert.ok(await exists(UI_INDEX), `Expected UI barrel at ${UI_INDEX}`);
  const src = await readFile(UI_INDEX, 'utf8');
  for (const name of ['ChartShell', 'ChartTooltip', 'ChartLegend', 'CHART_PALETTE']) {
    assert.match(
      src,
      new RegExp(`\\b${name}\\b`),
      `ui/index.ts must re-export ${name}`,
    );
  }
});
