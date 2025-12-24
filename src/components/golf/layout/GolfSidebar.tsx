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
  IconChevronLeft,
  IconChevronRight,
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
  const { collapsed, setCollapsed, setMobileOpen } = useSidebar();
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
        'bg-slate-50 border-r border-slate-200/80 h-screen flex flex-col relative',
        'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'will-change-[width]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        !isMobile && 'fixed left-0 top-0 z-40'
      )}
    >
      {/* Collapse Toggle Button (desktop only) */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'absolute -right-3 top-7 z-50',
            'w-6 h-6 rounded-full bg-white border border-slate-200',
            'flex items-center justify-center',
            'shadow-sm hover:shadow-md hover:border-slate-300',
            'transition-all duration-200',
            'opacity-0 hover:opacity-100 group-hover:opacity-100',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500/40'
          )}
          style={{ opacity: 1 }}
        >
          {isCollapsed ? (
            <IconChevronRight size={14} className="text-slate-500" />
          ) : (
            <IconChevronLeft size={14} className="text-slate-500" />
          )}
        </button>
      )}

      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-slate-200/80',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-3 justify-center' : 'px-5'
      )}>
        <Link href="/golf/dashboard" className="flex items-center gap-2" onClick={handleNavClick}>
          <div className="relative h-8 flex items-center">
            <div
              className={cn(
                'w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center',
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
          'border-b border-slate-200/80 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'h-0 p-0 border-0' : 'h-auto px-5 py-4'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">
                {userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {userName || 'User'}
            </p>
            <p className="text-xs text-slate-500 truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {teamName || 'Golf Team'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden py-4',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-2' : 'px-3'
      )}>
        {/* Primary Navigation */}
        <div className="space-y-0.5">
          {!isCollapsed && (
            <p className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
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
                  'flex items-center gap-3 py-2 rounded-lg text-[13px] font-medium',
                  'transition-all duration-150 ease-out will-change-transform',
                  'active:scale-[0.98]',
                  active
                    ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
                  isCollapsed ? 'justify-center px-2' : 'px-3'
                )}
              >
                <Icon size={18} className={cn('flex-shrink-0', active ? 'text-emerald-600' : 'text-slate-400')} />
                <span
                  className={cn(
                    'whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}
                >
                  {item.name}
                </span>
                {item.badge && !isCollapsed && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Secondary Navigation */}
        <div className="mt-6 space-y-0.5">
          {!isCollapsed && (
            <p className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
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
                  'flex items-center gap-3 py-2 rounded-lg text-[13px] font-medium',
                  'transition-all duration-150 ease-out',
                  active
                    ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
                  isCollapsed ? 'justify-center px-2' : 'px-3'
                )}
              >
                <Icon size={18} className={cn('flex-shrink-0', active ? 'text-emerald-600' : 'text-slate-400')} />
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
        'border-t border-slate-200/80 space-y-0.5',
        'transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-3'
      )}>
        <Link
          href="/golf/dashboard/settings"
          onClick={handleNavClick}
          title={isCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 py-2 rounded-lg text-[13px] font-medium',
            'transition-all duration-150 ease-out',
            pathname === '/golf/dashboard/settings'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconSettings size={18} className="flex-shrink-0 text-slate-400" />
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
            'w-full flex items-center gap-3 py-2 rounded-lg text-[13px] font-medium',
            'text-slate-600 hover:bg-red-50 hover:text-red-600',
            'transition-all duration-150 ease-out disabled:opacity-50 active:scale-[0.98]',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconLogout size={18} className="flex-shrink-0 text-slate-400" />
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
