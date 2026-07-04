'use client';

/**
 * ============================================================================
 * BaseballFairwayShell  (ADDITIVE · FLAG-GATED) — Fairway migration Phase A
 * ----------------------------------------------------------------------------
 * The flag-ON dashboard frame for the generic `/baseball/(dashboard)` route
 * group. Mirrors GolfHelm's `FairwayDashboardShell` playbook exactly: a full,
 * standalone replacement for the legacy shell composition (not a wrapper
 * around it) that renders the shared Fairway `<AppShell>` — the warm-black
 * recessive rail on desktop, a slide-in glass drawer on mobile, the one glass
 * top bar — in place of the legacy `BaseballDashboardShell`.
 *
 * PRESENTATION ONLY. No server actions, no RLS, no new reads beyond what the
 * existing baseball auth/nav hooks already resolve:
 *   - useBaseballAuth(requiredRole) — the SAME session/onboarding gate
 *     BaseballShellLayout uses for each mounted route group.
 *   - useBaseballNavContext()      — the SAME server-resolved capability map
 *     (nav-context.ts), so capability-gated verticals never fail-closed here
 *     when they wouldn't in the legacy shell.
 *   - getVisibleBaseballNav()      — the #383 capability-gated nav-registry
 *     single source of truth (nav-registry.ts). NavSections are built from
 *     this, never a hardcoded route list, so this shell can't drift from (or
 *     duplicate) what Sidebar / MobileBottomNav / CommandPalette already read.
 *
 * PROVIDER STACK — kept VERBATIM from BaseballShellLayout (the shared
 * composition point for all three BaseballHelm shell route groups): the same
 * SidebarProvider > SessionActivityProvider > LastSeenUpdater >
 * PeekPanelProvider nesting, unchanged. BaseballShellLayout.tsx itself is not
 * imported or edited — this file is a parallel, full duplicate of that
 * composition (same reason GolfHelm's FairwayDashboardShell duplicates
 * GolfDashboardShell's stack rather than wrapping it).
 *
 * Mounted ONLY behind isRedesignEnabled() in the Baseball dashboard/player
 * route-group layouts. Flag OFF renders the legacy `BaseballShellLayout` →
 * `BaseballDashboardShell`, byte-for-byte unchanged.
 *
 * The AppShell drawer (`mobileOpen`) is BRIDGED to the SAME SidebarContext
 * every legacy baseball page's own menu button already calls `setMobileOpen`
 * against, so a not-yet-migrated page opens the SAME drawer. One nav surface,
 * no dead buttons, no double drawers.
 * ========================================================================== */

import { useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AppShell, FairwayBottomNav, useSidebarCollapsed } from '@/components/fairway/app-shell';
import type { Breadcrumb, NavItem, NavSection, ShellLinkComponent } from '@/components/fairway/app-shell';

import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { PageLoading } from '@/components/ui/loading';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { PeekPanelProvider } from '@/components/baseball/peek-panel';
import { NotificationBell } from '@/components/baseball/NotificationBell';
import { BaseballProgramBrand } from '@/components/baseball/settings/BaseballProgramBrand';

import { useBaseballAuth } from '@/hooks/use-baseball-auth';
import { useBaseballNavContext } from '@/hooks/use-baseball-nav-context';
import { useAuth } from '@/hooks/use-auth';
import { useTeams } from '@/hooks/use-teams';
import { usePlayerTeams } from '@/hooks/use-player-teams';
import { useUnreadCount } from '@/hooks/use-unread-count';
import {
  getVisibleBaseballNav,
  getBaseballTerminology,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavContext,
  type BaseballNavEntry,
} from '@/lib/baseball/nav-registry';
import {
  COACH_HUB_ORDER,
  COACH_HUB_DEFS,
  HUB_ICONS,
  HUB_LANDING,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_RECRUITING_TABS,
  PLAYER_STATS_TABS,
  PLAYER_TEAM_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import {
  filterHubTabsByCapabilities,
  filterHubTabsByProgramType,
  resolveActiveHub,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
import { HubSubNav } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';
import type { HubSubNavTab } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';
import { IconSettings, IconLogout, IconHome, IconUsers, IconCalendar } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// PERF: lazy-load the same heavy global the legacy BaseballDashboardShell
// mounts unconditionally (mirrors GolfHelm's FairwayDashboardShell).
const CommandPalette = dynamic(
  () => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);

type Role = 'coach' | 'player';

/**
 * P413-equivalent: mobile bottom-tab destinations derived from the SAME hub
 * sections as the desktop rail so active states agree across breakpoints.
 * Golf FairwayDashboardShell uses the same pattern (5 tabs, hub activeMatch).
 */
function buildBottomNavFromSections(sections: NavSection[], role: Role): NavItem[] {
  const items = sections.flatMap((section) => section.items);
  const preferredLabels =
    role === 'coach'
      ? (['Dashboard', 'Team', 'Stats & Performance', 'Messages'] as const)
      : (['Today', 'Stats', 'Development', 'Team', 'Messages'] as const);

  const picked = preferredLabels
    .map((label) => items.find((item) => item.label === label))
    .filter((item): item is NavItem => Boolean(item));

  if (picked.length >= 3) return picked.slice(0, 5);
  return items.slice(0, 5);
}

/** Next <Link> adapter for the shell's link contract (module scope = stable identity). */
const ShellLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <Link href={href} prefetch {...rest}>
    {children}
  </Link>
);

/** entry.icon carries a wider SVG prop contract than FairwayIcon's minimal
 *  `{size, className}` — both are drawn from the same `@/components/icons`
 *  set, so this narrows structurally without behavior change. */
function toNavItem(
  entry: Pick<BaseballNavEntry, 'href' | 'label' | 'icon'>,
  badge?: number,
  matchPrefixes: readonly string[] = [],
): NavItem {
  return {
    label: entry.label,
    href: entry.href,
    icon: entry.icon as unknown as NavItem['icon'],
    badge,
    activeMatch: (pathname) =>
      pathname === entry.href ||
      matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  };
}

function playerHubToNavItem({
  label,
  href,
  icon,
  tabs,
  badge,
}: {
  label: string;
  href: string;
  icon: NavItem['icon'];
  tabs?: readonly HubSubNavTab[];
  badge?: number;
}): NavItem {
  return {
    label,
    href,
    icon,
    badge,
    activeMatch: (pathname) =>
      pathname === href ||
      Boolean(
        tabs?.some(
          (tab) => pathname === tab.href || tab.matchPrefixes?.some((prefix) => pathname.startsWith(prefix)),
        ),
      ),
  };
}

const RECRUITING_PROGRAM_TYPES = new Set<BaseballProgramType>(['college', 'juco', 'showcase', 'academy', 'club']);

function buildPlayerNavSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const visible = getVisibleBaseballNav(ctx);
  const byId = new Map(visible.map((entry) => [entry.id, entry]));
  const today = byId.get('player-today');
  const schedule = byId.get('calendar');
  const profile = byId.get('player-profile');

  const primary: NavItem[] = [
    ...(today ? [toNavItem(today)] : []),
    ...(schedule ? [toNavItem(schedule)] : []),
    ...(profile ? [toNavItem(profile)] : []),
    playerHubToNavItem({
      label: 'Stats',
      href: HUB_LANDING.playerStats,
      icon: HUB_ICONS.stats as unknown as NavItem['icon'],
      tabs: PLAYER_STATS_TABS,
    }),
    playerHubToNavItem({
      label: 'Development',
      href: HUB_LANDING.playerDevelopment,
      icon: HUB_ICONS.development as unknown as NavItem['icon'],
      tabs: PLAYER_DEVELOPMENT_TABS,
    }),
    playerHubToNavItem({
      label: 'Team',
      href: HUB_LANDING.playerTeam,
      icon: HUB_ICONS.team as unknown as NavItem['icon'],
      tabs: PLAYER_TEAM_TABS,
    }),
    toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined, [BASEBALL_MESSAGES_NAV.href]),
  ];

  const secondary: NavItem[] = [
    playerHubToNavItem({
      label: getBaseballTerminology(ctx).exposureNoun,
      href: HUB_LANDING.playerRecruiting,
      icon: HUB_ICONS.recruiting as unknown as NavItem['icon'],
      tabs: PLAYER_RECRUITING_TABS,
    }),
    toNavItem(
      { href: '/baseball/dashboard/settings', label: 'Settings', icon: IconSettings },
      undefined,
      ['/baseball/dashboard/settings'],
    ),
  ];

  const sections: NavSection[] = [{ heading: 'My Baseball', items: primary }];
  if (secondary.length) sections.push({ heading: 'More', items: secondary });
  return sections;
}

function buildCoachHubSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const items: NavItem[] = [];

  for (const hubId of COACH_HUB_ORDER) {
    const def = COACH_HUB_DEFS[hubId];

    // Recruiting/Academics are MODE-gated (RECRUITING_PROGRAM_TYPES / JUCO-only)
    // — same gate resolveActiveHub.ts's coachHubs() uses — checked up front so
    // a recruiting-ineligible program type never shows the hub.
    if (hubId === 'recruiting' && !(ctx.programType && RECRUITING_PROGRAM_TYPES.has(ctx.programType))) {
      continue;
    }
    if (hubId === 'academics' && ctx.programType !== 'juco') continue;

    const capFiltered = filterHubTabsByCapabilities(def.tabs, 'coach', ctx.capabilities);
    const visibleTabs = filterHubTabsByProgramType(capFiltered, ctx.programType);
    if (visibleTabs.length === 0) continue;

    // Recruiting reframed per mode (JUCO → "Transfer Exposure") using the SAME
    // terminology engine program-type-variants.ts already provides — never a
    // second hand-maintained label map.
    items.push(
      playerHubToNavItem({
        label: hubId === 'recruiting' ? getBaseballTerminology(ctx).exposureNoun : def.label,
        href: visibleTabs[0]!.href,
        icon: def.icon as unknown as NavItem['icon'],
        tabs: visibleTabs,
      }),
    );

    // Messages is the persistent cross-cutting slot, outside the hub registry.
    if (hubId === 'dashboard') {
      items.push(toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined, [BASEBALL_MESSAGES_NAV.href]));
    }
  }

  return [{ heading: 'Baseball', items }];
}

/**
 * Showcase ORG-level rail (no team selected yet) — the documented two-level
 * org→team exception (COACH_NAV_8TAB_PROPOSAL.md): org-wide Dashboard/Teams/
 * Events, mirroring src/components/layout/sidebar.tsx's `showcaseOrgNav`
 * exactly (same routes/icons/order), plus the persistent Messages slot.
 */
function buildShowcaseOrgSections(unreadCount: number): NavSection[] {
  return [
    {
      heading: 'Organization',
      items: [
        { label: 'Dashboard', href: '/baseball/dashboard/organization', icon: IconHome },
        { label: 'Teams', href: '/baseball/dashboard/teams', icon: IconUsers },
        { label: 'Events', href: '/baseball/dashboard/events', icon: IconCalendar },
        toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined, [BASEBALL_MESSAGES_NAV.href]),
      ],
    },
  ];
}

/**
 * Showcase TEAM-level rail (a team is selected) — the other half of the
 * two-level exception, mirroring `showcaseTeamNav`: Team / Stats & Performance
 * / Development only (no Recruiting/Academics/Management — those are org-level
 * or not part of the showcase team surface), plus Dashboard + Messages so the
 * rail is never just three orphaned sections with no way back to Today.
 */
function buildShowcaseTeamSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const items: NavItem[] = [];
  const dashboardTabs = filterHubTabsByCapabilities(COACH_HUB_DEFS.dashboard.tabs, 'coach', ctx.capabilities);
  if (dashboardTabs.length) {
    items.push(
      playerHubToNavItem({
        label: COACH_HUB_DEFS.dashboard.label,
        href: dashboardTabs[0]!.href,
        icon: COACH_HUB_DEFS.dashboard.icon as unknown as NavItem['icon'],
        tabs: dashboardTabs,
      }),
    );
    items.push(toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined, [BASEBALL_MESSAGES_NAV.href]));
  }
  for (const hubId of ['team', 'stats-performance', 'development'] as const) {
    const def = COACH_HUB_DEFS[hubId];
    const capFiltered = filterHubTabsByCapabilities(def.tabs, 'coach', ctx.capabilities);
    const visibleTabs = filterHubTabsByProgramType(capFiltered, ctx.programType);
    if (visibleTabs.length === 0) continue;
    items.push(
      playerHubToNavItem({
        label: def.label,
        href: visibleTabs[0]!.href,
        icon: def.icon as unknown as NavItem['icon'],
        tabs: visibleTabs,
      }),
    );
  }
  return [{ heading: 'Baseball', items }];
}

function toTitle(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Breadcrumb label resolved against the SAME registry (never a second
 * hardcoded route→label map) — the longest href the pathname matches wins.
 */
function buildBreadcrumbs(pathname: string, ctx: BaseballNavContext, homeHref: string): Breadcrumb[] {
  if (pathname === homeHref) return [{ label: 'Dashboard' }];

  const candidates: { href: string; label: string }[] = [
    ...getVisibleBaseballNav(ctx).map((e) => ({ href: e.href, label: e.label })),
    { href: BASEBALL_MESSAGES_NAV.href, label: BASEBALL_MESSAGES_NAV.label },
  ];
  let best: { href: string; label: string } | null = null;
  for (const c of candidates) {
    if (pathname === c.href || pathname.startsWith(`${c.href}/`)) {
      if (!best || c.href.length > best.href.length) best = c;
    }
  }
  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? 'Page';
  return [{ label: 'Dashboard', href: homeHref }, { label: best?.label ?? toTitle(lastSegment) }];
}

/** BaseballHelm wordmark for the rail header — hides text in icon-only mode. */
function Brand({ homeHref }: { homeHref: string }) {
  const collapsed = useSidebarCollapsed();
  return (
    <Link
      href={homeHref}
      prefetch
      aria-label="BaseballHelm home"
      className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-2.5')}
    >
      <span className="font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em] text-nav-text">
        {collapsed ? 'B' : (
          <>
            Baseball<span className="text-nav-accent">Helm</span>
          </>
        )}
      </span>
    </Link>
  );
}

/** Pinned rail footer — Settings (coach only, matching the legacy secondary
 *  nav) + Sign out, styled for the warm-black rail. */
function ShellFooter({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const collapsed = useSidebarCollapsed();
  const settingsHref = '/baseball/dashboard/settings';
  const settingsActive = pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/baseball/login');
  }, [signOut, router]);

  const rowBase = cn(
    'flex w-full items-center rounded-fw-md text-body-sm font-medium font-fw-sans tracking-[-0.005em]',
    'transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none',
    collapsed ? 'justify-center px-2 py-2.5 min-h-11' : 'gap-3 px-3.5 py-2.5',
  );

  return (
    <div className="flex flex-col gap-1">
      {/* Players reach Settings via the secondary nav section instead (matches
          the legacy player secondary nav — coaches keep it in Management). */}
      {role === 'coach' && (
        <Link
          href={settingsHref}
          prefetch
          aria-current={settingsActive ? 'page' : undefined}
          aria-label={collapsed ? 'Settings' : undefined}
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            rowBase,
            settingsActive
              ? 'bg-nav-surface text-nav-text'
              : 'text-nav-text-dim hover:bg-nav-surface/60 hover:text-nav-text',
          )}
        >
          <IconSettings
            size={18}
            aria-hidden
            className={cn('flex-shrink-0', settingsActive ? 'text-nav-accent' : 'text-nav-text-dim')}
          />
          {!collapsed && <span className="min-w-0 flex-1 truncate">Settings</span>}
        </Link>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={handleSignOut}
        aria-label={collapsed ? 'Sign out' : undefined}
        title={collapsed ? 'Sign out' : undefined}
        className={cn(rowBase, 'min-h-0 p-0 justify-start rounded-none text-nav-text-dim hover:bg-red-500/10 hover:text-red-400')}
      >
        <IconLogout size={18} aria-hidden className="flex-shrink-0 text-nav-text-dim" />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">Sign out</span>}
      </Button>
    </div>
  );
}

function BaseballFairwayContent({
  children,
  role,
  navContext,
}: {
  children: React.ReactNode;
  role: Role;
  navContext: BaseballNavContext | undefined;
}) {
  const pathname = usePathname();
  // BRIDGE: the exact SidebarContext instance legacy baseball pages already
  // call setMobileOpen against (BaseballDashboardShell's own menu button, any
  // not-yet-migrated page header) — so both shells open the SAME drawer.
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { coach, player } = useAuth();
  const { unreadCount } = useUnreadCount();

  // Same team-identity source the legacy Sidebar's TeamSwitcher reads.
  const coachTeams = useTeams();
  const playerTeams = usePlayerTeams();
  const { selectedTeam } = role === 'coach' ? coachTeams : playerTeams;

  // Fail-closed fallback (empty capability map) mirrors BaseballDashboardShell
  // when navContext hasn't resolved yet — gated verticals stay hidden, never
  // wrongly shown.
  const ctx: BaseballNavContext = useMemo(
    () => navContext ?? { role, capabilities: {} },
    [navContext, role],
  );
  const homeHref = role === 'coach' ? '/baseball/dashboard/command-center' : '/baseball/player/today';

  // Showcase two-level org→team exception (COACH_NAV_8TAB_PROPOSAL.md,
  // mirrors sidebar.tsx's showcaseOrgNav/showcaseTeamNav split): org-wide rail
  // until a team is picked, then the team-scoped hub rail.
  const isShowcaseCoach = role === 'coach' && coach?.coach_type === 'showcase';
  const sections = useMemo(() => {
    if (role !== 'coach') return buildPlayerNavSections(ctx, unreadCount);
    if (isShowcaseCoach) {
      return selectedTeam ? buildShowcaseTeamSections(ctx, unreadCount) : buildShowcaseOrgSections(unreadCount);
    }
    return buildCoachHubSections(ctx, unreadCount);
  }, [ctx, unreadCount, role, isShowcaseCoach, selectedTeam]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname, ctx, homeHref), [pathname, ctx, homeHref]);
  const activeHub = resolveActiveHub({
    pathname,
    role,
    programType: ctx.programType ?? null,
    capabilities: ctx.capabilities,
  });
  // P413-equivalent: persistent mobile bottom-tab bar (subset of the rail).
  const bottomNavItems = useMemo(
    () => buildBottomNavFromSections(sections, role),
    [sections, role],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  const name = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const avatarUrl = coach?.avatar_url || player?.avatar_url || undefined;
  const teamName = selectedTeam?.name || coach?.organization?.name;

  // Imperative open (mirrors GolfHelm's FairwayDashboardShell): the shell's
  // own ⌘K entry point dispatches the same global event CommandPalette listens
  // for, rather than synthesizing a keystroke.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event('helm:open-command-palette'));
  }, []);

  // Same "Skip to main content" anchor the legacy BaseballDashboardShell
  // renders (and GolfHelm's FairwayDashboardShell mirrors) — keyboard/SR users
  // must keep skip-nav when the flag is ON, not just flag-OFF.
  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );

  return (
    // `.living-annual` re-points the Fairway surface tokens to warm cream for
    // the whole baseball subtree (founder: "less white, more cream"); golf never
    // carries the class. `display:contents` so it only provides CSS-var
    // inheritance — no extra box, no layout impact on AppShell.
    <div className="living-annual" style={{ display: 'contents' }}>
      {skipLink}

      <AppShell
        sections={sections}
        user={{ name, teamName: teamName ?? undefined, avatarUrl: avatarUrl ?? undefined }}
        brand={<Brand homeHref={homeHref} />}
        sidebarFooter={<ShellFooter role={role} />}
        topBarActions={<NotificationBell />}
        pathname={pathname}
        linkComponent={ShellLink}
        breadcrumbs={breadcrumbs}
        collapsible
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onSearchOpen={openCommandPalette}
        searchPlaceholder="Search players, teams, pages…"
        // P413-equivalent: persistent mobile bottom-tab bar for the core
        // destinations (md:hidden; drawer keeps the long tail).
        bottomNav={
          <FairwayBottomNav items={bottomNavItems} pathname={pathname} linkComponent={ShellLink} />
        }
        // Pages own their own gutters + titles (the legacy <main> in
        // dashboard-shell.tsx had no content padding either) — the shell keeps
        // only the bottom home-indicator pad.
        contentPadding={false}
        constrainContent={false}
      >
        <div id="main-content" tabIndex={-1} className="outline-none">
          {activeHub && (
            <HubSubNav
              key={activeHub.id}
              tabs={activeHub.tabs}
              ariaLabel={activeHub.ariaLabel}
              className="hidden md:block md:top-16"
            />
          )}
          {children}
        </div>
      </AppShell>

      {/* Same global the legacy BaseballDashboardShell mounts unconditionally. */}
      <CommandPalette navContext={ctx} />
    </div>
  );
}

/**
 * Exported shell — full standalone replacement for BaseballShellLayout (auth
 * gate + provider stack + shell), rendering the Fairway AppShell frame.
 */
export function BaseballFairwayShell({
  children,
  authVerified = false,
  requiredRole = null,
}: {
  children: React.ReactNode;
  authVerified?: boolean;
  requiredRole?: Role | null;
}) {
  // SAME auth gate BaseballShellLayout uses for the mounted route group.
  const { loading, authorized, role } = useBaseballAuth(requiredRole);
  // SAME server-resolved capability map (nav-context.ts) BaseballShellLayout
  // passes into BaseballDashboardShell.
  const { navContext } = useBaseballNavContext();

  if (!authVerified && (loading || !authorized)) {
    return <PageLoading />;
  }

  const resolvedRole: Role = requiredRole ?? role ?? 'coach';

  return (
    <SidebarProvider>
      <SessionActivityProvider>
        <LastSeenUpdater />
        {/* Render-null: fetches the program's brand + applies it as CSS vars /
            data attrs on <html>. Mounted here too — this is a full parallel
            duplicate of BaseballShellLayout's provider stack (not a wrapper),
            so branding would otherwise silently die whenever the redesign
            flag is on for this route group. */}
        <BaseballProgramBrand />
        <PeekPanelProvider>
          <BaseballFairwayContent role={resolvedRole} navContext={navContext ?? undefined}>
            {children}
          </BaseballFairwayContent>
        </PeekPanelProvider>
      </SessionActivityProvider>
    </SidebarProvider>
  );
}
