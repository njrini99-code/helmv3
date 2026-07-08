// =============================================================================
// resolve-active-hub.ts — map the current pathname + role to the active hub's
// sub-tab list, so the shell can render the right HubSubNav strip above any page.
//
// The grouped-hubs architecture renders the sub-tab strip at the SHELL level
// (BaseballDashboardShell wraps every dashboard route). That avoids editing the
// many sibling leaf routes a hub spans (Team alone = roster/calendar/messages/
// announcements/tasks/documents/travel — seven sibling segments that can't share
// one Next route-group layout). The shell asks this resolver "which hub owns the
// current route?" and renders that hub's tabs.
//
// Coach hub MEMBERSHIP is driven entirely by COACH_HUB_ORDER / COACH_HUB_DEFS
// (hub-definitions.ts, itself derived from BASEBALL_NAV_REGISTRY's `hub` field)
// — this module only decides which hubs are VISIBLE for the current
// role/programType (Recruiting gating) and does the longest-prefix route match
// + capability/program-type tab filtering. It never hand-lists a hub's member
// routes.
//
// PURE. No React, no Supabase. Longest-prefix match across every hub's tabs.
// =============================================================================

import {
  COACH_HUB_ORDER,
  COACH_HUB_DEFS,
  PLAYER_STATS_TABS,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_TEAM_TABS,
  PLAYER_RECRUITING_TABS,
} from './hub-definitions';
import type { HubSubNavTab } from './hub-sub-nav';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';
import type { BaseballCapability } from '@/lib/baseball/capabilities';
import type { BaseballNavHub } from '@/lib/baseball/nav-registry';

const RECRUITING_PROGRAM_TYPES = new Set<BaseballProgramType>([
  'college',
  'juco',
  'showcase',
  'academy',
  'club',
]);

export { RECRUITING_PROGRAM_TYPES };

/**
 * Stable short ids for telemetry/tests, decoupled from the hub's display label
 * (BaseballNavHub / COACH_HUB_DEFS id) so relabeling a hub in the sidebar can
 * never break a test anchor. 'stats-performance' keeps its pre-consolidation
 * 'stats' id — the hub's CONTENT grew (Practice/Postgame/Import folded in),
 * its identity did not.
 */
const RESOLVE_HUB_ID: Readonly<Record<BaseballNavHub, string>> = {
  dashboard: 'dashboard',
  messages: 'messages',
  team: 'team',
  'stats-performance': 'stats',
  development: 'development',
  recruiting: 'recruiting',
  academics: 'academics',
  management: 'management',
};

export interface ResolvedHub {
  /** Stable hub id (telemetry / test anchor). */
  id: string;
  /** Accessible label for the sub-nav landmark. */
  ariaLabel: string;
  /** The hub's ordered sub-tabs. */
  tabs: readonly HubSubNavTab[];
}

interface HubDef extends ResolvedHub {
  /** Route prefixes that mean "the active page lives in this hub". */
  ownedPrefixes: string[];
}

// Coach hubs. Order matters only for tie-breaking; resolution is longest-prefix
// across ALL tabs of ALL hubs, so a deeper route wins regardless of hub order.
function coachHubs(opts: { showRecruiting: boolean }): HubDef[] {
  return COACH_HUB_ORDER.filter((hub) => {
    if (hub === 'recruiting') return opts.showRecruiting;
    return true;
  }).map((hub) => {
    const def = COACH_HUB_DEFS[hub];
    return {
      id: RESOLVE_HUB_ID[hub],
      ariaLabel: `${def.label} sections`,
      tabs: def.tabs,
      ownedPrefixes: def.tabs.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    };
  });
}

function playerHubs(): HubDef[] {
  return [
    {
      id: 'stats',
      ariaLabel: 'Stats sections',
      tabs: PLAYER_STATS_TABS,
      ownedPrefixes: PLAYER_STATS_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
    {
      id: 'development',
      ariaLabel: 'Development sections',
      tabs: PLAYER_DEVELOPMENT_TABS,
      ownedPrefixes: PLAYER_DEVELOPMENT_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
    {
      id: 'team',
      ariaLabel: 'Team sections',
      tabs: PLAYER_TEAM_TABS,
      ownedPrefixes: PLAYER_TEAM_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
    {
      id: 'recruiting',
      ariaLabel: 'Recruiting sections',
      tabs: PLAYER_RECRUITING_TABS,
      ownedPrefixes: PLAYER_RECRUITING_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
  ];
}

export interface ResolveActiveHubArgs {
  pathname: string | null;
  role: 'coach' | 'player' | null;
  /** Server-resolved program type — gates mode-specific hub visibility. */
  programType?: BaseballProgramType | null;
  /** Resolved staff capabilities — filters capability-gated hub tabs (#370). */
  capabilities?: Partial<Record<BaseballCapability, boolean>>;
}

/** Hide hub sub-tabs the current coach cannot access. Players skip cap checks. */
export function filterHubTabsByCapabilities(
  tabs: readonly HubSubNavTab[],
  role: 'coach' | 'player',
  capabilities: Partial<Record<BaseballCapability, boolean>> = {},
): HubSubNavTab[] {
  return tabs.filter((tab) => {
    if (tab.requiredAnyCapabilities?.length) {
      if (role !== 'coach') return false;
      return tab.requiredAnyCapabilities.some((cap) => capabilities[cap] === true);
    }
    if (tab.requiredCapability) {
      if (role !== 'coach') return false;
      return capabilities[tab.requiredCapability] === true;
    }
    return true;
  });
}

/**
 * Hide hub sub-tabs the current team's program_type doesn't allow (#367 —
 * Organization/Teams/Events inside the Management hub, showcase-only). Mirrors
 * isBaseballNavEntryVisible's program-type gate in nav-registry.ts exactly, so
 * a tab carrying `allowedProgramTypes` (copied verbatim from its registry
 * entry) is never shown for a program type the registry itself would hide it
 * for.
 */
export function filterHubTabsByProgramType(
  tabs: readonly HubSubNavTab[],
  programType?: BaseballProgramType | null,
): HubSubNavTab[] {
  return tabs.filter((tab) => {
    if (!tab.allowedProgramTypes?.length) return true;
    return Boolean(programType && tab.allowedProgramTypes.includes(programType));
  });
}

/**
 * Resolve the hub (and thus the sub-tab strip) that owns the current route, or
 * null when the active page is a top-level surface that is NOT inside any hub
 * (Profile, Messages for players, etc.) — those render with no sub-nav strip,
 * exactly like a flat top-level tab.
 */
export function resolveActiveHub(args: ResolveActiveHubArgs): ResolvedHub | null {
  const { pathname, role, programType } = args;
  if (!pathname || !role) return null;

  const hubs =
    role === 'coach'
      ? coachHubs({
          showRecruiting: Boolean(programType && RECRUITING_PROGRAM_TYPES.has(programType)),
        })
      : playerHubs();

  let best: { hub: HubDef; len: number } | null = null;
  for (const hub of hubs) {
    for (const p of hub.ownedPrefixes) {
      if (
        (pathname === p || pathname.startsWith(`${p}/`)) &&
        (!best || p.length > best.len)
      ) {
        best = { hub, len: p.length };
      }
    }
  }

  if (!best) return null;
  const { id, ariaLabel, tabs } = best.hub;
  let visibleTabs =
    role === 'coach'
      ? filterHubTabsByCapabilities(tabs, role, args.capabilities ?? {})
      : [...tabs];
  if (role === 'coach') {
    visibleTabs = filterHubTabsByProgramType(visibleTabs, programType);
  }
  if (visibleTabs.length === 0) return null;
  return { id, ariaLabel, tabs: visibleTabs };
}
