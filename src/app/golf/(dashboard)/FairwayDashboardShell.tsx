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
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/fairway/app-shell/AppShell';
import { useSidebarCollapsed } from '@/components/fairway/app-shell/FairwaySidebar';
import { FairwayBottomNav } from '@/components/fairway/app-shell/FairwayBottomNav';
import type { Breadcrumb, NavItem, NavSection, ShellLinkComponent } from '@/components/fairway/app-shell/types';
import { FAIRWAY_SCOPE } from '@/lib/redesign/flag';

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
  IconRocket,
  IconSettings,
  IconLogout,
} from '@/components/icons';

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

/**
 * The CoachHelm AI route cluster. The single "CoachHelm AI" sidebar row points
 * at /intelligence, but the cluster's tabs (Signals/Players/Effectiveness/Ask)
 * live at sibling routes — so the global rail must stay lit across all of them
 * (P408) and the top-bar breadcrumb must show the cluster trail (P409). Kept as
 * a single source of truth so the two location systems agree.
 */
const COACHHELM_CLUSTER_PREFIXES = [
  '/golf/dashboard/intelligence',
  '/golf/dashboard/alerts',
  '/golf/dashboard/insights',
  '/golf/dashboard/patterns',
  '/golf/dashboard/development',
  '/golf/dashboard/analytics/coachhelm',
  // NOTE: only the COACH CoachHelm sub-routes (`/coachhelm/chat`, `/coachhelm/genome`)
  // belong to this cluster. Bare `/golf/dashboard/coachhelm` is the PLAYER CoachHelm
  // home (no masthead sub-nav) and must NOT be treated as the coach cluster.
  '/golf/dashboard/coachhelm/',
] as const;

/** First dashboard segments that belong to the CoachHelm cluster (breadcrumb). */
const COACHHELM_CLUSTER_SEGMENTS = new Set([
  'intelligence',
  'alerts',
  'insights',
  'patterns',
  'development',
  'analytics',
  'coachhelm',
]);

function isCoachHelmCluster(pathname: string): boolean {
  return COACHHELM_CLUSTER_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/'),
  );
}

/**
 * The PLAYER CoachHelm cluster. The single "CoachHelm AI" player nav row points
 * at /coachhelm (the Overview front door), but the cluster's sub-tabs
 * (Development / Game Profile / Standing) live at SIBLING routes that fold into
 * the same player CoachHelm shell (CoachHelmSubNav PLAYER_TABS). Without this the
 * sidebar's segment-boundary match drops the row's highlight the moment a player
 * opens any sub-tab, so the rail loses its current-location indicator (P164).
 * Source of truth must agree with CoachHelmSubNav.PLAYER_TABS.
 */
const PLAYER_COACHHELM_CLUSTER_PREFIXES = [
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/my-development',
  '/golf/dashboard/my-game-profile',
  '/golf/dashboard/my-standing',
] as const;

function isPlayerCoachHelmCluster(pathname: string): boolean {
  return PLAYER_COACHHELM_CLUSTER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

/** The already-computed notification counts the nav rail can surface. The
 *  badge context polls all of these every 45s; previously only `messages` and
 *  `coachhelm` reached the rail and the rest were thrown away (P438). A badge
 *  only renders when its count is > 0 — a 0 count stays honestly badge-less. */
interface NavBadgeCounts {
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

/**
 * Role → nav sections. Mirrors GolfSidebar's IA exactly (primary + secondary,
 * same hrefs/icons, same badge surfaces). This shell only renders flag-ON, so
 * the player secondary uses the Fairway "Team Hub" variant (Classes → Team Hub).
 */
function buildNavSections(role: Role, badges: NavBadgeCounts): NavSection[] {
  if (role === 'coach') {
    return [
      {
        heading: 'Team Management',
        items: [
          { label: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
          {
            label: 'CoachHelm AI',
            href: '/golf/dashboard/intelligence',
            icon: IconSparkles,
            // P414: ONE SOURCE for the "pressing CoachHelm signals" count. This
            // sidebar cluster badge (badges.coachhelm) and the CoachHelmSubNav
            // Signals-tab badge (signalCount) MUST stay the same number — both
            // derive from getAlertCounts().counts.critical (open urgent+high
            // insights). notification-badge-context seeds badges.coachhelm from
            // exactly that read (notification-badge-context.tsx:108) and every
            // CoachHelm page seeds signalCount from the same read, so the two
            // never contradict on the same screen. The ONLY divergence is by
            // design: the insights page passes signalCount=null to defer to its
            // on-page "Urgent + high" tile — the sidebar badge stays as the
            // out-of-context rail cue. Keep both wired to getAlertCounts.critical.
            badge: navBadge(badges.coachhelm),
            // P408: keep the rail lit across the whole CoachHelm cluster
            // (Signals/Players/Effectiveness/Ask), not just /intelligence.
            activeMatch: isCoachHelmCluster,
          },
          { label: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
          { label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
          {
            label: 'Calendar',
            href: '/golf/dashboard/calendar',
            icon: IconCalendar,
            // P438: surface the already-polled calendar-notification count.
            badge: navBadge(badges.calendarNotifications),
          },
          { label: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
          {
            label: 'Messages',
            href: '/golf/dashboard/messages',
            icon: IconMessage,
            badge: navBadge(badges.messages),
          },
        ],
      },
      {
        heading: 'Operations',
        items: [
          // P438: thread the polled counts the context already computes. (Coach
          // announcements/travel currently resolve to 0 in the badge context, so
          // these stay badge-less until those counts are populated — never a fake 0.)
          {
            label: 'Announcements',
            href: '/golf/dashboard/announcements',
            icon: IconBell,
            badge: navBadge(badges.announcements),
          },
          {
            label: 'Travel',
            href: '/golf/dashboard/travel',
            icon: IconAirplane,
            badge: navBadge(badges.travel),
          },
          { label: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
          {
            label: 'Tasks',
            href: '/golf/dashboard/tasks',
            icon: IconClipboardList,
            // P438: thread the polled tasks count. (Coach tasks currently resolve
            // to 0 in the badge context, so this stays badge-less until a coach
            // tasks count is populated — navBadge(0) is honestly undefined.)
            badge: navBadge(badges.tasks),
          },
          { label: 'Courses', href: '/golf/dashboard/courses', icon: IconMapPin },
          { label: 'Recruiting HQ', href: '/golf/dashboard/recruiting', icon: IconUserPlus },
          { label: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
          // P393/P441: What's New (team activity feed) was reachable ONLY via the
          // ⌘K palette + one ghost link on the coach dashboard hero — a feature
          // meant to be checked regularly hidden behind recall. Give it a
          // persistent rail entry so it satisfies recognition-over-recall.
          { label: "What's New", href: '/golf/dashboard/whats-new', icon: IconRocket },
        ],
      },
    ];
  }
  return [
    {
      heading: 'My Golf',
      items: [
        { label: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
        // P411: the Hub (today / action center) was reachable ONLY via in-page
        // "Open Hub" / "Back to hub" links — orphaned from the rail and palette,
        // so it read as a competing second "home". Give it a persistent nav
        // entry (so every shipped surface is reachable) and label it as the
        // action center it is — the Dashboard remains the analytical home.
        { label: 'Hub', href: '/golf/dashboard/hub', icon: IconLayoutGrid },
        {
          label: 'CoachHelm AI',
          href: '/golf/dashboard/coachhelm',
          icon: IconSparkles,
          // P164: keep the rail lit across the whole player CoachHelm cluster
          // (Overview/Development/Game Profile/Standing), not just /coachhelm —
          // those sub-tabs live at sibling routes that fold into the same shell.
          activeMatch: isPlayerCoachHelmCluster,
        },
        { label: 'My Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
        { label: 'Courses', href: '/golf/dashboard/courses', icon: IconMapPin },
        {
          label: 'Calendar',
          href: '/golf/dashboard/calendar',
          icon: IconCalendar,
          // P438: surface the polled calendar-notification count for players too.
          badge: navBadge(badges.calendarNotifications),
        },
        { label: 'My Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
        {
          label: 'Messages',
          href: '/golf/dashboard/messages',
          icon: IconMessage,
          badge: navBadge(badges.messages),
        },
      ],
    },
    {
      heading: 'Team',
      items: [
        { label: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: IconTrophy },
        { label: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
        // P363: the player Team Info surface (coach + roster + announcements +
        // tasks) was reachable only by direct URL / the command palette — never
        // from the rail (src/TODO.md self-flagged it as unlinked). Give it a
        // persistent nav entry so every shipped surface is reachable (gate B2).
        { label: 'Team Info', href: '/golf/dashboard/team', icon: IconUsers },
        { label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: IconLayoutGrid },
        // P441: What's New is NOT given a player rail entry on purpose — the
        // route (whats-new/page.tsx) redirects any non-coach back to the
        // dashboard ("What's New is a coach-only feature"). Linking it for
        // players would be a dead nav item / redirect trap. The orphan is
        // resolved for the role that CAN see it (coach Operations entry); the
        // player palette entry should be dropped separately (out of scope here).
      ],
    },
  ];
}

/**
 * P413: the 4–5 highest-frequency destinations for the persistent MOBILE
 * bottom-tab bar (the drawer keeps the long tail). Hrefs/icons/active-matches
 * reuse the sidebar's source of truth so the bar agrees with the rail.
 *   coach:  Home · CoachHelm · Roster · Calendar · Messages
 *   player: Home · CoachHelm · My Rounds · My Stats · Team
 */
function buildBottomNavItems(role: Role, badges: NavBadgeCounts): NavItem[] {
  if (role === 'coach') {
    return [
      { label: 'Home', href: '/golf/dashboard', icon: IconHome },
      {
        label: 'CoachHelm',
        href: '/golf/dashboard/intelligence',
        icon: IconSparkles,
        badge: navBadge(badges.coachhelm),
        activeMatch: isCoachHelmCluster,
      },
      { label: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
      {
        label: 'Calendar',
        href: '/golf/dashboard/calendar',
        icon: IconCalendar,
        badge: navBadge(badges.calendarNotifications),
      },
      {
        label: 'Messages',
        href: '/golf/dashboard/messages',
        icon: IconMessage,
        badge: navBadge(badges.messages),
      },
    ];
  }
  return [
    { label: 'Home', href: '/golf/dashboard', icon: IconHome },
    {
      label: 'CoachHelm',
      href: '/golf/dashboard/coachhelm',
      icon: IconSparkles,
      activeMatch: isPlayerCoachHelmCluster,
    },
    { label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
    { label: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
    { label: 'Team', href: '/golf/dashboard/team', icon: IconUsers },
  ];
}

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
  if (COACHHELM_CLUSTER_SEGMENTS.has(seg) && isCoachHelmCluster(pathname)) {
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
        className={cn(rowBase, 'text-nav-text-dim hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50')}
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

  const teamSwitcher = showSwitcher ? (
    <TeamSwitcher
      teams={coachTeams}
      activeTeamId={userData.teamId!}
      canSwitch
      onOptimisticSwitch={setOptimisticGender}
    />
  ) : null;

  // Track presence (deferred internally so it doesn't compete with page load).
  usePresence();

  const sections = useMemo(
    () =>
      buildNavSections(role, {
        messages: badges.messages,
        coachhelm: role === 'coach' ? badges.coachhelm : 0,
        calendarNotifications: badges.calendarNotifications,
        announcements: badges.announcements,
        travel: badges.travel,
        tasks: badges.tasks,
      }),
    [
      role,
      badges.messages,
      badges.coachhelm,
      badges.calendarNotifications,
      badges.announcements,
      badges.travel,
      badges.tasks,
    ],
  );

  // P413: mobile bottom-tab destinations (subset of the rail, badge-aware).
  const bottomNavItems = useMemo(
    () =>
      buildBottomNavItems(role, {
        messages: badges.messages,
        coachhelm: role === 'coach' ? badges.coachhelm : 0,
        calendarNotifications: badges.calendarNotifications,
        announcements: badges.announcements,
        travel: badges.travel,
        tasks: badges.tasks,
      }),
    [
      role,
      badges.messages,
      badges.coachhelm,
      badges.calendarNotifications,
      badges.announcements,
      badges.travel,
      badges.tasks,
    ],
  );

  const openCommandPalette = useCallback(() => {
    void triggerHaptic('light');
    // WKWebView-safe imperative open (synthetic ⌘K keystrokes are unreliable
    // there); CommandPalette listens for this event additively.
    window.dispatchEvent(new Event('helm:open-command-palette'));
  }, []);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname]);

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
      className="sr-only focus:not-sr-only focus:absolute focus:z-modal focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
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
        user={{ name: userData.name, teamName: userData.teamName, avatarUrl: userData.avatarUrl }}
        brand={<Brand />}
        sidebarFooter={<ShellFooter />}
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
              <LazyMotion features={domAnimation}>
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
