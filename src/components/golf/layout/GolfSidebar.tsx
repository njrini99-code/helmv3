'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useSidebar } from '@/contexts/sidebar-context';
import {
  IconHome,
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconMail,
  IconAirplane,
  IconFolder,
  IconClipboardList,
  IconBell,
  IconSettings,
  IconLogout,
  IconGolf,
  IconUser,
  IconBook,
} from '@/components/icons';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

// Coach navigation
const coachNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: IconFlag },
  { name: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMail },
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
  { name: 'My Rounds', href: '/golf/dashboard/rounds', icon: IconGolf },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'My Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Classes', href: '/golf/dashboard/classes', icon: IconBook },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMail },
];

const playerSecondaryNav: NavItem[] = [
  { name: 'Team Info', href: '/golf/dashboard/team', icon: IconUsers },
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
  const { collapsed, setMobileOpen } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const primaryNav = userRole === 'coach' ? coachNavItems : playerNavItems;
  const secondaryNav = userRole === 'coach' ? coachSecondaryNav : playerSecondaryNav;

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
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'bg-white border-r border-slate-200 h-screen flex flex-col',
        'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'will-change-[width]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        !isMobile && 'fixed left-0 top-0 z-40'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-slate-200',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-3 justify-center' : 'p-4'
      )}>
        <Link href="/golf/dashboard" className="flex items-center gap-2" onClick={handleNavClick}>
          {/* Show "G" badge when collapsed, full logo when expanded */}
          <div className="relative h-8 flex items-center">
            <div
              className={cn(
                'w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center',
                'shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
              )}
            >
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <img
              src="/helm-golf-logo.png"
              alt="GolfHelm"
              className={cn(
                'h-8 w-auto transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-0 scale-75 absolute' : 'opacity-100 scale-100'
              )}
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
        </Link>
      </div>

      {/* Team/User Info */}
      <div
        className={cn(
          'border-b border-slate-200 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'h-0 p-0 border-0' : 'h-auto p-4'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <IconUser size={20} className="text-green-600" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {userName || 'User'}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {teamName || 'Golf Team'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden py-4',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-2' : 'px-2'
      )}>
        {/* Primary Navigation */}
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
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
                onClick={handleNavClick}
                title={isCollapsed ? item.name : undefined}
                className={cn(
                  'flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium',
                  'transition-all duration-150 ease-out will-change-transform',
                  'active:scale-[0.98]',
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  isCollapsed ? 'justify-center px-2' : 'px-3'
                )}
              >
                <Icon size={20} className={cn('flex-shrink-0', active ? 'text-green-600' : 'text-slate-400')} />
                <span
                  className={cn(
                    'whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Secondary Navigation */}
        <div className="mt-6 space-y-1">
          {!isCollapsed && (
            <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
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
                onClick={handleNavClick}
                title={isCollapsed ? item.name : undefined}
                className={cn(
                  'flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium',
                  'transition-all duration-150 ease-out',
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  isCollapsed ? 'justify-center px-2' : 'px-3'
                )}
              >
                <Icon size={20} className={cn('flex-shrink-0', active ? 'text-green-600' : 'text-slate-400')} />
                <span
                  className={cn(
                    'whitespace-nowrap transition-all duration-300',
                    isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className={cn(
        'border-t border-slate-200 space-y-1',
        'transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-4'
      )}>
        <Link
          href="/golf/dashboard/settings"
          onClick={handleNavClick}
          title={isCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium',
            'transition-all duration-150 ease-out',
            pathname === '/golf/dashboard/settings'
              ? 'bg-green-50 text-green-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconSettings size={20} className="flex-shrink-0 text-slate-400" />
          <span
            className={cn(
              'whitespace-nowrap transition-all duration-300',
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
          className={cn(
            'w-full flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium',
            'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            'transition-all duration-150 ease-out disabled:opacity-50 active:scale-[0.98]',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconLogout size={20} className="flex-shrink-0 text-slate-400" />
          <span
            className={cn(
              'whitespace-nowrap transition-all duration-300',
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
