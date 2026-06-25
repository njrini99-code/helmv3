'use client';

import { useEffect, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { MobileBottomNav, type MobileNavItem } from '@/components/layout/mobile-bottom-nav';
import { useSidebar } from '@/contexts/sidebar-context';
import { useUnreadCount } from '@/hooks/use-unread-count';
import { cn } from '@/lib/utils';
import { HubSubNav } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';
import { resolveActiveHub } from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
import { useAuth } from '@/hooks/use-auth';
import {
  getVisibleBaseballNav,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavContext,
} from '@/lib/baseball/nav-registry';
import {
  IconHome,
  IconUsers,
  IconUser,
  IconMessage,
  IconSettings,
} from '@/components/icons';

// ---------------------------------------------------------------------------
// Fallback mobile nav (rendered while navContext is still resolving so the
// bottom bar is never empty on first paint).
// ---------------------------------------------------------------------------
const COACH_NAV_FALLBACK: MobileNavItem[] = [
  { label: 'Home', href: '/baseball/dashboard', icon: IconHome },
  { label: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { label: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage },
  { label: 'More', href: '/baseball/dashboard/settings', icon: IconSettings },
];

const PLAYER_NAV_FALLBACK: MobileNavItem[] = [
  { label: 'Home', href: '/baseball/dashboard', icon: IconHome },
  { label: 'Profile', href: '/baseball/dashboard/profile', icon: IconUser },
  { label: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage },
  { label: 'More', href: '/baseball/dashboard/settings', icon: IconSettings },
];

/**
 * Derive the 4 mobile bottom nav items from the resolved nav context.
 *
 * Strategy: take the first 3 visible PRIMARY entries from the registry (which
 * are already role- and capability-filtered + program-type ordered), then
 * insert Messages (always last, with live unread badge). This matches the
 * spec's "4-item mobile nav" pattern and automatically reflects any registry
 * changes — no manual sync needed.
 */
function buildMobileNavFromContext(
  ctx: BaseballNavContext,
  unreadCount: number,
): MobileNavItem[] {
  const primary = getVisibleBaseballNav(ctx).filter((e) => e.section === 'primary');
  const top3 = primary.slice(0, 3);
  const items: MobileNavItem[] = top3.map((e) => ({
    label: e.label,
    href: e.href,
    icon: e.icon,
    ...(e.showUnreadBadge && unreadCount > 0 ? { badge: unreadCount } : {}),
  }));
  // Messages is always the fourth slot, always present.
  items.push({
    label: BASEBALL_MESSAGES_NAV.label,
    href: BASEBALL_MESSAGES_NAV.href,
    icon: BASEBALL_MESSAGES_NAV.icon,
    ...(unreadCount > 0 ? { badge: unreadCount } : {}),
  });
  return items;
}

type Props = {
  children: React.ReactNode;
  role: 'coach' | 'player';
  /**
   * Server-resolved nav context (role + capabilities + programType). When
   * provided, the mobile bottom nav is derived from getVisibleBaseballNav() so
   * nav registry changes propagate automatically. Falls back to the hardcoded
   * role constants until the context resolves.
   */
  navContext?: BaseballNavContext;
};

export function BaseballDashboardShell({ children, role, navContext }: Props) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();
  const { coach } = useAuth();
  const { unreadCount } = useUnreadCount();

  // Derive the mobile nav from the registry when the context is available;
  // fall back to the role-specific constants while it is still resolving.
  const mobileNavItems = useMemo<MobileNavItem[]>(() => {
    if (navContext) {
      return buildMobileNavFromContext(navContext, unreadCount);
    }
    const fallback = role === 'coach' ? COACH_NAV_FALLBACK : PLAYER_NAV_FALLBACK;
    // Inject live unread badge into the Messages slot even for the fallback.
    return fallback.map((item) =>
      item.href === BASEBALL_MESSAGES_NAV.href && unreadCount > 0
        ? { ...item, badge: unreadCount }
        : item,
    );
  }, [navContext, role, unreadCount]);

  // Grouped-hubs sub-tab strip: resolve which hub (Team / Stats / Development /
  // Management / Recruiting / Academics) owns the current route and render its
  // sub-tabs above the page. Top-level surfaces (Dashboard, Profile, etc.) sit
  // in no hub → activeHub is null → no strip.
  const activeHub = resolveActiveHub({
    pathname,
    role,
    coachType: coach?.coach_type ?? null,
  });

  const mobileSidebarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
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
    <div className="min-h-dvh bg-dashboard-gradient">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-toolbar focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <CommandPalette />

      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-warm-900/50 backdrop-blur-sm z-40 lg:hidden',
          'transition-opacity duration-300 ease-out',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
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
          'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar isMobile />
      </div>

      <div
        className={cn(
          'min-h-dvh flex flex-col',
          'transition-[margin-left] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
        )}
      >
        <main
          id="main-content"
          className={cn(
            'flex-1',
            'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0'
          )}
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
          }}
        >
          {/* Grouped-hub sub-tab strip (only on hub-owned routes). */}
          {activeHub && (
            <HubSubNav
              key={activeHub.id}
              tabs={activeHub.tabs}
              ariaLabel={activeHub.ariaLabel}
            />
          )}
          {children}
        </main>
      </div>

      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
