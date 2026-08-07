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
});
