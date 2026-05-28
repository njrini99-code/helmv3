import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W5C — chart tooltip consolidation (agent tooltip).
 *
 * W5C migrated every Recharts `<Tooltip content={…}>` in the data-viz panels
 * onto the single canonical `<ChartTooltip>` primitive added in W5A
 * (src/components/ui/chart-tooltip.tsx). Before W5C each chart hand-rolled its
 * own tooltip CARD — a bespoke `function *Tooltip({ active, payload }) { … }`
 * content component that re-invented its own glass surface, swatch and number
 * formatting (`bg-cream-50/95 backdrop-blur-sm rounded-lg shadow-lg border …`).
 * That sprawl is exactly the "one tooltip treatment, not a dozen hand-rolled
 * Recharts content cards" debt called out in the ultra-audit MASTER synthesis
 * (A4 component sprawl / A2 §5 surface + number-format consistency).
 *
 * After W5C the only tooltip surface in these dirs is `<ChartTooltip>`, fed by
 * a thin inline `content={({ active, payload }) => <ChartTooltip … />}` adapter
 * that maps the Recharts payload onto `rows` and standardizes number formatting
 * (SG 2-decimals + sign, putts/score/counts integer, rates 1-decimal %), while
 * preserving every value each tooltip showed.
 *
 * This test re-asserts that contract so a chart cannot silently start
 * hand-rolling its own tooltip content card again:
 *
 *   1. Every chart module that renders a Recharts `<Tooltip>` imports the
 *      canonical `ChartTooltip` and renders it.
 *   2. No chart module declares a bespoke `*Tooltip` content component (the
 *      banned `function …Tooltip(` / `const …Tooltip =` per-chart pattern).
 *   3. No chart module passes `<Tooltip content={<SomeCustomTooltip />}>` (the
 *      old element-instance content pattern) — content must delegate to
 *      `<ChartTooltip>`.
 *   4. The canonical ChartTooltip primitive still exists and exposes its
 *      `rows` + `formatter` public API.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const CHART_TOOLTIP = join(REPO_ROOT, 'src', 'components', 'ui', 'chart-tooltip.tsx');

// The chart modules in the owned data-viz dirs that render a Recharts
// <Tooltip> and were migrated to <ChartTooltip> in W5C.
const MIGRATED_CHART_MODULES = [
  'src/components/golf/coachhelm/analytics/PatternImpactPanel.tsx',
  'src/components/golf/coachhelm/analytics/InsightEffectivenessPanel.tsx',
  'src/components/golf/coachhelm/analytics/PredictionAccuracyPanel.tsx',
  'src/components/golf/stats/ProgressStats.tsx',
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Strip block + line comments so prose mentioning a pattern isn't a false hit. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Detect a bespoke per-chart `*Tooltip` CONTENT component declaration — the
 * banned pattern. Matches both a named function declaration and a
 * const-arrow declaration whose identifier ends in "Tooltip", EXCLUDING the
 * canonical `ChartTooltip` (which is imported, never declared here).
 */
function declaresCustomTooltipComponent(src) {
  // `function FooTooltip(`  (named component)
  const fnDecl = /\bfunction\s+([A-Z][A-Za-z0-9_]*Tooltip)\s*\(/g;
  // `const FooTooltip = (` / `const FooTooltip = function`  (arrow/expr component)
  const constDecl = /\bconst\s+([A-Z][A-Za-z0-9_]*Tooltip)\s*=\s*(?:\(|function|React\.)/g;
  for (const re of [fnDecl, constDecl]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1] !== 'ChartTooltip') return m[1];
    }
  }
  return null;
}

/** Detect the old `<Tooltip content={<SomethingTooltip />}>` element pattern. */
function hasElementInstanceContent(src) {
  // content={<XxxTooltip ... />} — an element instance, not a render fn.
  return /content=\{\s*<\s*[A-Z][A-Za-z0-9_]*Tooltip\b/.test(src);
}

test('canonical ChartTooltip primitive still exists with its rows + formatter API', async () => {
  assert.ok(await exists(CHART_TOOLTIP), `Expected canonical ChartTooltip at ${CHART_TOOLTIP}`);
  const src = await readFile(CHART_TOOLTIP, 'utf8');
  assert.match(src, /export function ChartTooltip\b/, 'must export the ChartTooltip component');
  assert.match(src, /\brows\b/, 'ChartTooltip must accept per-row data (`rows`)');
  assert.match(src, /\bformatter\b/, 'ChartTooltip must accept a number `formatter` prop');
});

test('every migrated chart module imports + renders <ChartTooltip>', async () => {
  const missing = [];
  const notDelegating = [];

  for (const rel of MIGRATED_CHART_MODULES) {
    const full = join(REPO_ROOT, rel);
    if (!(await exists(full))) {
      missing.push(rel);
      continue;
    }
    const src = await readFile(full, 'utf8');
    const importsChartTooltip =
      /from\s+['"]@\/components\/ui\/chart-tooltip['"]/.test(src) ||
      /from\s+['"]@\/components\/ui['"]/.test(src);
    const rendersChartTooltip = /<ChartTooltip\b/.test(src);
    if (!importsChartTooltip || !rendersChartTooltip) notDelegating.push(rel);
  }

  assert.deepEqual(missing, [], `Migrated chart module(s) unexpectedly missing:\n${missing.join('\n')}`);
  assert.deepEqual(
    notDelegating,
    [],
    `These chart modules no longer import + render <ChartTooltip> for their ` +
      `Recharts tooltip:\n${notDelegating.join('\n')}`,
  );
});

test('no chart module declares a bespoke *Tooltip content component', async () => {
  const violations = [];

  for (const rel of MIGRATED_CHART_MODULES) {
    const full = join(REPO_ROOT, rel);
    if (!(await exists(full))) continue;
    const src = stripComments(await readFile(full, 'utf8'));
    const offender = declaresCustomTooltipComponent(src);
    if (offender) violations.push(`${rel} → ${offender}`);
  }

  assert.deepEqual(
    violations,
    [],
    `These chart modules still hand-roll a bespoke *Tooltip content component. ` +
      `Delegate the tooltip surface to <ChartTooltip> via an inline ` +
      `content={({ active, payload }) => <ChartTooltip … />} adapter instead:\n` +
      violations.join('\n'),
  );
});

test('no chart module passes a <CustomTooltip /> element as Recharts content', async () => {
  const violations = [];

  for (const rel of MIGRATED_CHART_MODULES) {
    const full = join(REPO_ROOT, rel);
    if (!(await exists(full))) continue;
    const src = stripComments(await readFile(full, 'utf8'));
    if (hasElementInstanceContent(src)) violations.push(rel);
  }

  assert.deepEqual(
    violations,
    [],
    `These chart modules still pass a bespoke <…Tooltip /> element to ` +
      `<Tooltip content={…}>. Use an inline render fn returning <ChartTooltip> ` +
      `instead:\n${violations.join('\n')}`,
  );
});

test('the custom-tooltip detector matches the banned forms but not ChartTooltip', () => {
  // Positive: a named function content component.
  assert.equal(
    declaresCustomTooltipComponent('function CustomTooltip({ active, payload }) { return null; }'),
    'CustomTooltip',
    'detector should flag a named *Tooltip function component',
  );
  // Positive: a const-arrow content component.
  assert.equal(
    declaresCustomTooltipComponent('const LifecycleTooltip = ({ active }) => null;'),
    'LifecycleTooltip',
    'detector should flag a const-arrow *Tooltip component',
  );
  // Negative: the canonical ChartTooltip is never a violation.
  assert.equal(
    declaresCustomTooltipComponent('const ChartTooltip = (props) => null;'),
    null,
    'detector must not flag the canonical ChartTooltip',
  );
  // Negative: a render-fn delegating to ChartTooltip is fine.
  assert.equal(
    declaresCustomTooltipComponent(
      'content={({ active, payload }) => <ChartTooltip rows={[]} />}',
    ),
    null,
    'detector must not flag an inline ChartTooltip render fn',
  );
  // Element-instance detector: positive + negative.
  assert.ok(
    hasElementInstanceContent('<Tooltip content={<CustomTooltip />} />'),
    'detector should flag a <CustomTooltip /> element content',
  );
  assert.ok(
    !hasElementInstanceContent('<Tooltip content={({ active }) => <ChartTooltip rows={[]} />} />'),
    'detector must not flag an inline ChartTooltip render fn as element content',
  );
});
