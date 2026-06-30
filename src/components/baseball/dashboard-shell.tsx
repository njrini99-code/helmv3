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
import { NotificationBell } from '@/components/baseball/NotificationBell';
import {
  getVisibleBaseballNav,
  type BaseballNavContext,
} from '@/lib/baseball/nav-registry';
import {
  IconHome,
  IconUsers,
  IconUser,
  IconCalendar,
  IconMenu,
} from '@/components/icons';

// ---------------------------------------------------------------------------
// Fallback mobile nav (rendered while navContext is still resolving so the
// bottom bar is never empty on first paint).
// ---------------------------------------------------------------------------
const COACH_NAV_FALLBACK: MobileNavItem[] = [
  { label: 'Home', href: '/baseball/dashboard/command-center', icon: IconHome },
  { label: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { label: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
];

const PLAYER_NAV_FALLBACK: MobileNavItem[] = [
  { label: 'Home', href: '/baseball/player/today', icon: IconHome },
  { label: 'Schedule', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { label: 'Profile', href: '/baseball/dashboard/profile', icon: IconUser },
];

/**
 * Derive the 4 mobile bottom nav items from the resolved nav context.
 *
 * Strategy: keep the three everyday mobile destinations stable, then make the
 * fourth slot open the full drawer. The registry still decides whether the
 * preferred ids exist for the current role/program, and the drawer carries the
 * rest of the product surface without pretending Settings is "More".
 */
function buildMobileNavFromContext(
  ctx: BaseballNavContext,
  unreadCount: number,
  openMenu: () => void,
): MobileNavItem[] {
  const primary = getVisibleBaseballNav(ctx).filter((e) => e.section === 'primary');
  const preferredIds = ctx.role === 'coach'
    ? ['command-center', 'calendar', 'roster']
    : ['player-today', 'calendar', 'player-profile'];
  const top3 = preferredIds
    .map((id) => primary.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const fill = primary.filter((e) => !top3.some((selected) => selected.id === e.id));
  const items: MobileNavItem[] = [...top3, ...fill].slice(0, 3).map((e) => ({
    label: e.label,
    href: e.href,
    icon: e.icon,
    ...(e.showUnreadBadge && unreadCount > 0 ? { badge: unreadCount } : {}),
  }));
  items.push({
    label: 'Menu',
    icon: IconMenu,
    onClick: openMenu,
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
  const { unreadCount } = useUnreadCount();

  // Derive the mobile nav from the registry when the context is available;
  // fall back to the role-specific constants while it is still resolving.
  const mobileNavItems = useMemo<MobileNavItem[]>(() => {
    if (navContext) {
      return buildMobileNavFromContext(navContext, unreadCount, () => setMobileOpen(true));
    }
    const fallback = role === 'coach' ? COACH_NAV_FALLBACK : PLAYER_NAV_FALLBACK;
    return [
      ...fallback,
      {
        label: 'Menu',
        icon: IconMenu,
        onClick: () => setMobileOpen(true),
        ...(unreadCount > 0 ? { badge: unreadCount } : {}),
      },
    ];
  }, [navContext, role, unreadCount, setMobileOpen]);

  // Grouped-hubs sub-tab strip: resolve which hub (Team / Stats / Development /
  // Management / Recruiting / Academics) owns the current route and render its
  // sub-tabs above the page. Top-level surfaces (Dashboard, Profile, etc.) sit
  // in no hub → activeHub is null → no strip.
  const activeHub = resolveActiveHub({
    pathname,
    role,
    programType: navContext?.programType ?? null,
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

      <CommandPalette navContext={navContext ?? { role, capabilities: {} }} />

      <div className="hidden lg:block">
        <Sidebar navContext={navContext} />
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
        <Sidebar isMobile navContext={navContext} />
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
          <div className="sticky top-0 z-30 flex min-h-14 items-center justify-end border-b border-warm-200/70 bg-cream-50/82 px-4 py-2 backdrop-blur-xl sm:px-6 lg:px-8">
            <NotificationBell />
          </div>

          {/* Grouped-hub sub-tab strip (only on hub-owned routes). */}
          {activeHub && (
            <HubSubNav
              key={activeHub.id}
              tabs={activeHub.tabs}
              ariaLabel={activeHub.ariaLabel}
              className="hidden md:block md:top-14"
            />
          )}
          {children}
        </main>
      </div>

      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
