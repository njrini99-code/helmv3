// =============================================================================
// src/lib/baseball/__tests__/settings-aliases-and-legacy-redirects.test.ts
//
// Phase 3 (#383) — stale-link / alias regression coverage.
//
// Unlike nav-manifest.test.ts (which pins the MANIFEST's own declared targets),
// these tests read the SOURCE FILES directly — the actual settings-route-aliases
// module and the actual redirect() call inside each legacy redirect page — so a
// future rename/removal of a canonical route fails here even if nav-manifest.ts
// itself was never updated to match.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  BASEBALL_PROGRAM_SETTINGS_PATH,
  BASEBALL_SETTINGS_ALIASES,
  getBaseballSettingsAliasHref,
  type BaseballSettingsAlias,
} from '../settings-route-aliases';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // → repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');

// -----------------------------------------------------------------------------
// Filesystem walk (same contract as auth-redirects-resolve.test.ts).
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

/**
 * Extract every in-product `/baseball/...` string literal from a page's
 * source. These pages are single-purpose redirect-only leaves (verified by
 * the `existsSync` + literal-count assertions below), so every such literal
 * is a candidate redirect target — whether it appears directly inside
 * `redirect('...')` or is first assigned to a local `target` variable (as in
 * `dashboard/team/page.tsx`'s coach/player ternary) before being passed to
 * `redirect(target)`.
 */
function extractRedirectLiterals(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');
  const found = new Set<string>();
  const re = /['"`](\/baseball\/[^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    found.add(m[1]!);
  }
  return [...found];
}

// -----------------------------------------------------------------------------
// 1. Settings aliases (#383 Phase 3 Task 2).
// -----------------------------------------------------------------------------

describe('BASEBALL_SETTINGS_ALIASES', () => {
  const aliasKeys = Object.keys(BASEBALL_SETTINGS_ALIASES) as BaseballSettingsAlias[];

  it('declares all 8 known aliases', () => {
    expect(aliasKeys).toHaveLength(8);
    expect(aliasKeys.sort()).toEqual(
      [
        'appearance',
        'ai',
        'guardian-access',
        'notifications',
        'player-access',
        'data-retention',
        'demo-mode',
        'showcase-profile',
      ].sort(),
    );
  });

  it.each(aliasKeys.map((k) => [k] as const))(
    'getBaseballSettingsAliasHref(%s) returns the canonical settings/program#<section> form',
    (alias) => {
      const href = getBaseballSettingsAliasHref(alias);
      expect(href).toBe(`${BASEBALL_PROGRAM_SETTINGS_PATH}#${alias}`);
      expect(href.startsWith(BASEBALL_PROGRAM_SETTINGS_PATH)).toBe(true);
    },
  );

  it.each(aliasKeys.map((k) => [k] as const))(
    'alias %s base path (before #fragment) resolves to a real page on disk',
    (alias) => {
      const href = getBaseballSettingsAliasHref(alias);
      expect(routeExists(href)).toBe(true);
    },
  );
});

// -----------------------------------------------------------------------------
// 2. Legacy create/new + role-type + team redirect pages.
// -----------------------------------------------------------------------------
//
// Each tuple is [page path relative to src/app, expected redirect target(s)].
// Reading the literal redirect() call (rather than re-deriving the target from
// memory) means a future rename of the canonical destination fails THIS test —
// not just the page's own behavior.

const LEGACY_REDIRECT_PAGES: ReadonlyArray<{
  relPath: string[];
  expectedTargets: readonly string[];
}> = [
  {
    relPath: ['baseball', '(coach-dashboard)', 'coach', 'college', 'page.tsx'],
    expectedTargets: ['/baseball/dashboard/command-center'],
  },
  {
    relPath: ['baseball', '(coach-dashboard)', 'coach', 'high-school', 'page.tsx'],
    expectedTargets: ['/baseball/dashboard/command-center'],
  },
  {
    relPath: ['baseball', '(coach-dashboard)', 'coach', 'juco', 'page.tsx'],
    expectedTargets: ['/baseball/dashboard/command-center'],
  },
  {
    relPath: ['baseball', '(coach-dashboard)', 'coach', 'showcase', 'page.tsx'],
    expectedTargets: ['/baseball/dashboard/command-center'],
  },
  {
    relPath: ['baseball', '(player-dashboard)', 'player', 'college', 'page.tsx'],
    expectedTargets: ['/baseball/player/today'],
  },
  {
    relPath: ['baseball', '(player-dashboard)', 'player', 'high-school', 'page.tsx'],
    expectedTargets: ['/baseball/player/today'],
  },
  {
    relPath: ['baseball', '(player-dashboard)', 'player', 'juco', 'page.tsx'],
    expectedTargets: ['/baseball/player/today'],
  },
  {
    relPath: ['baseball', '(player-dashboard)', 'player', 'showcase', 'page.tsx'],
    expectedTargets: ['/baseball/player/today'],
  },
  {
    relPath: ['baseball', '(dashboard)', 'dashboard', 'team', 'high-school', 'page.tsx'],
    expectedTargets: ['/baseball/dashboard/command-center'],
  },
  {
    relPath: ['baseball', '(dashboard)', 'dashboard', 'stats', 'page.tsx'],
    expectedTargets: ['/baseball/dashboard/stats-center'],
  },
  {
    // Dynamic: branches coach -> command-center, player -> player/today, plus
    // the unauthenticated -> login guard.
    relPath: ['baseball', '(dashboard)', 'dashboard', 'team', 'page.tsx'],
    expectedTargets: [
      '/baseball/dashboard/command-center',
      '/baseball/player/today',
      '/baseball/login',
    ],
  },
];

describe('legacy create/new + role-type redirect pages target existing canonical routes', () => {
  it.each(LEGACY_REDIRECT_PAGES.map(({ relPath, expectedTargets }) => [relPath, expectedTargets] as const))(
    '%j',
    (relPath, expectedTargets) => {
      const filePath = join(APP_DIR, ...relPath);
      expect(existsSync(filePath), `expected legacy redirect page at ${filePath}`).toBe(true);

      const literals = extractRedirectLiterals(filePath);
      expect(
        literals.length,
        `expected at least one redirect() literal in ${filePath}`,
      ).toBeGreaterThan(0);

      // Every literal found must be one of the expected targets (catches drift
      // if someone repoints the redirect to a route this test doesn't know
      // about) AND must resolve to a real page on disk (catches removal).
      for (const literal of literals) {
        expect(
          expectedTargets.includes(literal),
          `${filePath} redirects to unexpected target "${literal}" (expected one of ${expectedTargets.join(', ')})`,
        ).toBe(true);
        expect(routeExists(literal), `redirect target "${literal}" from ${filePath} must resolve`).toBe(
          true,
        );
      }

      // Every declared expected target must actually appear as a literal —
      // catches a target being silently dropped (e.g. the team/page.tsx
      // dynamic branch losing one of its two arms).
      for (const expected of expectedTargets) {
        expect(
          literals.includes(expected),
          `${filePath} no longer redirects to expected target "${expected}"`,
        ).toBe(true);
      }
    },
  );

  it('reuses stats-route-aliases.ts coverage for the legacy /stats/games/new create alias', async () => {
    // stats-route-aliases.test.ts already locks this contract directly; this
    // assertion just confirms the alias module + its canonical target both
    // resolve, keeping this file's "legacy create/new style routes" coverage
    // complete without duplicating that suite's assertions.
    const { BASEBALL_STATS_GAME_CREATE_PATH, BASEBALL_STATS_GAME_CREATE_LEGACY_PATH } =
      await import('../stats-route-aliases');
    expect(routeExists(BASEBALL_STATS_GAME_CREATE_PATH)).toBe(true);
    expect(routeExists(BASEBALL_STATS_GAME_CREATE_LEGACY_PATH)).toBe(true);
  });
});
