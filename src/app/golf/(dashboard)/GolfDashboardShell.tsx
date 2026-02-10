'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { GolfSidebar } from '@/components/golf/layout/GolfSidebar';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { ToastProvider } from '@/components/ui/toast';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { usePresence } from '@/hooks/use-presence';
import { MobileBottomNav } from '@/components/golf/MobileBottomNav';
import { KeyboardShortcutHint } from '@/components/golf/KeyboardShortcutHint';
import { MobileNavProvider } from '@/contexts/mobile-nav-context';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { OfflineProvider } from '@/components/golf/OfflineProvider';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { cn } from '@/lib/utils';

// PERF: Lazy-load CommandPalette — only shown on Cmd+K
const CommandPalette = dynamic(
  () => import('@/components/golf/CommandPalette').then(mod => ({ default: mod.CommandPalette })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Inner layout component that consumes sidebar context
// ---------------------------------------------------------------------------
function GolfDashboardContent({ children, userData }: { children: React.ReactNode; userData: GolfUserData }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const isCoach = userData.role === 'coach';
  const mobileSidebarRef = useRef<HTMLDivElement>(null);

  // Track user online presence (deferred by 5s so it doesn't compete with page load)
  usePresence();

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  // Focus trap for mobile sidebar
  useEffect(() => {
    if (!mobileOpen || !mobileSidebarRef.current) return;
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
    return () => document.removeEventListener('keydown', trapFocus);
  }, [mobileOpen]);

  return (
    <div className="flex h-dvh bg-dashboard-gradient" style={{ overscrollBehavior: 'none' }}>
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isCoach={isCoach} />

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <GolfSidebar
          userRole={userData.role}
          userName={userData.name}
          teamName={userData.teamName}
          avatarUrl={userData.avatarUrl}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden',
          'transition-opacity duration-300 ease-out',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Sidebar */}
      <div
        ref={mobileSidebarRef}
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
        className={cn(
          'fixed inset-y-0 left-0 z-50 lg:hidden',
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
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
          layout thrashing during sidebar collapse. */}
      <main
        id="main-content"
        className={cn(
          'flex-1 overflow-y-auto',
          'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0',
          'transition-[padding-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-64',
        )}
        style={{
          background: 'transparent',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
        }}
      >
        <div className="min-h-full" style={{ background: 'transparent' }}>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav isCoach={isCoach} />

      {/* Keyboard Shortcut Hint (shows once) */}
      <KeyboardShortcutHint />
    </div>
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
        <ToastProvider>
          <SessionActivityProvider>
            <GolfUserProvider userData={userData}>
              <OfflineProvider showSyncStatus={false} showWarningBanner={false}>
                <LastSeenUpdater />
                <GolfDashboardContent userData={userData}>
                  {children}
                </GolfDashboardContent>
              </OfflineProvider>
            </GolfUserProvider>
          </SessionActivityProvider>
        </ToastProvider>
      </SidebarProvider>
    </MobileNavProvider>
  );
}
