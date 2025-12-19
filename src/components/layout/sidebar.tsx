'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { ModeToggle, type Mode } from './mode-toggle';
import {
  IconHome,
  IconSearch,
  IconUsers,
  IconMessage,
  IconChart,
  IconSettings,
  IconLogOut,
  IconUser,
  IconBuilding,
  IconVideo,
  IconCalendar,
  IconNote,
  IconTarget,
  IconStar,
  IconEye,
  IconChevronLeft,
  IconHelp,
} from '@/components/icons';

// College/JUCO Coach - Recruiting Mode
const coachRecruitingNav = [
  { name: 'Dashboard', href: '/dashboard', icon: IconHome },
  { name: 'Discover', href: '/dashboard/discover', icon: IconSearch },
  { name: 'Watchlist', href: '/dashboard/watchlist', icon: IconStar },
  { name: 'Pipeline', href: '/dashboard/pipeline', icon: IconUsers },
  { name: 'Compare', href: '/dashboard/compare', icon: IconTarget },
  { name: 'Camps', href: '/dashboard/camps', icon: IconCalendar },
  { name: 'Messages', href: '/dashboard/messages', icon: IconMessage, badge: true },
];

// HS/JUCO/Showcase Coach - Team Mode
const coachTeamNav = [
  { name: 'Dashboard', href: '/dashboard/team', icon: IconHome },
  { name: 'Roster', href: '/dashboard/roster', icon: IconUsers },
  { name: 'Videos', href: '/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/dashboard/dev-plans', icon: IconNote },
  { name: 'College Interest', href: '/dashboard/college-interest', icon: IconEye },
  { name: 'Calendar', href: '/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/dashboard/messages', icon: IconMessage, badge: true },
];

// Player - Recruiting Mode
const playerRecruitingNav = [
  { name: 'Dashboard', href: '/dashboard', icon: IconHome },
  { name: 'My Profile', href: '/dashboard/profile', icon: IconUser },
  { name: 'Colleges', href: '/dashboard/colleges', icon: IconBuilding },
  { name: 'Journey', href: '/dashboard/journey', icon: IconTarget },
  { name: 'Camps', href: '/dashboard/camps', icon: IconCalendar },
  { name: 'Messages', href: '/dashboard/messages', icon: IconMessage, badge: true },
  { name: 'Analytics', href: '/dashboard/analytics', icon: IconChart },
];

// Player - Team Mode
const playerTeamNav = [
  { name: 'Dashboard', href: '/dashboard/team', icon: IconHome },
  { name: 'My Profile', href: '/dashboard/profile', icon: IconUser },
  { name: 'Videos', href: '/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plan', href: '/dashboard/dev-plan', icon: IconNote },
  { name: 'Calendar', href: '/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/dashboard/team/messages', icon: IconMessage, badge: true },
];

// Secondary navigation (coach)
const coachSecondaryNav = [
  { name: 'Program', href: '/dashboard/program', icon: IconBuilding },
  { name: 'Settings', href: '/dashboard/settings', icon: IconSettings },
  { name: 'Help', href: '/help', icon: IconHelp },
];

// Secondary navigation (player)
const playerSecondaryNav = [
  { name: 'Settings', href: '/dashboard/settings', icon: IconSettings },
  { name: 'Help', href: '/help', icon: IconHelp },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ collapsed = false, onToggle, onClose, isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, coach, player, signOut } = useAuth();

  // Determine if user should see mode toggle
  const showModeToggle =
    (coach?.coach_type === 'juco') ||
    (player && player.recruiting_activated && player.player_type !== 'college');

  // Determine initial mode based on pathname
  const getInitialMode = (): Mode => {
    if (pathname.includes('/team') || pathname.includes('/roster') || pathname.includes('/dev-plan')) {
      return 'team';
    }
    return 'recruiting';
  };

  const [currentMode, setCurrentMode] = useState<Mode>(getInitialMode());

  // Update mode when pathname changes
  useEffect(() => {
    setCurrentMode(getInitialMode());
  }, [pathname]);

  // Determine navigation based on role, coach type, and mode
  const getNavigation = () => {
    if (user?.role === 'coach') {
      if (coach?.coach_type === 'college') {
        return coachRecruitingNav;
      } else if (coach?.coach_type === 'juco') {
        return currentMode === 'recruiting' ? coachRecruitingNav : coachTeamNav;
      } else {
        // HS and Showcase coaches only have team mode
        return coachTeamNav;
      }
    } else if (user?.role === 'player') {
      if (player?.player_type === 'college' || !player?.recruiting_activated) {
        // College players or players without recruiting activated only see team mode
        return playerTeamNav;
      } else {
        // HS, Showcase, JUCO players with recruiting activated can toggle
        return currentMode === 'recruiting' ? playerRecruitingNav : playerTeamNav;
      }
    }
    return coachRecruitingNav; // Default fallback
  };

  const navigation = getNavigation();
  const secondaryNav = user?.role === 'coach' ? coachSecondaryNav : playerSecondaryNav;
  const displayName = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const subtitle = coach ? (coach.school_name || 'Coach') : (player ? `${player.primary_position} • ${player.grad_year}` : '');

  const handleModeChange = (mode: Mode) => {
    setCurrentMode(mode);
    // Redirect to appropriate dashboard based on mode
    if (mode === 'recruiting') {
      router.push('/dashboard');
    } else {
      router.push('/dashboard/team');
    }
  };

  const handleNavClick = () => {
    // Close mobile sidebar on navigation
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-slate-100 flex flex-col transition-all duration-300 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-60',
        !isMobile && 'fixed left-0 top-0 z-40'
      )}
    >
      {/* Logo */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group"
          onClick={handleNavClick}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:scale-105">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-slate-900 tracking-tight text-lg">Helm</span>
          )}
        </Link>
        {onToggle && !isMobile && (
          <button
            onClick={onToggle}
            className={cn(
              'p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200',
              collapsed && 'absolute -right-3 top-6 bg-white border border-slate-200 shadow-sm z-50'
            )}
          >
            <IconChevronLeft
              size={16}
              className={cn('transition-transform duration-300', collapsed && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar">
        {showModeToggle && !collapsed && (
          <div className="mb-4 px-1">
            <ModeToggle currentMode={currentMode} onModeChange={handleModeChange} />
          </div>
        )}

        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/dashboard/team' && pathname.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <item.icon
                    size={20}
                    className={cn(
                      'flex-shrink-0 transition-colors',
                      isActive ? 'text-green-600' : 'text-slate-400'
                    )}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.name}</span>
                      {item.badge && (
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </>
                  )}
                  {collapsed && item.badge && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Divider */}
        <div className="my-4 border-t border-slate-100" />

        {/* Secondary Navigation */}
        <ul className="space-y-1">
          {secondaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <item.icon size={20} className="flex-shrink-0 text-slate-400" />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-slate-100">
        {/* Upgrade CTA (only when expanded) */}
        {!collapsed && (
          <div className="mb-3 p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
            <div className="text-sm font-medium text-slate-900 mb-1">Upgrade to Pro</div>
            <div className="text-xs text-slate-500 mb-3">Unlock unlimited features</div>
            <button className="w-full py-2 px-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
              Upgrade Now
            </button>
          </div>
        )}

        {/* User info */}
        {!collapsed && (
          <div className="px-3 py-2.5 mb-2 rounded-xl bg-slate-50">
            <p className="text-sm font-medium text-slate-900 truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all duration-200',
            collapsed && 'justify-center px-2'
          )}
        >
          <IconLogOut size={20} className="text-slate-400" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
