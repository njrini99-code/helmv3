'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  IconHome,
  IconUsers,
  IconMessage,
  IconSettings,
  IconLogOut,
  IconUser,
  IconBuilding,
  IconCalendar,
  IconHelp,
  IconGraduationCap,
  IconChevronLeft,
  IconChevronRight,
  IconChartBar,
  IconClipboardList,
  IconMessageSquare,
  IconMap,
  IconFileText,
  IconTarget,
} from '@/components/icons';
import {
  COACH_TEAM_TABS,
  COACH_STATS_TABS,
  COACH_DEVELOPMENT_TABS,
  COACH_MANAGEMENT_TABS,
  COACH_ACADEMICS_TABS,
  COACH_HUB_ORDER,
  COACH_HUB_DEFS,
  PLAYER_STATS_TABS,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_TEAM_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import { TeamSwitcher } from './team-switcher';
import { useTeams } from '@/hooks/use-teams';
import { usePlayerTeams } from '@/hooks/use-player-teams';
import { useUnreadCount } from '@/hooks/use-unread-count';
import { useSidebar } from '@/contexts/sidebar-context';
import { Button } from '@/components/ui/button';
import {
  getVisibleBaseballNav,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavContext,
} from '@/lib/baseball/nav-registry';

// =============================================================================
// GROUPED-HUBS NAVIGATION (approved 2026-06-24)
//
// The old flat 11–13 sidebar tabs are condensed into a handful of top-level HUBS.
// Each hub is ONE sidebar item that lands on its first child route; the hub's own
// sub-tab strip (rendered by BaseballDashboardShell via HubSubNav) then exposes
// the leaf routes. `hubPrefixes` lists every route inside the hub so the sidebar
// item lights active whenever ANY of the hub's leaves is the current page. The
// hub tab lists themselves live in the single-source-of-truth hub-definitions.
//
// ADDITIVE: every existing leaf route still works; the hubs add a layer above
// them. The sidebar's dark styling is unchanged — only the top-level item set is.
// =============================================================================

type SidebarHubItem = {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>;
  badge?: boolean;
  /** Route prefixes that mark this hub item active (defaults to [href]). */
  hubPrefixes?: string[];
};

/** Collect every route a hub owns (each tab's href + matchPrefixes). */
function hubPrefixesFrom(
  tabs: readonly { href: string; matchPrefixes?: string[] }[],
): string[] {
  return tabs.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]);
}

// --- Coach hub item builders (one shared set; landing differs by program mode) ---
const COACH_TEAM_HUB: SidebarHubItem = {
  name: 'Team',
  href: COACH_TEAM_TABS[0]!.href,
  icon: IconUsers,
  hubPrefixes: hubPrefixesFrom(COACH_TEAM_TABS),
};
const COACH_STATS_HUB: SidebarHubItem = {
  name: 'Stats',
  href: COACH_STATS_TABS[0]!.href,
  icon: IconChartBar,
  hubPrefixes: hubPrefixesFrom(COACH_STATS_TABS),
};
const COACH_DEVELOPMENT_HUB: SidebarHubItem = {
  name: 'Development',
  href: COACH_DEVELOPMENT_TABS[0]!.href,
  icon: IconTarget,
  hubPrefixes: hubPrefixesFrom(COACH_DEVELOPMENT_TABS),
};
const COACH_MANAGEMENT_HUB: SidebarHubItem = {
  name: 'Management',
  href: COACH_MANAGEMENT_TABS[0]!.href,
  icon: IconBuilding,
  hubPrefixes: hubPrefixesFrom(COACH_MANAGEMENT_TABS),
};
const COACH_ACADEMICS_HUB: SidebarHubItem = {
  name: 'Academics',
  href: COACH_ACADEMICS_TABS[0]!.href,
  icon: IconGraduationCap,
  hubPrefixes: hubPrefixesFrom(COACH_ACADEMICS_TABS),
};
// Messages — persistent cross-cutting slot (golf-style), never a hub sub-tab.
// Deliberately outside BASEBALL_NAV_REGISTRY (see nav-registry.ts), so every
// nav consumer injects it explicitly; this is the shared literal both the
// condensed (8-tab) nav and the legacy showcase org nav inject.
const COACH_MESSAGES_ITEM: SidebarHubItem = {
  name: BASEBALL_MESSAGES_NAV.label,
  href: BASEBALL_MESSAGES_NAV.href,
  icon: IconMessage,
  badge: true,
};

// College Coach — grouped hubs (Dashboard, Team, Stats, Development, Management).
const collegeTeamNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/baseball/dashboard/command-center', icon: IconHome },
  COACH_TEAM_HUB,
  COACH_STATS_HUB,
  COACH_DEVELOPMENT_HUB,
  COACH_MANAGEMENT_HUB,
];

// HS Coach — same hubs, HS-specific dashboard landing.
const hsCoachTeamNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/baseball/dashboard/command-center', icon: IconHome },
  COACH_TEAM_HUB,
  COACH_STATS_HUB,
  COACH_DEVELOPMENT_HUB,
  COACH_MANAGEMENT_HUB,
];

// JUCO Coach — adds the Academics hub (JUCO-only).
const jucoTeamNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/baseball/dashboard/command-center', icon: IconHome },
  COACH_TEAM_HUB,
  COACH_STATS_HUB,
  COACH_DEVELOPMENT_HUB,
  COACH_ACADEMICS_HUB,
  COACH_MANAGEMENT_HUB,
];

// Showcase Coach - Organization Mode (manages multiple teams). Showcase keeps its
// org-level surfaces at the top level; the per-team hubs appear once a team is
// selected (showcaseTeamNav below).
const showcaseOrgNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/baseball/dashboard/organization', icon: IconHome },
  { name: 'Teams', href: '/baseball/dashboard/teams', icon: IconUsers },
  { name: 'Events', href: '/baseball/dashboard/events', icon: IconCalendar },
  COACH_MESSAGES_ITEM,
];

// Showcase Coach - Team-specific hubs (shown when a team is selected).
const showcaseTeamNav: SidebarHubItem[] = [
  COACH_TEAM_HUB,
  COACH_STATS_HUB,
  COACH_DEVELOPMENT_HUB,
];

// Player — grouped hubs: Dashboard, My Profile, My Stats hub, Development hub,
// Calendar, Messages, and a Team hub (Announcements / Tasks / Documents).
const playerTeamNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/baseball/player/today', icon: IconHome },
  { name: 'My Profile', href: '/baseball/dashboard/profile', icon: IconUser },
  {
    name: 'My Stats',
    href: PLAYER_STATS_TABS[0]!.href,
    icon: IconChartBar,
    hubPrefixes: hubPrefixesFrom(PLAYER_STATS_TABS),
  },
  {
    name: 'Development',
    href: PLAYER_DEVELOPMENT_TABS[0]!.href,
    icon: IconTarget,
    hubPrefixes: hubPrefixesFrom(PLAYER_DEVELOPMENT_TABS),
  },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
  {
    name: 'Team',
    href: PLAYER_TEAM_TABS[0]!.href,
    icon: IconUsers,
    hubPrefixes: hubPrefixesFrom(PLAYER_TEAM_TABS),
  },
];

// Golf Coach navigation (flat — golf keeps its own nav model; unchanged).
const golfCoachNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Rounds', href: '/golf/dashboard/rounds', icon: IconClipboardList },
  { name: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessageSquare, badge: true },
  { name: 'Travel', href: '/golf/dashboard/travel', icon: IconMap },
];

// Secondary navigation (coach) — Settings + Program now live in the Management
// hub, so "More" carries only the always-available Help link for coaches.
const coachSecondaryNav = [
  { name: 'Help', href: '/help', icon: IconHelp },
];

// Secondary navigation (player) — players have no Management hub, so Settings
// stays in the "More" group.
const playerSecondaryNav = [
  { name: 'Settings', href: '/baseball/dashboard/settings', icon: IconSettings },
  { name: 'Help', href: '/help', icon: IconHelp },
];

/**
 * Dashboard / "home" hrefs that must match EXACTLY (never light via a startsWith
 * prefix, since every nested route starts with the dashboard root).
 */
const EXACT_MATCH_HREFS = new Set<string>([
  '/baseball/dashboard',
  '/baseball/dashboard/command-center',
  '/baseball/player/today',
  '/baseball/dashboard/organization',
  '/golf/dashboard',
]);

const RECRUITING_PROGRAM_TYPES = new Set(['college', 'juco', 'showcase', 'academy', 'club']);

function visibleIdSet(ctx: BaseballNavContext) {
  return new Set(getVisibleBaseballNav(ctx).map((entry) => entry.id));
}

function hasAnyVisible(ids: Set<string>, candidates: string[]) {
  return candidates.some((id) => ids.has(id));
}

/**
 * The condensed 8-tab coach nav (COACH_NAV_8TAB_PROPOSAL.md, approved
 * 2026-07-01): Dashboard, Team, Messages, Stats & Performance, Development,
 * Recruiting, Academics, Management. GROUPED BY `entry.hub` (via
 * COACH_HUB_ORDER / COACH_HUB_DEFS in hub-definitions.ts, itself derived from
 * BASEBALL_NAV_REGISTRY) — this function never hand-lists a hub's member
 * routes, so a new registry entry tagged with an existing `hub` is picked up
 * automatically, with no risk of re-orphaning a feature from the sidebar.
 */
function buildCondensedBaseballNavigation(ctx: BaseballNavContext): SidebarHubItem[] {
  const ids = visibleIdSet(ctx);

  if (ctx.role === 'player') {
    return [
      { name: 'Today', href: '/baseball/player/today', icon: IconHome },
      { name: 'Schedule', href: '/baseball/dashboard/calendar', icon: IconCalendar },
      {
        name: 'My Stats',
        href: PLAYER_STATS_TABS[0]!.href,
        icon: IconChartBar,
        hubPrefixes: hubPrefixesFrom(PLAYER_STATS_TABS),
      },
      {
        name: 'Development',
        href: PLAYER_DEVELOPMENT_TABS[0]!.href,
        icon: IconTarget,
        hubPrefixes: hubPrefixesFrom(PLAYER_DEVELOPMENT_TABS),
      },
      {
        name: 'Team',
        href: PLAYER_TEAM_TABS[0]!.href,
        icon: IconUsers,
        hubPrefixes: hubPrefixesFrom(PLAYER_TEAM_TABS),
      },
      { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
      { name: 'My Profile', href: '/baseball/dashboard/profile', icon: IconUser },
    ];
  }

  const items: SidebarHubItem[] = [];

  for (const hubId of COACH_HUB_ORDER) {
    const def = COACH_HUB_DEFS[hubId];

    // Recruiting/Academics are MODE-gated (RECRUITING_PROGRAM_TYPES / JUCO-only),
    // not just capability-gated — checked up front so a recruiting-ineligible
    // program type never shows the hub, even if a member id happens to also be
    // capability-visible.
    if (hubId === 'recruiting' && !(ctx.programType && RECRUITING_PROGRAM_TYPES.has(ctx.programType))) {
      continue;
    }
    if (hubId === 'academics' && !ids.has('academics')) continue;

    // Dashboard (Command Center) and Management (Program Info/Settings) each
    // always carry a member every coach can see, so — matching pre-
    // consolidation behavior where Command was always item #1 and Management
    // was always pushed last — they are never hidden for lacking a visible
    // member the way Team/Stats/Development legitimately can be.
    const alwaysShow = hubId === 'dashboard' || hubId === 'management';
    if (!alwaysShow && !hasAnyVisible(ids, def.tabs.map((t) => t.id))) continue;

    items.push({
      name: def.label,
      href: def.tabs[0]!.href,
      icon: def.icon,
      hubPrefixes: def.tabs.flatMap((t) => [t.href, ...(t.matchPrefixes ?? [])]),
    });

    // Messages: persistent cross-cutting slot (golf-style), injected right
    // after Dashboard — never a hub sub-tab (nav-registry.ts: "messages lives
    // outside this set").
    if (hubId === 'dashboard') items.push(COACH_MESSAGES_ITEM);
  }

  return items;
}

/**
 * Whether a top-level (hub or flat) sidebar item is active for the current path.
 * A hub item lights when the pathname matches its href OR any route inside the
 * hub (`hubPrefixes`); home/dashboard items match exactly. Settings is excluded
 * from the Management hub's prefixes when it would collide with the secondary
 * Settings link (handled by the secondary nav's own active state).
 */
function isHubItemActive(item: SidebarHubItem, pathname: string): boolean {
  const prefixes = item.hubPrefixes ?? [item.href];
  for (const p of prefixes) {
    if (pathname === p) return true;
    if (!EXACT_MATCH_HREFS.has(p) && pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

interface SidebarProps {
  isMobile?: boolean;
  navContext?: BaseballNavContext;
}

export function Sidebar({ isMobile = false, navContext }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, coach, player, signOut } = useAuth();
  const { unreadCount } = useUnreadCount();
  const { collapsed, setCollapsed, setMobileOpen } = useSidebar();

  // Use appropriate teams hook based on user role
  const coachTeams = useTeams();
  const playerTeams = usePlayerTeams();
  const { hasMultipleTeams, selectedTeam } = user?.role === 'coach' ? coachTeams : playerTeams;

  // Determine sport-specific dashboard href based on pathname
  const isGolf = pathname.startsWith('/golf');
  const dashboardHref = isGolf ? '/golf/dashboard' : '/baseball/dashboard';

  // Determine navigation based on role, coach type, and mode
  // ARCHIVED: Recruiting mode branches removed — all users see team mode only
  const getNavigation = (): SidebarHubItem[] => {
    if (isGolf) {
      return golfCoachNav;
    }
    if (navContext) {
      return buildCondensedBaseballNavigation(navContext);
    }
    if (user?.role === 'coach') {
      if (coach?.coach_type === 'college') {
        return collegeTeamNav;
      } else if (coach?.coach_type === 'juco') {
        return jucoTeamNav;
      } else if (coach?.coach_type === 'showcase') {
        return showcaseOrgNav;
      } else if (coach?.coach_type === 'high_school') {
        return hsCoachTeamNav;
      } else {
        return hsCoachTeamNav;
      }
    } else if (user?.role === 'player') {
      // ARCHIVED: All players now see team nav only — recruiting nav disabled
      return playerTeamNav;
    }
    return collegeTeamNav;
  };

  const getTeamNavigation = () => {
    if (coach?.coach_type === 'showcase' && selectedTeam) {
      return showcaseTeamNav;
    }
    return [];
  };

  const navigation = getNavigation();
  const teamNavigation = getTeamNavigation();
  const secondaryNav = !isGolf && navContext
    ? navContext.role === 'coach'
      ? [{ name: 'Help', href: '/help', icon: IconHelp }]
      : [
          ...getVisibleBaseballNav(navContext)
            .filter((entry) => entry.section === 'secondary')
            .map((entry) => ({
              name: entry.label,
              href: entry.href,
              icon: entry.icon,
            })),
          { name: 'Help', href: '/help', icon: IconHelp },
        ]
    : user?.role === 'coach' ? coachSecondaryNav : playerSecondaryNav;
  const displayName = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const isShowcaseCoach = coach?.coach_type === 'showcase';
  const subtitle = coach ? ((coach.organization as { name?: string })?.name || 'Coach') : (player ? `${player.primary_position} • ${player.grad_year}` : '');

  const handleNavClick = () => {
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/baseball/login');
  };

  // For mobile, always show expanded; for desktop, use collapsed state
  const isCollapsed = isMobile ? false : collapsed;

  return (
    <aside
      className={cn(
        // Dark sidebar per Batch 3 spec
        'bg-[rgba(28,25,23,0.97)] backdrop-blur-xl',
        'h-dvh flex flex-col relative',
        'transition-[width] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
        'will-change-[width]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        !isMobile && 'fixed left-0 top-0 z-40'
      )}
    >
      {/* Collapse Toggle Button (desktop only) */}
      {!isMobile && (
        <Button variant="ghost"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-5 top-6 z-50',
            'w-10 h-10 rounded-full bg-[#1C1917] border border-white/20',
            'flex items-center justify-center',
            'shadow-lg hover:bg-white/10 active:bg-white/15 hover:border-white/30',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/40'
          )}
        >
          {isCollapsed ? (
            <IconChevronRight size={14} className="text-white/70" aria-hidden="true" />
          ) : (
            <IconChevronLeft size={14} className="text-white/70" aria-hidden="true" />
          )}
        </Button>
      )}
      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-white/10',
        'transition-[padding] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-3 justify-center' : 'px-5'
      )}>
        <Link
          href={dashboardHref}
          className="flex items-center gap-3"
          onClick={handleNavClick}
        >
          <div className="relative h-10 flex items-center">
            {/* Icon version (shown when collapsed) */}
            <div
              aria-hidden={!isCollapsed}
              className={cn(
                'w-10 h-10 flex items-center justify-center flex-shrink-0',
                'transition-[opacity,transform] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
              )}
            >
              <Image
                src="/anim/helm-baseball-icon.png"
                alt="BaseballHelm"
                width={300}
                height={300}
                className="w-10 h-10 object-contain"
                priority
                unoptimized
              />
            </div>
            {/* Full logo + text (shown when expanded) */}
            <div
              aria-hidden={isCollapsed}
              className={cn(
                'flex items-center gap-2 transition-[opacity,transform] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-0 scale-75 absolute' : 'opacity-100 scale-100'
              )}
            >
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                <Image
                  src="/anim/helm-baseball-icon.png"
                  alt=""
                  width={300}
                  height={300}
                  className="w-10 h-10 object-contain"
                  priority
                  unoptimized
                />
              </div>
              <span className="text-lg font-bold leading-none tracking-tight text-white">
                Baseball<span className="text-primary-400">Helm</span>
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 py-4 overflow-y-auto overflow-x-hidden custom-scrollbar',
        'transition-[padding] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-2' : 'px-3'
      )}>
        {/* ARCHIVED: Recruiting mode toggle hidden — re-enable when recruiting is ready */}
        {/* {showModeToggle && !isCollapsed && (
          <div className="mb-4 px-1 animate-fade-in">
            <ModeToggle currentMode={currentMode} onModeChange={handleModeChange} />
          </div>
        )} */}

        {/* Team Switcher */}
        {(isShowcaseCoach || (user?.role === 'player' && hasMultipleTeams)) && hasMultipleTeams && (
          <TeamSwitcher collapsed={isCollapsed} />
        )}

        {/* Section Label */}
        {!isCollapsed && (
          <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
            {user?.role === 'coach'
              ? (coach?.coach_type === 'showcase' ? 'Organization' : 'Team')
              : 'Team'}
          </p>
        )}

        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = isHubItemActive(item, pathname);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 py-3 rounded-[10px] text-body-sm font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out will-change-transform',
                    'active:scale-[0.98]',
                    isActive
                      ? 'bg-white/10 text-primary-400 border-l-[3px] border-primary-500 nav-item-active'
                      : 'text-white/60 hover:bg-white/5 active:bg-white/10 hover:text-white/90',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'text-primary-400 nav-item-active-icon' : 'text-white/50'
                    )}
                  />
                  {/* Text - animates out */}
                  <span
                    className={cn(
                      'flex-1 whitespace-nowrap transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
                      isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                  {/* Badge */}
                  {item.badge && unreadCount > 0 && (
                    <span
                      className={cn(
                        'flex items-center justify-center text-micro font-semibold bg-primary-600 text-white rounded-full transition-opacity duration-300',
                        isCollapsed
                          ? 'absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1'
                          : 'ml-auto px-1.5 py-0.5'
                      )}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Team-specific navigation for Showcase Coaches */}
        {isShowcaseCoach && selectedTeam && teamNavigation.length > 0 && (
          <>
            {/* Divider */}
            <div className="my-4 mx-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            {!isCollapsed && (
              <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap overflow-hidden">
                {selectedTeam.name}
              </p>
            )}
            <ul className="space-y-0.5">
              {teamNavigation.map((item) => {
                const isActive = isHubItemActive(item, pathname);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={handleNavClick}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 py-3 rounded-[10px] text-body-sm font-medium min-h-[44px]',
                        'transition-colors duration-150 ease-out',
                        isActive
                          ? 'bg-white/10 text-primary-400 border-l-[3px] border-primary-500 nav-item-active'
                          : 'text-white/60 hover:bg-white/5 active:bg-white/10 hover:text-white/90',
                        isCollapsed ? 'justify-center px-2' : 'px-3'
                      )}
                    >
                      <item.icon
                        size={18}
                        aria-hidden="true"
                        className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-primary-400 nav-item-active-icon' : 'text-white/50'
                        )}
                      />
                      <span
                        className={cn(
                          'whitespace-nowrap transition-opacity duration-300',
                          isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                        )}
                      >
                        {item.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Divider */}
        <div className="my-4 mx-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Secondary Navigation */}
        {!isCollapsed && (
          <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
            More
          </p>
        )}
        <ul className="space-y-0.5">
          {secondaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 py-3 rounded-[10px] text-body-sm font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out',
                    isActive
                      ? 'bg-white/10 text-primary-400 nav-item-active'
                      : 'text-white/60 hover:bg-white/5 active:bg-white/10 hover:text-white/90',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon size={18} className="flex-shrink-0 text-white/50" aria-hidden="true" />
                  <span
                    className={cn(
                      'whitespace-nowrap transition-opacity duration-300',
                      isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className={cn(
        'border-t border-white/10 space-y-0.5',
        'transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-3'
      )}>
        {/* Pro badge (only when expanded) */}
        <div
          className={cn(
            'rounded-xl bg-white/5 border border-white/10 overflow-hidden',
            'transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0 border-0' : 'h-auto opacity-100 p-3 mb-3'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">Free Plan</span>
            
          </div>
          <div className="text-xs text-white/50">Free for all teams</div>
        </div>

        {/* User info */}
        <div
          className={cn(
            'rounded-xl bg-white/5 overflow-hidden transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0' : 'h-auto opacity-100 px-3 py-2.5 mb-2'
          )}
        >
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          <p className="text-xs text-white/50 truncate">{subtitle}</p>
        </div>

        {/* Sign out */}
        <Button variant="danger"
          onClick={handleSignOut}
          aria-label="Sign out"
          title={isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-3 rounded-[10px] text-body-sm font-medium min-h-[44px]',
            'text-white/60 hover:bg-red-500/10 hover:text-red-400',
            'transition-colors duration-150 ease-out active:scale-[0.98]',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconLogOut size={18} className="flex-shrink-0 text-white/50" aria-hidden="true" />
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-300',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            Sign out
          </span>
        </Button>
      </div>
    </aside>
  );
}
