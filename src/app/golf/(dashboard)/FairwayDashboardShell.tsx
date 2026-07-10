'use client';

/**
 * ============================================================================
 * FairwayDashboardShell  (WAVE W1 — THE ONLY DASHBOARD FRAME)
 * ----------------------------------------------------------------------------
 * The dashboard frame mounted unconditionally by (dashboard)/layout.tsx.
 * Renders the premium Fairway `AppShell` — the warm-black recessive rail on
 * desktop, a slide-in glass drawer on mobile (the hamburger), and the one
 * glass top bar. The legacy GolfDashboardShell / GolfSidebar fork it used to
 * be gated against was deleted in Wave W1 (2026-07-09).
 *
 * The AppShell drawer (`mobileOpen`) is BRIDGED to SidebarContext, so a
 * not-yet-migrated page's own menu button — which calls `setMobileOpen` — opens
 * the SAME drawer. One nav surface, no dead buttons, no double drawers.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/fairway/app-shell/AppShell';
import { useSidebarCollapsed } from '@/components/fairway/app-shell/FairwaySidebar';
import { FairwayBottomNav } from '@/components/fairway/app-shell/FairwayBottomNav';
import { FairwayHubSubNav } from '@/components/fairway/app-shell/FairwayHubSubNav';
import type { Breadcrumb, ShellLinkComponent } from '@/components/fairway/app-shell/types';
import { FAIRWAY_SCOPE } from '@/lib/redesign/flag';
import {
  buildCoachRailSections,
  buildPlayerRailSections,
  buildCoachBottomNavItems,
  buildPlayerBottomNavItems,
  resolveActiveGolfHub,
  isCoachHelmCoachCluster,
  COACHHELM_COACH_CLUSTER_PREFIXES,
  type GolfNavBadgeCounts,
} from '@/lib/golf/nav-registry';

import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { MobileNavProvider } from '@/contexts/mobile-nav-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { NotificationBadgeProvider, useNotificationBadges } from '@/contexts/notification-badge-context';
import { OfflineProvider } from '@/components/golf/OfflineProvider';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { DemoEnterTracker } from '@/components/demo/DemoEnterTracker';
import { NoTeamBanner } from '@/components/golf/NoTeamBanner';
import { KeyboardShortcutHint } from '@/components/golf/KeyboardShortcutHint';
import { TeamSwitcher } from '@/components/golf/TeamSwitcher';
import { normalizeTeamGender, teamAccentVar, type TeamGender } from '@/lib/golf/team-theme';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { usePresence } from '@/hooks/use-presence';
import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { cn } from '@/lib/utils';
import { IconSettings, IconLogout } from '@/components/icons';

// PERF: lazy-load the same heavy globals GolfDashboardShell mounts.
const CommandPalette = dynamic(
  () => import('@/components/golf/CommandPalette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);
const NewAnnouncementsModalWrapper = dynamic(
  () =>
    import('@/components/golf/announcements/NewAnnouncementsModalWrapper').then((m) => ({
      default: m.NewAnnouncementsModalWrapper,
    })),
  { ssr: false },
);
const PushPermissionSoftAsk = dynamic(
  () => import('@/components/golf/PushPermissionSoftAsk').then((m) => ({ default: m.PushPermissionSoftAsk })),
  { ssr: false },
);

type Role = 'coach' | 'player';

/** First dashboard segments that belong to the CoachHelm cluster (breadcrumb).
 *  DERIVED from `COACHHELM_COACH_CLUSTER_PREFIXES` — the single source of
 *  truth in src/lib/golf/nav-registry.ts (also feeds isCoachHelmCoachCluster
 *  and the rail/bottom-nav activeMatch) — so this breadcrumb segment set can
 *  never drift from what the rail highlights or CoachHelmSubNav renders as
 *  tabs (P410: `/golf/dashboard/players` previously highlighted the rail but
 *  showed a bare "Dashboard / Players" breadcrumb because this set was a
 *  hand-maintained duplicate that omitted it). */
const COACHHELM_CLUSTER_SEGMENTS = new Set(
  COACHHELM_COACH_CLUSTER_PREFIXES.map(
    (prefix) => prefix.replace(/^\/golf\/dashboard\//, '').split('/')[0],
  ),
);

/** Top-bar breadcrumb labels for the first dashboard segment (desktop only). */
const SEGMENT_LABELS: Record<string, string> = {
  intelligence: 'CoachHelm AI',
  coachhelm: 'CoachHelm AI',
  roster: 'Roster',
  rounds: 'Rounds',
  calendar: 'Calendar',
  stats: 'Stats',
  messages: 'Messages',
  announcements: 'Announcements',
  travel: 'Travel',
  documents: 'Documents',
  tasks: 'Tasks',
  courses: 'Courses',
  recruiting: 'Recruiting HQ',
  development: 'Development',
  qualifiers: 'Qualifiers',
  'my-development': 'My Development',
  'my-qualifiers': 'My Qualifiers',
  'team-hub': 'Team Hub',
  settings: 'Settings',
  insights: 'Insights',
  alerts: 'Alerts',
  patterns: 'Patterns',
  analytics: 'Analytics',
  players: 'Players',
  classes: 'Classes',
  hub: 'Hub',
  team: 'Team Info',
  'whats-new': "What's New",
  'my-game-profile': 'My Game',
  'my-standing': 'My Standing',
};

function toTitle(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Within the CoachHelm cluster, the leaf-tab label the masthead sub-nav shows
 *  (so the top-bar breadcrumb agrees with it instead of disagreeing). */
const COACHHELM_TAB_LABELS: Record<string, string> = {
  intelligence: 'Brief',
  alerts: 'Signals',
  insights: 'Signals',
  patterns: 'Signals',
  development: 'Players',
  analytics: 'Effectiveness', // /analytics/coachhelm
  coachhelm: 'Ask', // /coachhelm/chat, /coachhelm/genome
};

/** Pathname → breadcrumb trail. Two levels normally (Dashboard / Section); for
 *  the CoachHelm cluster, three (Dashboard / CoachHelm AI / Tab) so the top-bar
 *  breadcrumb agrees with the CoachHelm masthead + sub-nav instead of showing a
 *  competing trail for the same screen (P409). */
function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const rest = pathname.replace(/^\/golf\/dashboard\/?/, '');
  if (!rest) return [{ label: 'Dashboard' }];
  const seg = rest.split('/')[0] ?? '';

  // CoachHelm cluster → reconcile with the masthead's "CoachHelm AI / <Tab>".
  if (COACHHELM_CLUSTER_SEGMENTS.has(seg) && isCoachHelmCoachCluster(pathname)) {
    const tabLabel = COACHHELM_TAB_LABELS[seg] ?? SEGMENT_LABELS[seg] ?? toTitle(seg);
    return [
      { label: 'Dashboard', href: '/golf/dashboard' },
      { label: 'CoachHelm AI', href: '/golf/dashboard/intelligence' },
      { label: tabLabel },
    ];
  }

  const label = SEGMENT_LABELS[seg] ?? toTitle(seg);
  return [{ label: 'Dashboard', href: '/golf/dashboard' }, { label }];
}

/** Next <Link> adapter for the shell's link contract (module scope = stable identity). */
const ShellLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <Link href={href} prefetch {...rest}>
    {children}
  </Link>
);

/**
 * GolfHelm brand for the rail header. Reads collapsed state from
 * SidebarCollapseContext so it can hide the wordmark in icon-only mode.
 */
function Brand() {
  const collapsed = useSidebarCollapsed();
  return (
    <Link
      href="/golf/dashboard"
      prefetch
      aria-label="GolfHelm home"
      className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-2.5')}
    >
      <Image
        src="/helm-golf-logo-transparent.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 flex-shrink-0 object-contain"
        priority
        unoptimized
      />
      {!collapsed && (
        <span className="font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em] text-nav-text">
          Golf<span className="text-nav-accent">Helm</span>
        </span>
      )}
    </Link>
  );
}

/** Pinned rail footer — Settings + Sign out, styled for the warm-black rail.
 * Reads collapsed state from SidebarCollapseContext to render icon-only when
 * the rail is collapsed. */
function ShellFooter() {
  const router = useRouter();
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const collapsed = useSidebarCollapsed();
  const settingsActive = pathname.startsWith('/golf/dashboard/settings');

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return; // guard double-tap (legacy shell guarded this too)
    setIsSigningOut(true);
    void triggerHaptic('heavy');
    const supabase = createClient();
    await clearActiveTeam();
    await supabase.auth.signOut();
    router.push('/golf/login');
  }, [router, isSigningOut]);

  const rowBase = cn(
    'flex w-full items-center rounded-fw-md text-body-sm font-medium font-fw-sans tracking-[-0.005em]',
    'transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none',
    collapsed ? 'justify-center px-2 py-2.5 min-h-11' : 'gap-3 px-3.5 py-2.5',
  );

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/golf/dashboard/settings"
        prefetch
        onClick={() => setMobileOpen(false)}
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
      <Button variant="ghost"
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        aria-label={collapsed ? (isSigningOut ? 'Signing out…' : 'Sign out') : undefined}
        title={collapsed ? 'Sign out' : undefined}
        className={cn(rowBase, 'text-nav-text-dim hover:bg-fw-danger/10 hover:text-fw-danger disabled:opacity-50')}
      >
        <IconLogout size={18} aria-hidden className="flex-shrink-0 text-nav-text-dim" />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-left">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
        )}
      </Button>
    </div>
  );
}

function FairwayDashboardContent({
  children,
  userData,
}: {
  children: React.ReactNode;
  userData: GolfUserData;
}) {
  const pathname = usePathname();
  const badges = useNotificationBadges();
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { displayDensity, showAnimations } = useAppearancePreferences();
  const role: Role = userData.role === 'coach' ? 'coach' : 'player';

  // TeamSwitcher (program heads only): renders in the glass top bar's action
  // cluster — desktop AND mobile — when the coach is a multi-team head coach.
  const coachTeams = useMemo(() => userData.coachTeams ?? [], [userData.coachTeams]);
  const showSwitcher =
    role === 'coach' && !!userData.canSwitchTeams && coachTeams.length > 1 && !!userData.teamId;

  // Active team's gender → accent (men's = helm green, women's = violet). Held
  // optimistically so the shell's accent wash + top-bar underline flip the
  // instant the toggle is clicked — before the RSC refresh — then re-seed from
  // the server-resolved team once the refresh lands. Undefined (no theming) for
  // single-team coaches and players.
  const serverGender = useMemo(
    () =>
      showSwitcher
        ? normalizeTeamGender(coachTeams.find((t) => t.id === userData.teamId)?.gender)
        : null,
    [showSwitcher, coachTeams, userData.teamId],
  );
  const [optimisticGender, setOptimisticGender] = useState<TeamGender | null>(serverGender);
  useEffect(() => {
    setOptimisticGender(serverGender);
  }, [serverGender]);
  const accentColor = showSwitcher ? teamAccentVar(optimisticGender ?? serverGender) : undefined;

  // Stable element identity (perf packet [shell-render-hygiene]): a fresh JSX
  // literal every render would defeat the React.memo on FairwayTopBar, which
  // receives this verbatim as `actions`.
  const teamSwitcher = useMemo(
    () =>
      showSwitcher ? (
        <TeamSwitcher
          teams={coachTeams}
          activeTeamId={userData.teamId!}
          canSwitch
          onOptimisticSwitch={setOptimisticGender}
        />
      ) : null,
    [showSwitcher, coachTeams, userData.teamId],
  );

  // Track presence (deferred internally so it doesn't compete with page load).
  usePresence();

  // WAVE W2: 8-hub rail (see src/lib/golf/nav-registry.ts — the single source
  // of truth for both roles' rail/bottom-nav/sub-nav definitions).
  const navBadges: GolfNavBadgeCounts = useMemo(
    () => ({
      messages: badges.messages,
      coachhelm: role === 'coach' ? badges.coachhelm : 0,
      calendarNotifications: badges.calendarNotifications,
      announcements: badges.announcements,
      travel: badges.travel,
      tasks: badges.tasks,
    }),
    [role, badges.messages, badges.coachhelm, badges.calendarNotifications, badges.announcements, badges.travel, badges.tasks],
  );

  const sections = useMemo(
    () => (role === 'coach' ? buildCoachRailSections(navBadges) : buildPlayerRailSections(navBadges)),
    [role, navBadges],
  );

  // P413: mobile bottom-tab destinations (subset of the rail, badge-aware).
  const bottomNavItems = useMemo(
    () => (role === 'coach' ? buildCoachBottomNavItems(navBadges) : buildPlayerBottomNavItems()),
    [role, navBadges],
  );

  // WAVE W2: the sub-tab strip for whichever multi-tab hub owns the current
  // route (Team / Calendar / Rounds & Stats / Messages / Operations for
  // coach; Team for player). null on single-destination rail items AND on
  // the CoachHelm cluster (which renders its OWN strip per-page via
  // CoachHelmShell — see nav-registry.ts module header).
  const activeHub = useMemo(() => resolveActiveGolfHub(pathname, role), [pathname, role]);

  const openCommandPalette = useCallback(() => {
    void triggerHaptic('light');
    // WKWebView-safe imperative open (synthetic ⌘K keystrokes are unreliable
    // there); CommandPalette listens for this event additively.
    window.dispatchEvent(new Event('helm:open-command-palette'));
  }, []);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname]);

  // Stable identity across pathname-only re-renders (perf packet
  // [shell-render-hygiene]) — was a fresh object literal every render,
  // defeating FairwaySidebar's React.memo (it reads `user` from AppShell).
  const shellUser = useMemo(
    () => ({ name: userData.name, teamName: userData.teamName, avatarUrl: userData.avatarUrl }),
    [userData.name, userData.teamName, userData.avatarUrl],
  );

  // Same packet, element props: inline JSX literals are fresh objects every
  // render, so passing them straight into AppShell defeats the React.memo on
  // FairwaySidebar (which receives them verbatim) — and AppShell's own
  // sidebarProps useMemo, which lists `brand` as a dependency.
  const brand = useMemo(() => <Brand />, []);
  const sidebarFooter = useMemo(() => <ShellFooter />, []);

  // Live shot-entry flows own their full screen (their own sticky control header
  // + immersive scoring UI), so render them WITHOUT the shell chrome — the glass
  // top bar must not compete with the round controls. The page brings its own
  // `.fairway-ds` scope + bg; we only stick its control header below the notch.
  const isImmersive =
    pathname === '/golf/dashboard/rounds/new' || pathname.startsWith('/golf/dashboard/rounds/continue');

  // Immersive routes render no drawer; if the bridged drawer state is somehow
  // open, force it closed so SidebarProvider's body-scroll-lock can't soft-lock
  // the immersive screen.
  useEffect(() => {
    if (isImmersive && mobileOpen) setMobileOpen(false);
  }, [isImmersive, mobileOpen, setMobileOpen]);

  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-accent-500 text-text-on-accent px-4 py-2 rounded-fw-md font-fw-sans font-medium shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-600 focus:ring-offset-2 focus:ring-offset-canvas"
    >
      Skip to main content
    </a>
  );

  if (isImmersive) {
    return (
      <MotionConfig reducedMotion={showAnimations ? 'user' : 'always'}>
        {skipLink}
        <div
          id="main-content"
          tabIndex={-1}
          className={cn(
            FAIRWAY_SCOPE,
            'relative min-h-dvh bg-canvas outline-none',
            displayDensity === 'compact' && 'density-compact',
            !showAnimations && 'reduce-motion',
          )}
          style={{ '--golf-mobile-header-offset': 'env(safe-area-inset-top, 0px)' } as React.CSSProperties}
        >
          {children}
        </div>
        {/* ⌘K stays available; announcement/push interrupts are suppressed mid-round. */}
        <CommandPalette isCoach={role === 'coach'} />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={showAnimations ? 'user' : 'always'}>
      {skipLink}

      <AppShell
        sections={sections}
        user={shellUser}
        brand={brand}
        sidebarFooter={sidebarFooter}
        topBarActions={teamSwitcher}
        accentColor={accentColor}
        pathname={pathname}
        linkComponent={ShellLink}
        breadcrumbs={breadcrumbs}
        collapsible={true}
        // The dashboard route `template.tsx` already owns the route-reveal fade
        // (one keyed motion div). Disabling the shell's own RouteTransition here
        // prevents BOTH from fading on navigation — that compounded the opacity
        // and read as a heavy, laggy double-fade. One fade, one source of truth.
        disableRouteTransition
        // Pages own their gutters (horizontal padding + max-width) and their
        // page-title blocks, exactly as in the legacy shell whose <main> had no
        // content padding. The shell keeps only the bottom home-indicator pad.
        contentPadding={false}
        constrainContent={false}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onSearchOpen={openCommandPalette}
        searchPlaceholder="Search players, rounds, pages…"
        // P413: persistent mobile bottom-tab bar for the core destinations
        // (md:hidden; drawer keeps the long tail).
        bottomNav={
          <FairwayBottomNav items={bottomNavItems} pathname={pathname} linkComponent={ShellLink} />
        }
        className={cn(displayDensity === 'compact' && 'density-compact', !showAnimations && 'reduce-motion')}
      >
        <div id="main-content" tabIndex={-1} className="outline-none">
          <NoTeamBanner />
          {/* WAVE W2: the shared sub-tab strip for whichever multi-tab hub owns
              the current route — rendered ONCE here so every leaf route in the
              hub gets it automatically (mirrors BaseballHelm's HubSubNav /
              resolve-active-hub pattern). Absent on single-destination rail
              items and on the CoachHelm cluster (its own per-page strip). */}
          {activeHub && (
            <FairwayHubSubNav key={activeHub.id} tabs={activeHub.tabs} ariaLabel={activeHub.ariaLabel} />
          )}
          {children}
        </div>
      </AppShell>

      {/* Globals — the same set GolfDashboardShell mounts. */}
      <CommandPalette isCoach={role === 'coach'} />
      <KeyboardShortcutHint />
      <NewAnnouncementsModalWrapper />
      <PushPermissionSoftAsk />
    </MotionConfig>
  );
}

/**
 * Exported shell — wraps children in the full client-provider stack (identical
 * to GolfDashboardShell) and renders the Fairway AppShell frame inside it.
 */
export function FairwayDashboardShell({
  children,
  userData,
}: {
  children: React.ReactNode;
  userData: GolfUserData;
}) {
  return (
    <MobileNavProvider>
      <SidebarProvider>
        <SessionActivityProvider>
          <GolfUserProvider userData={userData}>
            <NotificationBadgeProvider>
              <LazyMotion features={loadFeatures}>
                <OfflineProvider showSyncStatus={false} showWarningBanner={false}>
                  <LastSeenUpdater />
                  {/* B36/F012: the demo_coach_entered PostHog event must fire in the
                      flag-ON shell too — prod demo entries land here, not on the legacy
                      GolfDashboardShell. Pure side-effect leaf (renders null). */}
                  <DemoEnterTracker />
                  <FairwayDashboardContent userData={userData}>{children}</FairwayDashboardContent>
                </OfflineProvider>
              </LazyMotion>
            </NotificationBadgeProvider>
          </GolfUserProvider>
        </SessionActivityProvider>
      </SidebarProvider>
    </MobileNavProvider>
  );
}
