'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
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

// Coach navigation - team management focused
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
}

export function GolfSidebar({ userRole, userName, teamName, avatarUrl }: GolfSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const primaryNav = userRole === 'coach' ? coachNavItems : playerNavItems;
  const secondaryNav = userRole === 'coach' ? coachSecondaryNav : playerSecondaryNav;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push('/golf/login');
  };

  const isActive = (href: string) => {
    if (href === '/golf/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-slate-200">
        <Link href="/golf/dashboard" className="flex items-center gap-2">
          <img
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            className="h-8 w-auto"
          />
        </Link>
      </div>

      {/* Team/User Info */}
      <div className="p-4 border-b border-slate-200">
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
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Primary Navigation */}
        <div className="px-2 space-y-1">
          <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {userRole === 'coach' ? 'Team Management' : 'My Golf'}
          </p>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon size={20} className={active ? 'text-green-600' : 'text-slate-400'} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Secondary Navigation */}
        <div className="px-2 mt-6 space-y-1">
          <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {userRole === 'coach' ? 'More' : 'Team'}
          </p>
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Icon size={20} className={active ? 'text-green-600' : 'text-slate-400'} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-slate-200 space-y-1">
        <Link
          href="/golf/dashboard/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname === '/golf/dashboard/settings'
              ? 'bg-green-50 text-green-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          )}
        >
          <IconSettings size={20} className="text-slate-400" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          <IconLogout size={20} className="text-slate-400" />
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
