// =============================================================================
// src/lib/golf/nav-registry.ts
//
// WAVE W2 (2026-07-09) — SINGLE SOURCE OF TRUTH for GolfHelm's 8-tab coach and
// 8-tab player navigation IA (https://github.com/njrini99-code/helmv3/blob/docs-attic-2026-09/docs/archive/2026-07/PRODUCTION_READINESS_MISSION_2026-07-09.md
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

/** A multi-tab hub's metadata — id, human + accessible label, ordered tabs. */
export interface GolfHubDef {
  /** Stable id (telemetry / test anchor / aria-label seed). */
  id: string;
  /**
   * The hub's human name — what the mobile top bar calls the SECTION you are
   * in, with the sub-nav strip below naming which tab within it. This is the
   * same name the bottom nav gives the destination, so the two chrome
   * surfaces always agree: on `/dashboard/roster` the bottom nav highlights
   * "Team", so the bar says "Team" and the strip says "Roster" — rather than
   * the bar saying "Roster" a second time directly above the strip's own
   * active "Roster" tab.
   */
  label: string;
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
// AI-insight surface, ScoutingReport) is CoachHelmSubNav's own "Players"
// tab matchPrefix (not a Roster/Team-hub route — verified by reading the
// route: it renders ScoutingReport, getThemesForCoach, getAlertCounts —
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
// COACH — multi-tab hub sub-nav strips. OD-14 (owner, 2026-09-24) adopted the
// coach tab IA Home · Players · CoachHelm · Schedule · Team
// (audit design-direction §3.2), mapped onto the EXISTING routes — no route
// moved, so no redirect shims were needed:
//   Players  = Roster · Recruiting         (was the "Team" hub)
//   Schedule = Calendar · Qualifiers · Travel (was "Calendar" + Qualifiers)
//   Team     = Messages · Announcements · Tasks · Documents
//              (was the "Messages" + "Operations" hubs)
// "Rounds & Stats" (Team Stats · Rounds) stays a desktop rail hub and a More
// overflow row on phone. Dashboard, CoachHelm AI (see above) and Courses are
// single-destination rail items with no strip.
// -----------------------------------------------------------------------------

const COACH_PLAYERS_TABS: readonly GolfSubTab[] = [
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

const COACH_SCHEDULE_TABS: readonly GolfSubTab[] = [
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { id: 'qualifiers', label: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
  { id: 'travel', label: 'Travel', href: '/golf/dashboard/travel', icon: IconAirplane },
];

// golf-ia-plan.json step 9: Team Stats is now the DEFAULT landing tab (tabs[0]
// — hubToNavItem always uses a hub's first tab as its rail href), and the
// redundant "Stats" tab is pruned — it always dead-ended right back into Team
// Stats for single-role coaches. /stats itself stays fully live (drill-down
// only, via Team Stats' own ?player= links), so Team Stats' matchPrefixes
// keeps it — and the owning "Rounds & Stats" rail item — lit while a coach is
// on that drill-down. Qualifiers moved to Schedule (OD-14).
const COACH_ROUNDS_STATS_TABS: readonly GolfSubTab[] = [
  {
    id: 'team-stats',
    label: surfaceName('stats-team'),
    href: '/golf/dashboard/stats/team',
    icon: IconChartBar,
    matchPrefixes: ['/golf/dashboard/stats'],
  },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
];

const COACH_TEAM_TABS: readonly GolfSubTab[] = [
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage },
  { id: 'announcements', label: 'Announcements', href: '/golf/dashboard/announcements', icon: IconBell },
  { id: 'tasks', label: 'Tasks', href: '/golf/dashboard/tasks', icon: IconClipboardList },
  { id: 'documents', label: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
];

/** Ordered list of the coach's multi-tab hubs (Dashboard/CoachHelm/Courses are
 *  single-tab rail items and intentionally excluded — see module header). */
export const GOLF_COACH_HUBS: readonly GolfHubDef[] = [
  { id: 'players', label: surfaceName('tab-players-coach'), ariaLabel: 'Players sections', tabs: COACH_PLAYERS_TABS },
  { id: 'schedule', label: surfaceName('tab-schedule-coach'), ariaLabel: 'Schedule sections', tabs: COACH_SCHEDULE_TABS },
  { id: 'team', label: 'Team', ariaLabel: 'Team sections', tabs: COACH_TEAM_TABS },
  { id: 'rounds-stats', label: 'Rounds & Stats', ariaLabel: 'Rounds & Stats sections', tabs: COACH_ROUNDS_STATS_TABS },
];

// -----------------------------------------------------------------------------
// PLAYER — the one multi-tab hub sub-nav strip (Team). Dashboard, CoachHelm AI
// (own strip), My Rounds, My Stats, Calendar, Messages and Courses are
// single-destination rail items with no strip.
// -----------------------------------------------------------------------------

const PLAYER_TEAM_TABS: readonly GolfSubTab[] = [
  { id: 'team-hub', label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: IconLayoutGrid },
  { id: 'my-qualifiers', label: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: IconTrophy },
  {
    id: 'roster',
    label: 'Roster',
    href: '/golf/dashboard/roster',
    icon: IconUsers,
    // The coach player-detail (AI insight) surface lives at /players/[id] and
    // belongs to the CoachHelm cluster (see above) — the PLAYER roster detail
    // surface is /roster/[id] (PlayerDetailScreen), a path-child of this
    // tab's own href, so no extra matchPrefixes are needed for it.
  },
  { id: 'team-info', label: 'Team Info', href: '/golf/dashboard/team', icon: IconUsers },
];

export const GOLF_PLAYER_HUBS: readonly GolfHubDef[] = [
  { id: 'team', label: 'Team', ariaLabel: 'Team sections', tabs: PLAYER_TEAM_TABS },
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
  /** Compact label for the mobile bottom bar only (audit P-31). */
  shortLabel?: string;
}): NavItem {
  const { label, href, icon, tabs, badge, activeMatch, exact, shortLabel } = opts;
  return {
    label,
    shortLabel,
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
 * The 7 coach rail items (OD-14 coach IA, desktop mirror of the tab bar):
 *   Dashboard · CoachHelm AI · Players · Schedule · Team · Rounds & Stats ·
 *   Courses.
 * Settings + Sign out are the shell's pinned footer (unchanged, not part of
 * this array).
 */
export function buildCoachRailSections(badges: GolfNavBadgeCounts): NavSection[] {
  const players = GOLF_COACH_HUBS.find((h) => h.id === 'players')!;
  const schedule = GOLF_COACH_HUBS.find((h) => h.id === 'schedule')!;
  const team = GOLF_COACH_HUBS.find((h) => h.id === 'team')!;
  const roundsStats = GOLF_COACH_HUBS.find((h) => h.id === 'rounds-stats')!;

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
      label: players.label,
      href: players.tabs[0]!.href,
      icon: IconUsers,
      tabs: players.tabs,
    }),
    hubToNavItem({
      label: schedule.label,
      href: schedule.tabs[0]!.href,
      icon: IconCalendar,
      tabs: schedule.tabs,
      badge: navBadge(badges.calendarNotifications),
    }),
    hubToNavItem({
      label: team.label,
      href: team.tabs[0]!.href,
      icon: IconMessage,
      tabs: team.tabs,
      // Team = Messages · Announcements · Tasks · Documents; Documents carries
      // no count today.
      badge: navBadge(badges.messages + badges.announcements + badges.tasks),
    }),
    hubToNavItem({
      label: roundsStats.label,
      href: roundsStats.tabs[0]!.href,
      icon: IconChartBar,
      tabs: roundsStats.tabs,
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
      // The Team cluster owns the hub's three notification feeds. Summing the
      // provider's existing per-domain counts lights the dark rail the moment
      // a new announcement, task, or itinerary lands (badge only when > 0 —
      // never a fake zero). The mobile More sheet mirrors the rail, so this
      // one declaration covers both surfaces.
      badge: navBadge(badges.announcements + badges.tasks + badges.travel),
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
// Mobile bottom-tab bar — OD-14 (owner, 2026-09-24): five labelled tabs per
// role (audit design-direction §3.1/§3.2), mapped onto EXISTING routes:
//   Player: Home · Rounds · Game · Plan · Team
//     Game = the CoachHelm player hub (/coachhelm) + My Stats (/stats)
//     Plan = the hub's Development view (/coachhelm?view=development)
//   Coach:  Home · Players · CoachHelm · Schedule · Team
// The tab bar no longer carries a 6th "More" column: the remaining rail
// destinations (and Settings) live in the More sheet, opened from the mobile
// nav bar (FairwayDashboardShell `MobileMoreButton`), and `more-nav.ts`'s
// `selectOverflow` still derives that list from the rail. A hub's tab href is
// always its FIRST sub-tab, so the tab bar can never disagree with the rail
// about where "Players"/"Schedule"/"Team" lands.
//
// `view` is the current `?view=` search param. Game and Plan share one
// pathname (/golf/dashboard/coachhelm) and differ only by it, and
// `activeMatch` only sees the pathname, so the shell passes the param in.
// -----------------------------------------------------------------------------

const ZERO_NAV_BADGES: GolfNavBadgeCounts = {
  messages: 0,
  coachhelm: 0,
  calendarNotifications: 0,
  announcements: 0,
  travel: 0,
  tasks: 0,
};

const PLAYER_COACHHELM_HREF = '/golf/dashboard/coachhelm';
export const PLAYER_PLAN_VIEW = 'development';
export const PLAYER_PLAN_HREF = `${PLAYER_COACHHELM_HREF}?view=${PLAYER_PLAN_VIEW}`;
const COACH_PLAYER_DETAIL_PREFIX = '/golf/dashboard/players';

function isPlayerPlanRoute(pathname: string, view: string | null | undefined): boolean {
  return (
    (pathname === PLAYER_COACHHELM_HREF && view === PLAYER_PLAN_VIEW) ||
    matchesRoutePrefix(pathname, '/golf/dashboard/my-development')
  );
}

export function buildCoachBottomNavItems(badges: GolfNavBadgeCounts): NavItem[] {
  const players = GOLF_COACH_HUBS.find((h) => h.id === 'players')!;
  const schedule = GOLF_COACH_HUBS.find((h) => h.id === 'schedule')!;
  const team = GOLF_COACH_HUBS.find((h) => h.id === 'team')!;
  const inTabs = (pathname: string, tabs: readonly GolfSubTab[]) =>
    tabs.some(
      (tab) =>
        matchesRoutePrefix(pathname, tab.href) ||
        Boolean(tab.matchPrefixes?.some((prefix) => matchesRoutePrefix(pathname, prefix))),
    );

  return [
    hubToNavItem({ label: 'Home', href: '/golf/dashboard', icon: IconHome, exact: true }),
    hubToNavItem({
      label: players.label,
      href: players.tabs[0]!.href,
      icon: IconUsers,
      // Roster rows push the coach Player page (/players/[id]), so the Players
      // tab owns it on phone. The CoachHelm tab below excludes it, so exactly
      // one tab is lit there.
      activeMatch: (pathname) =>
        inTabs(pathname, players.tabs) || matchesRoutePrefix(pathname, COACH_PLAYER_DETAIL_PREFIX),
    }),
    hubToNavItem({
      label: 'CoachHelm',
      href: '/golf/dashboard/intelligence',
      icon: IconSparkles,
      badge: navBadge(badges.coachhelm),
      activeMatch: (pathname) =>
        isCoachHelmCoachCluster(pathname) && !matchesRoutePrefix(pathname, COACH_PLAYER_DETAIL_PREFIX),
    }),
    hubToNavItem({
      label: schedule.label,
      href: schedule.tabs[0]!.href,
      icon: IconCalendar,
      tabs: schedule.tabs,
      badge: navBadge(badges.calendarNotifications),
    }),
    hubToNavItem({
      label: team.label,
      href: team.tabs[0]!.href,
      icon: IconMessage,
      tabs: team.tabs,
      badge: navBadge(badges.messages + badges.announcements + badges.tasks),
    }),
  ];
}

export function buildPlayerBottomNavItems(
  badges: GolfNavBadgeCounts = ZERO_NAV_BADGES,
  view: string | null = null,
): NavItem[] {
  const team = GOLF_PLAYER_HUBS.find((h) => h.id === 'team')!;
  return [
    hubToNavItem({ label: 'Home', href: '/golf/dashboard', icon: IconHome, exact: true }),
    hubToNavItem({ label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf }),
    hubToNavItem({
      label: surfaceName('tab-game-player'),
      href: PLAYER_COACHHELM_HREF,
      icon: IconChartBar,
      activeMatch: (pathname) =>
        (isCoachHelmPlayerCluster(pathname) && !isPlayerPlanRoute(pathname, view)) ||
        matchesRoutePrefix(pathname, '/golf/dashboard/stats'),
    }),
    hubToNavItem({
      label: surfaceName('tab-plan-player'),
      href: PLAYER_PLAN_HREF,
      icon: IconFlag,
      activeMatch: (pathname) => isPlayerPlanRoute(pathname, view),
    }),
    hubToNavItem({
      label: 'Team',
      href: team.tabs[0]!.href,
      icon: IconUsers,
      tabs: team.tabs,
      badge: navBadge(badges.announcements + badges.tasks + badges.travel),
    }),
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

function stripQuery(href: string): string {
  return href.split(/[?#]/, 1)[0]!;
}

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
  // Registered hrefs may carry a `?view=` (the player Plan tab); lateral
  // classification is by pathname only.
  return new Set(
    [...railHrefs, ...hubTabHrefs, ...bottomNavHrefs, ...COACHHELM_CLUSTER_PAGE_HREFS].map(stripQuery),
  );
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
  return golfLateralDestinations.has(stripQuery(pathname));
}
