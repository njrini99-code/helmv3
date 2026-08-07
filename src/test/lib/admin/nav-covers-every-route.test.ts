/**
 * Every Bridge route must be reachable from the navigation.
 *
 * `/admin/teams` — the one cross-sport board built to answer "who needs
 * attention", with a 30-day activity/error EKG and four triage sorts — had
 * exactly ONE inbound link: a text-xs back-arrow three levels deep.
 * `/admin/billing` had zero, repo-wide. Both had been recorded as "no static
 * nav link found" in docs/qa/helm-route-inventory.md and stayed that way,
 * because nothing failed when a route was added without a nav entry.
 *
 * ADMIN_NAV is the single array behind the rail, ⌘K, the More sheet, the
 * bottom nav, breadcrumbs and active-state — so one missing entry costs all
 * six at once.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_NAV } from '@/app/admin/_components/admin-nav';

/**
 * Routes deliberately NOT in the rail: detail pages you arrive at by clicking
 * a row, not by navigating. Adding to this list is a decision; forgetting a
 * route is not.
 */
const DETAIL_LEAVES = new Set([
  '/admin/errors/[fingerprint]',
  '/admin/teams/[id]',
  '/admin/users/[id]',
  '/admin/users/[id]/view-as',
  '/admin/thread/[entity]/[id]',
  '/admin/golf/tracer',
]);

function walkRoutes(dir: string, base = '/admin'): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === 'page.tsx') out.push(base);
      continue;
    }
    // _components, _data etc. are not routes
    if (entry.name.startsWith('_') || entry.name.startsWith('(')) continue;
    out.push(...walkRoutes(path.join(dir, entry.name), `${base}/${entry.name}`));
  }
  return out;
}

describe('Bridge navigation covers every route', () => {
  const routes = walkRoutes(path.join(process.cwd(), 'src/app/admin'));
  const navHrefs = new Set(ADMIN_NAV.map((e) => e.href as string));

  it('found the Bridge routes at all (guards against a broken walker)', () => {
    // A walker that silently returns [] would make every assertion below vacuous.
    expect(routes.length).toBeGreaterThan(15);
    expect(routes).toContain('/admin');
  });

  it('every route is either in the nav or an explicit detail leaf', () => {
    const orphans = routes.filter((r) => !navHrefs.has(r) && !DETAIL_LEAVES.has(r));
    expect(
      orphans,
      `Route(s) reachable by URL but linked from nowhere. Add an ADMIN_NAV entry, ` +
        `or add to DETAIL_LEAVES if it is genuinely a click-through detail page:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });

  it('every nav entry points at a route that exists', () => {
    const dangling = [...navHrefs].filter((h) => !routes.includes(h));
    expect(dangling, `ADMIN_NAV entries with no page.tsx:\n${dangling.join('\n')}`).toEqual([]);
  });

  it('the two previously-orphaned boards are now reachable', () => {
    expect(navHrefs.has('/admin/teams')).toBe(true);
    expect(navHrefs.has('/admin/billing')).toBe(true);
  });

  it('keyboard shortcuts are unique', () => {
    const keys = ADMIN_NAV.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the rail and ⌘K group by every section ADMIN_NAV actually uses', () => {
    // AdminShell used to hand-list ['Operations', 'Apps', 'Platform']. When the
    // nav was regrouped into Triage / Customers / Apps / Platform / Revenue,
    // that tuple did not change — so the rail and the command menu silently
    // dropped 10 of 17 entries (every Triage, Customers and Revenue tab,
    // Overview and Errors among them) under an empty "Operations" heading.
    // Nothing failed: the routes still resolved by URL, they were just
    // unreachable by navigation. Caught locally, never shipped.
    const shell = fs.readFileSync(
      path.join(process.cwd(), 'src/app/admin/_components/AdminShell.tsx'),
      'utf8',
    );
    const sections = [...new Set(ADMIN_NAV.map((e) => e.section))];

    // The grouping must be DERIVED from ADMIN_NAV, not restated. This is the
    // load-bearing assertion — it is the one that fails on the pre-fix file.
    expect(shell).toContain('const NAV_SECTION_ORDER = [...new Set(ADMIN_NAV.map(');

    // Forward guard only: the tuple that caused the bug named 'Operations', a
    // section ADMIN_NAV no longer has, so this loop could not have caught it in
    // hindsight. It catches the NEXT person who restates today's section names.
    const code = shell
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n');
    for (const section of sections) {
      const literalTuple = new RegExp(`\\[\\s*'${section}'\\s*,`);
      expect(
        literalTuple.test(code),
        `AdminShell.tsx hard-codes a section list starting '${section}'. ` +
          `Derive it from ADMIN_NAV — a hand-listed tuple silently drops whole ` +
          `sections when the nav is regrouped.`,
      ).toBe(false);
    }
  });
});
