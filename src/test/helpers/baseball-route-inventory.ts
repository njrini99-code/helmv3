// =============================================================================
// src/test/helpers/baseball-route-inventory.ts
//
// Node-side filesystem inventory builder for the BaseballHelm route/shell
// contract (#374). Walks src/app/baseball/ with the same route-group-aware
// descent proven in
// src/app/baseball/actions/__tests__/auth-redirects-resolve.test.ts
// (collapsing `(group)` dirs, resolving page.tsx/route.ts/default.tsx) and
// pairs the resulting disk inventory with two hand-curated, reason-documented
// manifests:
//   - REDIRECT_ALIAS_MANIFEST — intentional old -> new route aliases
//   - DYNAMIC_ROUTE_SAMPLES   — a representative sample id per dynamic route
//     template (the "crawler seed" source for the missing-sample gap check)
// plus an adapter that turns the middleware's STAFF_CAPABILITY_ROUTES into the
// `GuardedRoute[]` shape `analyzeRouteContract()` expects.
//
// fs/path are Node-only — this module is NEVER imported by route-contract.ts
// (which must stay pure/isomorphic) or by any client/server bundle. Only the
// Vitest contract test and the report generator import it.
//
// Gap semantics: docs/operations/baseball-route-contract-runbook.md
// =============================================================================

import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiskRoute, DynamicRouteSample, GuardedRoute, RedirectAlias } from '@/lib/baseball/route-contract';
import { STAFF_CAPABILITY_ROUTES } from '@/lib/supabase/middleware';
import type { BaseballCapability } from '@/lib/baseball/capabilities';

// import.meta.url (not __dirname) — this module is run both by Vitest (ESM via
// vite-node) and directly via `tsx` (the repo's package.json sets
// "type": "module", so plain CJS `__dirname` is unavailable in the latter).
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(CURRENT_DIR, '..', '..', '..');
const BASEBALL_APP_DIR = join(REPO_ROOT, 'src', 'app', 'baseball');

const RENDERABLE_FILES = ['page.tsx', 'page.ts', 'route.ts', 'route.tsx', 'default.tsx'];

function isRouteGroupDir(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
}

/** Next.js "private folder" convention (`_components`, etc.) plus test dirs. */
function isNonRouteDir(name: string): boolean {
  return name.startsWith('_') || name === '__tests__';
}

function hasRenderableFile(dir: string): boolean {
  return RENDERABLE_FILES.some((file) => {
    try {
      return statSync(join(dir, file)).isFile();
    } catch {
      return false;
    }
  });
}

function walk(dir: string, urlSegments: readonly string[]): DiskRoute[] {
  const out: DiskRoute[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  if (hasRenderableFile(dir)) {
    out.push({
      routePath: `/${urlSegments.join('/')}`,
      isDynamic: urlSegments.some((seg) => seg.startsWith('[') && seg.endsWith(']')),
      filePath: relative(REPO_ROOT, dir),
    });
  }

  for (const name of entries) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (isNonRouteDir(name)) continue;
    const nextSegments = isRouteGroupDir(name) ? urlSegments : [...urlSegments, name];
    out.push(...walk(full, nextSegments));
  }
  return out;
}

/**
 * Build the full BaseballHelm App Router disk inventory: every route backed by
 * a page.tsx / page.ts / route.ts / route.tsx / default.tsx under
 * src/app/baseball/, with route groups collapsed and dynamic segments
 * (`[id]`, `[gameId]`, ...) preserved as templated routes.
 */
export function buildBaseballRouteInventory(): DiskRoute[] {
  return walk(BASEBALL_APP_DIR, ['baseball']);
}

// -----------------------------------------------------------------------------
// Redirect-alias manifest — every intentional old -> new route rename. A new
// entry here (with a reason) is the conscious, reviewed way to land a rename;
// see the runbook's "renames" section.
// -----------------------------------------------------------------------------

export const REDIRECT_ALIAS_MANIFEST: RedirectAlias[] = [
  {
    from: '/baseball/dashboard/team',
    to: '/baseball/dashboard/command-center',
    reason:
      'Legacy team dashboard route, replaced by Command Center (coach) / Player Today (player). ' +
      'The page itself remains on disk as a redirect-only stub for old bookmarks; middleware ' +
      'short-circuits it before the page even renders.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_TEAM_ROUTES, COACH_HOME)',
  },
  {
    from: '/baseball/coach/college',
    to: '/baseball/dashboard/command-center',
    reason: 'Legacy per-coach-type bookmark; stub page removed in favor of canonical Command Center.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/coach/high-school',
    to: '/baseball/dashboard/command-center',
    reason: 'Legacy per-coach-type bookmark; stub page removed in favor of canonical Command Center.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/coach/juco',
    to: '/baseball/dashboard/command-center',
    reason: 'Legacy per-coach-type bookmark; stub page removed in favor of canonical Command Center.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/coach/showcase',
    to: '/baseball/dashboard/command-center',
    reason: 'Legacy per-coach-type bookmark; stub page removed in favor of canonical Command Center.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/player/college',
    to: '/baseball/player/today',
    reason: 'Legacy per-program-type bookmark; stub page removed in favor of canonical Player Today.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/player/high-school',
    to: '/baseball/player/today',
    reason: 'Legacy per-program-type bookmark; stub page removed in favor of canonical Player Today.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/player/juco',
    to: '/baseball/player/today',
    reason: 'Legacy per-program-type bookmark; stub page removed in favor of canonical Player Today.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/player/showcase',
    to: '/baseball/player/today',
    reason: 'Legacy per-program-type bookmark; stub page removed in favor of canonical Player Today.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/dashboard/team/high-school',
    to: '/baseball/dashboard/command-center',
    reason: 'Legacy HS team dashboard bookmark; stub page removed in favor of Command Center.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
  {
    from: '/baseball/dashboard/stats/games/new',
    to: '/baseball/dashboard/stats/games/create',
    reason: 'Legacy game-create alias; canonical path is /stats/games/create.',
    implementedAt: 'src/lib/supabase/middleware.ts (LEGACY_BASEBALL_ROUTE_REDIRECTS)',
  },
];

// -----------------------------------------------------------------------------
// Dynamic-route sample-id registry — one representative concrete value per
// dynamic route template, the crawler-seed source for the
// missingDynamicSamples gap check.
// -----------------------------------------------------------------------------

export const DYNAMIC_ROUTE_SAMPLES: DynamicRouteSample[] = [
  {
    template: '/baseball/dashboard/camps/[id]',
    sampleParams: { id: 'demo-camp' },
    reason: 'Camp detail page reached from the Camps list (/baseball/dashboard/camps).',
  },
  {
    template: '/baseball/dashboard/dev-plans/[id]',
    sampleParams: { id: 'demo-dev-plan' },
    reason: 'Dev plan detail page reached from the coach Dev Plans list.',
  },
  {
    template: '/baseball/dashboard/lift/[sessionId]',
    sampleParams: { sessionId: 'demo-lift-session' },
    reason: 'Lift session detail reached from the player Lift home (/baseball/dashboard/lift).',
  },
  {
    template: '/baseball/dashboard/messages/[id]',
    sampleParams: { id: 'demo-thread' },
    reason: 'Message thread detail reached from the Messages inbox.',
  },
  {
    template: '/baseball/dashboard/performance/players/[id]',
    sampleParams: { id: 'demo-player' },
    reason: 'Per-player performance detail reached from the Performance hub.',
  },
  {
    template: '/baseball/dashboard/performance/programs/[programId]',
    sampleParams: { programId: 'demo-program' },
    reason: 'Lifting program detail reached from Performance > Programs.',
  },
  {
    template: '/baseball/dashboard/players/[id]',
    sampleParams: { id: 'demo-player' },
    reason: 'Player profile detail reached from Roster.',
  },
  {
    template: '/baseball/dashboard/players/[id]/passport',
    sampleParams: { id: 'demo-player' },
    reason: 'Player passport view reached from the player profile.',
  },
  {
    template: '/baseball/dashboard/players/[id]/profile',
    sampleParams: { id: 'demo-player' },
    reason: 'Player profile sub-view reached from Roster.',
  },
  {
    template: '/baseball/dashboard/players/[id]/scout-packet',
    sampleParams: { id: 'demo-player' },
    reason: 'Scout packet builder reached from the player profile.',
  },
  {
    template: '/baseball/dashboard/players/[id]/scout-packet/preview',
    sampleParams: { id: 'demo-player' },
    reason: 'Scout packet print preview reached from the scout packet builder.',
  },
  {
    template: '/baseball/dashboard/players/[id]/stats',
    sampleParams: { id: 'demo-player' },
    reason: 'Player stats sub-view reached from the player profile.',
  },
  {
    template: '/baseball/dashboard/stats/games/[gameId]',
    sampleParams: { gameId: 'demo-game' },
    reason: 'Box score detail reached from the Games list.',
  },
  {
    template: '/baseball/dashboard/videos/[id]',
    sampleParams: { id: 'demo-video' },
    reason: 'Video detail reached from the Videos library.',
  },
  {
    template: '/baseball/dashboard/videos/[id]/edit',
    sampleParams: { id: 'demo-video' },
    reason: 'Video edit form reached from the video detail page.',
  },
  {
    template: '/baseball/packet/[token]',
    sampleParams: { token: 'demo-packet-token' },
    reason: 'Public scout-packet share link, distributed out-of-band — not linked from app nav.',
  },
  {
    template: '/baseball/packet/[token]/csv',
    sampleParams: { token: 'demo-packet-token' },
    reason: 'CSV export of the public scout-packet share link.',
  },
  {
    template: '/baseball/player/[id]',
    sampleParams: { id: 'demo-public-player' },
    reason: 'Public player profile share page, linked from recruiting outreach — not in-app nav.',
  },
  {
    template: '/baseball/program/[id]',
    sampleParams: { id: 'demo-public-program' },
    reason: 'Public program marketing page, not in-app nav.',
  },
  {
    template: '/baseball/team/[id]',
    sampleParams: { id: 'demo-public-team' },
    reason: 'Public team marketing page, not in-app nav.',
  },
  {
    template: '/baseball/join/[code]',
    sampleParams: { code: 'DEMO123' },
    reason: 'Team join-by-code flow, shared via invite link — not in-app nav.',
  },
  {
    template: '/baseball/staff/join/[code]',
    sampleParams: { code: 'DEMO456' },
    reason: 'Staff join-by-code flow, shared via invite link — not in-app nav.',
  },
];

// -----------------------------------------------------------------------------
// Server-guard policy adapter — turns middleware's STAFF_CAPABILITY_ROUTES
// into the GuardedRoute[] shape analyzeRouteContract() expects.
//
// SCOPE NOTE: middleware.ts also gates RECRUITING_ROUTES / ORG_ROUTES /
// ACADEMICS_ROUTES / LEGACY_TEAM_ROUTES by program type, but those consts are
// module-private (not exported) and several of the nav-registry entries they
// cover (pipeline, discover, watchlist, ...) do not yet carry matching
// `allowedProgramTypes` gating metadata. Folding that program-type policy into
// `guardWithoutNavGating` would make a HARD-gated bucket non-empty today, so
// this pass deliberately scopes the bucket to the capability policy alone
// (the one already locked empty by
// src/lib/baseball/__tests__/nav-capability-gating.test.ts). See the runbook's
// "Deferred" section for the follow-up.
// -----------------------------------------------------------------------------

export function buildGuardedRoutes(): GuardedRoute[] {
  return STAFF_CAPABILITY_ROUTES.map(([href, requiredCapability]) => ({
    href,
    requiredCapability: requiredCapability as BaseballCapability,
    source: 'middleware:STAFF_CAPABILITY_ROUTES',
  }));
}
