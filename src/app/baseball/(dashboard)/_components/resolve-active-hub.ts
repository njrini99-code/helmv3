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
// PURE. No React, no Supabase. Longest-prefix match across every hub's tabs.
// =============================================================================

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
} from './hub-definitions';
import type { HubSubNavTab } from './hub-sub-nav';

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
function coachHubs(opts: { showRecruiting: boolean; showAcademics: boolean }): HubDef[] {
  const hubs: HubDef[] = [
    {
      id: 'team',
      ariaLabel: 'Team sections',
      tabs: COACH_TEAM_TABS,
      ownedPrefixes: COACH_TEAM_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
    {
      id: 'stats',
      ariaLabel: 'Stats sections',
      tabs: COACH_STATS_TABS,
      ownedPrefixes: COACH_STATS_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
    {
      id: 'development',
      ariaLabel: 'Development sections',
      tabs: COACH_DEVELOPMENT_TABS,
      ownedPrefixes: COACH_DEVELOPMENT_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
    {
      id: 'management',
      ariaLabel: 'Management sections',
      tabs: COACH_MANAGEMENT_TABS,
      ownedPrefixes: COACH_MANAGEMENT_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    },
  ];
  if (opts.showRecruiting) {
    hubs.push({
      id: 'recruiting',
      ariaLabel: 'Recruiting sections',
      tabs: COACH_RECRUITING_TABS,
      ownedPrefixes: COACH_RECRUITING_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    });
  }
  if (opts.showAcademics) {
    hubs.push({
      id: 'academics',
      ariaLabel: 'Academics sections',
      tabs: COACH_ACADEMICS_TABS,
      ownedPrefixes: COACH_ACADEMICS_TABS.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    });
  }
  return hubs;
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
  ];
}

export interface ResolveActiveHubArgs {
  pathname: string | null;
  role: 'coach' | 'player' | null;
  /** Coach type — gates Recruiting (hidden by default) + Academics (JUCO only). */
  coachType?: string | null;
}

/**
 * Resolve the hub (and thus the sub-tab strip) that owns the current route, or
 * null when the active page is a top-level surface that is NOT inside any hub
 * (Dashboard, Profile, Calendar, Messages for players, etc.) — those render with
 * no sub-nav strip, exactly like a flat top-level tab.
 */
export function resolveActiveHub(args: ResolveActiveHubArgs): ResolvedHub | null {
  const { pathname, role, coachType } = args;
  if (!pathname || !role) return null;

  const hubs =
    role === 'coach'
      ? coachHubs({
          // Recruiting is archived-ok / scaffolded hidden for now.
          showRecruiting: false,
          // Academics is JUCO-only.
          showAcademics: coachType === 'juco',
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
  return { id, ariaLabel, tabs };
}
