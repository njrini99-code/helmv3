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
 *   - useBaseballAuth(null)        — the SAME session/onboarding gate
 *     BaseballShellLayout uses for this route group.
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
 * GolfDashboardShell's stack rather than wrapping it), so the two OTHER
 * baseball shell route groups ((coach-dashboard), (player-dashboard)) are
 * completely unaffected by this migration step.
 *
 * Mounted ONLY behind isRedesignEnabled() in `(dashboard)/layout.tsx`. Flag
 * OFF renders the legacy `BaseballShellLayout` → `BaseballDashboardShell`,
 * byte-for-byte unchanged.
 *
 * The AppShell drawer (`mobileOpen`) is BRIDGED to the SAME SidebarContext
 * every legacy baseball page's own menu button already calls `setMobileOpen`
 * against, so a not-yet-migrated page opens the SAME drawer. One nav surface,
 * no dead buttons, no double drawers.
 * ========================================================================== */

import { useCallback, useMemo } from 'react';
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
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import {
  filterHubTabsByCapabilities,
  filterHubTabsByProgramType,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
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
 * P413-equivalent: the 3 highest-frequency destinations for the persistent
 * MOBILE bottom-tab bar, matching the legacy `MobileBottomNav`'s preferred ids
 * exactly (dashboard-shell.tsx's `buildMobileNavFromContext`) — the drawer
 * (opened by AppShell's own hamburger) keeps the long tail, so the 4th "Menu"
 * slot the legacy bar shows is redundant here rather than dropped.
 */
function buildBottomNavItems(ctx: BaseballNavContext, unreadCount: number): NavItem[] {
  const primary = getVisibleBaseballNav(ctx).filter((e) => e.section === 'primary');
  const preferredIds =
    ctx.role === 'coach'
      ? ['command-center', 'calendar', 'roster']
      : ['player-today', 'calendar', 'player-profile'];
  const top3 = preferredIds
    .map((id) => primary.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const fill = primary.filter((e) => !top3.some((selected) => selected.id === e.id));
  return [...top3, ...fill].slice(0, 3).map((e) =>
    toNavItem(e, e.showUnreadBadge && unreadCount > 0 ? unreadCount : undefined),
  );
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
function toNavItem(entry: Pick<BaseballNavEntry, 'href' | 'label' | 'icon'>, badge?: number): NavItem {
  return { label: entry.label, href: entry.href, icon: entry.icon as unknown as NavItem['icon'], badge };
}

/** Same structural narrowing as toNavItem, for a hub sub-tab (whose `icon` is
 *  optional in HubSubNavTab — every tab this shell renders always sets one). */
function hubTabToNavItem(tab: HubSubNavTab, badge?: number): NavItem {
  return { label: tab.label, href: tab.href, icon: tab.icon as unknown as NavItem['icon'], badge };
}

const RECRUITING_PROGRAM_TYPES = new Set<BaseballProgramType>(['college', 'juco', 'showcase', 'academy', 'club']);

/**
 * Player rail sections — UNCHANGED by the coach-nav-8tab consolidation
 * (COACH_NAV_8TAB_PROPOSAL.md is scoped to the coach nav). Derived straight
 * from `getVisibleBaseballNav()`, exactly as before.
 */
function buildPlayerNavSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const visible = getVisibleBaseballNav(ctx);
  const primary: NavItem[] = visible.filter((e) => e.section === 'primary').map((e) => toNavItem(e));
  const secondary: NavItem[] = visible.filter((e) => e.section === 'secondary').map((e) => toNavItem(e));

  primary.push(toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined));

  const sections: NavSection[] = [{ heading: 'My Baseball', items: primary }];
  if (secondary.length) sections.push({ heading: 'More', items: secondary });
  return sections;
}

/**
 * Coach rail sections — GROUPED BY `entry.hub` (COACH_HUB_ORDER / COACH_HUB_DEFS
 * in hub-definitions.ts, itself derived from BASEBALL_NAV_REGISTRY), the same
 * single source of truth src/components/layout/sidebar.tsx's
 * buildCondensedBaseballNavigation groups by. One NavSection per visible hub
 * (heading = hub label, items = the hub's capability/program-type-filtered
 * tabs) — the Fairway rail shows every tab inline (no separate landing-item +
 * sub-nav-strip split the legacy shell needs), so "hub label > sub-items" is
 * literally the section heading over its item list.
 *
 * A hub section is omitted entirely once its tabs filter down to zero (mirrors
 * resolveActiveHub's own "empty hub → no strip" precedent), so this shell and
 * the legacy sidebar can never show a dead-end top-level item for a coach
 * missing every capability a hub's members require.
 *
 * Messages is injected into the DASHBOARD section (golf-style: FairwayDashboard
 * Shell.tsx puts Messages inside its first/primary section, never a section of
 * its own) — it is deliberately excluded from BASEBALL_NAV_REGISTRY (see
 * nav-registry.ts), so every nav consumer must add it explicitly.
 */
function buildCoachHubSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const sections: NavSection[] = [];

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
    const items = visibleTabs.map((t) => hubTabToNavItem(t));

    if (hubId === 'dashboard') {
      items.push(hubTabToNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined));
    }
    if (items.length === 0) continue;

    // Recruiting reframed per mode (JUCO → "Transfer Exposure") using the SAME
    // terminology engine program-type-variants.ts already provides — never a
    // second hand-maintained label map.
    const heading = hubId === 'recruiting' ? getBaseballTerminology(ctx).exposureNoun : def.label;
    sections.push({ heading, items });
  }

  return sections;
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
        hubTabToNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined),
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
  const sections: NavSection[] = [];
  const dashboardTabs = filterHubTabsByCapabilities(COACH_HUB_DEFS.dashboard.tabs, 'coach', ctx.capabilities);
  sections.push({
    heading: COACH_HUB_DEFS.dashboard.label,
    items: [
      ...dashboardTabs.map((t) => hubTabToNavItem(t)),
      hubTabToNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined),
    ],
  });
  for (const hubId of ['team', 'stats-performance', 'development'] as const) {
    const def = COACH_HUB_DEFS[hubId];
    const capFiltered = filterHubTabsByCapabilities(def.tabs, 'coach', ctx.capabilities);
    const visibleTabs = filterHubTabsByProgramType(capFiltered, ctx.programType);
    if (visibleTabs.length === 0) continue;
    sections.push({ heading: def.label, items: visibleTabs.map((t) => hubTabToNavItem(t)) });
  }
  return sections;
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
  // P413-equivalent: persistent mobile bottom-tab bar (subset of the rail).
  const bottomNavItems = useMemo(() => buildBottomNavItems(ctx, unreadCount), [ctx, unreadCount]);

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
export function BaseballFairwayShell({ children }: { children: React.ReactNode }) {
  // SAME auth gate BaseballShellLayout uses for this route group (accepts
  // both roles; requiredRole=null).
  const { loading, authorized, role } = useBaseballAuth(null);
  // SAME server-resolved capability map (nav-context.ts) BaseballShellLayout
  // passes into BaseballDashboardShell.
  const { navContext } = useBaseballNavContext();

  if (loading || !authorized) {
    return <PageLoading />;
  }

  const resolvedRole: Role = role ?? 'coach';

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
