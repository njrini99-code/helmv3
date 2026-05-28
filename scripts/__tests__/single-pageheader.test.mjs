import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

/**
 * Regression guard for the Wave W2E header consolidation.
 *
 * W2E folded six hand-rolled "sibling" page headers into the single canonical
 * `src/components/ui/page-header.tsx` primitive, which now exposes four
 * documented title variants (default | large-title | mobile-nav | plinth)
 * plus the calendar / round / support control bars. Each sibling module was
 * thinned to a re-export wrapper that delegates to `<PageHeader variant=… />`
 * — no module may hand-roll its own header markup again.
 *
 * This test asserts that:
 *   1. The canonical PageHeader still ships all four documented variants and
 *      renders exactly one semantic <h1> per title variant.
 *   2. Each of the six sibling modules is either deleted OR has been reduced
 *      to a thin shim that imports the canonical PageHeader and no longer
 *      hand-rolls a header (no <header> tag, no bespoke sticky/blur/h1 markup
 *      of its own).
 *
 * It FAILS on reintroduction of any hand-rolled sibling header.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — A4 (header
 *   sprawl) + A7 (single semantic <h1> per page surface).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const CANONICAL = join(REPO_ROOT, 'src', 'components', 'ui', 'page-header.tsx');

// The six sibling header modules that were consolidated. Each must now be
// deleted or a thin shim over the canonical PageHeader.
const SIBLINGS = [
  {
    name: 'LargeTitleHeader',
    path: join(REPO_ROOT, 'src', 'components', 'golf', 'layout', 'LargeTitleHeader.tsx'),
  },
  {
    name: 'MobileNavHeader',
    path: join(REPO_ROOT, 'src', 'components', 'golf', 'layout', 'MobileNavHeader.tsx'),
  },
  {
    name: 'CalendarHeader',
    path: join(REPO_ROOT, 'src', 'components', 'golf', 'calendar', 'CalendarHeader.tsx'),
  },
  {
    name: 'PremiumRoundHeader',
    path: join(REPO_ROOT, 'src', 'components', 'golf', 'rounds', 'PremiumRoundHeader.tsx'),
  },
  {
    name: 'CoachPageHeader',
    path: join(REPO_ROOT, 'src', 'app', 'golf', 'admin', 'crm', 'components', 'coach', 'CoachPageHeader.tsx'),
  },
  {
    name: 'SupportHeader',
    path: join(REPO_ROOT, 'src', 'app', 'support', 'SupportHeader.tsx'),
  },
];

// The four documented title variants the canonical primitive must expose.
const REQUIRED_VARIANTS = ['default', 'large-title', 'mobile-nav', 'plinth'];

async function exists(path) {
  return (await stat(path).catch(() => null)) !== null;
}

function countMatches(content, re) {
  const m = content.match(re);
  return m ? m.length : 0;
}

/**
 * Strip /* … *​/ block comments and // line comments so structural checks
 * (<header>, <h1>, sticky/blur markers) don't false-positive on prose that
 * legitimately mentions those tokens inside a doc comment.
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('canonical PageHeader exposes the four documented variants', async () => {
  assert.ok(await exists(CANONICAL), `Canonical PageHeader must exist: ${CANONICAL}`);
  const content = await readFile(CANONICAL, 'utf8');

  for (const v of REQUIRED_VARIANTS) {
    assert.ok(
      content.includes(`'${v}'`),
      `PageHeader must declare/handle the "${v}" variant (literal '${v}' not found).`,
    );
  }

  // The variant union + a switch-style dispatcher must be present.
  assert.match(
    content,
    /export\s+type\s+PageHeaderProps/,
    'PageHeader must export a PageHeaderProps variant union.',
  );
  assert.match(
    content,
    /switch\s*\(\s*props\.variant\s*\)/,
    'PageHeader must dispatch on props.variant.',
  );

  // Title renders as a semantic <h1> in the canonical module (default,
  // large-title, mobile-nav, plinth title variants all use <h1>).
  assert.ok(
    countMatches(content, /<h1[\s>]/g) >= 4,
    'Canonical PageHeader must render semantic <h1> titles for its title variants.',
  );
});

test('the six sibling headers are deleted or thin shims over PageHeader', async () => {
  const violations = [];

  for (const sib of SIBLINGS) {
    if (!(await exists(sib.path))) {
      // Deleted — acceptable. All call sites must have been migrated; that is
      // enforced by typecheck, not here.
      continue;
    }

    const raw = await readFile(sib.path, 'utf8');
    // Structural checks run on comment-stripped source so doc-comment prose
    // (which legitimately mentions <h1>, <header>, blur, etc.) can't trip them.
    const content = stripComments(raw);
    const rel = relative(REPO_ROOT, sib.path);

    // A thin shim must delegate to the canonical PageHeader primitive.
    if (!/from\s+['"]@\/components\/ui\/page-header['"]/.test(content)) {
      violations.push(
        `${rel} still exists but does not import the canonical @/components/ui/page-header. ` +
          `It must be deleted or reduced to a thin <PageHeader variant=…/> shim.`,
      );
      continue;
    }

    if (!/<PageHeader\b/.test(content)) {
      violations.push(
        `${rel} imports page-header but never renders <PageHeader …>. ` +
          `A thin shim must delegate to the canonical primitive.`,
      );
    }

    // A thin shim must NOT hand-roll its own header markup. The canonical
    // primitive owns every <header> tag, sticky/blur nav bar, and <h1>.
    if (/<header\b/.test(content)) {
      violations.push(
        `${rel} hand-rolls a <header> element — header markup must live in the ` +
          `canonical PageHeader, not in the sibling shim.`,
      );
    }
    if (/<h1\b/.test(content)) {
      violations.push(
        `${rel} hand-rolls an <h1> — the semantic page title must come from the ` +
          `canonical PageHeader variant, not the sibling shim.`,
      );
    }
    // The iOS large-title / mobile-nav sticky+blur treatment must not be
    // re-implemented in a sibling.
    if (/backdropFilter|backdrop-blur-xl|sticky\s+top-0/.test(content)) {
      violations.push(
        `${rel} re-implements sticky/backdrop-blur header chrome — that treatment ` +
          `belongs to the canonical PageHeader variant.`,
      );
    }
  }

  if (violations.length > 0) {
    assert.fail(
      `Found ${violations.length} sibling-header consolidation regression(s).\n` +
        `Wave W2E consolidated all six headers into PageHeader — do not reintroduce ` +
        `hand-rolled sibling headers.\n\n` +
        violations.map((v) => `  - ${v}`).join('\n'),
    );
  }
});

test('sibling shims are small (no hand-rolled implementation remains)', async () => {
  // Defense-in-depth: a genuine thin shim is short. If a sibling balloons back
  // past a generous ceiling it almost certainly grew a hand-rolled header
  // again. CoachPageHeader is the largest legitimate shim (it maps a rich
  // domain record onto the plinth variant), so the ceiling accommodates it.
  const SHIM_LINE_CEILING = 230;

  for (const sib of SIBLINGS) {
    if (!(await exists(sib.path))) continue;
    const content = await readFile(sib.path, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(
      lines <= SHIM_LINE_CEILING,
      `${relative(REPO_ROOT, sib.path)} is ${lines} lines — a thin PageHeader shim ` +
        `should stay under ${SHIM_LINE_CEILING}. Did a hand-rolled header creep back in?`,
    );
  }
});
