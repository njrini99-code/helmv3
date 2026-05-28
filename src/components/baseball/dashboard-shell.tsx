'use client';

import { useEffect, useRef } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { MobileBottomNav, type MobileNavItem } from '@/components/layout/mobile-bottom-nav';
import { useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';
import {
  IconHome,
  IconUsers,
  IconUser,
  IconMessage,
  IconSettings,
} from '@/components/icons';

const COACH_NAV: MobileNavItem[] = [
  { label: 'Home', href: '/baseball/dashboard', icon: IconHome },
  { label: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { label: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage },
  { label: 'More', href: '/baseball/dashboard/settings', icon: IconSettings },
];

const PLAYER_NAV: MobileNavItem[] = [
  { label: 'Home', href: '/baseball/dashboard', icon: IconHome },
  { label: 'Profile', href: '/baseball/dashboard/profile', icon: IconUser },
  { label: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage },
  { label: 'More', href: '/baseball/dashboard/settings', icon: IconSettings },
];

type Props = {
  children: React.ReactNode;
  role: 'coach' | 'player' | null;
};

export function BaseballDashboardShell({ children, role }: Props) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const mobileNavItems = role === 'coach' ? COACH_NAV : PLAYER_NAV;
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
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
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar isMobile />
      </div>

      <div
        className={cn(
          'min-h-dvh flex flex-col',
          'transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
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
          {children}
        </main>
      </div>

      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
