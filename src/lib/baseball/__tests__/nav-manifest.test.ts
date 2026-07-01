// =============================================================================
// src/lib/baseball/__tests__/nav-manifest.test.ts
//
// Phase 1 (#383) — pins the navigation manifest to reality:
//   1. Every 'canonical' and 'alias' href resolves to a real page.tsx/route.ts
//      on disk (reusing the route-group-aware filesystem walk from
//      auth-redirects-resolve.test.ts).
//   2. Every 'deprecated'/'removed' legacy-redirect entry is internally
//      consistent: deprecated entries point at a target that IS a canonical
//      manifest entry; removed entries must NOT resolve on disk (otherwise the
//      tombstone is stale and should be deleted, not asserted).
//   3. Every BASEBALL_NAV_REGISTRY entry and every hub-definitions.ts tab href
//      has a corresponding manifest entry — no untracked routes.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  BASEBALL_NAV_MANIFEST,
  manifestHrefsByStatus,
  type NavManifestEntry,
} from '../nav-manifest';
import { BASEBALL_NAV_REGISTRY, BASEBALL_MESSAGES_NAV } from '../nav-registry';
import {
  COACH_TEAM_TABS,
  COACH_STATS_TABS,
  COACH_DEVELOPMENT_TABS,
  COACH_MANAGEMENT_TABS,
  COACH_RECRUITING_TABS,
  COACH_ACADEMICS_TABS,
  PLAYER_STATS_TABS,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_TEAM_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // → repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');

// -----------------------------------------------------------------------------
// Filesystem walk — identical contract to auth-redirects-resolve.test.ts:
// resolve an in-product href to a page.tsx/route.ts/default.tsx on disk,
// allowing the URL segments to be nested under any number of route groups.
// -----------------------------------------------------------------------------

function routeExists(href: string): boolean {
  const path = href.split('?')[0]!.split('#')[0]!;
  const segments = path.split('/').filter(Boolean);

  let dirs: string[] = [APP_DIR];

  for (const seg of segments) {
    const next: string[] = [];
    for (const dir of dirs) {
      const direct = join(dir, seg);
      if (existsSync(direct) && statSync(direct).isDirectory()) next.push(direct);
      collectThroughGroups(dir, seg, next);
    }
    if (next.length === 0) return false;
    dirs = next;
  }

  return dirs.some((d) => dirHasRenderable(d));
}

function collectThroughGroups(dir: string, seg: string, out: string[]): void {
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return;
  }
  for (const child of children) {
    if (child.startsWith('(') && child.endsWith(')')) {
      const groupDir = join(dir, child);
      if (!statSync(groupDir).isDirectory()) continue;
      const target = join(groupDir, seg);
      if (existsSync(target) && statSync(target).isDirectory()) out.push(target);
      collectThroughGroups(groupDir, seg, out);
    }
  }
}

function dirHasRenderable(dir: string): boolean {
  const RENDERABLE = ['page.tsx', 'page.ts', 'route.ts', 'route.tsx', 'default.tsx'];
  if (RENDERABLE.some((f) => existsSync(join(dir, f)))) return true;
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return false;
  }
  return children.some(
    (c) =>
      c.startsWith('(') &&
      c.endsWith(')') &&
      statSync(join(dir, c)).isDirectory() &&
      dirHasRenderable(join(dir, c)),
  );
}

describe('BASEBALL_NAV_MANIFEST', () => {
  it('the App Router app dir exists at the resolved path', () => {
    expect(existsSync(APP_DIR)).toBe(true);
  });

  it('is non-empty and covers every classification this test suite checks', () => {
    expect(BASEBALL_NAV_MANIFEST.length).toBeGreaterThan(20);
    const statuses = new Set(BASEBALL_NAV_MANIFEST.map((e) => e.status));
    expect(statuses.has('canonical')).toBe(true);
    expect(statuses.has('alias')).toBe(true);
    expect(statuses.has('deprecated')).toBe(true);
    expect(statuses.has('removed')).toBe(true);
  });

  describe('every canonical href resolves to a real page/route on disk', () => {
    const canonical = manifestHrefsByStatus('canonical');

    it('sanity: canonical hrefs were actually collected', () => {
      expect(canonical.length).toBeGreaterThan(15);
    });

    it.each(canonical.map((href) => [href] as const))('%s resolves', (href) => {
      expect(routeExists(href)).toBe(true);
    });
  });

  describe('every alias href resolves to a real page/route on disk', () => {
    const aliases = manifestHrefsByStatus('alias');

    it('sanity: alias hrefs were actually collected', () => {
      expect(aliases.length).toBe(8);
    });

    it.each(aliases.map((href) => [href] as const))('%s base path resolves', (href) => {
      // routeExists already strips the #fragment, so this proves the base
      // settings path is real even though the fragment is a client-side anchor.
      expect(routeExists(href)).toBe(true);
    });
  });

  describe('every deprecated entry points at a canonical target that exists', () => {
    const deprecated = BASEBALL_NAV_MANIFEST.filter((e) => e.status === 'deprecated');
    const canonicalHrefs = new Set(manifestHrefsByStatus('canonical'));

    it('sanity: deprecated entries were actually collected', () => {
      expect(deprecated.length).toBeGreaterThanOrEqual(10);
    });

    it.each(deprecated.map((e) => [e] as const))(
      '%j declares a target that is a canonical manifest entry',
      (entry: NavManifestEntry) => {
        expect(entry.target, `deprecated entry ${entry.href} must declare a target`).toBeTruthy();
        expect(
          canonicalHrefs.has(entry.target!),
          `target "${entry.target}" of deprecated entry "${entry.href}" must be a canonical manifest entry`,
        ).toBe(true);
        expect(routeExists(entry.target!)).toBe(true);
      },
    );

    it('the deprecated redirect page itself still resolves on disk', () => {
      for (const entry of deprecated) {
        expect(routeExists(entry.href), `deprecated redirect page ${entry.href} must exist`).toBe(
          true,
        );
      }
    });
  });

  describe('every removed entry is a genuine tombstone (does NOT resolve)', () => {
    const removed = BASEBALL_NAV_MANIFEST.filter((e) => e.status === 'removed');

    it('sanity: at least one removed entry exists (the known dead /staff target)', () => {
      expect(removed.length).toBeGreaterThanOrEqual(1);
      expect(removed.some((e) => e.href === '/baseball/dashboard/staff')).toBe(true);
    });

    it.each(removed.map((e) => [e.href] as const))(
      '%s does not resolve to a real page/route',
      (href) => {
        expect(routeExists(href)).toBe(false);
      },
    );
  });

  describe('no untracked routes — every registry + hub-tab href is in the manifest', () => {
    const manifestHrefs = new Set(BASEBALL_NAV_MANIFEST.map((e) => e.href));

    it('every BASEBALL_NAV_REGISTRY href (and playerHref override) is tracked', () => {
      for (const entry of BASEBALL_NAV_REGISTRY) {
        expect(manifestHrefs.has(entry.href), `registry entry "${entry.id}" href ${entry.href} missing from manifest`).toBe(
          true,
        );
        if (entry.playerHref) {
          expect(
            manifestHrefs.has(entry.playerHref),
            `registry entry "${entry.id}" playerHref ${entry.playerHref} missing from manifest`,
          ).toBe(true);
        }
      }
    });

    it('the cross-cutting Messages entry is tracked', () => {
      expect(manifestHrefs.has(BASEBALL_MESSAGES_NAV.href)).toBe(true);
    });

    it('every hub-definitions.ts tab href is tracked', () => {
      const allTabs = [
        ...COACH_TEAM_TABS,
        ...COACH_STATS_TABS,
        ...COACH_DEVELOPMENT_TABS,
        ...COACH_MANAGEMENT_TABS,
        ...COACH_RECRUITING_TABS,
        ...COACH_ACADEMICS_TABS,
        ...PLAYER_STATS_TABS,
        ...PLAYER_DEVELOPMENT_TABS,
        ...PLAYER_TEAM_TABS,
      ];
      for (const tab of allTabs) {
        expect(manifestHrefs.has(tab.href), `hub tab "${tab.id}" href ${tab.href} missing from manifest`).toBe(
          true,
        );
      }
    });
  });
});
