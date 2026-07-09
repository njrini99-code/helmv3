// =============================================================================
// hub-definitions.ts — the grouped-hub tab lists for BaseballHelm coach + player.
//
// Single source of truth for the SUB-TABS inside each top-level hub. The hub
// layout.tsx files render <HubSubNav tabs={...}> from these arrays, and the
// sidebar derives each hub's landing href from the FIRST tab here — so the
// top-level sidebar item and the hub's own sub-tab strip can never drift.
//
// These point at EXISTING leaf routes only. The grouped-hubs architecture is
// ADDITIVE: no route is moved, renamed, or deleted — the hub adds a navigation
// layer above the leaves that already work.
//
// COACH_NAV_8TAB_PROPOSAL.md (approved 2026-07-01) — DERIVED, NOT HAND-LISTED:
// every COACH_*_TABS array below is built by grouping BASEBALL_NAV_REGISTRY on
// its `hub` field (nav-registry.ts), not by hand-maintaining a parallel route
// list. Labels, icons, requiredCapability/requiredAnyCapabilities, and
// allowedProgramTypes are all read from the registry entry verbatim — never
// re-declared here, so they can never drift from the registry again. The only
// hand-maintained data left is (a) each hub's DISPLAY ORDER (a small id list;
// entries not listed simply fall to the end in registry order), and (b) ONE
// supplementary leaf tab (Stats Center's "Games" — a child page of a registry
// feature, not a registry feature in its own right).
//
// HARD CAP (COHERENCE_RULING_2026-07-08.md Ruling 2): every hub renders AT
// MOST 3 sub-tabs, for every coach type. The mechanism is `hub` +
// `foldedUnder` on nav-registry.ts entries: a registry entry declares
// `foldedUnder: <id>` to mark itself as reachable ONLY from its parent's
// LANDING PAGE (a card grid — see dashboard/operations and dashboard/scouting)
// rather than as its own rendered sub-tab. `hubEntries()` below excludes any
// entry carrying `foldedUnder` from the rendered array; the folded entry KEEPS
// its own registry row, so command palette and deep links still resolve it,
// and the parent landing entry's `matchPrefixes` (nav-registry.ts) still
// route `resolve-active-hub.ts` to the right hub + subtab when a user is on
// the folded destination directly. nav-manifest.test.ts locks both halves of
// this contract (≤3 rendered tabs; every folded href still resolves a hub).
//
// PLAYER_*_TABS are intentionally NOT derived the same way: most player-only
// registry entries (player-dev-plan, player-lift, player-readiness, etc.) carry
// no `hub` field (hub is only required for role coach/both — see nav-registry.ts),
// so they stay hand-maintained here, trimmed to the same ≤3 cap by hand.
//
// PURE DATA + ICONS. No 'use client' / 'use server', no Supabase, no React state —
// safe to import from both the client sidebar and the client hub layouts.
// =============================================================================

import {
  IconUsers,
  IconCalendar,
  IconMessage,
  IconBell,
  IconCheckCircle2,
  IconFileText,
  IconChartBar,
  IconClipboardList,
  IconTrendingUp,
  IconTarget,
  IconShieldCheck,
  IconBuilding,
  IconStar,
  IconHome,
  IconUser,
  IconGraduationCap,
} from '@/components/icons';
import type { HubSubNavTab } from './hub-sub-nav';
import {
  BASEBALL_NAV_REGISTRY,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavEntry,
  type BaseballNavHub,
  type BaseballNavIcon,
} from '@/lib/baseball/nav-registry';

// -----------------------------------------------------------------------------
// Derivation core — group BASEBALL_NAV_REGISTRY by `hub`, in a curated display
// order, with registry-order fallback for anything not explicitly ordered.
// -----------------------------------------------------------------------------

/** Registry entry → HubSubNavTab, copying every gating field VERBATIM. */
function toHubTab(entry: BaseballNavEntry): HubSubNavTab {
  return {
    id: entry.id,
    // hubTabLabel overrides the canonical label ONLY inside the sub-nav
    // strip (Ruling 2 — e.g. "Performance" reads "Training" here, unchanged
    // everywhere else); falls back to the canonical label otherwise.
    label: entry.hubTabLabel ?? entry.label,
    href: entry.href,
    icon: entry.icon,
    requiredCapability: entry.requiredCapability ?? undefined,
    requiredAnyCapabilities: entry.requiredAnyCapabilities,
    allowedProgramTypes: entry.allowedProgramTypes,
    matchPrefixes: entry.matchPrefixes,
  };
}

/**
 * Every coach/both registry entry tagged for `hub`, converted to tabs.
 * Excludes two kinds of entries from the RENDERED strip (both keep their own
 * registry row — see the module header):
 *   - `team`: the legacy `/dashboard/team` alias (hub: 'dashboard' for the
 *     registry invariant, but its href is an exact duplicate of
 *     `command-center` for coaches) — never a distinct destination.
 *   - anything carrying `foldedUnder`: Ruling 2's ≤3-subtabs mechanism.
 */
function hubEntries(hub: BaseballNavHub): HubSubNavTab[] {
  return BASEBALL_NAV_REGISTRY.filter(
    (e) => e.hub === hub && e.role !== 'player' && e.id !== 'team' && !e.foldedUnder,
  ).map(toHubTab);
}

/** Stable-sort tabs by a curated id order; unlisted ids keep registry order at the end. */
function orderTabs(tabs: HubSubNavTab[], order: readonly string[]): HubSubNavTab[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...tabs].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

/** Splice hand-declared supplementary leaf tabs directly after their parent registry tab. */
function withSupplements(
  tabs: readonly HubSubNavTab[],
  supplements: Readonly<Record<string, readonly HubSubNavTab[]>>,
): HubSubNavTab[] {
  const out: HubSubNavTab[] = [];
  for (const tab of tabs) {
    out.push(tab);
    const extra = supplements[tab.id];
    if (extra) out.push(...extra);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Supplementary leaf tabs — child pages of a registry feature that are not
// themselves BASEBALL_NAV_REGISTRY entries. Games is the ONE surviving
// supplement post-Ruling-2: Season/Upload now resolve via stats-center's own
// matchPrefixes (a view + header CTAs inside Stats Center, not their own
// tabs), and Performance's Live/Programs/Groups/Builder are reached via
// in-page masthead links on /dashboard/performance itself (verified present),
// not a second copy of the same links in the hub sub-nav strip.
// -----------------------------------------------------------------------------

const STATS_GAMES_TAB: HubSubNavTab = {
  id: 'games',
  label: 'Games',
  href: '/baseball/dashboard/stats/games',
  icon: IconClipboardList,
  matchPrefixes: ['/baseball/dashboard/stats/games'],
};

// -----------------------------------------------------------------------------
// Curated display order per hub (COHERENCE_RULING_2026-07-08.md Ruling 2 —
// the hub/subtab table is authoritative). Membership is always
// registry-derived (hubEntries); this only sequences it, and every hub below
// resolves to AT MOST 3 rendered tabs.
// -----------------------------------------------------------------------------

const DASHBOARD_ORDER = ['command-center', 'signals'];
const TEAM_ORDER = ['roster', 'calendar', 'operations'];
const MESSAGES_ORDER = ['announcements'];
const STATS_PERFORMANCE_ORDER = ['stats-center', 'postgame-review'];
const DEVELOPMENT_ORDER = ['dev-plans', 'performance', 'videos'];
const RECRUITING_ORDER = ['pipeline', 'discover', 'scouting'];
const ACADEMICS_ORDER = ['academics'];
const MANAGEMENT_ORDER = ['staff-decision-room', 'settings', 'organization'];

// -----------------------------------------------------------------------------
// COACH HUBS — every array below is registry-derived (see the module header).
// -----------------------------------------------------------------------------

/** DASHBOARD hub — Overview (command-center) + Signals. */
export const COACH_DASHBOARD_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('dashboard'),
  DASHBOARD_ORDER,
);

/** TEAM hub — Roster · Calendar · Operations (Documents/Travel/Practice Planner/
 *  Practice Effectiveness fold into the Operations landing, Ruling 2). */
export const COACH_TEAM_TABS: readonly HubSubNavTab[] = orderTabs(hubEntries('team'), TEAM_ORDER);

/**
 * MESSAGES hub — Messages · Announcements (Ruling 2: Announcements moves off
 * Team — comms belong with comms). The Messages tab itself is the persistent
 * cross-cutting entry (BASEBALL_MESSAGES_NAV, deliberately kept outside the
 * feature registry — see nav-registry.ts) rendered as the FIRST tab;
 * Announcements is registry-derived like every other hub.
 */
const MESSAGES_TAB: HubSubNavTab = {
  id: BASEBALL_MESSAGES_NAV.id,
  label: BASEBALL_MESSAGES_NAV.label,
  href: BASEBALL_MESSAGES_NAV.href,
  icon: BASEBALL_MESSAGES_NAV.icon,
};

export const COACH_MESSAGES_TABS: readonly HubSubNavTab[] = [
  MESSAGES_TAB,
  ...orderTabs(hubEntries('messages'), MESSAGES_ORDER),
];

/**
 * STATS & PERFORMANCE hub — Stats Center · Games · Postgame (Ruling 2: Season
 * is a view inside Stats Center, Upload + Import Center are header CTAs
 * there; Practice Planner/Effectiveness moved to Team>Operations; Performance
 * moved to Development>Training).
 */
export const COACH_STATS_TABS: readonly HubSubNavTab[] = withSupplements(
  orderTabs(hubEntries('stats-performance'), STATS_PERFORMANCE_ORDER),
  { 'stats-center': [STATS_GAMES_TAB] },
);

/** DEVELOPMENT hub — Dev Plans · Training (performance) · Videos. */
export const COACH_DEVELOPMENT_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('development'),
  DEVELOPMENT_ORDER,
);

/**
 * RECRUITING hub — Pipeline · Discover · Scouting (Ruling 2: Watchlist,
 * Compare, Saved Comparisons, Scout Packets, and Camps fold into the new
 * Scouting landing; Interest folds into Pipeline). Gated to
 * RECRUITING_PROGRAM_TYPES by the sidebar/resolve-active-hub, hidden entirely
 * for High School.
 */
export const COACH_RECRUITING_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('recruiting'),
  RECRUITING_ORDER,
);

/**
 * ACADEMICS hub — capability/module gated. A single-surface hub today; kept as
 * a hub so it slots into the same grouped-nav grammar and can grow sub-tabs
 * later.
 */
export const COACH_ACADEMICS_TABS: readonly HubSubNavTab[] = orderTabs(hubEntries('academics'), ACADEMICS_ORDER);

/**
 * MANAGEMENT hub — Decision Room · Settings · Organization (Ruling 2: DELETED
 * the 9-item settings-route splice — the existing card-grid landing at
 * /dashboard/settings is now the single settings nav surface; Program
 * Info/Staff Settings/Program Settings fold into it. Organization/Teams/
 * Events fold under Organization for Showcase/Academy/Club program types
 * only, via allowedProgramTypes carried through verbatim from the registry).
 */
export const COACH_MANAGEMENT_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('management'),
  MANAGEMENT_ORDER,
);

// -----------------------------------------------------------------------------
// HUB METADATA — the ordered list of coach hubs + their label/icon/tabs, so
// sidebar.tsx and BaseballFairwayShell.tsx can build the top-level grouped nav
// generically (loop over COACH_HUB_ORDER) instead of hand-listing hubs.
// -----------------------------------------------------------------------------

export interface CoachHubDef {
  id: BaseballNavHub;
  label: string;
  icon: BaseballNavIcon;
  tabs: readonly HubSubNavTab[];
}

/** Display order of the 8 registry-backed coach hubs (Ruling 2 promotes
 *  Messages from a bare flat link to a real hub with its own sub-nav). */
export const COACH_HUB_ORDER: readonly BaseballNavHub[] = [
  'dashboard',
  'messages',
  'team',
  'stats-performance',
  'development',
  'recruiting',
  'academics',
  'management',
];

export const COACH_HUB_DEFS: Readonly<Record<BaseballNavHub, CoachHubDef>> = {
  dashboard: { id: 'dashboard', label: 'Dashboard', icon: IconHome, tabs: COACH_DASHBOARD_TABS },
  messages: { id: 'messages', label: 'Messages', icon: IconMessage, tabs: COACH_MESSAGES_TABS },
  team: { id: 'team', label: 'Team', icon: IconUsers, tabs: COACH_TEAM_TABS },
  'stats-performance': {
    id: 'stats-performance',
    label: 'Stats & Performance',
    icon: IconChartBar,
    tabs: COACH_STATS_TABS,
  },
  development: { id: 'development', label: 'Development', icon: IconTarget, tabs: COACH_DEVELOPMENT_TABS },
  recruiting: { id: 'recruiting', label: 'Recruiting', icon: IconStar, tabs: COACH_RECRUITING_TABS },
  academics: { id: 'academics', label: 'Academics', icon: IconGraduationCap, tabs: COACH_ACADEMICS_TABS },
  management: { id: 'management', label: 'Management', icon: IconBuilding, tabs: COACH_MANAGEMENT_TABS },
};

// -----------------------------------------------------------------------------
// PLAYER HUBS — unchanged mechanism (see the module header: most player-only
// registry entries carry no `hub`, so these stay hand-maintained), trimmed to
// the same ≤3 cap (Ruling 2 item 7). Every dropped tab below KEEPS its own
// registry row (still command-palette + deep-link reachable) and, for
// Lifts/Readiness specifically, is also surfaced inline on Player Today —
// so nothing is orphaned, only de-duplicated off the sub-nav strip.
// -----------------------------------------------------------------------------

/** Player STATS hub — own stats depth + game/season views. */
export const PLAYER_STATS_TABS: readonly HubSubNavTab[] = [
  { id: 'overview', label: 'Overview', href: '/baseball/dashboard/my-stats', icon: IconChartBar },
];

/**
 * Player DEVELOPMENT hub — Dev Plan · Practice · Passport. Lifts and
 * Readiness are already surfaced inline on Player Today's daily card
 * (PlayerLiftToday) and remain reachable via their own registry entries
 * (player-lift, player-readiness); Videos remains reachable via its own
 * registry entry (role: 'both').
 */
export const PLAYER_DEVELOPMENT_TABS: readonly HubSubNavTab[] = [
  { id: 'dev-plan', label: 'Dev Plan', href: '/baseball/dashboard/dev-plan', icon: IconTarget },
  { id: 'practice', label: 'Practice', href: '/baseball/player/practice', icon: IconClipboardList },
  { id: 'passport', label: 'Passport', href: '/baseball/player/passport', icon: IconShieldCheck },
];

/** Player TEAM hub — shared team surfaces a player reads. */
export const PLAYER_TEAM_TABS: readonly HubSubNavTab[] = [
  { id: 'announcements', label: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { id: 'tasks', label: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconCheckCircle2 },
  { id: 'documents', label: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
];

/**
 * Player RECRUITING hub — Journey · Colleges · Analytics. Activate Recruiting
 * remains reachable via its own registry entry (player-activate, section:
 * 'secondary') — command palette + direct URL — it is a one-time opt-in
 * action, not a recurring destination worth a permanent tab slot.
 */
export const PLAYER_RECRUITING_TABS: readonly HubSubNavTab[] = [
  { id: 'journey', label: 'Journey', href: '/baseball/dashboard/journey', icon: IconStar },
  { id: 'colleges', label: 'Colleges', href: '/baseball/dashboard/colleges', icon: IconGraduationCap },
  { id: 'analytics', label: 'Analytics', href: '/baseball/dashboard/analytics', icon: IconTrendingUp },
];

// -----------------------------------------------------------------------------
// SHARED REFERENCES — non-hub leaf routes the sidebar links directly (no sub-nav).
// Kept here only so the sidebar and any future hub share one href string.
// -----------------------------------------------------------------------------

export const HUB_LANDING = {
  coachDashboard: COACH_DASHBOARD_TABS[0]!.href,
  coachMessages: COACH_MESSAGES_TABS[0]!.href,
  coachTeam: COACH_TEAM_TABS[0]!.href,
  coachStats: COACH_STATS_TABS[0]!.href,
  coachDevelopment: COACH_DEVELOPMENT_TABS[0]!.href,
  coachManagement: COACH_MANAGEMENT_TABS[0]!.href,
  coachRecruiting: COACH_RECRUITING_TABS[0]!.href,
  coachAcademics: COACH_ACADEMICS_TABS[0]!.href,
  playerDashboard: '/baseball/player/today',
  playerProfile: '/baseball/dashboard/profile',
  playerStats: PLAYER_STATS_TABS[0]!.href,
  playerDevelopment: PLAYER_DEVELOPMENT_TABS[0]!.href,
  playerRecruiting: PLAYER_RECRUITING_TABS[0]!.href,
  playerCalendar: '/baseball/dashboard/calendar',
  playerMessages: '/baseball/dashboard/messages',
  playerTeam: PLAYER_TEAM_TABS[0]!.href,
} as const;

export const HUB_ICONS = {
  dashboard: IconHome,
  team: IconUsers,
  stats: IconChartBar,
  development: IconTarget,
  management: IconBuilding,
  recruiting: IconStar,
  academics: IconGraduationCap,
  profile: IconUser,
  calendar: IconCalendar,
  messages: IconMessage,
} as const;

// -----------------------------------------------------------------------------
// PLAYER RAIL SHAPE (Owner directive, wave W3, 2026-07-09: "~8 tabs" for the
// player rail) — the single source of truth for WHICH destinations render in
// each player-rail section, and in what order. BaseballFairwayShell.tsx's
// buildPlayerNavSections consumes these id lists to select from a map of
// renderable NavItems (it owns the icon/href/badge for each); nav-player-rail
// test pins the shape here without needing to import that 'use client' module.
//
// Three of the ids below (stats/development/team/recruiting "hub" rows) are
// NOT individual BASEBALL_NAV_REGISTRY entries — they're synthetic hub-landing
// rows built from the PLAYER_*_TABS arrays above, so they need their own
// stable id here. The other four ids (player-today, calendar, player-profile,
// messages) ARE real registry/BASEBALL_MESSAGES_NAV ids.
//
// Settings is deliberately ABSENT from both lists: it moved OUT of the
// secondary "More" section and INTO the shell's pinned rail FOOTER
// (ShellFooter in BaseballFairwayShell.tsx), matching the coach shell, so it
// no longer competes for a rail-section slot. That is what takes the player
// rail from 9 destinations (7 primary + exposureNoun + Settings) down to the
// owner-directed ~8 (7 primary + exposureNoun; Settings lives in the footer).
// -----------------------------------------------------------------------------
export const PLAYER_HUB_ROW_IDS = {
  stats: 'player-stats-hub',
  development: 'player-development-hub',
  team: 'player-team-hub',
  recruiting: 'player-recruiting-hub',
} as const;

/** PRIMARY ("My Baseball") section — 7 daily-loop destinations, in render order. */
export const PLAYER_RAIL_PRIMARY_IDS: readonly string[] = [
  'player-today',
  'calendar',
  'player-profile',
  PLAYER_HUB_ROW_IDS.stats,
  PLAYER_HUB_ROW_IDS.development,
  PLAYER_HUB_ROW_IDS.team,
  BASEBALL_MESSAGES_NAV.id,
];

/** SECONDARY ("More") section — just the recruiting/exposure hub now. */
export const PLAYER_RAIL_SECONDARY_IDS: readonly string[] = [PLAYER_HUB_ROW_IDS.recruiting];
