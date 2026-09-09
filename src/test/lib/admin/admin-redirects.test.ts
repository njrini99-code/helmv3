/**
 * A retired Bridge route must still resolve.
 *
 * The 30→19 consolidation deleted five `page.tsx` files. Those paths are in
 * operators' bookmarks, in Slack scrollback and in merged PR bodies — deleting
 * the file without a redirect turns each into a 404 that nobody notices until
 * someone clicks an old link during an incident.
 *
 * `next.config.mjs` is ESM and cannot import the TypeScript route table, so the
 * two lists are maintained separately. This test is what keeps them the same
 * list: it parses the config's `redirects()` array and checks it against
 * `RETIRED_ADMIN_ROUTES`, the nav, and the view vocabulary.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_NAV } from '@/app/admin/_components/admin-nav';
import { ADMIN_VIEWS, isViewHost, USER_DETAIL_VIEWS } from '@/lib/admin/views';
import {
  RETIRED_ADMIN_ROUTES,
  retiredDestination,
  retiredRouteRedirects,
} from '@/lib/admin/retired-routes';

const config = fs
  .readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8')
  // Rules carry inline comments between their braces; strip them so one regex
  // matches the single-line and multi-line forms alike.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Every `{ source, destination, permanent }` literal in next.config.mjs. */
const allRules = [...config.matchAll(
  /\{\s*source:\s*'([^']+)'\s*,\s*destination:\s*'([^']+)'\s*,\s*permanent:\s*(true|false)\s*,?\s*\}/g,
)].map((m) => ({ source: m[1]!, destination: m[2]!, permanent: m[3] === 'true' }));

/** Bridge rules only — the golf dashboard has its own `?view=` vocabulary. */
const configRules = allRules.filter((r) => r.source.startsWith('/admin/'));

const navHrefs = new Set(ADMIN_NAV.map((e) => e.href as string));
const DETAIL_LEAVES = new Set([
  '/admin/errors/[fingerprint]',
  '/admin/teams/[id]',
  '/admin/users/[id]',
  '/admin/thread/[entity]/[id]',
]);

function pathnameOf(destination: string): string {
  return destination.split('?')[0]!;
}

/** `/admin/users/:id?view=journey` → `/admin/users/[id]` */
function toRouteShape(pathname: string): string {
  return pathname.replace(/\/:([a-zA-Z]+)/g, '/[$1]');
}

describe('retired Bridge routes', () => {
  it('parsed the config at all (guards against a regex that matches nothing)', () => {
    expect(allRules.length).toBeGreaterThan(RETIRED_ADMIN_ROUTES.length);
    expect(configRules.length).toBeGreaterThanOrEqual(RETIRED_ADMIN_ROUTES.length);
  });

  it('every retired route has a redirect in next.config.mjs', () => {
    for (const route of RETIRED_ADMIN_ROUTES) {
      const rule = configRules.find((r) => r.source === route.from);
      expect(rule, `No redirects() entry for retired route ${route.from}`).toBeDefined();
      expect(rule!.destination).toBe(retiredDestination(route));
    }
  });

  it('every retired route is genuinely gone (no page.tsx left behind)', () => {
    for (const route of RETIRED_ADMIN_ROUTES) {
      const file = path.join(process.cwd(), 'src/app', `${route.from}/page.tsx`);
      expect(
        fs.existsSync(file),
        `${route.from} still has a page.tsx — a redirect never fires for a route that exists.`,
      ).toBe(false);
    }
  });

  it('every redirect lands on a live nav entry or an explicit detail leaf', () => {
    for (const rule of configRules) {
      const shape = toRouteShape(pathnameOf(rule.destination));
      expect(
        navHrefs.has(shape) || DETAIL_LEAVES.has(shape),
        `${rule.source} redirects to ${rule.destination}, which is neither in ADMIN_NAV nor a detail leaf.`,
      ).toBe(true);
    }
  });

  it('every ?view= named by a redirect is registered for that destination', () => {
    for (const rule of configRules.filter((r) => r.destination.includes('view='))) {
      const host = pathnameOf(rule.destination);
      const view = new URLSearchParams(rule.destination.split('?')[1]!).get('view')!;
      if (!isViewHost(host)) {
        // Dynamic destinations (/admin/users/:id) carry their own vocabulary —
        // USER_DETAIL_VIEWS, which cannot be an ADMIN_VIEWS key.
        expect(USER_DETAIL_VIEWS as readonly string[]).toContain(view);
        continue;
      }
      expect(
        (ADMIN_VIEWS[host] as readonly string[]).includes(view),
        `${rule.source} redirects to ?view=${view}, which ${host} does not register.`,
      ).toBe(true);
    }
  });

  it('every retired-route redirect is a 307, never a 308', () => {
    // A 308 is cached by browsers and intermediaries effectively forever. These
    // folds are an IA judgement; reverting one must be a code change, not a
    // plea for every operator to clear their cache.
    for (const route of RETIRED_ADMIN_ROUTES) {
      expect(configRules.find((r) => r.source === route.from)!.permanent).toBe(false);
    }
    for (const rule of retiredRouteRedirects()) expect(rule.permanent).toBe(false);
  });

  it('the /admin/lenses detail rule is ordered before its directory rule', () => {
    // Next matches redirects in array order. `/admin/lenses/users` listed first
    // would still not shadow `/admin/lenses/users/:id` (sources match whole
    // paths), but the detail-before-directory order is what a reader expects
    // and what keeps a future `:path*` rule from swallowing the leaf.
    const detail = configRules.findIndex((r) => r.source === '/admin/lenses/users/:id');
    const directory = configRules.findIndex((r) => r.source === '/admin/lenses/users');
    expect(detail).toBeGreaterThanOrEqual(0);
    expect(detail).toBeLessThan(directory);
  });

  it('the Reliability redirect carries ?feature= rather than dropping it', () => {
    // /admin/reliability?feature=<key> selected a constellation node. A single
    // blanket rule would land on /admin/errors?view=sources with nothing
    // selected — a redirect that appears to work and silently loses the one
    // thing the link was carrying. Next matches in array order, so the
    // param-carrying rule must come first.
    const featureRule =
      /\{\s*source:\s*'\/admin\/reliability'\s*,\s*has:\s*\[\s*\{\s*type:\s*'query'\s*,\s*key:\s*'feature'\s*\}\s*\]\s*,\s*destination:\s*'([^']+)'\s*,\s*permanent:\s*false/;
    const match = config.match(featureRule);
    expect(match, 'No has:[query feature] redirect for /admin/reliability').not.toBeNull();
    expect(match![1]).toBe('/admin/errors?view=sources&feature=:feature');
    expect(config.indexOf("has: [{ type: 'query', key: 'feature' }]")).toBeLessThan(
      config.indexOf("{ source: '/admin/reliability', destination:"),
    );
  });

  it('the fingerprint route is never retired', () => {
    // /admin/errors/<fingerprint> is stored in rca_analysis rows and matched by
    // repair-link.ts's PR-body regex. It does not move.
    for (const route of RETIRED_ADMIN_ROUTES) {
      expect(route.from.startsWith('/admin/errors/')).toBe(false);
    }
  });
});
