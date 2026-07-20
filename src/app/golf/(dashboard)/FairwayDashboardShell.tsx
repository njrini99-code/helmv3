'use client';

/**
 * ============================================================================
 * FairwayDashboardShell  (WAVE W1 — THE ONLY DASHBOARD FRAME)
 * ----------------------------------------------------------------------------
 * The dashboard frame mounted unconditionally by (dashboard)/layout.tsx.
 * Renders the premium Fairway `AppShell` — the warm-black recessive rail on
 * desktop, a 4-tab bottom bar + More sheet on mobile (M1, 2026-07-10 —
 * docs/MOBILE_DOCTRINE.md Rule 6/10; the old hamburger → slide-in drawer is
 * retired), and the one glass top bar. The legacy GolfDashboardShell /
 * GolfSidebar fork it used to be gated against was deleted in Wave W1
 * (2026-07-09).
 *
 * The AppShell sheet (`mobileOpen`) is BRIDGED to SidebarContext, so a
 * not-yet-migrated page's own menu button — which calls `setMobileOpen` —
 * opens the SAME More sheet. One nav surface, no dead buttons, no double
 * overflow surfaces.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { MoreSheetFooter } from '@/components/fairway/app-shell/MoreSheetFooter';
import { selectOverflow, summarizeMoreTab } from '@/components/fairway/app-shell/more-nav';
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
import { surfaceName, surfaceHref } from '@/lib/golf/surface-registry';
import { isPageScrollHomeEndTarget, shouldResetScrollOnNavigate } from '@/lib/golf/scroll-behavior';

import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { MobileNavProvider } from '@/contexts/mobile-nav-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { NotificationBadgeProvider, useNotificationBadges } from '@/contexts/notification-badge-context';
import { OfflineProvider } from '@/components/golf/OfflineProvider';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { DemoEnterTracker } from '@/components/demo/DemoEnterTracker';
import { DemoPricingNudge } from '@/components/golf/demo/DemoPricingNudge';
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

/** Top-bar breadcrumb labels for the first dashboard segment (desktop only).
 *  The CoachHelm AI + Stats entries are sourced from surface-registry.ts so
 *  this map can never disagree with the rail/sub-nav/palette (P409+). */
const SEGMENT_LABELS: Record<string, string> = {
  intelligence: surfaceName('rail-coachhelm-ai-coach'),
  coachhelm: surfaceName('rail-coachhelm-ai-player'),
  roster: 'Roster',
  rounds: 'Rounds',
  calendar: 'Calendar',
  stats: surfaceName('stats'),
  messages: 'Messages',
  announcements: 'Announcements',
  travel: 'Travel',
  documents: 'Documents',
  tasks: 'Tasks',
  courses: 'Courses',
  recruiting: 'Recruiting HQ',
  development: 'Development',
  qualifiers: 'Qualifiers',
  'my-development': surfaceName('my-development-tab'),
  'my-qualifiers': 'My Qualifiers',
  'team-hub': 'Team Hub',
  settings: 'Settings',
  insights: surfaceName('insights'),
  alerts: surfaceName('alerts'),
  patterns: surfaceName('patterns'),
  analytics: 'Analytics',
  players: surfaceName('players-tab'),
  classes: 'Classes',
  hub: 'Hub',
  team: 'Team Info',
  'whats-new': "What's New",
  'my-game-profile': surfaceName('my-game-profile-tab'),
  'my-standing': surfaceName('my-standing-tab'),
};

function toTitle(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Within the CoachHelm cluster, the leaf-tab label the masthead sub-nav shows
 *  (so the top-bar breadcrumb agrees with it instead of disagreeing). Sourced
 *  from surface-registry.ts — the same canonical names CoachHelmSubNav.tsx
 *  renders for these tabs. */
const COACHHELM_TAB_LABELS: Record<string, string> = {
  intelligence: surfaceName('brief'),
  alerts: surfaceName('signals'),
  insights: surfaceName('signals'),
  patterns: surfaceName('signals'),
  development: surfaceName('players-tab'),
  analytics: surfaceName('effectiveness'), // /analytics/coachhelm
  coachhelm: surfaceName('ask'), // /coachhelm/chat, /coachhelm/genome
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
      { label: surfaceName('rail-coachhelm-ai-coach'), href: surfaceHref('rail-coachhelm-ai-coach') },
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

/**
 * Shared sign-out side effects (haptic + clear active team + Supabase
 * signOut + redirect) — used by BOTH the rail's dark `ShellFooter` and the
 * More sheet's light `GolfMoreSheetFooter` (M1) so the two footers never
 * hand-maintain two copies of the same effectful call.
 */
function useGolfSignOut() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return; // guard double-tap (legacy shell guarded this too)
    setIsSigningOut(true);
    void triggerHaptic('heavy');
    const supabase = createClient();
    await clearActiveTeam();
    await supabase.auth.signOut();
    router.push('/golf/login');
  }, [router, isSigningOut]);

  return { isSigningOut, handleSignOut };
}

/** Pinned rail footer — Settings + Sign out, styled for the warm-black rail.
 * Reads collapsed state from SidebarCollapseContext to render icon-only when
 * the rail is collapsed. */
function ShellFooter() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const { isSigningOut, handleSignOut } = useGolfSignOut();
  const collapsed = useSidebarCollapsed();
  const settingsActive = pathname.startsWith('/golf/dashboard/settings');

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

/**
 * M1: the More sheet's light-themed footer (Settings + Sign out row) — NOT
 * the rail's dark `ShellFooter` above (that JSX is built for the black rail
 * and reads wrong on the sheet's warm-cream `bg-elevated` body). Reuses the
 * SAME sign-out side effects via `useGolfSignOut`.
 */
function GolfMoreSheetFooter() {
  const pathname = usePathname();
  const { isSigningOut, handleSignOut } = useGolfSignOut();
  const settingsActive = pathname.startsWith('/golf/dashboard/settings');

  return (
    <MoreSheetFooter
      settingsHref="/golf/dashboard/settings"
      settingsActive={settingsActive}
      onSignOut={handleSignOut}
      signingOut={isSigningOut}
      linkComponent={ShellLink}
    />
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

  // #947: reset the document scroll position to the top on a route change.
  // This shell mounts ONCE per session (it lives in (dashboard)/layout.tsx,
  // which persists across every sibling navigation) and the dashboard is a
  // plain document-scrolling page (see globals.css's `overflow-x: clip`
  // comment — no inner `overflow-y-auto` wrapper), so without this a
  // navigation to a new route inherited whatever scrollY the PREVIOUS page
  // was left at (Dashboard → Brief landing mid-page instead of at the top).
  // Browser back/forward is deliberately excluded — a `popstate` listener
  // flags the next pathname change as "the browser already restored scroll
  // for this one", so native back-button semantics are untouched — and a
  // destination hash (`#section`) is excluded so anchor links still work.
  // See `src/lib/golf/scroll-behavior.ts` for the (unit-tested) decision.
  const isPopStateRef = useRef(false);
  useEffect(() => {
    const onPopState = () => {
      isPopStateRef.current = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const previousPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    const wasPopState = isPopStateRef.current;
    isPopStateRef.current = false; // consume — good for exactly one pathname change
    const reset = shouldResetScrollOnNavigate({
      previousPathname: previousPathnameRef.current,
      nextPathname: pathname,
      isPopState: wasPopState,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
    });
    previousPathnameRef.current = pathname;
    if (reset) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  // #947: the dashboard content area ignored Home/End keyboard scrolling.
  // The shell is document-scrolling (no inner `overflow-y-auto` wrapper —
  // see the scroll-reset effect above), so this is a `window`-level listener
  // rather than a handler scoped to one element: whatever currently has
  // focus (a nav item, a card action, or nothing more specific than
  // `document.body`) should still let Home/End move the page, exactly as a
  // plain document would without any shell chrome layered over it. Native
  // form controls and composite ARIA widgets (tabs/listbox/menu/grid/tree)
  // that legitimately own Home/End for their own first/last-item navigation
  // are excluded — see `isPageScrollHomeEndTarget`.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Home' && event.key !== 'End') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!isPageScrollHomeEndTarget(event.target instanceof Element ? event.target : null)) return;
      event.preventDefault();
      window.scrollTo({
        top: event.key === 'Home' ? 0 : document.documentElement.scrollHeight,
        left: 0,
        behavior: 'instant',
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  // M1 (more-sheet-nav, docs/MOBILE_DOCTRINE.md Rule 6/10): the More sheet's
  // content is the FULL rail `sections` minus the 4 bottom-nav hrefs
  // (`selectOverflow`), and the bottom bar's 5th "More" column derives its
  // active/badge state from that same overflow (`summarizeMoreTab`) — never
  // a second hand-maintained destination list.
  const bottomNavHrefs = useMemo(() => bottomNavItems.map((item) => item.href), [bottomNavItems]);
  const overflow = useMemo(() => selectOverflow(sections, bottomNavHrefs), [sections, bottomNavHrefs]);
  const more = useMemo(() => summarizeMoreTab(overflow, pathname), [overflow, pathname]);
  const openMoreSheet = useCallback(() => setMobileOpen(true), [setMobileOpen]);

  // WAVE W2: the sub-tab strip for whichever multi-tab hub owns the current
  // route (Team / Calendar / Rounds & Stats / Messages / Operations for
  // coach; Team for player). null on single-destination rail items AND on
  // the CoachHelm cluster (which renders its OWN strip per-page via
  // CoachHelmShell — see nav-registry.ts module header).
  const activeHub = useMemo(() => resolveActiveGolfHub(pathname, role), [pathname, role]);

  // M1 (condensing-header): the sub-nav is now part of AppShell's ONE sticky
  // chrome unit (its own `subNav` prop), not a first child inside
  // `{children}` — memoized (Decision 7: every element prop entering AppShell
  // is stable at the call site) so it only changes identity when the active
  // hub actually changes, not on every unrelated re-render.
  const subNav = useMemo(
    () =>
      activeHub ? (
        <FairwayHubSubNav key={activeHub.id} tabs={activeHub.tabs} ariaLabel={activeHub.ariaLabel} />
      ) : null,
    [activeHub],
  );

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
  const moreSheetFooter = useMemo(() => <GolfMoreSheetFooter />, []);
  // Same stability contract as the five props above — was the one element
  // prop entering AppShell built as a fresh JSX literal every render,
  // undermining AppShell's shallow-prop-comparison memoization for this one
  // prop regardless of the other five being stable (CodeRabbit #797
  // cluster-4 finding 4 / React Doctor).
  const bottomNav = useMemo(
    () => (
      <FairwayBottomNav
        items={bottomNavItems}
        pathname={pathname}
        linkComponent={ShellLink}
        onMoreOpen={openMoreSheet}
        moreActive={more.active}
        moreBadge={more.badge}
        moreOpen={mobileOpen}
      />
    ),
    [bottomNavItems, pathname, openMoreSheet, more.active, more.badge, mobileOpen],
  );

  // Live shot-entry flows own their full screen (their own sticky control header
  // + immersive scoring UI), so render them WITHOUT the shell chrome — the glass
  // top bar must not compete with the round controls. The page brings its own
  // `.fairway-ds` scope + bg; we only stick its control header below the notch.
  const isImmersive =
    pathname === '/golf/dashboard/rounds/new' || pathname.startsWith('/golf/dashboard/rounds/continue');

  // Immersive routes render no More sheet; if the bridged sheet state is
  // somehow open, force it closed so SidebarProvider's body-scroll-lock can't
  // soft-lock the immersive screen.
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
        // M1 (condensing-header): the shared sub-tab strip now renders as
        // part of AppShell's ONE sticky chrome unit; `pageTitle` is the
        // condensed-bar fallback for routes that haven't adopted
        // `<FairwayLargeTitle>` yet (already-computed breadcrumb trail).
        subNav={subNav}
        pageTitle={breadcrumbs.at(-1)?.label}
        // M1: the More sheet's identity row links here; its footer is the
        // light-themed Settings + Sign out row (moreSheetFooter, below).
        settingsHref="/golf/dashboard/settings"
        bottomNavHrefs={bottomNavHrefs}
        moreSheetFooter={moreSheetFooter}
        // P413: persistent mobile bottom-tab bar for the core destinations
        // (md:hidden; the 5th "More" column opens the sheet, which keeps the
        // long tail — see docs/MOBILE_DOCTRINE.md Rule 6/10).
        bottomNav={bottomNav}
        className={cn(displayDensity === 'compact' && 'density-compact', !showAnimations && 'reduce-motion')}
      >
        <div id="main-content" tabIndex={-1} className="outline-none">
          <NoTeamBanner />
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
                  {/* Must mount BEFORE DemoEnterTracker — see DemoPricingNudge.tsx
                      header: it reads window.location.search for `demo=1` before
                      DemoEnterTracker's own effect strips that param from the URL. */}
                  <DemoPricingNudge />
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
