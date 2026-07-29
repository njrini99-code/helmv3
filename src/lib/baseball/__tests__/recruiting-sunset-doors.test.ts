// =============================================================================
// src/lib/baseball/__tests__/recruiting-sunset-doors.test.ts
//
// Team A — "complete the recruiting sunset" (recon item 5).
//
// Proves recruiting is closed for EVERY ordinary role × program type
// combination, on BOTH axes the brief called out:
//   (a) the nav layer — no visible nav entry for coach or player, for any
//       BASEBALL_PROGRAM_TYPES value (or an unresolved programType), ever
//       carries hub: 'recruiting' or module: 'recruiting';
//   (b) the route layer — isPathnameModuleDisabled() is true for every
//       recruiting route prefix, and resolveActiveHub() never resolves a
//       recruiting hub for any role/program-type on those pathnames;
//   (c) the server-guard layer — requireRecruitingCoachRoute /
//       requireRecruitingPlayerRoute (server-route-guards.ts) refuse a direct
//       URL for every coach/player type, closing the door a hidden nav link
//       alone would not.
//
// "Ordinary role" here means: not gated out for some OTHER reason first (a
// head-coach capability map is used throughout so a missing capability can
// never masquerade as the recruiting gate working).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASEBALL_PROGRAM_TYPES, type BaseballProgramType } from '@/lib/types/baseball-settings';
import { BASEBALL_NAV_REGISTRY, getVisibleBaseballNav, type BaseballNavContext } from '../nav-registry';
import { isPathnameModuleDisabled, isRecruitingEnabled, MODULE_ROUTE_PREFIXES } from '../product-modules';
import { BASEBALL_CAPABILITY_KEYS, type BaseballCapability } from '../capabilities';
import { resolveActiveHub } from '@/app/baseball/(dashboard)/_components/resolve-active-hub';

// Every program type PLUS the unresolved (null) case — the brief's "every
// ordinary role" sweep, matching the same set bottom-nav.test.ts iterates.
const ALL_PROGRAM_TYPES: readonly (BaseballProgramType | null)[] = [...BASEBALL_PROGRAM_TYPES, null];

// A head coach who holds EVERY capability — proves recruiting stays hidden
// because of the product-module gate specifically, not because of an
// unrelated missing capability that would hide it "by accident."
const ALL_CAPS_GRANTED: Record<BaseballCapability, boolean> = BASEBALL_CAPABILITY_KEYS.reduce(
  (acc, key) => {
    acc[key] = true;
    return acc;
  },
  {} as Record<BaseballCapability, boolean>,
);

function coachCtx(programType: BaseballProgramType | null): BaseballNavContext {
  return { role: 'coach', capabilities: ALL_CAPS_GRANTED, programType };
}
function playerCtx(programType: BaseballProgramType | null): BaseballNavContext {
  return { role: 'player', capabilities: {}, programType };
}

// Every registry id known to belong to recruiting, by construction (hub or
// module tag) — asserted directly below as a belt-and-suspenders check on
// top of the generic hub/module sweep, so a future registry edit that adds a
// new recruiting id without tagging it correctly still gets caught by name.
const RECRUITING_HUB_IDS = BASEBALL_NAV_REGISTRY.filter((e) => e.hub === 'recruiting').map((e) => e.id);
const RECRUITING_MODULE_IDS = BASEBALL_NAV_REGISTRY.filter((e) => e.module === 'recruiting').map((e) => e.id);

describe('recruiting sunset — nav layer is closed for every role x program type', () => {
  it('the registry actually has recruiting-tagged entries to test against (sanity — a passing suite here must not be vacuous)', () => {
    expect(RECRUITING_HUB_IDS.length).toBeGreaterThan(0);
    expect(RECRUITING_MODULE_IDS.length).toBeGreaterThan(0);
    expect(isRecruitingEnabled()).toBe(false);
  });

  it.each(ALL_PROGRAM_TYPES)('coach nav (programType=%s): no visible entry carries hub "recruiting" or module "recruiting", even with every capability granted', (pt) => {
    const visible = getVisibleBaseballNav(coachCtx(pt));
    expect(visible.some((e) => e.hub === 'recruiting')).toBe(false);
    expect(visible.some((e) => e.module === 'recruiting')).toBe(false);
    for (const id of [...RECRUITING_HUB_IDS, ...RECRUITING_MODULE_IDS]) {
      expect(visible.map((e) => e.id)).not.toContain(id);
    }
  });

  it.each(ALL_PROGRAM_TYPES)('player nav (programType=%s): no visible entry carries module "recruiting" (players are never capability-gated)', (pt) => {
    const visible = getVisibleBaseballNav(playerCtx(pt));
    expect(visible.some((e) => e.module === 'recruiting')).toBe(false);
    // 'camps' is role: 'both' + hub: 'recruiting' — must also disappear for
    // players via the same hub gate coaches use, not just the module gate.
    expect(visible.some((e) => e.hub === 'recruiting')).toBe(false);
    for (const id of [...RECRUITING_HUB_IDS, ...RECRUITING_MODULE_IDS]) {
      expect(visible.map((e) => e.id)).not.toContain(id);
    }
  });
});

// Map a literal pathname to its App Router page file, skipping route groups.
// Only literal segments are handled, which is all the recruiting nav needs —
// every recruiting href in the registry is a fixed path.
function findPageFile(pathname: string): string | null {
  const wanted = pathname.split('/').filter(Boolean);

  const walk = (dir: string, segs: string[]): string | null => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    if (segs.length === wanted.length && segs.every((s, i) => s === wanted[i])) {
      const page = entries.find((e) => e.isFile() && /^page\.(tsx?|jsx?)$/.test(e.name));
      if (page) return join(dir, page.name);
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const isGroup = e.name.startsWith('(') && e.name.endsWith(')');
      const next = isGroup ? segs : [...segs, e.name];
      // Prune: never descend past the path we are looking for.
      if (!isGroup && (next.length > wanted.length || next[next.length - 1] !== wanted[next.length - 1])) {
        continue;
      }
      const hit = walk(join(dir, e.name), next);
      if (hit) return hit;
    }
    return null;
  };

  return walk(join(__dirname, '../../../app'), []);
}

/** Does this route's own page file call a recruiting server guard? */
function pageCallsRecruitingGuard(pathname: string): boolean {
  const file = findPageFile(pathname);
  if (!file) return false;
  return /requireRecruiting(Coach|Player)Route/.test(readFileSync(file, 'utf8'));
}

describe('recruiting sunset — nav and routes agree with each other', () => {
  // The two sweeps above are each complete on their own axis and still leave a
  // seam between them, which is where /baseball/dashboard/activate hid: the
  // nav layer knew it was recruiting (module: 'recruiting', so it was hidden),
  // the route layer did not (absent from MODULE_ROUTE_PREFIXES, so nothing
  // closed the door). Each suite passed. Neither compared its answer to the
  // other's.
  //
  // These two assertions close that seam from both sides. They are about
  // AGREEMENT, not about either list being right — which is the only kind of
  // check that can catch an omission, since an omission is invisible to any
  // sweep that iterates the list it is missing from.

  it('the page-file resolver answers in both directions (guards the assertion below)', () => {
    // Without this, a resolver that silently returned null for everything
    // would make pageCallsRecruitingGuard() a constant `false`. The sweep
    // below would then be testing only MODULE_ROUTE_PREFIXES while its failure
    // message claimed to have checked two mechanisms — a test that lies about
    // what it looked at is worse than one that checks less.
    expect(findPageFile('/baseball/dashboard/roster')).toMatch(/roster\/page\.tsx$/);
    expect(findPageFile('/baseball/dashboard/definitely-not-a-route')).toBeNull();

    // A route genuinely closed by the server guard, and one genuinely not.
    expect(pageCallsRecruitingGuard('/baseball/dashboard/watchlist')).toBe(true);
    expect(pageCallsRecruitingGuard('/baseball/dashboard/roster')).toBe(false);
  });

  it('every recruiting-tagged nav entry has its door shut by SOMETHING', () => {
    // Deliberately not "…covered by MODULE_ROUTE_PREFIXES". The first draft
    // asserted exactly that and failed on /dashboard/watchlist — whose page
    // calls requireRecruitingCoachRoute(), i.e. is closed, by a different
    // mechanism. Demanding one specific mechanism would have made the test
    // pass only by adding a second, redundant gate to a route that already
    // had one, which is the shape of change that leaves a codebase with
    // comments describing problems it does not have.
    //
    // So this asserts the property that actually matters — the door is shut —
    // and accepts either lock:
    //   (1) the central route-prefix registry (checked by middleware), or
    //   (2) a recruiting server guard in the route's own page file.
    const taggedRecruiting = BASEBALL_NAV_REGISTRY.filter(
      (e) => e.hub === 'recruiting' || e.module === 'recruiting',
    );
    expect(taggedRecruiting.length).toBeGreaterThan(0);

    for (const entry of taggedRecruiting) {
      for (const href of [entry.href, entry.playerHref].filter(
        (h): h is string => typeof h === 'string' && h.startsWith('/baseball'),
      )) {
        const byRegistry = isPathnameModuleDisabled(href);
        const byServerGuard = pageCallsRecruitingGuard(href);
        expect(
          byRegistry || byServerGuard,
          `Nav entry "${entry.id}" is tagged recruiting and therefore hidden, but ${href} ` +
            `has NO server-side gate: it is absent from MODULE_ROUTE_PREFIXES and its page ` +
            `file does not call a requireRecruiting*Route guard. Hiding a link is not ` +
            `closing a door — this is exactly how /dashboard/activate stayed reachable.`,
        ).toBe(true);
      }
    }
  });

  it('no VISIBLE nav entry points at a route the module gate blocks', () => {
    // The inverse seam: an entry that forgot its recruiting tag would stay in
    // the sidebar while its destination redirects — a link that visibly leads
    // nowhere, which is worse for a demo than one that is simply absent.
    for (const pt of ALL_PROGRAM_TYPES) {
      for (const ctx of [coachCtx(pt), playerCtx(pt)]) {
        for (const entry of getVisibleBaseballNav(ctx)) {
          const href = ctx.role === 'player' ? (entry.playerHref ?? entry.href) : entry.href;
          if (!href?.startsWith('/baseball')) continue;
          expect(
            isPathnameModuleDisabled(href),
            `Visible ${ctx.role} nav entry "${entry.id}" (programType=${pt}) links to ${href}, ` +
              `which a disabled product module blocks.`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('recruiting sunset — route layer is closed regardless of role/program type', () => {
  it('every recruiting route prefix (and a nested detail path under it) is module-disabled', () => {
    for (const prefix of MODULE_ROUTE_PREFIXES.recruiting) {
      expect(isPathnameModuleDisabled(prefix), prefix).toBe(true);
      expect(isPathnameModuleDisabled(`${prefix}/some-id`), `${prefix}/some-id`).toBe(true);
    }
  });

  it.each(ALL_PROGRAM_TYPES)('resolveActiveHub never resolves a recruiting hub for a coach on a recruiting route (programType=%s)', (pt) => {
    for (const pathname of ['/baseball/dashboard/pipeline', '/baseball/dashboard/discover', '/baseball/dashboard/scouting']) {
      const hub = resolveActiveHub({ pathname, role: 'coach', programType: pt, capabilities: ALL_CAPS_GRANTED });
      expect(hub, `${pathname} (coach, ${pt})`).toBeNull();
    }
  });

  it.each(ALL_PROGRAM_TYPES)('resolveActiveHub never resolves a recruiting hub for a player on a recruiting route (programType=%s)', (pt) => {
    for (const pathname of ['/baseball/dashboard/journey', '/baseball/dashboard/colleges', '/baseball/dashboard/analytics']) {
      const hub = resolveActiveHub({ pathname, role: 'player', programType: pt });
      expect(hub, `${pathname} (player, ${pt})`).toBeNull();
    }
  });
});

// -----------------------------------------------------------------------------
// Server-guard layer — requireRecruitingCoachRoute / requireRecruitingPlayerRoute
// refuse a direct URL for every coach/player, closing the door hiding a nav
// link alone does not. Mocked the same way server-route-guards.test.ts mocks
// its dependencies (separate module registry per test file — no collision).
// -----------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  getActiveBaseballContext: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: mocks.getSessionProfile,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: mocks.getActiveBaseballContext,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

describe('recruiting sunset — server guards refuse a direct URL for every role/type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['college', 'juco', 'showcase'] as const)(
    'requireRecruitingCoachRoute redirects a fully program-eligible %s coach away — module gate wins over an otherwise-passing program-type check',
    async (coach_type) => {
      const { requireRecruitingCoachRoute } = await import('../server-route-guards');
      mocks.getSessionProfile.mockResolvedValue({
        userId: 'u1',
        role: 'coach',
        coach: { id: 'c1', coach_type },
        player: null,
      });
      await expect(requireRecruitingCoachRoute()).rejects.toThrow(
        'REDIRECT:/baseball/dashboard/command-center',
      );
    },
  );

  it('requireRecruitingCoachRoute still redirects unauthenticated visitors to login — the module gate does not skip the session check', async () => {
    const { requireRecruitingCoachRoute } = await import('../server-route-guards');
    mocks.getSessionProfile.mockResolvedValue(null);
    await expect(requireRecruitingCoachRoute()).rejects.toThrow('REDIRECT:/baseball/login');
  });

  it('requireRecruitingCoachRoute still redirects a non-coach session to redirectTo — the module gate does not skip the role check', async () => {
    const { requireRecruitingCoachRoute } = await import('../server-route-guards');
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'college' },
    });
    await expect(requireRecruitingCoachRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/command-center',
    );
  });

  // baseball_player_type only has 4 members (database.ts) — 'academy'/'club'
  // are program_type-only modes, never a player_type value.
  it.each(['college', 'juco', 'showcase', 'high_school'] as const)(
    'requireRecruitingPlayerRoute redirects a %s player away — not just college players',
    async (player_type) => {
      const { requireRecruitingPlayerRoute } = await import('../server-route-guards');
      mocks.getSessionProfile.mockResolvedValue({
        userId: 'u1',
        role: 'player',
        coach: null,
        player: { id: 'p1', player_type },
      });
      await expect(requireRecruitingPlayerRoute()).rejects.toThrow('REDIRECT:/baseball/player/today');
    },
  );

  it('requireRecruitingPlayerRoute still redirects unauthenticated visitors to login', async () => {
    const { requireRecruitingPlayerRoute } = await import('../server-route-guards');
    mocks.getSessionProfile.mockResolvedValue(null);
    await expect(requireRecruitingPlayerRoute()).rejects.toThrow('REDIRECT:/baseball/login');
  });

  it('requireRecruitingPlayerRoute still redirects a coach session to its coach redirect', async () => {
    const { requireRecruitingPlayerRoute } = await import('../server-route-guards');
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });
    await expect(requireRecruitingPlayerRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/stats-center',
    );
  });
});
