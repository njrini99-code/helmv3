import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

/**
 * Regression guard for the Wave W4C responsive sidebar breakpoint shift.
 *
 * W4C moves the GolfHelm persistent sidebar from a `lg` (1024px) breakpoint
 * down to `md` (768px) so iPad-portrait (768–1023px) gets the full desktop
 * rail instead of the hamburger-only mobile chrome. The change lives entirely
 * in the dashboard shell (`GolfDashboardShell.tsx`):
 *
 *   - the persistent sidebar wrapper flips from `hidden lg:block` to
 *     `hidden md:block`
 *   - the main-content compensation padding (`pl`/`pb`) and the desktop
 *     notification bell flip from `lg:` to `md:`
 *   - the mobile drawer (overlay + sliding panel) flips its hide breakpoint
 *     from `lg:hidden` to `md:hidden` so it is PRESERVED for 320–767px and
 *     never double-renders alongside the persistent rail at md+.
 *
 * The `ContainerGrid` `wide` primitive must keep its `2xl:max-w-[1536px]`
 * affordance so data-dense dashboards can stretch on very large viewports.
 *
 * This test asserts that:
 *   1. The persistent sidebar wrapper uses `md:block` (not `lg:block`).
 *   2. No `lg:`-gated layout token survives in the shell (full migration).
 *   3. The mobile drawer panel + overlay are still rendered AND gated at
 *      `md:hidden` so the 320–767 drawer is preserved.
 *   4. The drawer dialog + focus-trap/Escape wiring and the mobile-open
 *      trigger plumbing (setMobileOpen) remain present.
 *   5. ContainerGrid `wide` still yields `2xl:max-w-[1536px]`.
 *
 * It FAILS on regression to the `lg` breakpoint, on removal of the mobile
 * drawer, or on loss of the wide-container affordance.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — responsive /
 *   surface remediation (W4 wave): iPad-portrait sidebar + wide containers.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SHELL = join(REPO_ROOT, 'src', 'app', 'golf', '(dashboard)', 'GolfDashboardShell.tsx');
const SIDEBAR = join(REPO_ROOT, 'src', 'components', 'golf', 'layout', 'GolfSidebar.tsx');
const CONTAINERS = join(REPO_ROOT, 'src', 'components', 'ui', 'containers.tsx');

async function exists(path) {
  return (await stat(path).catch(() => null)) !== null;
}

/**
 * Strip /* … *​/ block comments and // line comments so structural checks
 * don't false-positive on prose inside doc comments that legitimately
 * mentions lg:/md: tokens.
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('persistent sidebar wrapper is gated at md (not lg)', async () => {
  assert.ok(await exists(SHELL), `GolfDashboardShell must exist: ${SHELL}`);
  const content = stripComments(await readFile(SHELL, 'utf8'));

  // The persistent rail wrapper must use the md breakpoint.
  assert.match(
    content,
    /className="hidden md:block"/,
    'The persistent sidebar wrapper must be gated `hidden md:block` (iPad portrait gets the rail).',
  );

  // It must NOT have regressed back to the lg breakpoint.
  assert.doesNotMatch(
    content,
    /className="hidden lg:block"/,
    'The persistent sidebar wrapper regressed to `hidden lg:block`; it must be `hidden md:block`.',
  );
});

test('no lg:-gated layout token survives in the shell', async () => {
  const content = stripComments(await readFile(SHELL, 'utf8'));

  // After W4C the entire sidebar/main/drawer coordination moved to md:. Any
  // residual lg: utility in the shell means the migration is incomplete and
  // the breakpoints are incoherent (e.g. sidebar at md but padding at lg).
  const lgMatches = content.match(/\blg:[A-Za-z0-9[\]#(),./_-]+/g) ?? [];
  assert.deepEqual(
    lgMatches,
    [],
    `GolfDashboardShell still contains lg:-gated layout tokens — these must move to md: ` +
      `for a coherent breakpoint: ${JSON.stringify(lgMatches)}`,
  );
});

test('mobile drawer is preserved and gated at md:hidden', async () => {
  const content = stripComments(await readFile(SHELL, 'utf8'));

  // The sliding drawer panel must still exist (role="dialog", aria-modal),
  // and be hidden from md+ so it never double-renders with the persistent rail.
  assert.match(content, /id="mobile-sidebar"/, 'Mobile drawer panel (#mobile-sidebar) must remain.');
  assert.match(content, /role="dialog"/, 'Mobile drawer must keep role="dialog".');
  assert.match(content, /aria-modal="true"/, 'Mobile drawer must keep aria-modal="true".');

  // Both the drawer panel and its scrim/overlay must hide at md+ (md:hidden),
  // never the old lg:hidden.
  const mdHiddenCount = (content.match(/\bmd:hidden\b/g) ?? []).length;
  assert.ok(
    mdHiddenCount >= 2,
    `Expected the mobile overlay AND drawer panel to be gated md:hidden (>=2 occurrences); ` +
      `found ${mdHiddenCount}. The 320–767 drawer must be preserved and hidden from md+.`,
  );
  assert.doesNotMatch(
    content,
    /\blg:hidden\b/,
    'The mobile drawer/overlay still uses lg:hidden — it must move to md:hidden so the rail ' +
      'takes over from md+.',
  );

  // The mobile-open trigger plumbing (drawer open/close) and focus management
  // must remain wired.
  assert.match(content, /setMobileOpen/, 'Drawer open/close plumbing (setMobileOpen) must remain.');
  assert.match(content, /mobileSidebarRef/, 'Drawer focus-trap ref must remain.');
  assert.match(content, /Escape/, 'Drawer Escape-to-close handler must remain.');
});

test('main content compensation padding flips to md (rail offset)', async () => {
  const content = stripComments(await readFile(SHELL, 'utf8'));

  // Collapsed vs expanded rail widths must be reserved from md+.
  assert.match(
    content,
    /md:pl-\[72px\]/,
    'Collapsed-rail left padding must be md:pl-[72px] so content clears the rail at md+.',
  );
  assert.match(
    content,
    /md:pl-64/,
    'Expanded-rail left padding must be md:pl-64 so content clears the rail at md+.',
  );
});

test('ContainerGrid wide keeps the 2xl:max-w-[1536px] affordance', async () => {
  assert.ok(await exists(CONTAINERS), `containers.tsx must exist: ${CONTAINERS}`);
  const content = stripComments(await readFile(CONTAINERS, 'utf8'));

  assert.match(
    content,
    /wide\s*&&\s*['"]2xl:max-w-\[1536px\]['"]/,
    'ContainerGrid `wide` must yield `2xl:max-w-[1536px]` for data-dense dashboards.',
  );
});

test('GolfSidebar still ships full primary + secondary nav and sign-out', async () => {
  // Behaviour preservation: the breakpoint shift must not have stripped any
  // nav surface or interaction from the rail itself.
  assert.ok(await exists(SIDEBAR), `GolfSidebar must exist: ${SIDEBAR}`);
  const content = stripComments(await readFile(SIDEBAR, 'utf8'));

  for (const navList of [
    'coachNavItems',
    'coachSecondaryNav',
    'playerNavItems',
    'playerSecondaryNav',
  ]) {
    assert.match(content, new RegExp(navList), `GolfSidebar must keep the ${navList} nav list.`);
  }
  assert.match(content, /handleSignOut/, 'GolfSidebar must keep the sign-out handler.');
  assert.match(content, /setCollapsed/, 'GolfSidebar must keep the collapse toggle.');
  assert.match(content, /setMobileOpen/, 'GolfSidebar must keep mobile nav-click close plumbing.');
});
