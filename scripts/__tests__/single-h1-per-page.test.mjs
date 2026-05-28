import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

/**
 * Regression guard for Wave W3-a11y (W3D) — exactly one semantic <h1> per
 * dashboard page surface.
 *
 * The W2E header consolidation folded every hand-rolled sibling header into
 * the single canonical `src/components/ui/page-header.tsx` primitive, which is
 * the ONLY component authorized to render a page's semantic <h1> (it does so
 * for its default / large-title / mobile-nav / plinth title variants, exposed
 * through the thin shims PageHeader / LargeTitleHeader / MobileNavHeader /
 * CoachPageHeader).
 *
 * The A7 audit finding ("single semantic <h1> per page surface") was violated
 * by dashboard pages that mounted one of those consolidated headers AND ALSO
 * hand-rolled a raw <h1> in their own content for the very same title — which
 * emits two <h1> elements into the accessibility tree (the sticky
 * .golf-mobile-page-header bar is visible at every breakpoint, so the raw
 * content <h1> is not a responsive alternative to it). W3D demotes those
 * duplicate in-content titles to <h2> (className preserved → zero visual
 * change) so the consolidated PageHeader remains the single <h1> source.
 *
 * This test walks every dashboard `page.tsx` and asserts:
 *   1. A page that mounts a consolidated PageHeader-family header must NOT
 *      ALSO hand-roll a raw <h1> in the same file (the header owns the one
 *      and only <h1>). Demote any in-content title to <h2>/<h3>.
 *   2. Every page surface has at least one title source — either a
 *      consolidated header primitive or a raw <h1> (no page ships title-less).
 *
 * It FAILS on regression — i.e. if a raw <h1> is reintroduced alongside a
 * consolidated header, or a page loses its title entirely.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — A7 (semantic
 *   heading hierarchy: exactly one <h1> per page surface) + A4 (header
 *   consolidation, owned by the canonical PageHeader).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const DASHBOARD_DIR = join(
  REPO_ROOT,
  'src',
  'app',
  'golf',
  '(dashboard)',
);

// The consolidated PageHeader-family header components. Each renders the
// page's semantic <h1> internally (via the canonical page-header primitive),
// so a page that mounts one of these must not hand-roll its own <h1>.
const CONSOLIDATED_HEADER_RE =
  /<(PageHeader|LargeTitleHeader|MobileNavHeader|CoachPageHeader)\b/;

// Raw, hand-rolled <h1> opening tag (with attributes or with a trailing `>`).
const RAW_H1_RE = /<h1[\s>]/g;

// A page may legitimately delegate its entire surface (header + <h1> included)
// to an imported client component, e.g. `return <FooClient … />`. Detect a
// rendered imported component (PascalCase JSX tag that is not an intrinsic
// element) so we don't false-flag the delegation pattern as "title-less".
const RENDERS_COMPONENT_RE = /<[A-Z][A-Za-z0-9]*[\s/>]/;

/**
 * Strip /* … *​/ block comments and // line comments so structural checks
 * (<h1>, header-component names) don't false-positive on prose that
 * legitimately mentions those tokens inside a doc comment. Mirrors the
 * comment-stripping used by single-pageheader.test.mjs.
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function countMatches(content, re) {
  const m = content.match(re);
  return m ? m.length : 0;
}

/** Recursively collect every `page.tsx` under the dashboard route group. */
async function collectDashboardPages(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectDashboardPages(full)));
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

test('every dashboard page exposes exactly one semantic <h1> source', async () => {
  const pages = await collectDashboardPages(DASHBOARD_DIR);

  // Sanity: the route group must contain the dashboard pages. If this ever
  // drops to zero the walk is broken and the guard is silently passing.
  assert.ok(
    pages.length >= 20,
    `Expected to find the dashboard page set under ${relative(REPO_ROOT, DASHBOARD_DIR)} ` +
      `but found only ${pages.length}. Did the route group move?`,
  );

  const duplicateTitle = [];
  const titleless = [];

  for (const page of pages) {
    const raw = await readFile(page, 'utf8');
    const content = stripComments(raw);
    const rel = relative(REPO_ROOT, page);

    const hasConsolidatedHeader = CONSOLIDATED_HEADER_RE.test(content);
    const rawH1Count = countMatches(content, RAW_H1_RE);

    if (hasConsolidatedHeader && rawH1Count > 0) {
      duplicateTitle.push(
        `${rel} mounts a consolidated PageHeader-family header AND hand-rolls ` +
          `${rawH1Count} raw <h1> — that emits a duplicate page title into the ` +
          `accessibility tree. The consolidated PageHeader owns the single <h1>; ` +
          `demote the in-content title to <h2>/<h3> (keep the className for an ` +
          `identical look).`,
      );
    }

    // A page is title-less only if it neither mounts a header, nor hand-rolls
    // an <h1>, NOR delegates its surface to an imported component (the common
    // `return <FooClient … />` pattern, where the client owns the header/h1).
    const delegatesToComponent = RENDERS_COMPONENT_RE.test(content);
    // Redirect-only routes (e.g. legacy aliases that just `redirect(...)`)
    // render no UI at all and legitimately have no page title.
    const isRedirectOnly =
      /\bredirect\s*\(/.test(content) && !RENDERS_COMPONENT_RE.test(content);
    if (
      !hasConsolidatedHeader &&
      rawH1Count === 0 &&
      !delegatesToComponent &&
      !isRedirectOnly
    ) {
      titleless.push(
        `${rel} has no consolidated PageHeader-family header, no raw <h1>, and ` +
          `delegates to no component — every page surface needs exactly one ` +
          `semantic page title.`,
      );
    }
  }

  const problems = [...duplicateTitle, ...titleless];
  if (problems.length > 0) {
    assert.fail(
      `Found ${problems.length} single-<h1>-per-page violation(s).\n` +
        `Wave W3D requires exactly one semantic <h1> per dashboard page, sourced ` +
        `from the consolidated PageHeader.\n\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
  }
});

test('IconButton size="sm" tap target is at least 44px (W3D)', async () => {
  // The a11y tap-target floor (web.dev accessible-tap-targets) is 44px. The
  // IconButton `sm` size must enlarge its hit area to >= 44px while keeping
  // the visual icon glyph (the children) unchanged. Guard against a regression
  // back to the old fixed 36px (w-9 h-9) box.
  const buttonPath = join(REPO_ROOT, 'src', 'components', 'ui', 'button.tsx');
  const content = stripComments(await readFile(buttonPath, 'utf8'));

  // Isolate the IconButton component's source so we assert on ITS size map and
  // not the (separately-correct) Button size map, which also declares an `sm`.
  const iconStart = content.indexOf('export const IconButton');
  assert.ok(iconStart !== -1, 'button.tsx must export an IconButton component.');
  const iconEnd = content.indexOf("IconButton.displayName", iconStart);
  const iconSrc = content.slice(iconStart, iconEnd === -1 ? undefined : iconEnd);

  // The IconButton size map must define an `sm` variant with a >= 44px floor.
  const smMatch = iconSrc.match(/sm:\s*'([^']*min-[hw]-\[44px\][^']*)'/);
  assert.ok(
    smMatch,
    'IconButton size="sm" must declare a >= 44px tap target ' +
      "(expected min-h-[44px] / min-w-[44px] in the sm size string).",
  );
  assert.match(
    smMatch[1],
    /min-h-\[44px\]/,
    'IconButton size="sm" must set min-h-[44px].',
  );
  assert.match(
    smMatch[1],
    /min-w-\[44px\]/,
    'IconButton size="sm" must set min-w-[44px].',
  );
  assert.doesNotMatch(
    smMatch[1],
    /\bw-9\b|\bh-9\b/,
    'IconButton size="sm" must not fall back to the old fixed 36px (w-9 h-9) box.',
  );
});
