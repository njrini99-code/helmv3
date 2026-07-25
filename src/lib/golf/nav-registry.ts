// =============================================================================
// src/lib/golf/nav-registry.ts
//
// WAVE W2 (2026-07-09) — SINGLE SOURCE OF TRUTH for GolfHelm's 8-tab coach and
// 8-tab player navigation IA (docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md
// § Target IA). Mirrors the SHAPE of BaseballHelm's proven hub pattern
// (src/lib/baseball/nav-registry.ts + the baseball dashboard's
// hub-definitions.ts / resolve-active-hub.ts), simplified: golf has no
// capability gating and no program-type variants, so hub/tab membership is a
// flat, always-visible declaration instead of a filtered registry.
//
// A rail item's `activeMatch` predicate (built by buildCoach/PlayerRailItems)
// is DERIVED from its hub's tab list (own href ∪ every tab's href ∪ every
// tab's matchPrefixes) — exactly baseball's `playerHubToNavItem` mechanism —
// so the rail stays lit across the WHOLE cluster, including deep routes
// (rounds/[id], qualifiers/[id], roster/[id], players/[playerId], …),
// automatically, from ONE declaration per route.
//
// The CoachHelm AI cluster is the one exception: its OWN 5-tab (coach) /
// 4-tab (player) sub-nav strip already exists and is rendered per-page by
// <CoachHelmShell> (src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx)
// — this module does not re-model those tabs (that would be two competing
// sources of truth for the same strip). It only carries the CLUSTER PREFIXES
// so the RAIL item's activeMatch + the shell's breadcrumb logic agree with
// what CoachHelmSubNav already renders.
//
// PURE + ISOMORPHIC: no 'use client' / 'use server', no Supabase, no React
// runtime — only data + pure functions (icon fields are typed, never
// instantiated), safe to import from server or client code alike.
// =============================================================================

import type { ComponentType, SVGProps } from 'react';
import type { NavItem, NavSection } from '@/components/fairway/app-shell/types';
import { surfaceName } from '@/lib/golf/surface-registry';
import {
  IconHome,
  IconSparkles,
  IconUsers,
  IconGolf,
  IconCalendar,
  IconChartBar,
  IconMessage,
  IconBell,
  IconAirplane,
  IconFileText,
  IconClipboardList,
  IconUserPlus,
  IconFlag,
  IconTrophy,
  IconLayoutGrid,
  IconMapPin,
} from '@/components/icons';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type GolfNavRole = 'coach' | 'player';

/** Icon contract shared by the rail (AppShell NavItem) and the sub-nav strip. */
export type GolfNavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** A single sub-tab inside a multi-tab hub's strip. */
export interface GolfSubTab {
  /** Stable id (React key, test anchor). */
  id: string;
  label: string;
  /** Canonical destination route (absolute, starts with /golf/dashboard). */
  href: string;
  icon?: GolfNavIcon;
  /**
   * Extra route prefixes (besides `href`) that should light THIS tab AND keep
   * the owning rail item lit. Used when a tab owns a nested/sibling detail
   * route that isn't a path-child of its own href (e.g. Roster's
   * /golf/dashboard/players/* history — see ROSTER_TAB below).
   */
  matchPrefixes?: readonly string[];
}

/** A multi-tab hub's metadata — id, accessible label, and its ordered tabs. */
export interface GolfHubDef {
  /** Stable id (telemetry / test anchor / aria-label seed). */
  id: string;
  ariaLabel: string;
  tabs: readonly GolfSubTab[];
}

/** The already-polled notification counts the rail/bottom-nav can surface. A
 *  badge only renders when its count is > 0 — never a fake "0". */
export interface GolfNavBadgeCounts {
  messages: number;
  coachhelm: number;
  calendarNotifications: number;
  announcements: number;
  travel: number;
  tasks: number;
}

/** Render a numeric badge only when the count is meaningful (> 0). */
function navBadge(count: number): number | undefined {
  return count > 0 ? count : undefined;
}

/** Segment-boundary route match (exact or `${prefix}/…`) — never a bare substring. */
function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// -----------------------------------------------------------------------------
// CoachHelm AI cluster — the ONE hub whose sub-nav strip is a pre-existing,
// separately-rendered component (CoachHelmSubNav via CoachHelmShell), not
// derived from this registry. Kept here as the single source of truth for the
// CLUSTER PREFIXES so the rail's activeMatch and the shell's breadcrumb logic
// can never drift from what CoachHelmSubNav actually renders as tabs.
//
// P410 fix (2026-07-09): `/golf/dashboard/players` (the coach player-detail
// AI-insight surface, FairwayPlayerInsight) is CoachHelmSubNav's own "Players"
// tab matchPrefix (not a Roster/Team-hub route — verified by reading the
// route: it renders FairwayPlayerInsight, getThemesForCoach, getAlertCounts —
// all CoachHelm reads). The RAIL's activeMatch previously omitted it, so the
// rail lost its highlight on that one deep route even though the in-page
// CoachHelmSubNav correctly lit "Players" — this list now agrees with
// CoachHelmSubNav's TABS matchPrefixes exactly.
// -----------------------------------------------------------------------------

export const COACHHELM_COACH_CLUSTER_PREFIXES = [
  '/golf/dashboard/intelligence',
  '/golf/dashboard/alerts',
  '/golf/dashboard/insights',
  '/golf/dashboard/patterns',
  '/golf/dashboard/development',
  '/golf/dashboard/analytics/coachhelm',
  '/golf/dashboard/players',
  // NOTE: only the COACH CoachHelm sub-routes (`/coachhelm/chat`, `/coachhelm/genome`)
  // belong to this cluster. Bare `/golf/dashboard/coachhelm` is the PLAYER CoachHelm
  // home (no masthead sub-nav) and must NOT be treated as the coach cluster.
  '/golf/dashboard/coachhelm/',
] as const;

export function isCoachHelmCoachCluster(pathname: string): boolean {
  return COACHHELM_COACH_CLUSTER_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : matchesRoutePrefix(pathname, p),
  );
}

export const COACHHELM_PLAYER_CLUSTER_PREFIXES = [
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/my-development',
  '/golf/dashboard/my-game-profile',
  '/golf/dashboard/my-standing',
] as const;

export function isCoachHelmPlayerCluster(pathname: string): boolean {
  return COACHHELM_PLAYER_CLUSTER_PREFIXES.some((p) => matchesRoutePrefix(pathname, p));
}

// -----------------------------------------------------------------------------
// COACH — multi-tab hub sub-nav strips (Team · Calendar · Rounds & Stats ·
// Messages · Operations). Dashboard, CoachHelm AI (see above) and Courses are
// single-destination rail items with no strip.
// -----------------------------------------------------------------------------

const COACH_TEAM_TABS: readonly GolfSubTab[] = [
  {
    id: 'roster',
    label: 'Roster',
    href: '/golf/dashboard/roster',
    icon: IconUsers,
  },
  {
    id: 'recruiting',
    label: 'Recruiting HQ',
    href: '/golf/dashboard/recruiting',
    icon: IconUserPlus,
  },
];

const COACH_CALENDAR_TABS: readonly GolfSubTab[] = [
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { id: 'travel', label: 'Travel', href: '/golf/dashboard/travel', icon: IconAirplane },
];

// golf-ia-plan.json step 9: Team Stats is now the DEFAULT landing tab (tabs[0]
// — hubToNavItem/buildCoachBottomNavItems always use a hub's first tab as its
// rail/bottom-nav href), and the redundant "Stats" tab is pruned — it always
// dead-ended right back into Team Stats for single-role coaches. /stats itself
// stays fully live (drill-down only, via Team Stats' own ?player= links), so
// Team Stats' matchPrefixes keeps it — and the owning "Rounds & Stats" rail
// item — lit while a coach is on that drill-down, instead of going dark now
// that /stats has no tab of its own.
const COACH_ROUNDS_STATS_TABS: readonly GolfSubTab[] = [
  {
    id: 'team-stats',
    label: surfaceName('stats-team'),
    href: '/golf/dashboard/stats/team',
    icon: IconChartBar,
    matchPrefixes: ['/golf/dashboard/stats'],
  },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { id: 'qualifiers', label: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
];

const COACH_MESSAGES_TABS: readonly GolfSubTab[] = [
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage },
  { id: 'announcements', label: 'Announcements', href: '/golf/dashboard/announcements', icon: IconBell },
];

const COACH_OPERATIONS_TABS: readonly GolfSubTab[] = [
  { id: 'tasks', label: 'Tasks', href: '/golf/dashboard/tasks', icon: IconClipboardList },
  { id: 'documents', label: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
];

/** Ordered list of the coach's multi-tab hubs (Dashboard/CoachHelm/Courses are
 *  single-tab rail items and intentionally excluded — see module header). */
export const GOLF_COACH_HUBS: readonly GolfHubDef[] = [
  { id: 'team', ariaLabel: 'Team sections', tabs: COACH_TEAM_TABS },
  { id: 'calendar', ariaLabel: 'Calendar sections', tabs: COACH_CALENDAR_TABS },
  { id: 'rounds-stats', ariaLabel: 'Rounds & Stats sections', tabs: COACH_ROUNDS_STATS_TABS },
  { id: 'messages', ariaLabel: 'Messages sections', tabs: COACH_MESSAGES_TABS },
  { id: 'operations', ariaLabel: 'Operations sections', tabs: COACH_OPERATIONS_TABS },
];

// -----------------------------------------------------------------------------
// PLAYER — the one multi-tab hub sub-nav strip (Team). Dashboard, CoachHelm AI
// (own strip), My Rounds, My Stats, Calendar, Messages and Courses are
// single-destination rail items with no strip.
// -----------------------------------------------------------------------------

const PLAYER_TEAM_TABS: readonly GolfSubTab[] = [
  {
    id: 'roster',
    label: 'Roster',
    href: '/golf/dashboard/roster',
    icon: IconUsers,
    // The coach player-detail (AI insight) surface lives at /players/[id] and
    // belongs to the CoachHelm cluster (see above) — the PLAYER roster detail
    // surface is /roster/[id] (FairwayPlayerProfile), a path-child of this
    // tab's own href, so no extra matchPrefixes are needed for it.
  },
  { id: 'team-info', label: 'Team Info', href: '/golf/dashboard/team', icon: IconUsers },
  { id: 'team-hub', label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: IconLayoutGrid },
  { id: 'my-qualifiers', label: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: IconTrophy },
];

export const GOLF_PLAYER_HUBS: readonly GolfHubDef[] = [
  { id: 'team', ariaLabel: 'Team sections', tabs: PLAYER_TEAM_TABS },
];

// -----------------------------------------------------------------------------
// resolveActiveGolfHub — longest-prefix match across the role's hub list.
// Returns null when the current route is NOT inside a multi-tab hub (single-
// destination rail items, and the CoachHelm cluster, which renders its own
// strip independently) — the shell renders no generic sub-nav strip then.
// -----------------------------------------------------------------------------

export function resolveActiveGolfHub(pathname: string | null, role: GolfNavRole): GolfHubDef | null {
  if (!pathname) return null;
  const hubs = role === 'coach' ? GOLF_COACH_HUBS : GOLF_PLAYER_HUBS;

  let best: { hub: GolfHubDef; len: number } | null = null;
  for (const hub of hubs) {
    for (const tab of hub.tabs) {
      const prefixes = [tab.href, ...(tab.matchPrefixes ?? [])];
      for (const p of prefixes) {
        if (matchesRoutePrefix(pathname, p) && (!best || p.length > best.len)) {
          best = { hub, len: p.length };
        }
      }
    }
  }
  return best?.hub ?? null;
}

// -----------------------------------------------------------------------------
// Rail item construction — activeMatch DERIVED from a hub's tab list (own
// href ∪ every tab's href/matchPrefixes), so the rail stays lit across the
// whole cluster including deep routes, from ONE declaration per route.
// -----------------------------------------------------------------------------

function hubToNavItem(opts: {
  label: string;
  href: string;
  icon: GolfNavIcon;
  tabs?: readonly GolfSubTab[];
  badge?: number;
  /** Explicit override — used only for the CoachHelm AI item, whose cluster
   *  membership is the pre-existing isCoachHelm*Cluster predicate rather than
   *  a GolfSubTab[] (see module header). */
  activeMatch?: (pathname: string) => boolean;
  /** Match `href` EXACTLY instead of by route prefix.
   *
   *  Required for the Dashboard/Home item: its href (`/golf/dashboard`) is a
   *  prefix of every other destination in the product, so the default
   *  `startsWith` test lit Home on literally every route — the rail and the
   *  mobile bottom bar both showed two active tabs at once, and emitted two
   *  `aria-current="page"` nodes, which is invalid (audit 2026-07-24, P-03).
   *  On `/team-hub` and `/calendar` Home was the ONLY lit tab. */
  exact?: boolean;
}): NavItem {
  const { label, href, icon, tabs, badge, activeMatch, exact } = opts;
  return {
    label,
    href,
    icon: icon as unknown as NavItem['icon'],
    badge,
    activeMatch:
      activeMatch ??
      ((pathname: string) =>
        (exact ? pathname === href : matchesRoutePrefix(pathname, href)) ||
        Boolean(
          tabs?.some(
            (tab) =>
              matchesRoutePrefix(pathname, tab.href) ||
              tab.matchPrefixes?.some((prefix) => matchesRoutePrefix(pathname, prefix)),
          ),
        )),
  };
}

/**
 * The 8 coach rail items (Target IA §Golf coach):
 *   Dashboard · CoachHelm AI · Team · Calendar · Rounds & Stats · Messages ·
 *   Operations · Courses.
 * Settings + Sign out are the shell's pinned footer (unchanged, not part of
 * this array).
 */
export function buildCoachRailSections(badges: GolfNavBadgeCounts): NavSection[] {
  const team = GOLF_COACH_HUBS.find((h) => h.id === 'team')!;
  const calendar = GOLF_COACH_HUBS.find((h) => h.id === 'calendar')!;
  const roundsStats = GOLF_COACH_HUBS.find((h) => h.id === 'rounds-stats')!;
  const messages = GOLF_COACH_HUBS.find((h) => h.id === 'messages')!;
  const operations = GOLF_COACH_HUBS.find((h) => h.id === 'operations')!;

  const items: NavItem[] = [
    hubToNavItem({ label: 'Dashboard', href: '/golf/dashboard', icon: IconHome, exact: true }),
    hubToNavItem({
      label: surfaceName('rail-coachhelm-ai-coach'),
      href: '/golf/dashboard/intelligence',
      icon: IconSparkles,
      badge: navBadge(badges.coachhelm),
      activeMatch: isCoachHelmCoachCluster,
    }),
    hubToNavItem({
      label: 'Team',
      href: team.tabs[0]!.href,
      icon: IconUsers,
      tabs: team.tabs,
    }),
    hubToNavItem({
      label: 'Calendar',
      href: calendar.tabs[0]!.href,
      icon: IconCalendar,
      tabs: calendar.tabs,
      badge: navBadge(badges.calendarNotifications),
    }),
    hubToNavItem({
      label: 'Rounds & Stats',
      href: roundsStats.tabs[0]!.href,
      icon: IconChartBar,
      tabs: roundsStats.tabs,
    }),
    hubToNavItem({
      label: 'Messages',
      href: messages.tabs[0]!.href,
      icon: IconMessage,
      tabs: messages.tabs,
      badge: navBadge(badges.messages),
    }),
    hubToNavItem({
      label: 'Operations',
      href: operations.tabs[0]!.href,
      icon: IconClipboardList,
      tabs: operations.tabs,
      // Operations = Tasks · Documents; Documents carries no count today.
      badge: navBadge(badges.tasks),
    }),
    hubToNavItem({ label: 'Courses', href: '/golf/dashboard/courses', icon: IconMapPin }),
  ];

  return [{ heading: 'GolfHelm', items }];
}

/**
 * The 8 player rail items (Target IA §Golf player):
 *   Dashboard · CoachHelm AI · My Rounds · My Stats · Calendar · Team ·
 *   Messages · Courses.
 * Settings + Sign out are the shell's pinned footer (unchanged, not part of
 * this array). The former standalone "Hub" rail entry is GONE — its content
 * merged into Dashboard (see PlayerActionCenter); /dashboard/hub redirects.
 */
export function buildPlayerRailSections(badges: GolfNavBadgeCounts): NavSection[] {
  const team = GOLF_PLAYER_HUBS.find((h) => h.id === 'team')!;

  const items: NavItem[] = [
    hubToNavItem({ label: 'Dashboard', href: '/golf/dashboard', icon: IconHome, exact: true }),
    hubToNavItem({
      label: surfaceName('rail-coachhelm-ai-player'),
      href: '/golf/dashboard/coachhelm',
      icon: IconSparkles,
      activeMatch: isCoachHelmPlayerCluster,
    }),
    hubToNavItem({ label: 'My Rounds', href: '/golf/dashboard/rounds', icon: IconGolf }),
    hubToNavItem({ label: surfaceName('rail-my-stats-player'), href: '/golf/dashboard/stats', icon: IconChartBar }),
    hubToNavItem({
      label: 'Calendar',
      href: '/golf/dashboard/calendar',
      icon: IconCalendar,
      badge: navBadge(badges.calendarNotifications),
    }),
    hubToNavItem({
      label: 'Team',
      href: team.tabs[0]!.href,
      icon: IconUsers,
      tabs: team.tabs,
    }),
    hubToNavItem({
      label: 'Messages',
      href: '/golf/dashboard/messages',
      icon: IconMessage,
      badge: navBadge(badges.messages),
    }),
    hubToNavItem({ label: 'Courses', href: '/golf/dashboard/courses', icon: IconMapPin }),
  ];

  return [{ heading: 'My Golf', items }];
}

// -----------------------------------------------------------------------------
// Mobile bottom-tab bar — the role's 4 daily-loop destinations (Doctrine Rule
// 10: "4 + More" — a 5th "More" button, rendered by FairwayBottomNav itself
// when the shell passes `onMoreOpen`, opens a MoreNavSheet listing the rest of
// the rail as overflow). M1 (2026-07-10): trimmed 5→4 — coach drops Messages,
// player drops Team; both remain one tap away via the More sheet, which
// mirrors the rail's own grouping (src/components/fairway/app-shell/more-nav.ts
// `selectOverflow`), so nothing here is orphaned. Hrefs/labels match the new
// IA; a hub's bottom-tab href is always its FIRST sub-tab (same "first tab =
// landing" convention the rail + hub-definitions.ts use), so the bottom bar
// can never disagree with the rail about where "Team"/"Calendar" lands.
// -----------------------------------------------------------------------------

export function buildCoachBottomNavItems(badges: GolfNavBadgeCounts): NavItem[] {
  const team = GOLF_COACH_HUBS.find((h) => h.id === 'team')!;
  const calendar = GOLF_COACH_HUBS.find((h) => h.id === 'calendar')!;

  return [
    hubToNavItem({ label: 'Home', href: '/golf/dashboard', icon: IconHome, exact: true }),
    hubToNavItem({
      label: 'CoachHelm',
      href: '/golf/dashboard/intelligence',
      icon: IconSparkles,
      badge: navBadge(badges.coachhelm),
      activeMatch: isCoachHelmCoachCluster,
    }),
    hubToNavItem({ label: 'Team', href: team.tabs[0]!.href, icon: IconUsers, tabs: team.tabs }),
    hubToNavItem({
      label: 'Calendar',
      href: calendar.tabs[0]!.href,
      icon: IconCalendar,
      tabs: calendar.tabs,
      badge: navBadge(badges.calendarNotifications),
    }),
  ];
}

export function buildPlayerBottomNavItems(): NavItem[] {
  return [
    hubToNavItem({ label: 'Home', href: '/golf/dashboard', icon: IconHome, exact: true }),
    hubToNavItem({
      label: 'CoachHelm',
      href: '/golf/dashboard/coachhelm',
      icon: IconSparkles,
      activeMatch: isCoachHelmPlayerCluster,
    }),
    hubToNavItem({ label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf }),
    hubToNavItem({ label: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar }),
  ];
}

// -----------------------------------------------------------------------------
// isGolfLateralDestination — Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md): "Tab
// switches are instant." src/lib/motion/route-motion.ts's useRouteRevealMotion
// hook calls this to decide whether the CURRENT pathname is a lateral peer
// (instant swap) or a detail leaf (forward-push reveal). Every declared
// destination across BOTH roles (a coach never visits player-only hrefs, so
// unioning is safe) is unioned into one exact-match Set:
//   - every rail item href (coach + player)
//   - every hub sub-tab href (coach + player)
//   - every mobile bottom-nav item href (coach + player)
//   - the CoachHelm AI cluster's own page hrefs — CoachHelmSubNav
//     (src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx) renders its
//     OWN 5-tab (coach) / 4-tab (player) strip independently of this module
//     (see the module header), so those tab hrefs are not otherwise reachable
//     from GOLF_COACH_HUBS/GOLF_PLAYER_HUBS and must be listed explicitly.
// A dynamic detail leaf (roster/[id], rounds/[id]/review, players/[playerId],
// coachhelm/genome/[playerId]) is never a member of this Set, so it correctly
// falls through to a "push" reveal with zero maintenance per new route.
// -----------------------------------------------------------------------------

const ZERO_NAV_BADGES: GolfNavBadgeCounts = {
  messages: 0,
  coachhelm: 0,
  calendarNotifications: 0,
  announcements: 0,
  travel: 0,
  tasks: 0,
};

/**
 * CoachHelm cluster page hrefs that are lateral tab destinations inside
 * CoachHelmSubNav's own strip but are NOT otherwise present in any rail/hub/
 * bottom-nav array. Coach tabs: Brief/Signals(x3)/Players/Effectiveness/Ask.
 * Player tabs: Overview(already the rail href)/Development/Game Profile/
 * Standing. Kept as literal page hrefs (not the looser activeMatch route
 * PREFIXES above) so a genuinely dynamic leaf under the same cluster (e.g.
 * coachhelm/genome/[playerId]) still classifies as a push.
 */
const COACHHELM_CLUSTER_PAGE_HREFS = [
  '/golf/dashboard/intelligence',
  '/golf/dashboard/alerts',
  '/golf/dashboard/insights',
  '/golf/dashboard/patterns',
  '/golf/dashboard/development',
  '/golf/dashboard/analytics/coachhelm',
  '/golf/dashboard/coachhelm/chat',
  '/golf/dashboard/coachhelm/genome',
  '/golf/dashboard/coachhelm/genome/compare',
  '/golf/dashboard/my-development',
  '/golf/dashboard/my-game-profile',
  '/golf/dashboard/my-standing',
] as const;

let golfLateralDestinations: Set<string> | null = null;

function buildGolfLateralDestinations(): Set<string> {
  const railHrefs = [
    ...buildCoachRailSections(ZERO_NAV_BADGES).flatMap((s) => s.items.map((i) => i.href)),
    ...buildPlayerRailSections(ZERO_NAV_BADGES).flatMap((s) => s.items.map((i) => i.href)),
  ];
  const hubTabHrefs = [
    ...GOLF_COACH_HUBS.flatMap((h) => h.tabs.map((t) => t.href)),
    ...GOLF_PLAYER_HUBS.flatMap((h) => h.tabs.map((t) => t.href)),
  ];
  const bottomNavHrefs = [
    ...buildCoachBottomNavItems(ZERO_NAV_BADGES).map((i) => i.href),
    ...buildPlayerBottomNavItems().map((i) => i.href),
  ];
  return new Set([...railHrefs, ...hubTabHrefs, ...bottomNavHrefs, ...COACHHELM_CLUSTER_PAGE_HREFS]);
}

/**
 * True when `pathname` is a registered lateral navigation destination (tab
 * root, rail item, hub sub-tab, or CoachHelm cluster tab) for either golf
 * role. Built once, lazily, and memoized module-wide — the registry is
 * static, so every subsequent navigation is an O(1) `Set.has` lookup, never a
 * fresh array walk.
 */
export function isGolfLateralDestination(pathname: string): boolean {
  if (!golfLateralDestinations) {
    golfLateralDestinations = buildGolfLateralDestinations();
  }
  return golfLateralDestinations.has(pathname);
}
