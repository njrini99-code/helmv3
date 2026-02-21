'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  UsersIcon,
  CalendarIcon,
  MessageSquareIcon,
  BarChart3Icon,
  TrophyIcon,
  SettingsIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LogOutIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';

// ============================================
// TYPES
// ============================================

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

interface DarkSidebarProps {
  sport: 'baseball' | 'golf';
  role: 'coach' | 'player';
}

// ============================================
// NAV CONFIGURATION
// ============================================

const getNavSections = (sport: string, role: string): NavSection[] => {
  const basePath = `/${sport}/dashboard`;

  const coachNav: NavSection[] = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', href: basePath, icon: HomeIcon },
        { label: 'Roster', href: `${basePath}/roster`, icon: UsersIcon },
        { label: 'Calendar', href: `${basePath}/calendar`, icon: CalendarIcon },
        { label: 'Messages', href: `${basePath}/messages`, icon: MessageSquareIcon },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Statistics', href: `${basePath}/stats`, icon: BarChart3Icon },
        {
          label: sport === 'golf' ? 'Tournaments' : 'Games',
          href: `${basePath}/${sport === 'golf' ? 'tournaments' : 'games'}`,
          icon: TrophyIcon,
        },
      ],
    },
  ];

  const playerNav: NavSection[] = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', href: basePath, icon: HomeIcon },
        { label: 'My Stats', href: `${basePath}/stats`, icon: BarChart3Icon },
        { label: 'Calendar', href: `${basePath}/calendar`, icon: CalendarIcon },
        { label: 'Messages', href: `${basePath}/messages`, icon: MessageSquareIcon },
      ],
    },
  ];

  return role === 'coach' ? coachNav : playerNav;
};

// ============================================
// COMPONENT
// ============================================

export function DarkSidebar({ sport, role }: DarkSidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const navSections = getNavSections(sport, role);

  // Load collapsed state from localStorage
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('dark-sidebar-collapsed');
    if (stored) setCollapsed(JSON.parse(stored));
  }, []);

  // Save collapsed state
  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('dark-sidebar-collapsed', JSON.stringify(newState));
  };

  // Check if nav item is active
  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Logo based on sport
  const Logo = () => (
    <div
      className={cn(
        'flex items-center gap-3 px-4 h-16',
        collapsed && 'justify-center px-0'
      )}
    >
      <div
        className="
        w-9 h-9 rounded-[10px]
        bg-gradient-to-br from-primary-500 to-primary-600
        flex items-center justify-center
        text-white text-lg
        shadow-lg shadow-primary-500/25
      "
      >
        {sport === 'golf' ? '⛳️' : '⚾️'}
      </div>
      {!collapsed && (
        <span className="font-bold text-lg text-white tracking-tight">
          {sport === 'golf' ? 'GolfHelm' : 'BaseballHelm'}
        </span>
      )}
    </div>
  );

  if (!mounted) return null;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40',
        'flex flex-col',
        'bg-[#1C1917]', // Dark background
        'border-r border-white/5',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]',
        'hidden lg:flex' // Hide on mobile
      )}
    >
      {/* ============================================ */}
      {/* LOGO */}
      {/* ============================================ */}
      <Logo />

      {/* ============================================ */}
      {/* SEARCH (optional, expanded only) */}
      {/* ============================================ */}
      {!collapsed && (
        <div className="px-3 mb-2">
          <button
            className="
            w-full flex items-center gap-3
            px-3 py-2.5
            bg-white/5 hover:bg-white/10 active:bg-white/15
            border border-white/10
            rounded-[10px]
            text-sm text-warm-400
            transition-colors duration-200
          "
          >
            <SearchIcon className="w-4 h-4" />
            <span>Search...</span>
            <kbd
              className="
              ml-auto px-1.5 py-0.5
              bg-white/10 rounded
              text-micro text-warm-500
            "
            >
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* ============================================ */}
      {/* NAV SECTIONS */}
      {/* ============================================ */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            {/* Section Label */}
            {section.label && !collapsed && (
              <div
                className="
                px-3 mb-2
                text-label font-semibold text-warm-500
                uppercase tracking-wider
              "
              >
                {section.label}
              </div>
            )}

            {/* Section divider for collapsed */}
            {section.label && collapsed && sectionIndex > 0 && (
              <div
                className="
                mx-auto my-3 w-8 h-px
                bg-gradient-to-r from-transparent via-white/20 to-transparent
              "
              />
            )}

            {/* Nav Items */}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-3',
                      'rounded-[10px]',
                      'transition-all duration-200',
                      collapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-warm-400 hover:bg-white/5 active:bg-white/10 hover:text-white'
                    )}
                  >
                    {/* Active indicator bar */}
                    {active && (
                      <div
                        className="
                        absolute left-0 top-1/2 -translate-y-1/2
                        w-[3px] h-5
                        bg-primary-500
                        rounded-r-full
                      "
                      />
                    )}

                    {/* Icon */}
                    <Icon
                      className={cn(
                        'w-5 h-5 flex-shrink-0',
                        'transition-colors duration-200',
                        active
                          ? 'text-primary-400'
                          : 'text-warm-400 group-hover:text-white'
                      )}
                    />

                    {/* Label */}
                    {!collapsed && (
                      <span className="text-sm font-medium flex-1">
                        {item.label}
                      </span>
                    )}

                    {/* Badge */}
                    {item.badge && item.badge > 0 && (
                      <span
                        className={cn(
                          'flex items-center justify-center',
                          'min-w-[20px] h-5 px-1.5',
                          'bg-primary-600 text-white',
                          'text-label font-bold',
                          'rounded-full',
                          collapsed &&
                            'absolute -top-1 -right-1 min-w-[18px] h-[18px] text-micro'
                        )}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}

                    {/* Tooltip for collapsed */}
                    {collapsed && (
                      <div
                        className="
                        absolute left-full ml-3
                        px-3 py-1.5
                        bg-warm-900 text-white text-sm
                        rounded-lg
                        opacity-0 invisible
                        group-hover:opacity-100 group-hover:visible
                        transition-all duration-200
                        whitespace-nowrap
                        z-50
                        shadow-xl
                      "
                      >
                        {item.label}
                        {item.badge && ` (${item.badge})`}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ============================================ */}
      {/* BOTTOM SECTION */}
      {/* ============================================ */}
      <div
        className="
        mt-auto
        border-t border-white/10
        p-3
      "
      >
        {/* Settings */}
        <Link
          href={`/${sport}/dashboard/settings`}
          className={cn(
            'flex items-center gap-3',
            'px-3 py-2.5 rounded-[10px]',
            'text-warm-400 hover:bg-white/5 active:bg-white/10 hover:text-white',
            'transition-colors duration-200',
            collapsed && 'justify-center'
          )}
        >
          <SettingsIcon className="w-5 h-5" />
          {!collapsed && (
            <span className="text-sm font-medium">Settings</span>
          )}
        </Link>

        {/* User Profile */}
        <div
          className={cn(
            'flex items-center gap-3 mt-2',
            'px-3 py-2.5 rounded-[10px]',
            'bg-white/5',
            collapsed && 'justify-center px-2'
          )}
        >
          {/* Avatar */}
          <div
            className="
            w-9 h-9 rounded-[10px]
            bg-gradient-to-br from-warm-600 to-warm-700
            flex items-center justify-center
            text-white font-semibold text-sm
            flex-shrink-0
          "
          >
            {user?.user_metadata?.first_name?.[0] || user?.email?.[0] || 'U'}
            {user?.user_metadata?.last_name?.[0] || ''}
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.first_name || 'User'}{' '}
                {user?.user_metadata?.last_name || ''}
              </div>
              <div className="text-xs text-warm-500 truncate">
                {role === 'coach' ? 'Head Coach' : 'Player'}
              </div>
            </div>
          )}

          {!collapsed && (
            <button
              className="
                p-1.5 rounded-lg
                text-warm-500 hover:text-white hover:bg-white/10 active:bg-white/15
                transition-colors duration-200
              "
              title="Sign out"
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* COLLAPSE TOGGLE */}
      {/* ============================================ */}
      <button
        onClick={toggleCollapsed}
        className="
          absolute -right-3 top-20
          w-6 h-6 rounded-full
          bg-[#1C1917] border border-white/20
          flex items-center justify-center
          text-warm-400 hover:text-white
          transition-colors duration-200
          shadow-lg
        "
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRightIcon className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        )}
      </button>
    </aside>
  );
}
