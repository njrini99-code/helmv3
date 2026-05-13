'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { usePresence } from '@/hooks/use-presence';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { KeyboardShortcutHint } from '@/components/golf/KeyboardShortcutHint';
import { NotificationCenter } from '@/components/golf/calendar/NotificationCenter';
import { MobileNavProvider } from '@/contexts/mobile-nav-context';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { NotificationBadgeProvider } from '@/contexts/notification-badge-context';
import { OfflineProvider } from '@/components/golf/OfflineProvider';
import { NoTeamBanner } from '@/components/golf/NoTeamBanner';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

// PERF: Lazy-load CommandPalette — only shown on Cmd+K
const CommandPalette = dynamic(
  () => import('@/components/golf/CommandPalette').then(mod => ({ default: mod.CommandPalette })),
  { ssr: false }
);

// PERF: Lazy-load announcement modal — only shown for players with unseen announcements
const NewAnnouncementsModalWrapper = dynamic(
  () => import('@/components/golf/announcements/NewAnnouncementsModalWrapper').then(mod => ({ default: mod.NewAnnouncementsModalWrapper })),
  { ssr: false }
);

// PERF: Lazy-load push permission soft-ask — only relevant on native iOS
const PushPermissionSoftAsk = dynamic(
  () => import('@/components/golf/PushPermissionSoftAsk').then(mod => ({ default: mod.PushPermissionSoftAsk })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Inner layout component that consumes sidebar context
// ---------------------------------------------------------------------------
function GolfDashboardContent({ children, userData }: { children: React.ReactNode; userData: GolfUserData }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const { displayDensity, showAnimations } = useAppearancePreferences();
  const isCoach = userData.role === 'coach';
  const mobileSidebarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Track user online presence (deferred by 5s so it doesn't compete with page load)
  usePresence();

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        void triggerHaptic('light');
        setMobileOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Focus trap for mobile sidebar + restore focus on close
  useEffect(() => {
    if (!mobileOpen || !mobileSidebarRef.current) return;

    // Store the element that had focus before sidebar opened
    triggerRef.current = document.activeElement;

    const sidebar = mobileSidebarRef.current;
    const focusable = sidebar.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    if (first) first.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      // Restore focus to trigger element when sidebar closes
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [mobileOpen]);

  return (
    <div
      className={cn(
        'flex h-dvh bg-dashboard-gradient',
        displayDensity === 'compact' && 'density-compact',
        !showAnimations && 'reduce-motion',
      )}
      style={{ overscrollBehavior: 'none' }}
      suppressHydrationWarning
    >
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isCoach={isCoach} />

      {/* Desktop Sidebar */}
      <div className="hidden lg:block" role="navigation" aria-label="Main navigation">
        <GolfSidebar
          userRole={userData.role}
          userName={userData.name}
          teamName={userData.teamName}
          avatarUrl={userData.avatarUrl}
        />
      </div>

      {/* Mobile Sidebar Overlay — z-[45] sits between bottom nav (z-40) and sidebar panel (z-50) */}
      <div
        className={cn(
          'fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-[45] lg:hidden',
          'transition-opacity duration-300 ease-out',
          mobileOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
        onClick={() => {
          void triggerHaptic('light');
          setMobileOpen(false);
        }}
        aria-hidden="true"
      />

      {/* Mobile Sidebar — explicit width + h-dvh on wrapper so child fills 100% cleanly.
          max-w prevents overflow on tiny iPhones (SE). Safe-area-left handles landscape notches. */}
      <div
        id="mobile-sidebar"
        ref={mobileSidebarRef}
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 lg:hidden',
          'h-dvh w-72 max-w-[85vw]',
          'pl-[env(safe-area-inset-left)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          mobileOpen ? 'tranwarm-x-0' : '-tranwarm-x-full'
        )}
      >
        <GolfSidebar
          userRole={userData.role}
          userName={userData.name}
          teamName={userData.teamName}
          avatarUrl={userData.avatarUrl}
          isMobile
        />
      </div>

      {/* Main content — uses padding-left instead of margin-left to avoid
          layout thrashing during sidebar collapse.
          isolation: isolate prevents child stacking contexts from leaking out
          and interfering with the fixed bottom nav. */}
      <main role="main" aria-label="Dashboard content"
        id="main-content"
        className={cn(
          'flex-1 overflow-y-auto isolate',
          'pb-[var(--golf-mobile-bottom-nav-offset)] lg:pb-0',
          'transition-[padding-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-64',
        )}
        style={{
          background: 'transparent',
        }}
      >
        <NoTeamBanner />
        <div className="min-h-full" style={{ background: 'transparent' }}>
          {children}
        </div>
      </main>

      {/* Global Notification Bell — top-right of viewport */}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-[35] hidden lg:block">
        <NotificationCenter />
      </div>

      {/* Mobile Bottom Navigation removed May 2026 — replaced by the
          hamburger button that lives in every page's <LargeTitleHeader> /
          <MobileNavHeader>. Single nav surface, premium feel. The
          --golf-mobile-bottom-nav-offset CSS var is now zero (just
          safe-area-inset-bottom) so existing layout math still works. */}

      {/* Keyboard Shortcut Hint (shows once) */}
      <KeyboardShortcutHint />

      {/* New Announcements Modal (players only) */}
      <NewAnnouncementsModalWrapper />

      {/* Push Permission Soft Ask (native iOS only, shown once) */}
      <PushPermissionSoftAsk />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MotionConfig wrapper that disables animations when user preference is off
// ---------------------------------------------------------------------------
function AppearanceMotionConfig({ children }: { children: React.ReactNode }) {
  const { showAnimations } = useAppearancePreferences();
  return (
    <MotionConfig reducedMotion={showAnimations ? 'user' : 'always'}>
      {children}
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------
// Exported shell — wraps children with all client-side providers
// ---------------------------------------------------------------------------
export function GolfDashboardShell({
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
                <AppearanceMotionConfig>
                  <OfflineProvider showSyncStatus={false} showWarningBanner={false}>
                    <LastSeenUpdater />
                    <GolfDashboardContent userData={userData}>
                      {children}
                    </GolfDashboardContent>
                  </OfflineProvider>
                </AppearanceMotionConfig>
              </LazyMotion>
            </NotificationBadgeProvider>
          </GolfUserProvider>
        </SessionActivityProvider>
      </SidebarProvider>
    </MobileNavProvider>
  );
}
