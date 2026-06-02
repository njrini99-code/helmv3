'use client';

/**
 * ============================================================================
 * FairwayDashboardShell  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-ON dashboard frame. Mirrors GolfDashboardShell's provider stack
 * VERBATIM (every page depends on useSidebar / useGolfUser / notification
 * badges / offline / presence), but renders the premium Fairway `AppShell` —
 * the warm-black recessive rail on desktop, a slide-in glass drawer on mobile
 * (the hamburger), and the one glass top bar — instead of the legacy
 * GolfSidebar.
 *
 * Mounted ONLY behind isRedesignEnabled() in (dashboard)/layout.tsx. Flag OFF
 * renders the legacy GolfDashboardShell, byte-for-byte unchanged.
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

import { AppShell } from '@/components/fairway/app-shell/AppShell';
import type { Breadcrumb, NavSection, ShellLinkComponent } from '@/components/fairway/app-shell/types';
import { FAIRWAY_SCOPE } from '@/lib/redesign/flag';

import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { MobileNavProvider } from '@/contexts/mobile-nav-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { NotificationBadgeProvider, useNotificationBadges } from '@/contexts/notification-badge-context';
import { OfflineProvider } from '@/components/golf/OfflineProvider';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { NoTeamBanner } from '@/components/golf/NoTeamBanner';
import { KeyboardShortcutHint } from '@/components/golf/KeyboardShortcutHint';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { usePresence } from '@/hooks/use-presence';
import { createClient } from '@/lib/supabase/client';
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
  IconTarget,
  IconFlag,
  IconTrophy,
  IconLayoutGrid,
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
 * Role → nav sections. Mirrors GolfSidebar's IA exactly (primary + secondary,
 * same hrefs/icons, same badge surfaces). This shell only renders flag-ON, so
 * the player secondary uses the Fairway "Team Hub" variant (Classes → Team Hub).
 */
function buildNavSections(role: Role, messages: number, coachhelm: number): NavSection[] {
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
            badge: coachhelm > 0 ? coachhelm : undefined,
          },
          { label: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
          { label: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
          { label: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
          { label: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
          {
            label: 'Messages',
            href: '/golf/dashboard/messages',
            icon: IconMessage,
            badge: messages > 0 ? messages : undefined,
          },
        ],
      },
      {
        heading: 'Operations',
        items: [
          { label: 'Announcements', href: '/golf/dashboard/announcements', icon: IconBell },
          { label: 'Travel', href: '/golf/dashboard/travel', icon: IconAirplane },
          { label: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
          { label: 'Tasks', href: '/golf/dashboard/tasks', icon: IconClipboardList },
          { label: 'Recruiting HQ', href: '/golf/dashboard/recruiting', icon: IconUserPlus },
          { label: 'Development', href: '/golf/dashboard/development', icon: IconTarget },
          { label: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
        ],
      },
    ];
  }
  return [
    {
      heading: 'My Golf',
      items: [
        { label: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
        { label: 'CoachHelm AI', href: '/golf/dashboard/coachhelm', icon: IconSparkles },
        { label: 'My Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
        { label: 'My Development', href: '/golf/dashboard/my-development', icon: IconTarget },
        { label: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
        { label: 'My Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
        {
          label: 'Messages',
          href: '/golf/dashboard/messages',
          icon: IconMessage,
          badge: messages > 0 ? messages : undefined,
        },
      ],
    },
    {
      heading: 'Team',
      items: [
        { label: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: IconTrophy },
        { label: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
        { label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: IconLayoutGrid },
      ],
    },
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
  hub: 'Home',
  team: 'Team',
  'whats-new': "What's New",
  'my-game-profile': 'My Game',
  'my-standing': 'My Standing',
};

function toTitle(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pathname → a 2-level breadcrumb trail (Dashboard / Section). */
function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const rest = pathname.replace(/^\/golf\/dashboard\/?/, '');
  if (!rest) return [{ label: 'Dashboard' }];
  const seg = rest.split('/')[0] ?? '';
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
 * GolfHelm brand for the rail header (logo + wordmark). Collapse is disabled in
 * this shell, so the rail is always full-width and the wordmark never clips.
 */
const Brand = (
  <Link href="/golf/dashboard" prefetch aria-label="GolfHelm home" className="flex items-center gap-2.5">
    <Image
      src="/helm-golf-logo-transparent.png"
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 object-contain"
      priority
      unoptimized
    />
    <span className="font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em] text-nav-text">
      Golf<span className="text-nav-accent">Helm</span>
    </span>
  </Link>
);

/** Pinned rail footer — Settings + Sign out, styled for the warm-black rail. */
function ShellFooter() {
  const router = useRouter();
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const settingsActive = pathname.startsWith('/golf/dashboard/settings');

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return; // guard double-tap (legacy shell guarded this too)
    setIsSigningOut(true);
    void triggerHaptic('heavy');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/golf/login');
  }, [router, isSigningOut]);

  const rowBase =
    'flex w-full items-center gap-3 rounded-fw-md px-3.5 py-2.5 text-body-sm font-medium font-fw-sans tracking-[-0.005em] transition-colors [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none';

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/golf/dashboard/settings"
        prefetch
        onClick={() => setMobileOpen(false)}
        aria-current={settingsActive ? 'page' : undefined}
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
        <span className="min-w-0 flex-1 truncate">Settings</span>
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className={cn(rowBase, 'text-nav-text-dim hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50')}
      >
        <IconLogout size={18} aria-hidden className="flex-shrink-0 text-nav-text-dim" />
        <span className="min-w-0 flex-1 truncate text-left">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
      </button>
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

  // Track presence (deferred internally so it doesn't compete with page load).
  usePresence();

  const sections = useMemo(
    () => buildNavSections(role, badges.messages, role === 'coach' ? badges.coachhelm : 0),
    [role, badges.messages, badges.coachhelm],
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
        brand={Brand}
        sidebarFooter={<ShellFooter />}
        pathname={pathname}
        linkComponent={ShellLink}
        breadcrumbs={breadcrumbs}
        collapsible={false}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onSearchOpen={openCommandPalette}
        searchPlaceholder="Search players, rounds, pages…"
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
