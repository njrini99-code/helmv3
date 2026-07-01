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
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AppShell, useSidebarCollapsed } from '@/components/fairway/app-shell';
import type { Breadcrumb, NavItem, NavSection, ShellLinkComponent } from '@/components/fairway/app-shell';

import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { PageLoading } from '@/components/ui/loading';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { PeekPanelProvider } from '@/components/baseball/peek-panel';

import { useBaseballAuth } from '@/hooks/use-baseball-auth';
import { useBaseballNavContext } from '@/hooks/use-baseball-nav-context';
import { useAuth } from '@/hooks/use-auth';
import { useTeams } from '@/hooks/use-teams';
import { usePlayerTeams } from '@/hooks/use-player-teams';
import { useUnreadCount } from '@/hooks/use-unread-count';
import {
  getVisibleBaseballNav,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavContext,
  type BaseballNavEntry,
} from '@/lib/baseball/nav-registry';
import { IconSettings, IconLogout } from '@/components/icons';
import { cn } from '@/lib/utils';

type Role = 'coach' | 'player';

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

/**
 * Grouped rail sections derived straight from `getVisibleBaseballNav()` — the
 * SAME resolved, capability-gated list Sidebar/MobileBottomNav read (no
 * hardcoded nav array here). Messages is injected explicitly: it is
 * deliberately excluded from BASEBALL_NAV_REGISTRY (see nav-registry.ts —
 * "the one cross-cutting surface that lives OUTSIDE the feature registry"),
 * so every nav consumer must add it itself.
 */
function buildNavSections(ctx: BaseballNavContext, unreadCount: number): NavSection[] {
  const visible = getVisibleBaseballNav(ctx);
  const primary: NavItem[] = visible.filter((e) => e.section === 'primary').map((e) => toNavItem(e));
  const secondary: NavItem[] = visible.filter((e) => e.section === 'secondary').map((e) => toNavItem(e));

  primary.push(toNavItem(BASEBALL_MESSAGES_NAV, unreadCount > 0 ? unreadCount : undefined));

  const sections: NavSection[] = [
    { heading: ctx.role === 'coach' ? 'Team' : 'My Baseball', items: primary },
  ];
  if (secondary.length) sections.push({ heading: 'More', items: secondary });
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
      <button
        type="button"
        onClick={handleSignOut}
        aria-label={collapsed ? 'Sign out' : undefined}
        title={collapsed ? 'Sign out' : undefined}
        className={cn(rowBase, 'text-nav-text-dim hover:bg-red-500/10 hover:text-red-400')}
      >
        <IconLogout size={18} aria-hidden className="flex-shrink-0 text-nav-text-dim" />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">Sign out</span>}
      </button>
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

  const sections = useMemo(() => buildNavSections(ctx, unreadCount), [ctx, unreadCount]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname, ctx, homeHref), [pathname, ctx, homeHref]);

  const name = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const avatarUrl = coach?.avatar_url || player?.avatar_url || undefined;
  const teamName = selectedTeam?.name || coach?.organization?.name;

  return (
    <AppShell
      sections={sections}
      user={{ name, teamName: teamName ?? undefined, avatarUrl: avatarUrl ?? undefined }}
      brand={<Brand homeHref={homeHref} />}
      sidebarFooter={<ShellFooter role={role} />}
      pathname={pathname}
      linkComponent={ShellLink}
      breadcrumbs={breadcrumbs}
      collapsible
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
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
        <PeekPanelProvider>
          <BaseballFairwayContent role={resolvedRole} navContext={navContext ?? undefined}>
            {children}
          </BaseballFairwayContent>
        </PeekPanelProvider>
      </SessionActivityProvider>
    </SidebarProvider>
  );
}
