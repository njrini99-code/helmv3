'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useSidebar } from '@/contexts/sidebar-context';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { CountBadge } from '@/components/ui/badge';
import { TooltipRoot, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  IconHome,
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconMessage,
  IconSettings,
  IconLogout,
  IconGolf,
  IconBook,
  IconChevronLeft,
  IconChevronRight,
  IconTrophy,
  IconTarget,
  IconSparkles,
  IconUserPlus,
} from '@/components/icons';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
}

// =============================================================================
// IA Discipline — 7 primary + 3 secondary per role (Miller's 7±2)
// =============================================================================
// IA audit 2026-05-28 verdict: coach had 10 primary + 4 secondary, player had
// 9 primary + 5 secondary — both 2× Miller's 7±2. The full surface area is
// still reachable via the Cmd+K command palette and direct URL; pages are
// untouched. Only the rail's "noise floor" was cut so the brand can breathe.
//
// Selection rule: daily-use destinations stay primary; weekly destinations
// move to secondary; monthly/admin destinations are Cmd+K only.

// Coach primary nav — 7 daily-use destinations (decisions + flow)
const coachNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'CoachHelm AI', href: '/golf/dashboard/intelligence', icon: IconSparkles },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage },
];

// Coach secondary — 3 weekly-use destinations
// Cmd+K only: Travel, Documents, Tasks, Announcements
const coachSecondaryNav: NavItem[] = [
  { name: 'Recruiting HQ', href: '/golf/dashboard/recruiting', icon: IconUserPlus },
  { name: 'Development', href: '/golf/dashboard/development', icon: IconTarget },
  { name: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
];

// Player primary nav — 7 daily-use destinations
const playerNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'CoachHelm AI', href: '/golf/dashboard/coachhelm', icon: IconSparkles },
  { name: 'My Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { name: 'My Development', href: '/golf/dashboard/my-development', icon: IconTarget },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'My Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage },
];

// Player secondary — 3 weekly-use destinations
// Cmd+K only: Team Info, Travel, Tasks, Announcements
const playerSecondaryNav: NavItem[] = [
  { name: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: IconTrophy },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Classes', href: '/golf/dashboard/classes', icon: IconBook },
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
  const supabase = useMemo(() => createClient(), []);
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

  // Secondary nav has no badge surfaces today — Tasks/Announcements/Travel
  // moved to Cmd+K only in the 2026-05-28 IA trim. Keep the memo shape so
  // adding a badge later is a one-line change.
  const secondaryNav = useMemo(() => {
    return userRole === 'coach' ? coachSecondaryNav : playerSecondaryNav;
  }, [userRole]);

  // For mobile, always show expanded
  const isCollapsed = isMobile ? false : collapsed;

  const handleSignOut = async () => {
    void triggerHaptic('heavy');
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push('/golf/login');
  };

  const handleNavClick = () => {
    if (isMobile) {
      void triggerHaptic('light');
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
        // Warm-charcoal sidebar — a sculpted basalt block beside the
        // linen canvas. The hue (28,25,23) has the same warm cast as
        // warm-900, so the cream page reads as the bright element and
        // the rail recedes.
        'bg-[rgba(28,25,23,0.96)] backdrop-blur-xl',
        'flex flex-col relative',
        'transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'will-change-[width]',
        isMobile
          ? 'w-full h-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : cn(
              'h-dvh fixed left-0 top-0 z-40',
              isCollapsed ? 'w-[72px]' : 'w-64'
            )
      )}
    >
      {/* Collapse Toggle Button (desktop only) */}
      {!isMobile && (
        <Button variant="ghost"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-3 top-7 z-50',
            'w-6 h-6 rounded-full bg-[rgba(28,25,23,0.96)] ring-1 ring-white/15',
            'flex items-center justify-center',
            'shadow-[0_2px_8px_rgba(0,0,0,0.25)] hover:bg-white/8',
            'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
          )}
        >
          {isCollapsed ? (
            <IconChevronRight size={14} className="text-white/65" aria-hidden="true" />
          ) : (
            <IconChevronLeft size={14} className="text-white/65" aria-hidden="true" />
          )}
        </Button>
      )}

      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-white/[0.06]',
        'transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isCollapsed ? 'px-3 justify-center' : 'px-5'
      )}>
        <Link href="/golf/dashboard" prefetch={true} className="flex items-center gap-3" onClick={handleNavClick}>
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
            <Image
              src="/helm-golf-logo-transparent.png"
              alt="GolfHelm"
              width={36}
              height={36}
              className="w-9 h-9 object-contain"
              priority
              unoptimized
            />
          </div>
          {!isCollapsed && (
            <span className="text-body-lg font-medium leading-none tracking-[-0.012em] text-white">
              Golf<span className="text-primary-400/85">Helm</span>
            </span>
          )}
        </Link>
      </div>

      {/* Team/User Info */}
      <div
        className={cn(
          'border-b border-white/[0.06] overflow-hidden transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isCollapsed ? 'h-0 p-0 border-0' : 'h-auto px-5 py-5'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-400/85 to-primary-700/95 flex items-center justify-center flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={userName || 'User avatar'}
                width={40}
                height={40}
                className="w-10 h-10 rounded-2xl object-cover"
              />
            ) : (
              <span className="text-white font-medium text-body-sm tracking-[-0.005em]">
                {userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-white truncate tracking-[-0.005em]">
              {userName || 'User'}
            </p>
            <p className="text-[11.5px] text-white/45 truncate flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-primary-400/80" aria-hidden />
              {teamName || 'Golf Team'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        aria-label={userRole === 'coach' ? 'Coach navigation' : 'Player navigation'}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-hidden',
          'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'px-2' : 'px-3'
        )}
      >
        {/* Primary Navigation */}
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="px-4 pt-1 pb-3 text-[10.5px] font-medium text-white/35 uppercase tracking-[0.12em] whitespace-nowrap">
              {userRole === 'coach' ? 'Team Management' : 'My Golf'}
            </p>
          )}
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const link = (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onClick={handleNavClick}
                aria-label={isCollapsed ? item.name : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 py-2.5 lg:py-2.5 rounded-2xl text-[13.5px] font-medium touch-manipulation',
                  'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  active
                    ? 'bg-white/[0.07] text-white'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
                  isCollapsed ? 'justify-center px-2' : 'px-3.5'
                )}
              >
                <Icon size={17} className={cn('flex-shrink-0', active ? 'text-primary-400/95' : 'text-white/45')} aria-hidden="true" />
                <span
                  className={cn(
                    'whitespace-nowrap transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
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
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-[rgba(28,25,23,0.96)]" />
                )}
              </Link>
            );
            if (isCollapsed && !isMobile) {
              return (
                <TooltipRoot key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>{item.name}</TooltipContent>
                </TooltipRoot>
              );
            }
            return link;
          })}
        </div>

        {/* Divider — minimal hairline, no gradient */}
        <div className="my-5 mx-4 h-px bg-white/[0.05]" aria-hidden />

        {/* Secondary Navigation */}
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="px-4 pt-1 pb-3 text-[10.5px] font-medium text-white/35 uppercase tracking-[0.12em] whitespace-nowrap">
              {userRole === 'coach' ? 'More' : 'Team'}
            </p>
          )}
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const link = (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onClick={handleNavClick}
                aria-label={isCollapsed ? item.name : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 py-2.5 lg:py-2.5 rounded-2xl text-[13.5px] font-medium touch-manipulation',
                  'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  active
                    ? 'bg-white/[0.07] text-white'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
                  isCollapsed ? 'justify-center px-2' : 'px-3.5'
                )}
              >
                <Icon size={17} className={cn('flex-shrink-0', active ? 'text-primary-400/95' : 'text-white/45')} aria-hidden="true" />
                <span
                  className={cn(
                    'whitespace-nowrap transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
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
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-[rgba(28,25,23,0.96)]" />
                )}
              </Link>
            );
            if (isCollapsed && !isMobile) {
              return (
                <TooltipRoot key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>{item.name}</TooltipContent>
                </TooltipRoot>
              );
            }
            return link;
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className={cn(
        'border-t border-white/[0.06] space-y-1',
        'transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
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
            'relative flex items-center gap-3 py-2.5 rounded-2xl text-[13.5px] font-medium touch-manipulation',
            'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            pathname.startsWith('/golf/dashboard/settings')
              ? 'bg-white/[0.07] text-white'
              : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
            isCollapsed ? 'justify-center px-2' : 'px-3.5'
          )}
        >
          <IconSettings size={17} className={cn('flex-shrink-0', pathname.startsWith('/golf/dashboard/settings') ? 'text-primary-400/95' : 'text-white/45')} aria-hidden="true" />
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            Settings
          </span>
        </Link>
        <Button variant="danger"
          onClick={handleSignOut}
          disabled={isSigningOut}
          title={isCollapsed ? 'Sign out' : undefined}
          aria-label={isCollapsed ? (isSigningOut ? 'Signing out' : 'Sign out') : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-2.5 rounded-2xl text-[13.5px] font-medium touch-manipulation',
            'text-white/55 hover:bg-red-500/8 hover:text-red-400',
            'transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:opacity-50',
            isCollapsed ? 'justify-center px-2' : 'px-3.5'
          )}
        >
          <IconLogout size={17} className="flex-shrink-0 text-white/45" aria-hidden="true" />
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </span>
        </Button>
      </div>
    </aside>
  );
}
