import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W7A — information-architecture nav primitives
 * (agent nav).
 *
 * W7A added the deep-route wayfinding surfaces:
 *   - src/components/ui/breadcrumb.tsx     → <Breadcrumb items? auto?> +
 *     `useBreadcrumbItems` / `deriveBreadcrumbItems` (auto-derive from
 *     pathname; chevron separators; truncation; last item is text, not a
 *     link, and carries aria-current="page").
 *   - src/components/ui/secondary-nav.tsx  → <SecondaryNav items currentRoute>
 *     (desktop tab bar with a primary-600 active underline; mobile scrollable
 *     chip row).
 *   - src/components/ui/page-header.tsx    → a `breadcrumb` slot wired into the
 *     default / mobile-nav / large-title variants.
 *
 * This test re-asserts that contract so the IA primitives cannot silently
 * disappear or stop exporting their public API, and so PageHeader keeps a
 * breadcrumb slot.
 *
 * Audit reference: ultra-audit master synthesis A4 (nav/wayfinding sprawl) +
 * A7 (deep-route orientation — every page ≥3 levels deep needs a trail).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const BREADCRUMB = join(REPO_ROOT, 'src', 'components', 'ui', 'breadcrumb.tsx');
const SECONDARY_NAV = join(REPO_ROOT, 'src', 'components', 'ui', 'secondary-nav.tsx');
const PAGE_HEADER = join(REPO_ROOT, 'src', 'components', 'ui', 'page-header.tsx');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('breadcrumb.tsx exists and exports Breadcrumb + the derive hook/fn', async () => {
  assert.ok(await exists(BREADCRUMB), `Expected canonical Breadcrumb at ${BREADCRUMB}`);
  const src = await readFile(BREADCRUMB, 'utf8');

  // Public component + props.
  assert.match(src, /export const Breadcrumb\b/, 'must export the Breadcrumb component');
  for (const prop of ['items', 'auto']) {
    assert.match(src, new RegExp(`\\b${prop}\\b`), `Breadcrumb must accept the "${prop}" prop`);
  }

  // Auto-derivation surface.
  assert.match(
    src,
    /export function useBreadcrumbItems\b/,
    'must export the useBreadcrumbItems hook',
  );
  assert.match(
    src,
    /export function deriveBreadcrumbItems\b/,
    'must export the deriveBreadcrumbItems helper',
  );
  // Derives from the URL.
  assert.match(src, /usePathname/, 'breadcrumb auto-derivation must read usePathname');

  // Behaviour contract: semantic landmark + current-page marker + chevrons.
  assert.match(src, /aria-label="Breadcrumb"/, 'must render a semantic Breadcrumb landmark');
  assert.match(src, /aria-current/, 'last/current crumb must carry aria-current');
  assert.match(src, /IconChevronRight/, 'crumbs must be chevron-separated');
  assert.match(src, /truncate/, 'crumb labels must truncate');
});

test('secondary-nav.tsx exists and exports SecondaryNav with the active treatment', async () => {
  assert.ok(await exists(SECONDARY_NAV), `Expected canonical SecondaryNav at ${SECONDARY_NAV}`);
  const src = await readFile(SECONDARY_NAV, 'utf8');

  assert.match(src, /export const SecondaryNav\b/, 'must export the SecondaryNav component');
  for (const prop of ['items', 'currentRoute']) {
    assert.match(src, new RegExp(`\\b${prop}\\b`), `SecondaryNav must accept the "${prop}" prop`);
  }

  // Desktop active state = primary-600 underline; mobile = scrollable chip row.
  assert.match(src, /border-primary-600/, 'active desktop tab must use a primary-600 underline');
  assert.match(src, /overflow-x-auto/, 'mobile chip row must be horizontally scrollable');
  assert.match(src, /aria-current/, 'active item must carry aria-current');
});

test('page-header.tsx references a breadcrumb slot', async () => {
  assert.ok(await exists(PAGE_HEADER), `Expected PageHeader at ${PAGE_HEADER}`);
  const src = await readFile(PAGE_HEADER, 'utf8');

  // The breadcrumb slot must be a declared prop AND actually rendered.
  assert.match(src, /breadcrumb\?:\s*React\.ReactNode/, 'PageHeader variants must declare a breadcrumb slot prop');
  assert.match(src, /\{breadcrumb\}/, 'PageHeader must render the breadcrumb slot');
});
