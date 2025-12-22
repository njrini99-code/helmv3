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
  IconGraduationCap,
  IconLayers,
} from '@/components/icons';
import { TeamSwitcher } from './team-switcher';
import { useTeams } from '@/hooks/use-teams';
import { usePlayerTeams } from '@/hooks/use-player-teams';

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
  { name: 'Messages', href: '/baseball/dashboard/team/messages', icon: IconMessage, badge: true },
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
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ collapsed = false, onToggle, onClose, isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, coach, player, signOut, coachMode, setCoachMode } = useAuth();

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
        // JUCO has both modes, team mode includes Academics
        return currentMode === 'recruiting' ? coachRecruitingNav : jucoTeamNav;
      } else if (coach?.coach_type === 'showcase') {
        // Showcase coaches see organization navigation
        return showcaseOrgNav;
      } else if (coach?.coach_type === 'high_school') {
        // HS coaches only have team mode with HS-specific dashboard
        return hsCoachTeamNav;
      } else {
        // Default to HS nav for any undefined coach type
        return hsCoachTeamNav;
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

  // Get team-specific navigation for showcase coaches
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
    // Redirect to appropriate dashboard based on mode and coach type
    if (mode === 'recruiting') {
      router.push('/baseball/dashboard');
    } else {
      // Team mode - redirect to coach-specific team dashboard
      if (coach?.coach_type === 'high_school') {
        router.push('/baseball/dashboard/team/high-school');
      } else {
        router.push('/baseball/dashboard/team');
      }
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
    router.push('/baseball/login');
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
          href={dashboardHref}
          className="flex items-center group"
          onClick={handleNavClick}
        >
          <img
            src={logoSrc}
            alt={logoAlt}
            className="h-9 w-auto transition-all duration-200 group-hover:scale-105"
          />
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

        {/* Team Switcher for Showcase Coaches and Players with Multiple Teams */}
        {(isShowcaseCoach || (user?.role === 'player' && hasMultipleTeams)) && hasMultipleTeams && (
          <TeamSwitcher collapsed={collapsed} />
        )}

        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/baseball/dashboard' && item.href !== '/baseball/dashboard/team' && pathname.startsWith(item.href));
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

        {/* Team-specific navigation for Showcase Coaches */}
        {isShowcaseCoach && selectedTeam && teamNavigation.length > 0 && (
          <>
            <div className="my-4 border-t border-slate-100" />
            {!collapsed && (
              <p className="px-4 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
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
                      {!collapsed && <span className="flex-1">{item.name}</span>}
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
