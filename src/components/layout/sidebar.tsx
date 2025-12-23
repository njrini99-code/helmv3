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
  IconHelp,
  IconGraduationCap,
  IconLayers,
} from '@/components/icons';
import { TeamSwitcher } from './team-switcher';
import { useTeams } from '@/hooks/use-teams';
import { usePlayerTeams } from '@/hooks/use-player-teams';
import { useUnreadCount } from '@/hooks/use-unread-count';
import { useSidebar } from '@/contexts/sidebar-context';

// College/JUCO Coach - Recruiting Mode
const coachRecruitingNav = [
  { name: 'Dashboard', href: '/baseball/dashboard', icon: IconHome },
  { name: 'Discover', href: '/baseball/dashboard/discover', icon: IconSearch },
  { name: 'Watchlist', href: '/baseball/dashboard/watchlist', icon: IconStar },
  { name: 'Pipeline', href: '/baseball/dashboard/pipeline', icon: IconUsers },
  { name: 'Compare', href: '/baseball/dashboard/compare', icon: IconTarget },
  { name: 'Camps', href: '/baseball/dashboard/camps', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// HS Coach - Team Mode (HS-specific dashboard)
const hsCoachTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team/high-school', icon: IconHome },
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'College Interest', href: '/baseball/dashboard/college-interest', icon: IconEye },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// Showcase Coach - Team Mode
const showcaseCoachTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// JUCO Coach - Team Mode (includes Academics)
const jucoTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'Academics', href: '/baseball/dashboard/academics', icon: IconGraduationCap },
  { name: 'College Interest', href: '/baseball/dashboard/college-interest', icon: IconEye },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// Showcase Coach - Organization Mode (manages multiple teams)
const showcaseOrgNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'Teams', href: '/baseball/dashboard/teams', icon: IconLayers },
  { name: 'Events', href: '/baseball/dashboard/events', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// Showcase Coach - Team-specific navigation (shown when team selected)
const showcaseTeamNav = [
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
];

// Player - Recruiting Mode
const playerRecruitingNav = [
  { name: 'Dashboard', href: '/baseball/dashboard', icon: IconHome },
  { name: 'My Profile', href: '/baseball/dashboard/profile', icon: IconUser },
  { name: 'Colleges', href: '/baseball/dashboard/colleges', icon: IconBuilding },
  { name: 'Journey', href: '/baseball/dashboard/journey', icon: IconTarget },
  { name: 'Camps', href: '/baseball/dashboard/camps', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
  { name: 'Analytics', href: '/baseball/dashboard/analytics', icon: IconChart },
];

// Player - Team Mode
const playerTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'My Profile', href: '/baseball/dashboard/profile', icon: IconUser },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plan', href: '/baseball/dashboard/dev-plan', icon: IconNote },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// Secondary navigation (coach)
const coachSecondaryNav = [
  { name: 'Program', href: '/baseball/dashboard/program', icon: IconBuilding },
  { name: 'Settings', href: '/baseball/dashboard/settings', icon: IconSettings },
  { name: 'Help', href: '/help', icon: IconHelp },
];

// Secondary navigation (player)
const playerSecondaryNav = [
  { name: 'Settings', href: '/baseball/dashboard/settings', icon: IconSettings },
  { name: 'Help', href: '/help', icon: IconHelp },
];

interface SidebarProps {
  isMobile?: boolean;
}

export function Sidebar({ isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, coach, player, signOut, coachMode, setCoachMode } = useAuth();
  const { unreadCount } = useUnreadCount();
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();

  // Use appropriate teams hook based on user role
  const coachTeams = useTeams();
  const playerTeams = usePlayerTeams();
  const { hasMultipleTeams, selectedTeam } = user?.role === 'coach' ? coachTeams : playerTeams;

  // Determine sport-specific logo based on pathname
  const isGolf = pathname.startsWith('/golf');
  const logoSrc = isGolf ? '/helm-golf-logo.png' : '/helm-baseball-logo.png';
  const logoAlt = isGolf ? 'GolfHelm' : 'BaseballHelm';
  const dashboardHref = isGolf ? '/golf/dashboard' : '/baseball/dashboard';

  // Determine if user should see mode toggle
  const showModeToggle =
    (coach?.coach_type === 'juco') ||
    (player && player.recruiting_activated && player.player_type !== 'college');

  // Use persisted coach mode from Zustand store
  const currentMode = coachMode as Mode;

  // Determine navigation based on role, coach type, and mode
  const getNavigation = () => {
    if (user?.role === 'coach') {
      if (coach?.coach_type === 'college') {
        return coachRecruitingNav;
      } else if (coach?.coach_type === 'juco') {
        return currentMode === 'recruiting' ? coachRecruitingNav : jucoTeamNav;
      } else if (coach?.coach_type === 'showcase') {
        return showcaseOrgNav;
      } else if (coach?.coach_type === 'high_school') {
        return hsCoachTeamNav;
      } else {
        return hsCoachTeamNav;
      }
    } else if (user?.role === 'player') {
      if (player?.player_type === 'college' || !player?.recruiting_activated) {
        return playerTeamNav;
      } else {
        return currentMode === 'recruiting' ? playerRecruitingNav : playerTeamNav;
      }
    }
    return coachRecruitingNav;
  };

  const getTeamNavigation = () => {
    if (coach?.coach_type === 'showcase' && selectedTeam) {
      return showcaseTeamNav;
    }
    return [];
  };

  const navigation = getNavigation();
  const teamNavigation = getTeamNavigation();
  const secondaryNav = user?.role === 'coach' ? coachSecondaryNav : playerSecondaryNav;
  const displayName = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
  const isShowcaseCoach = coach?.coach_type === 'showcase';
  const subtitle = coach ? (coach.school_name || 'Coach') : (player ? `${player.primary_position} • ${player.grad_year}` : '');

  const handleModeChange = (mode: Mode) => {
    setCoachMode(mode as 'recruiting' | 'team');
    if (mode === 'recruiting') {
      router.push('/baseball/dashboard');
    } else {
      if (coach?.coach_type === 'high_school') {
        router.push('/baseball/dashboard/team/high-school');
      } else {
        router.push('/baseball/dashboard/team');
      }
    }
  };

  const handleNavClick = () => {
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/baseball/login');
  };

  // For mobile, always show expanded; for desktop, use collapsed state
  const isCollapsed = isMobile ? false : collapsed;

  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-slate-100 flex flex-col',
        'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'will-change-[width]',
        isCollapsed ? 'w-[72px]' : 'w-60',
        !isMobile && 'fixed left-0 top-0 z-40'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-slate-100',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-3 justify-center' : 'px-4'
      )}>
        <Link
          href={dashboardHref}
          className="flex items-center group overflow-hidden"
          onClick={handleNavClick}
        >
          {/* Show "H" badge when collapsed, full logo when expanded */}
          <div className="relative h-9 flex items-center">
            {/* Icon badge - visible when collapsed */}
            <div
              className={cn(
                'w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center',
                'shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
              )}
            >
              <span className="text-white font-bold text-lg">H</span>
            </div>
            {/* Full logo - visible when expanded */}
            <img
              src={logoSrc}
              alt={logoAlt}
              className={cn(
                'h-9 w-auto transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-0 scale-75 absolute' : 'opacity-100 scale-100'
              )}
            />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 py-4 overflow-y-auto overflow-x-hidden custom-scrollbar',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-2' : 'px-3'
      )}>
        {showModeToggle && !isCollapsed && (
          <div className="mb-4 px-1 animate-fade-in">
            <ModeToggle currentMode={currentMode} onModeChange={handleModeChange} />
          </div>
        )}

        {/* Team Switcher */}
        {(isShowcaseCoach || (user?.role === 'player' && hasMultipleTeams)) && hasMultipleTeams && (
          <TeamSwitcher collapsed={isCollapsed} />
        )}

        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/baseball/dashboard' && item.href !== '/baseball/dashboard/team' && pathname.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium',
                    'transition-all duration-150 ease-out will-change-transform',
                    'active:scale-[0.98]',
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon
                    size={20}
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'text-green-600' : 'text-slate-400'
                    )}
                  />
                  {/* Text - animates out */}
                  <span
                    className={cn(
                      'flex-1 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                      isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                  {/* Badge */}
                  {item.badge && unreadCount > 0 && (
                    <span
                      className={cn(
                        'flex items-center justify-center text-xs font-medium bg-green-500 text-white rounded-full transition-all duration-300',
                        isCollapsed
                          ? 'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px]'
                          : 'min-w-[20px] h-5 px-1.5'
                      )}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Team-specific navigation for Showcase Coaches */}
        {isShowcaseCoach && selectedTeam && teamNavigation.length > 0 && (
          <>
            <div className="my-4 border-t border-slate-100" />
            {!isCollapsed && (
              <p className="px-4 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap overflow-hidden">
                {selectedTeam.name}
              </p>
            )}
            <ul className="space-y-1">
              {teamNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={handleNavClick}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium',
                        'transition-all duration-150 ease-out',
                        isActive
                          ? 'bg-green-50 text-green-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        isCollapsed ? 'justify-center px-2' : 'px-3'
                      )}
                    >
                      <item.icon
                        size={20}
                        className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-green-600' : 'text-slate-400'
                        )}
                      />
                      <span
                        className={cn(
                          'flex-1 whitespace-nowrap transition-all duration-300',
                          isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                        )}
                      >
                        {item.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

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
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium',
                    'transition-all duration-150 ease-out',
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon size={20} className="flex-shrink-0 text-slate-400" />
                  <span
                    className={cn(
                      'whitespace-nowrap transition-all duration-300',
                      isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className={cn(
        'border-t border-slate-100 transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-3'
      )}>
        {/* Pro badge (only when expanded) */}
        <div
          className={cn(
            'rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 overflow-hidden',
            'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0 border-0' : 'h-auto opacity-100 p-4 mb-3'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-900">Free Plan</span>
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">BETA</span>
          </div>
          <div className="text-xs text-slate-500">Pro plans coming soon</div>
        </div>

        {/* User info */}
        <div
          className={cn(
            'rounded-xl bg-slate-50 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0' : 'h-auto opacity-100 px-3 py-2.5 mb-2'
          )}
        >
          <p className="text-sm font-medium text-slate-900 truncate">{displayName}</p>
          <p className="text-xs text-slate-500 truncate">{subtitle}</p>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium',
            'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            'transition-all duration-150 ease-out active:scale-[0.98]',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconLogOut size={20} className="flex-shrink-0 text-slate-400" />
          <span
            className={cn(
              'whitespace-nowrap transition-all duration-300',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );
}
