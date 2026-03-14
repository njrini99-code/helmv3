'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useSidebar } from '@/contexts/sidebar-context';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { CountBadge } from '@/components/ui/badge';
import {
  IconHome,
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconMessage,
  IconAirplane,
  IconFolder,
  IconClipboardList,
  IconBell,
  IconSettings,
  IconLogout,
  IconGolf,
  IconBook,
  IconChevronLeft,
  IconChevronRight,
  IconTrophy,
  IconTarget,
  IconSparkles,
} from '@/components/icons';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
}

// Coach navigation
const coachNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'CoachHelm AI', href: '/golf/dashboard/intelligence', icon: IconSparkles },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { name: 'Development', href: '/golf/dashboard/development', icon: IconTarget },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
  { name: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage },
];

const coachSecondaryNav: NavItem[] = [
  { name: 'Travel', href: '/golf/dashboard/travel', icon: IconAirplane },
  { name: 'Documents', href: '/golf/dashboard/documents', icon: IconFolder },
  { name: 'Tasks', href: '/golf/dashboard/tasks', icon: IconClipboardList },
  { name: 'Announcements', href: '/golf/dashboard/announcements', icon: IconBell },
];

// Player navigation
const playerNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'CoachHelm AI', href: '/golf/dashboard/coachhelm', icon: IconSparkles },
  { name: 'My Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { name: 'My Development', href: '/golf/dashboard/my-development', icon: IconTarget },
  { name: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: IconTrophy },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'My Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Classes', href: '/golf/dashboard/classes', icon: IconBook },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage },
];

const playerSecondaryNav: NavItem[] = [
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Team Info', href: '/golf/dashboard/team', icon: IconHome },
  { name: 'Travel', href: '/golf/dashboard/travel', icon: IconAirplane },
  { name: 'Tasks', href: '/golf/dashboard/tasks', icon: IconClipboardList },
  { name: 'Announcements', href: '/golf/dashboard/announcements', icon: IconBell },
];

interface GolfSidebarProps {
  userRole: 'coach' | 'player';
  userName?: string;
  teamName?: string;
  avatarUrl?: string;
  isMobile?: boolean;
}

export function GolfSidebar({ userRole, userName, teamName, avatarUrl, isMobile = false }: GolfSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { collapsed, setCollapsed, setMobileOpen } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const badges = useNotificationBadges();

  // Inject badge counts into nav items
  const primaryNav = useMemo(() => {
    const items = userRole === 'coach' ? coachNavItems : playerNavItems;
    return items.map(item => {
      if (item.name === 'Messages' && badges.messages > 0) return { ...item, badge: badges.messages };
      return item;
    });
  }, [userRole, badges.messages]);

  const secondaryNav = useMemo(() => {
    const items = userRole === 'coach' ? coachSecondaryNav : playerSecondaryNav;
    return items.map(item => {
      if (item.name === 'Tasks' && badges.tasks > 0) return { ...item, badge: badges.tasks };
      if (item.name === 'Announcements' && badges.announcements > 0) return { ...item, badge: badges.announcements };
      if (item.name === 'Travel' && badges.travel > 0) return { ...item, badge: badges.travel };
      return item;
    });
  }, [userRole, badges.tasks, badges.announcements, badges.travel]);

  // For mobile, always show expanded
  const isCollapsed = isMobile ? false : collapsed;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push('/golf/login');
  };

  const handleNavClick = () => {
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const isActive = (href: string) => {
    if (href === '/golf/dashboard') {
      return pathname === href;
    }
    // Segment-based matching: ensure the path matches at a segment boundary
    // e.g. /golf/dashboard/stats should not match /golf/dashboard/stats-overview
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        // Dark sidebar per Batch 3 spec
        'bg-[rgba(28,25,23,0.97)] backdrop-blur-xl',
        'h-dvh flex flex-col relative',
        'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'will-change-[width]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        !isMobile && 'fixed left-0 top-0 z-40',
        isMobile && 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
      )}
    >
      {/* Collapse Toggle Button (desktop only) */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-3 top-7 z-50',
            'w-6 h-6 rounded-full bg-warm-900 border border-white/20',
            'flex items-center justify-center',
            'shadow-lg hover:bg-white/10 hover:border-white/30',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/40'
          )}
        >
          {isCollapsed ? (
            <IconChevronRight size={14} className="text-white/70" aria-hidden="true" />
          ) : (
            <IconChevronLeft size={14} className="text-white/70" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-white/10',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-3 justify-center' : 'px-5'
      )}>
        <Link href="/golf/dashboard" prefetch={true} className="flex items-center gap-3" onClick={handleNavClick}>
          <div className="relative h-14 flex items-center">
            {/* Icon version (shown when collapsed OR as fallback) */}
            <div
              aria-hidden={!isCollapsed}
              className={cn(
                'w-14 h-14 flex items-center justify-center flex-shrink-0',
                'transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
              )}
            >
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="GolfHelm"
                width={56}
                height={56}
                className="w-14 h-14 object-contain"
                unoptimized
              />
            </div>
            {/* Full logo + text (shown when expanded) */}
            <div
              aria-hidden={isCollapsed}
              className={cn(
                'flex items-center gap-3 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-0 scale-75 absolute' : 'opacity-100 scale-100'
              )}
            >
              <div className="w-14 h-14 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Image
                  src="/helm-golf-logo-transparent.png"
                  alt=""
                  width={56}
                  height={56}
                  className="w-14 h-14 object-contain"
                  priority
                  unoptimized
                />
              </div>
              <span className="text-xl font-bold leading-none tracking-tight text-white">
                Golf<span className="text-primary-400">Helm</span>
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Team/User Info */}
      <div
        className={cn(
          'border-b border-white/10 overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'h-0 p-0 border-0' : 'h-auto px-5 py-4'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={userName || 'User avatar'}
                width={36}
                height={36}
                className="w-9 h-9 rounded-lg object-cover"
              />
            ) : (
              <span className="text-white font-semibold text-sm">
                {userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">
              {userName || 'User'}
            </p>
            <p className="text-xs text-white/50 truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" aria-hidden="true" />
              <span className="sr-only">Online - </span>
              {teamName || 'Golf Team'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        aria-label={userRole === 'coach' ? 'Coach navigation' : 'Player navigation'}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden py-4',
          'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'px-2' : 'px-3'
        )}
      >
        {/* Primary Navigation */}
        <div className="space-y-0.5">
          {!isCollapsed && (
            <p className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
              {userRole === 'coach' ? 'Team Management' : 'My Golf'}
            </p>
          )}
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onClick={handleNavClick}
                title={isCollapsed ? item.name : undefined}
                aria-label={isCollapsed ? item.name : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 py-3 lg:py-2.5 rounded-[10px] text-[13px] font-medium touch-manipulation overflow-hidden',
                  'transition-colors duration-150 ease-out will-change-transform',
                  'active:scale-[0.98]',
                  active
                    ? 'bg-white/10 text-primary-400'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/90',
                  isCollapsed ? 'justify-center px-2' : 'px-3'
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary-500" />
                )}
                <Icon size={18} className={cn('flex-shrink-0', active ? 'text-primary-400' : 'text-white/50')} aria-hidden="true" />
                <span
                  className={cn(
                    'whitespace-nowrap transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}
                >
                  {item.name}
                </span>
                {item.badge && !isCollapsed && (
                  <span className="ml-auto">
                    <CountBadge count={item.badge} variant="primary" />
                  </span>
                )}
                {item.badge && isCollapsed && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-warm-900" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Divider */}
        <div className="my-4 mx-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden="true" />

        {/* Secondary Navigation */}
        <div className="space-y-0.5">
          {!isCollapsed && (
            <p className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
              {userRole === 'coach' ? 'More' : 'Team'}
            </p>
          )}
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onClick={handleNavClick}
                title={isCollapsed ? item.name : undefined}
                aria-label={isCollapsed ? item.name : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 py-3 lg:py-2.5 rounded-[10px] text-[13px] font-medium touch-manipulation overflow-hidden',
                  'transition-colors duration-150 ease-out active:scale-[0.98]',
                  active
                    ? 'bg-white/10 text-primary-400'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/90',
                  isCollapsed ? 'justify-center px-2' : 'px-3'
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary-500" />
                )}
                <Icon size={18} className={cn('flex-shrink-0', active ? 'text-primary-400' : 'text-white/50')} aria-hidden="true" />
                <span
                  className={cn(
                    'whitespace-nowrap transition-opacity duration-300',
                    isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}
                >
                  {item.name}
                </span>
                {item.badge && !isCollapsed && (
                  <span className="ml-auto">
                    <CountBadge count={item.badge} variant="primary" />
                  </span>
                )}
                {item.badge && isCollapsed && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-warm-900" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className={cn(
        'border-t border-white/10 space-y-0.5',
        'transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-3'
      )}>
        <Link
          href="/golf/dashboard/settings"
          prefetch={true}
          onClick={handleNavClick}
          title={isCollapsed ? 'Settings' : undefined}
          aria-label={isCollapsed ? 'Settings' : undefined}
          aria-current={pathname.startsWith('/golf/dashboard/settings') ? 'page' : undefined}
          className={cn(
            'relative flex items-center gap-3 py-3 lg:py-2.5 rounded-[10px] text-[13px] font-medium touch-manipulation overflow-hidden',
            'transition-colors duration-150 ease-out active:scale-[0.98]',
            pathname.startsWith('/golf/dashboard/settings')
              ? 'bg-white/10 text-primary-400'
              : 'text-white/60 hover:bg-white/5 hover:text-white/90',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          {pathname.startsWith('/golf/dashboard/settings') && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary-500" />
          )}
          <IconSettings size={18} className="flex-shrink-0 text-white/50" aria-hidden="true" />
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-300',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            Settings
          </span>
        </Link>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          title={isCollapsed ? 'Sign out' : undefined}
          aria-label={isCollapsed ? (isSigningOut ? 'Signing out' : 'Sign out') : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-3 lg:py-2.5 rounded-[10px] text-[13px] font-medium touch-manipulation',
            'text-white/60 hover:bg-red-500/10 hover:text-red-400',
            'transition-colors duration-150 ease-out disabled:opacity-50 active:scale-[0.98]',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconLogout size={18} className="flex-shrink-0 text-white/50" aria-hidden="true" />
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-300',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </span>
        </button>
      </div>
    </aside>
  );
}
