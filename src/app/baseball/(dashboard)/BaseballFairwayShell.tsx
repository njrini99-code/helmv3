'use client';

/**
 * ============================================================================
 * BaseballFairwayShell — the ONE dashboard frame for BaseballHelm
 * ----------------------------------------------------------------------------
 * Mounted unconditionally by the generic `/baseball/(dashboard)` and
 * `/baseball/player` route-group layouts (Coherence Ruling 1, 2026-07-08 —
 * see docs/baseball/COHERENCE_RULING_2026-07-08.md). Mirrors GolfHelm's
 * `FairwayDashboardShell` playbook: renders the shared Fairway `<AppShell>` —
 * the warm-black recessive rail on desktop, a 4-tab bottom bar + More sheet
 * on mobile (M1, 2026-07-10 — docs/MOBILE_DOCTRINE.md Rule 6/10; the old
 * hamburger → slide-in drawer is retired), the one glass top bar.
 *
 * PRESENTATION ONLY. No server actions, no RLS, no new reads beyond what the
 * existing baseball auth/nav hooks already resolve:
 *   - useBaseballAuth(requiredRole) — the SAME session/onboarding gate every
 *     mounted route group uses.
 *   - useBaseballNavContext()      — the SAME server-resolved capability map
 *     (nav-context.ts), so capability-gated verticals never fail-closed here.
 *   - getVisibleBaseballNav()      — the #383 capability-gated nav-registry
 *     single source of truth (nav-registry.ts). NavSections are built from
 *     this, never a hardcoded route list, so this shell can't drift from (or
 *     duplicate) what MobileBottomNav / CommandPalette already read.
 *
 * PROVIDER STACK: SidebarProvider > SessionActivityProvider > LastSeenUpdater
 * > PeekPanelProvider — the same nesting the legacy `BaseballShellLayout` /
 * `BaseballDashboardShell` composition used before it was deleted (Ruling 1 /
 * Ruling 5). This file is the sole surviving shell for BaseballHelm.
 *

 * The AppShell sheet (`mobileOpen`) is BRIDGED to the SAME SidebarContext
 * every legacy baseball page's own menu button already calls `setMobileOpen`
 * against, so a not-yet-migrated page opens the SAME More sheet. One nav
 * surface, no dead buttons, no double overflow surfaces.
 * ========================================================================== */

import { useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AppShell, FairwayBottomNav, MoreSheetFooter, useSidebarCollapsed } from '@/components/fairway/app-shell';
import { selectOverflow, summarizeMoreTab } from '@/components/fairway/app-shell/more-nav';
import type { NavItem, NavSection, ShellLinkComponent } from '@/components/fairway/app-shell';

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
import { getBaseballBottomNavKeys } from '@/lib/baseball/bottom-nav';
import {
  COACH_HUB_ORDER,
  COACH_HUB_DEFS,
  HUB_ICONS,
  HUB_LANDING,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_HUB_ROW_IDS,
  PLAYER_RAIL_PRIMARY_IDS,
  PLAYER_RAIL_SECONDARY_IDS,
  PLAYER_RECRUITING_TABS,
  PLAYER_STATS_TABS,
  PLAYER_TEAM_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import {
  filterHubTabsByCapabilities,
  filterHubTabsByProgramType,
  resolveActiveHub,
  RECRUITING_PROGRAM_TYPES,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
import { HubSubNav } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';
import type { HubSubNavTab } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';
import {
  BreadcrumbLabelProvider,
  useBreadcrumbLabel,
} from '@/app/baseball/(dashboard)/_components/breadcrumb-label';
import { buildBreadcrumbs } from '@/app/baseball/(dashboard)/_components/breadcrumbs';
import { IconSettings, IconLogout, IconHome, IconUsers, IconCalendar, IconArrowLeft } from '@/components/icons';
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
 * M1 (baseball-nav-4): bottom-tab-only label shortening — the rail's full
 * label doesn't fit the bottom bar's narrow per-tab column (`FairwayBottomNav`'s
 * `truncate`). Keyed by `navKey` (NOT raw label text) so it can target ONE
 * destination precisely — e.g. the showcase org-scope "Dashboard" row and the
 * regular coach "Dashboard" hub row share the literal label "Dashboard" but
 * resolve to different navKeys ('organization' vs 'dashboard'), and only the
 * navKey-keyed map can tell them apart without ever touching the desktop
 * rail's label (which reads `sections` directly, never this map).
 */
const BOTTOM_NAV_LABEL_OVERRIDES: Partial<Record<string, string>> = {
  'stats-performance': 'Stats',
  dashboard: 'Home',
  organization: 'Org',
};

/** Display-only relabel for the bottom bar — the desktop rail keeps the full
 *  label (a NEW object here, never mutating the shared NavItem the rail also
 *  renders). exposureNoun-driven labels (Recruiting/Transfer Exposure/College
 *  Interest/Exposure) are intentionally NOT overridden here — they stay their
 *  mode word and truncate to the column via CSS (`FairwayBottomNav`'s
 *  `truncate` class), never a second hand-maintained shortening map. */
function relabelForBottomNav(item: NavItem): NavItem {
  const short = item.navKey ? BOTTOM_NAV_LABEL_OVERRIDES[item.navKey] : undefined;
  return short ? { ...item, label: short } : item;
}

/**
 * Showcase org-level home route — the destination for BOTH the org rail's own
 * "Dashboard" row (buildShowcaseOrgSections) and the team rail's "Back to
 * Organization" row (buildShowcaseTeamSections). Shared so the team-store
 * intercept in the `shellLink` adapter (BaseballFairwayContent) matches
 * exactly one route.
 */
const SHOWCASE_ORG_HOME_HREF = '/baseball/dashboard/organization';

/** Segment-boundary route match — shared by rail items and hub cluster rows. */
function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * M1 (baseball-nav-4): a loose `id: string` (not `Pick<BaseballNavEntry, 'id'>`)
 * so BASEBALL_MESSAGES_NAV — whose `id: 'messages'` is NOT a member of the
 * BaseballNavId union — still structurally satisfies this shape. Both
 * BaseballNavEntry and BASEBALL_MESSAGES_NAV already have narrower literal
 * `id` types, which are assignable to `string`.
 */
function toNavItem(
  entry: { id: string; href: string; label: string; icon: BaseballNavEntry['icon'] },
  badge?: number,
  matchPrefixes: readonly string[] = [],
): NavItem {
  return {
    label: entry.label,
    href: entry.href,
    icon: entry.icon as unknown as NavItem['icon'],
    badge,
    // M1: the join key bottom-nav.ts's getBaseballBottomNavKeys resolves
    // against — the registry/messages id doubles as the bottom-nav key for
    // every entry built via this helper.
    navKey: entry.id,
    activeMatch: (pathname) =>
      matchesRoutePrefix(pathname, entry.href) ||
      matchPrefixes.some((prefix) => matchesRoutePrefix(pathname, prefix)),
  };
}

function playerHubToNavItem({
  label,
  href,
  icon,
  tabs,
  badge,
  navKey,
}: {
  label: string;
  href: string;
  icon: NavItem['icon'];
  tabs?: readonly HubSubNavTab[];
  badge?: number;
  /** M1: the bottom-nav join key (a BaseballNavHub id or PLAYER_HUB_ROW_IDS
   *  value) — this helper builds synthetic hub-landing rows that have no
   *  underlying registry entry, so the key must be passed explicitly. */
  navKey?: string;
}): NavItem {
  return {
    label,
    href,
    icon,
    badge,
    navKey,
    activeMatch: (pathname) =>
      matchesRoutePrefix(pathname, href) ||
      Boolean(
        tabs?.some(
          (tab) =>
            matchesRoutePrefix(pathname, tab.href) ||
            tab.matchPrefixes?.some((prefix) => matchesRoutePrefix(pathname, prefix)),
        ),
      ),
  };
}

/**
 * Owner directive (wave W3, 2026-07-09): the player rail caps at ~8
 * destinations. Settings used to be a 9th row inside the secondary "More"
 * section; it now lives in the shell's pinned rail FOOTER (ShellFooter,
 * below) instead — matching the coach shell, which has always kept Settings
 * out of the hub rail and pinned at the bottom. This function only supplies
 * the RENDERABLE bits (icon component, live href, badge) for each row;
 * hub-definitions.ts's PLAYER_RAIL_PRIMARY_IDS / PLAYER_RAIL_SECONDARY_IDS is
 * the single source of truth for the rail's SHAPE (which ids, which section,
 * what order) — nav-player-rail.test.ts pins that shape without importing
 * this 'use client' module.
 */
function buildPlayerNavSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const visible = getVisibleBaseballNav(ctx);
  const byId = new Map(visible.map((entry) => [entry.id, entry]));
  const today = byId.get('player-today');
  const schedule = byId.get('calendar');
  const profile = byId.get('player-profile');

  const itemsById = new Map<string, NavItem>();
  if (today) itemsById.set(today.id, toNavItem(today));
  if (schedule) itemsById.set(schedule.id, toNavItem(schedule));
  if (profile) itemsById.set(profile.id, toNavItem(profile));
  itemsById.set(
    PLAYER_HUB_ROW_IDS.stats,
    playerHubToNavItem({
      label: 'Stats',
      href: HUB_LANDING.playerStats,
      icon: HUB_ICONS.stats as unknown as NavItem['icon'],
      tabs: PLAYER_STATS_TABS,
      navKey: PLAYER_HUB_ROW_IDS.stats,
    }),
  );
  itemsById.set(
    PLAYER_HUB_ROW_IDS.development,
    playerHubToNavItem({
      label: 'Development',
      href: HUB_LANDING.playerDevelopment,
      icon: HUB_ICONS.development as unknown as NavItem['icon'],
      tabs: PLAYER_DEVELOPMENT_TABS,
      navKey: PLAYER_HUB_ROW_IDS.development,
    }),
  );
  itemsById.set(
    PLAYER_HUB_ROW_IDS.team,
    playerHubToNavItem({
      label: 'Team',
      href: HUB_LANDING.playerTeam,
      icon: HUB_ICONS.team as unknown as NavItem['icon'],
      tabs: PLAYER_TEAM_TABS,
      navKey: PLAYER_HUB_ROW_IDS.team,
    }),
  );
  itemsById.set(
    BASEBALL_MESSAGES_NAV.id,
    toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined, [BASEBALL_MESSAGES_NAV.href]),
  );
  itemsById.set(
    PLAYER_HUB_ROW_IDS.recruiting,
    playerHubToNavItem({
      label: getBaseballTerminology(ctx).exposureNoun,
      href: HUB_LANDING.playerRecruiting,
      icon: HUB_ICONS.recruiting as unknown as NavItem['icon'],
      tabs: PLAYER_RECRUITING_TABS,
      navKey: PLAYER_HUB_ROW_IDS.recruiting,
    }),
  );

  const primary = PLAYER_RAIL_PRIMARY_IDS.map((id) => itemsById.get(id)).filter(
    (item): item is NavItem => Boolean(item),
  );
  const secondary = PLAYER_RAIL_SECONDARY_IDS.map((id) => itemsById.get(id)).filter(
    (item): item is NavItem => Boolean(item),
  );

  const sections: NavSection[] = [{ heading: 'My Baseball', items: primary }];
  if (secondary.length) sections.push({ heading: 'More', items: secondary });
  return sections;
}

function buildCoachHubSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const items: NavItem[] = [];

  for (const hubId of COACH_HUB_ORDER) {
    const def = COACH_HUB_DEFS[hubId];

    // Recruiting is mode-gated — same gate resolveActiveHub.ts's coachHubs()
    // uses — checked up front so a recruiting-ineligible program type never
    // shows the hub. Academics is capability/module gated instead, so it is
    // handled by the tab filters and server route guard rather than hard-coded
    // to one program type here.
    if (hubId === 'recruiting' && !(ctx.programType && RECRUITING_PROGRAM_TYPES.has(ctx.programType))) {
      continue;
    }

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
        // Messages is now a real hub (Ruling 2: Messages · Announcements) —
        // the unread badge is the one piece of state that stays outside the
        // registry-derived tab list, so it's threaded in here by hub id.
        badge: hubId === 'messages' && unreadCount > 0 ? unreadCount : undefined,
        // M1: the bottom-nav join key — every coach/both registry entry's hub
        // IS the differentiator id program-type-variants.ts's
        // `coachBottomNavHubs` names, so the hub id doubles as the navKey.
        navKey: hubId,
      }),
    );
  }

  return [{ heading: 'Baseball', items }];
}

/**
 * The Messages hub rail item (Ruling 2: a real hub with an Announcements
 * subtab, not a bare flat link) — shared by the showcase org/team rails below
 * so a showcase coach's Messages click ALSO opens the sub-nav strip, exactly
 * like the main coach rail's (`buildCoachHubSections`) Messages entry.
 */
function messagesNavItem(unreadCount: number): NavItem {
  return playerHubToNavItem({
    label: COACH_HUB_DEFS.messages.label,
    href: COACH_HUB_DEFS.messages.tabs[0]!.href,
    icon: COACH_HUB_DEFS.messages.icon as unknown as NavItem['icon'],
    tabs: COACH_HUB_DEFS.messages.tabs,
    badge: unreadCount > 0 ? unreadCount : undefined,
    navKey: BASEBALL_MESSAGES_NAV.id,
  });
}

/**
 * Showcase ORG-level rail (no team selected yet) — the documented two-level
 * org→team exception (COACH_NAV_8TAB_PROPOSAL.md): org-wide Dashboard/Teams/
 * Events, mirroring src/components/layout/sidebar.tsx's `showcaseOrgNav`
 * exactly (same routes/icons/order), plus the persistent Messages hub.
 */
function buildShowcaseOrgSections(unreadCount: number): NavSection[] {
  return [
    {
      heading: 'Organization',
      items: [
        // M1 navKeys mirror the org bottom-nav bar's SHOWCASE_ORG_KEYS
        // (bottom-nav.ts): 'organization' | 'teams' | 'events' | 'messages'.
        { label: 'Dashboard', href: SHOWCASE_ORG_HOME_HREF, icon: IconHome, navKey: 'organization' },
        { label: 'Teams', href: '/baseball/dashboard/teams', icon: IconUsers, navKey: 'teams' },
        { label: 'Events', href: '/baseball/dashboard/events', icon: IconCalendar, navKey: 'events' },
        messagesNavItem(unreadCount),
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
 *
 * The FIRST row is always "Back to Organization" — without it a showcase
 * coach who lands in team scope (auto-selected on mount by the team store)
 * has no control anywhere to clear the selection and return to the org-level
 * rail (Organization/Teams/Events). The row's href is intercepted by the
 * `shellLink` adapter in BaseballFairwayContent, which clears the store's
 * selectedTeamId before navigating.
 */
function buildShowcaseTeamSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const items: NavItem[] = [
    // M1: deliberately NO navKey — excludes this row from bottomNavKeys
    // resolution by construction (getBaseballBottomNavKeys never returns a
    // 'back to org' key), so it can only ever surface in the rail / More
    // sheet, never the bottom bar. See bottom-nav.ts's team-scope branch.
    { label: 'Back to Organization', href: SHOWCASE_ORG_HOME_HREF, icon: IconArrowLeft },
  ];
  const dashboardTabs = filterHubTabsByCapabilities(COACH_HUB_DEFS.dashboard.tabs, 'coach', ctx.capabilities);
  if (dashboardTabs.length) {
    items.push(
      playerHubToNavItem({
        label: COACH_HUB_DEFS.dashboard.label,
        href: dashboardTabs[0]!.href,
        icon: COACH_HUB_DEFS.dashboard.icon as unknown as NavItem['icon'],
        tabs: dashboardTabs,
        navKey: 'dashboard',
      }),
    );
    items.push(messagesNavItem(unreadCount));
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
        navKey: hubId,
      }),
    );
  }
  return [{ heading: 'Baseball', items }];
}

// buildBreadcrumbs lives in ./_components/breadcrumbs.ts — a pure module
// (no React/hooks) so it can be unit-tested without importing this whole
// 'use client' shell file. See its doc comment for the UUID/numeric-id
// guard + override-label precedence (Ruling 4).

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

/**
 * Pinned rail footer — Settings + Sign out, styled for the warm-black rail.
 *
 * Wave W3 (2026-07-09): Settings now renders here for BOTH roles. Coaches
 * always had it here; players previously reached Settings via a row inside
 * the secondary "More" nav section, which pushed the player rail to 9
 * destinations (owner directive: ~8). Moving it into this pinned footer —
 * exactly where the coach shell already puts it — drops the player rail back
 * to 8 without changing the Settings ROUTE or any of its behavior; only where
 * the link lives changed. See buildPlayerNavSections' doc comment and
 * hub-definitions.ts's PLAYER_RAIL_PRIMARY_IDS / PLAYER_RAIL_SECONDARY_IDS.
 */
const BASEBALL_SETTINGS_HREF = '/baseball/dashboard/settings';

/**
 * Shared sign-out side effect (`useAuth().signOut()` + redirect) — used by
 * BOTH the rail's dark `ShellFooter` and the More sheet's light
 * `BaseballMoreSheetFooter` (M1) so the two footers never hand-maintain two
 * copies of the same effectful call.
 */
function useBaseballSignOut() {
  const router = useRouter();
  const { signOut } = useAuth();

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/baseball/login');
  }, [signOut, router]);

  return { handleSignOut };
}

export function ShellFooter() {
  const pathname = usePathname();
  const { handleSignOut } = useBaseballSignOut();
  const collapsed = useSidebarCollapsed();
  const settingsHref = BASEBALL_SETTINGS_HREF;
  const settingsActive = pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);

  const rowBase = cn(
    'flex w-full items-center rounded-fw-md text-body-sm font-medium font-fw-sans tracking-[-0.005em]',
    'transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none',
    collapsed ? 'justify-center px-2 py-2.5 min-h-11' : 'gap-3 px-3.5 py-2.5',
  );

  return (
    <div className="flex flex-col gap-1">
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
      <Button
        type="button"
        variant="ghost"
        onClick={handleSignOut}
        aria-label={collapsed ? 'Sign out' : undefined}
        title={collapsed ? 'Sign out' : undefined}
        className={cn(rowBase, 'min-h-0 p-0 justify-start rounded-none text-nav-text-dim hover:bg-destructive/10 hover:text-destructive')}
      >
        <IconLogout size={18} aria-hidden className="flex-shrink-0 text-nav-text-dim" />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">Sign out</span>}
      </Button>
    </div>
  );
}

/**
 * M1: the More sheet's light-themed footer (Settings + Sign out row) — NOT
 * the rail's dark `ShellFooter` above (that JSX is built for the black rail
 * and reads wrong on the sheet's warm-cream `bg-elevated` body). Reuses the
 * SAME sign-out side effect via `useBaseballSignOut`. Takes `linkComponent`
 * as a prop (rather than hardcoding one) because the caller's `shellLink`
 * adapter is a per-render value (it closes over the showcase team-store
 * reset), not a module-scope constant.
 */
function BaseballMoreSheetFooter({ linkComponent }: { linkComponent?: ShellLinkComponent }) {
  const pathname = usePathname();
  const { handleSignOut } = useBaseballSignOut();
  const settingsActive = pathname === BASEBALL_SETTINGS_HREF || pathname.startsWith(`${BASEBALL_SETTINGS_HREF}/`);

  return (
    <MoreSheetFooter
      settingsHref={BASEBALL_SETTINGS_HREF}
      settingsActive={settingsActive}
      onSignOut={handleSignOut}
      linkComponent={linkComponent}
    />
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
  const { selectedTeam, setSelectedTeamId } = role === 'coach' ? coachTeams : playerTeams;

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
  // Real record name a dynamic detail page has already fetched (player name,
  // opponent, plan title, …), registered via the breadcrumb-label override
  // channel — see breadcrumb-label.tsx and buildBreadcrumbs' doc comment.
  const breadcrumbOverride = useBreadcrumbLabel(pathname);
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(pathname, ctx, homeHref, breadcrumbOverride),
    [pathname, ctx, homeHref, breadcrumbOverride],
  );
  // M1 (condensing-header, Decision 7): memoized so identity is stable
  // across unrelated re-renders — feeds `subNav` below, which is itself
  // memoized to keep AppShell's `subNav` prop element-stable.
  const activeHub = useMemo(
    () => resolveActiveHub({ pathname, role, programType: ctx.programType ?? null, capabilities: ctx.capabilities }),
    [pathname, role, ctx],
  );
  // M1 (baseball-nav-4, docs/MOBILE_DOCTRINE.md Rule 10): the persistent
  // mobile bottom-tab bar is the role's actual daily loop — 4 registry-driven
  // destinations, never a hardcoded label array. showcaseScope mirrors the
  // exact org/team split `sections` already branches on above.
  const showcaseScope: 'org' | 'team' | null = isShowcaseCoach ? (selectedTeam ? 'team' : 'org') : null;
  const bottomNavKeys = useMemo(
    () => getBaseballBottomNavKeys({ role, programType: ctx.programType ?? null, showcaseScope }),
    [role, ctx.programType, showcaseScope],
  );
  const flatNavItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const bottomNavItems = useMemo(() => {
    const byNavKey = new Map(flatNavItems.map((item) => [item.navKey, item] as const));
    return bottomNavKeys
      .map((key) => byNavKey.get(key))
      .filter((item): item is NavItem => Boolean(item))
      .map(relabelForBottomNav);
  }, [flatNavItems, bottomNavKeys]);

  // M1 (more-sheet-nav, docs/MOBILE_DOCTRINE.md Rule 6/10): the More sheet's
  // content is the FULL rail `sections` (original labels, not the shortened
  // bottom-nav-only relabeling) minus the 4 bottom-nav hrefs (`selectOverflow`
  // — hrefs survive `relabelForBottomNav`, only labels change), and the
  // bottom bar's 5th "More" column derives its active/badge state from that
  // same overflow (`summarizeMoreTab`) — never a second hand-maintained list.
  const bottomNavHrefs = useMemo(() => bottomNavItems.map((item) => item.href), [bottomNavItems]);
  const overflow = useMemo(() => selectOverflow(sections, bottomNavHrefs), [sections, bottomNavHrefs]);
  const more = useMemo(() => summarizeMoreTab(overflow, pathname), [overflow, pathname]);
  const openMoreSheet = useCallback(() => setMobileOpen(true), [setMobileOpen]);

  // M1 (condensing-header): the sub-nav is now part of AppShell's ONE sticky
  // chrome unit (its own `subNav` prop), not a first child inside
  // `{children}` — memoized (Decision 7) so it only changes identity when
  // the active hub actually changes. Renders at EVERY breakpoint — its own
  // `overflow-x-auto` row (hub-sub-nav.tsx) IS the mobile treatment, not a
  // desktop-only affordance; `md:top-16` clears the desktop top bar.
  const subNav = useMemo(
    () =>
      activeHub ? (
        <HubSubNav key={activeHub.id} tabs={activeHub.tabs} ariaLabel={activeHub.ariaLabel} className="md:top-16" />
      ) : null,
    [activeHub],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  const name = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const avatarUrl = coach?.avatar_url || player?.avatar_url || undefined;
  const teamName = selectedTeam?.name || coach?.organization?.name;
  // Stable identity across pathname-only re-renders (perf packet
  // [shell-render-hygiene]) — was a fresh object literal every render,
  // defeating FairwaySidebar's React.memo (it reads `user` from AppShell).
  const shellUser = useMemo(
    () => ({ name, teamName: teamName ?? undefined, avatarUrl: avatarUrl ?? undefined }),
    [name, teamName, avatarUrl],
  );

  // Same packet, element props: inline JSX literals are fresh objects every
  // render, so passing them straight into AppShell defeats the React.memo on
  // FairwaySidebar/FairwayTopBar (which receive them verbatim) — and AppShell's
  // own sidebarProps useMemo, which lists `brand` as a dependency.
  const brand = useMemo(() => <Brand homeHref={homeHref} />, [homeHref]);
  const sidebarFooter = useMemo(() => <ShellFooter />, []);
  const topBarActions = useMemo(() => <NotificationBell />, []);

  // Imperative open (mirrors GolfHelm's FairwayDashboardShell): the shell's
  // own ⌘K entry point dispatches the same global event CommandPalette listens
  // for, rather than synthesizing a keystroke.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event('helm:open-command-palette'));
  }, []);

  // Showcase-aware <Link> adapter: the AppShell nav model (NavItem) has no
  // per-row onClick, so the "Back to Organization" row built by
  // buildShowcaseTeamSections can only signal the team-store reset through
  // its href. This intercepts clicks on that one route and clears
  // selectedTeamId before/alongside the normal navigation — a no-op for every
  // other row (college/HS/JUCO nav never uses this href) and a no-op if the
  // org rail's own "Dashboard" row (same href) is clicked while already
  // org-scoped.
  const shellLink: ShellLinkComponent = useCallback(
    ({ href, children, onClick, ...rest }) => (
      <Link
        href={href}
        prefetch
        onClick={
          isShowcaseCoach && href === SHOWCASE_ORG_HOME_HREF
            ? () => {
                setSelectedTeamId(null);
                onClick?.();
              }
            : onClick
        }
        {...rest}
      >
        {children}
      </Link>
    ),
    [isShowcaseCoach, setSelectedTeamId],
  );

  // M1: the More sheet's footer, threading the SAME showcase-aware `shellLink`
  // adapter through so its Settings row gets prefetch/client-side navigation
  // exactly like every other row in the sheet.
  const moreSheetFooter = useMemo(() => <BaseballMoreSheetFooter linkComponent={shellLink} />, [shellLink]);

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
        user={shellUser}
        brand={brand}
        sidebarFooter={sidebarFooter}
        topBarActions={topBarActions}
        pathname={pathname}
        linkComponent={shellLink}
        breadcrumbs={breadcrumbs}
        collapsible
        // The dashboard route `template.tsx` already owns the route-reveal
        // fade (one keyed motion div). Disabling the shell's own
        // RouteTransition here prevents BOTH from fading on navigation —
        // that compounded the opacity and read as a heavy, laggy
        // double-fade. One fade, one source of truth (mirrors golf's
        // FairwayDashboardShell.tsx).
        disableRouteTransition
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onSearchOpen={openCommandPalette}
        searchPlaceholder="Search players, teams, pages…"
        // The hub sub-nav strip renders as part of AppShell's ONE sticky
        // chrome unit; `pageTitle` is the name the bar shows on phone. Inside
        // a multi-tab hub that is the HUB label, not the crumb leaf — the
        // strip directly below already names the leaf on its active tab, so
        // the leaf would just be printed twice, one line apart. Baseball
        // mastheads (SectionMasthead) are server components and never register
        // a title, so this is what feeds the bar on every baseball route.
        subNav={subNav}
        pageTitle={activeHub?.label ?? breadcrumbs.at(-1)?.label}
        // M1: the More sheet's identity row links here; its footer is the
        // light-themed Settings + Sign out row (moreSheetFooter, below).
        settingsHref={BASEBALL_SETTINGS_HREF}
        bottomNavHrefs={bottomNavHrefs}
        moreSheetFooter={moreSheetFooter}
        // Verifier fix: vaul portals the More sheet's `Drawer.Content` to
        // `document.body` — outside the `.living-annual` wrapper's DOM
        // subtree above, even though it's still a React child of it. CSS
        // custom properties inherit by DOM ancestry, not the React tree, so
        // without this the sheet would fall back to golf's default cream
        // tokens. Applying the scope class directly to the sheet's own
        // portaled node (via AppShell → MoreNavSheet → Sheet's className)
        // restores baseball's deeper "living annual" cream.
        sheetClassName="living-annual"
        // P413-equivalent: persistent mobile bottom-tab bar for the core
        // destinations (md:hidden; the 5th "More" column opens the sheet,
        // which keeps the long tail — see docs/MOBILE_DOCTRINE.md Rule 6/10).
        bottomNav={
          <FairwayBottomNav
            items={bottomNavItems}
            pathname={pathname}
            linkComponent={shellLink}
            onMoreOpen={openMoreSheet}
            moreActive={more.active}
            moreBadge={more.badge}
            moreOpen={mobileOpen}
          />
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

      {/* The one global CommandPalette mount for the whole shell. */}
      <CommandPalette navContext={ctx} />
    </div>
  );
}

/**
 * Exported shell — auth gate + provider stack + shell, rendering the Fairway
 * AppShell frame. The only shell BaseballHelm renders.
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
  // Session/onboarding gate for the mounted route group.
  const { loading, authorized, role } = useBaseballAuth(requiredRole);
  // Server-resolved capability map (nav-context.ts) driving the nav sections.
  const { navContext } = useBaseballNavContext();

  if (!authVerified && (loading || !authorized)) {
    return <PageLoading />;
  }

  const resolvedRole: Role = requiredRole ?? navContext?.role ?? role ?? 'coach';

  return (
    <SidebarProvider>
      <SessionActivityProvider>
        <LastSeenUpdater />
        {/* Render-null: fetches the program's brand + applies it as CSS vars /
            data attrs on <html> so persisted branding (settings/appearance)
            actually takes visible effect. */}
        <BaseballProgramBrand />
        <PeekPanelProvider>
          {/* Breadcrumb-label override channel (Ruling 4) — wraps BOTH the
              shell chrome (reader, via useBreadcrumbLabel) and `children`
              (writer, via <BreadcrumbLabel/>) in one context instance. */}
          <BreadcrumbLabelProvider>
            <BaseballFairwayContent role={resolvedRole} navContext={navContext ?? undefined}>
              {children}
            </BaseballFairwayContent>
          </BreadcrumbLabelProvider>
        </PeekPanelProvider>
      </SessionActivityProvider>
    </SidebarProvider>
  );
}
