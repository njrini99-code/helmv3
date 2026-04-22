'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  IconHome,
  IconUsers,
  IconMessage,
  IconSettings,
  IconLogOut,
  IconUser,
  IconBuilding,
  IconVideo,
  IconCalendar,
  IconNote,
  IconEye,
  IconHelp,
  IconGraduationCap,
  IconLayers,
  IconChevronLeft,
  IconChevronRight,
  IconChartBar,
  IconClipboardList,
  IconFileText,
  IconMessageSquare,
  IconMap,
  IconBell,
  IconAirplane,
} from '@/components/icons';
import { TeamSwitcher } from './team-switcher';
import { useTeams } from '@/hooks/use-teams';
import { usePlayerTeams } from '@/hooks/use-player-teams';
import { useUnreadCount } from '@/hooks/use-unread-count';
import { useSidebar } from '@/contexts/sidebar-context';

// ARCHIVED: Recruiting features hidden — re-enable when recruiting is ready
// College/JUCO Coach - Recruiting Mode
// const coachRecruitingNav = [
//   { name: 'Dashboard', href: '/baseball/dashboard', icon: IconHome },
//   { name: 'Command Center', href: '/baseball/dashboard/command-center', icon: IconLayers },
//   { name: 'Discover', href: '/baseball/dashboard/discover', icon: IconSearch },
//   { name: 'Pipeline', href: '/baseball/dashboard/pipeline', icon: IconStar },
//   { name: 'Watchlist', href: '/baseball/dashboard/watchlist', icon: IconBookmark },
//   { name: 'Compare', href: '/baseball/dashboard/compare', icon: IconTarget },
//   { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
//   { name: 'Camps', href: '/baseball/dashboard/camps', icon: IconBuilding },
//   { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
// ];

// HS Coach - Team Mode (HS-specific dashboard)
const hsCoachTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team/high-school', icon: IconHome },
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Stats', href: '/baseball/dashboard/stats', icon: IconChartBar },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'College Interest', href: '/baseball/dashboard/college-interest', icon: IconEye },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
  { name: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { name: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconClipboardList },
  { name: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
  { name: 'Travel', href: '/baseball/dashboard/travel', icon: IconAirplane },
];

// College Coach - Team Mode
const collegeTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Stats', href: '/baseball/dashboard/stats', icon: IconChartBar },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
  { name: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { name: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconClipboardList },
  { name: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
  { name: 'Travel', href: '/baseball/dashboard/travel', icon: IconAirplane },
];

// JUCO Coach - Team Mode (includes Academics)
const jucoTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Stats', href: '/baseball/dashboard/stats', icon: IconChartBar },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'Academics', href: '/baseball/dashboard/academics', icon: IconGraduationCap },
  { name: 'College Interest', href: '/baseball/dashboard/college-interest', icon: IconEye },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
  { name: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { name: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconClipboardList },
  { name: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
  { name: 'Travel', href: '/baseball/dashboard/travel', icon: IconAirplane },
];

// Showcase Coach - Organization Mode (manages multiple teams)
const showcaseOrgNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/organization', icon: IconHome },
  { name: 'Teams', href: '/baseball/dashboard/teams', icon: IconLayers },
  { name: 'Events', href: '/baseball/dashboard/events', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
];

// Showcase Coach - Team-specific navigation (shown when team selected)
const showcaseTeamNav = [
  { name: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { name: 'Stats', href: '/baseball/dashboard/stats', icon: IconChartBar },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconNote },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { name: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconClipboardList },
  { name: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
];

// ARCHIVED: Recruiting features hidden — re-enable when recruiting is ready
// Player - Recruiting Mode
// const playerRecruitingNav = [
//   { name: 'Dashboard', href: '/baseball/dashboard', icon: IconHome },
//   { name: 'My Profile', href: '/baseball/dashboard/profile', icon: IconUser },
//   { name: 'Colleges', href: '/baseball/dashboard/colleges', icon: IconBuilding },
//   { name: 'Journey', href: '/baseball/dashboard/journey', icon: IconTarget },
//   { name: 'Camps', href: '/baseball/dashboard/camps', icon: IconCalendar },
//   { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
//   { name: 'Analytics', href: '/baseball/dashboard/analytics', icon: IconChart },
// ];

// Player - Team Mode (used for college players + non-recruiting-activated players)
const playerTeamNav = [
  { name: 'Dashboard', href: '/baseball/dashboard/team', icon: IconHome },
  { name: 'My Profile', href: '/baseball/dashboard/profile', icon: IconUser },
  { name: 'My Stats', href: '/baseball/dashboard/my-stats', icon: IconChartBar },
  { name: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo },
  { name: 'Dev Plan', href: '/baseball/dashboard/dev-plan', icon: IconNote },
  { name: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { name: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage, badge: true },
  { name: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { name: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconClipboardList },
  { name: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
];

// Golf Coach navigation
const golfCoachNav = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Rounds', href: '/golf/dashboard/rounds', icon: IconClipboardList },
  { name: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessageSquare, badge: true },
  { name: 'Travel', href: '/golf/dashboard/travel', icon: IconMap },
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
  const { user, coach, player, signOut } = useAuth();
  const { unreadCount } = useUnreadCount();
  const { collapsed, setCollapsed, setMobileOpen } = useSidebar();

  // Use appropriate teams hook based on user role
  const coachTeams = useTeams();
  const playerTeams = usePlayerTeams();
  const { hasMultipleTeams, selectedTeam } = user?.role === 'coach' ? coachTeams : playerTeams;

  // Determine sport-specific dashboard href based on pathname
  const isGolf = pathname.startsWith('/golf');
  const dashboardHref = isGolf ? '/golf/dashboard' : '/baseball/dashboard';

  // Determine navigation based on role, coach type, and mode
  // ARCHIVED: Recruiting mode branches removed — all users see team mode only
  const getNavigation = () => {
    if (isGolf) {
      return golfCoachNav;
    }
    if (user?.role === 'coach') {
      if (coach?.coach_type === 'college') {
        return collegeTeamNav;
      } else if (coach?.coach_type === 'juco') {
        return jucoTeamNav;
      } else if (coach?.coach_type === 'showcase') {
        return showcaseOrgNav;
      } else if (coach?.coach_type === 'high_school') {
        return hsCoachTeamNav.map(item =>
          item.href === '/baseball/dashboard/team/high-school' ? { ...item, href: '/baseball/coach/high-school' } : item
        );
      } else {
        return hsCoachTeamNav;
      }
    } else if (user?.role === 'player') {
      // ARCHIVED: All players now see team nav only — recruiting nav disabled
      return playerTeamNav;
    }
    return collegeTeamNav;
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
  const subtitle = coach ? ((coach.organization as { name?: string })?.name || 'Coach') : (player ? `${player.primary_position} • ${player.grad_year}` : '');

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
        // Dark sidebar per Batch 3 spec
        'bg-[rgba(28,25,23,0.97)] backdrop-blur-xl',
        'h-dvh flex flex-col relative',
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
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-5 top-6 z-50',
            'w-10 h-10 rounded-full bg-[#1C1917] border border-white/20',
            'flex items-center justify-center',
            'shadow-lg hover:bg-white/10 active:bg-white/15 hover:border-white/30',
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
        <Link
          href={dashboardHref}
          className="flex items-center gap-3"
          onClick={handleNavClick}
        >
          <div className="relative h-10 flex items-center">
            {/* Icon version (shown when collapsed) */}
            <div
              aria-hidden={!isCollapsed}
              className={cn(
                'w-10 h-10 flex items-center justify-center flex-shrink-0',
                'transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
              )}
            >
              <Image
                src="/helm-baseball-logo-cropped.png"
                alt="BaseballHelm"
                width={166}
                height={160}
                className="w-10 h-10 object-contain"
                priority
                unoptimized
              />
            </div>
            {/* Full logo + text (shown when expanded) */}
            <div
              aria-hidden={isCollapsed}
              className={cn(
                'flex items-center gap-2 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-0 scale-75 absolute' : 'opacity-100 scale-100'
              )}
            >
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                <Image
                  src="/helm-baseball-logo-cropped.png"
                  alt=""
                  width={166}
                  height={160}
                  className="w-10 h-10 object-contain"
                  priority
                  unoptimized
                />
              </div>
              <span className="text-lg font-bold leading-none tracking-tight text-white">
                Baseball<span className="text-primary-400">Helm</span>
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 py-4 overflow-y-auto overflow-x-hidden custom-scrollbar',
        'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        isCollapsed ? 'px-2' : 'px-3'
      )}>
        {/* ARCHIVED: Recruiting mode toggle hidden — re-enable when recruiting is ready */}
        {/* {showModeToggle && !isCollapsed && (
          <div className="mb-4 px-1 animate-fade-in">
            <ModeToggle currentMode={currentMode} onModeChange={handleModeChange} />
          </div>
        )} */}

        {/* Team Switcher */}
        {(isShowcaseCoach || (user?.role === 'player' && hasMultipleTeams)) && hasMultipleTeams && (
          <TeamSwitcher collapsed={isCollapsed} />
        )}

        {/* Section Label */}
        {!isCollapsed && (
          <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
            {user?.role === 'coach'
              ? (coach?.coach_type === 'showcase' ? 'Organization' : 'Team')
              : 'Team'}
          </p>
        )}

        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/baseball/dashboard' && item.href !== '/baseball/dashboard/team' && item.href !== '/golf/dashboard' && pathname.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 py-3 rounded-[10px] text-[13px] font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out will-change-transform',
                    'active:scale-[0.98]',
                    isActive
                      ? 'bg-white/10 text-primary-400 border-l-[3px] border-primary-500'
                      : 'text-white/60 hover:bg-white/5 active:bg-white/10 hover:text-white/90',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'text-primary-400' : 'text-white/50'
                    )}
                  />
                  {/* Text - animates out */}
                  <span
                    className={cn(
                      'flex-1 whitespace-nowrap transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                      isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                  {/* Badge */}
                  {item.badge && unreadCount > 0 && (
                    <span
                      className={cn(
                        'flex items-center justify-center text-micro font-semibold bg-primary-600 text-white rounded-full transition-opacity duration-300',
                        isCollapsed
                          ? 'absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1'
                          : 'ml-auto px-1.5 py-0.5'
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
            {/* Divider */}
            <div className="my-4 mx-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            {!isCollapsed && (
              <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap overflow-hidden">
                {selectedTeam.name}
              </p>
            )}
            <ul className="space-y-0.5">
              {teamNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={handleNavClick}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 py-3 rounded-[10px] text-[13px] font-medium min-h-[44px]',
                        'transition-colors duration-150 ease-out',
                        isActive
                          ? 'bg-white/10 text-primary-400 border-l-[3px] border-primary-500'
                          : 'text-white/60 hover:bg-white/5 active:bg-white/10 hover:text-white/90',
                        isCollapsed ? 'justify-center px-2' : 'px-3'
                      )}
                    >
                      <item.icon
                        size={18}
                        aria-hidden="true"
                        className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-primary-400' : 'text-white/50'
                        )}
                      />
                      <span
                        className={cn(
                          'whitespace-nowrap transition-opacity duration-300',
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
        <div className="my-4 mx-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Secondary Navigation */}
        {!isCollapsed && (
          <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
            More
          </p>
        )}
        <ul className="space-y-0.5">
          {secondaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 py-3 rounded-[10px] text-[13px] font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out',
                    isActive
                      ? 'bg-white/10 text-primary-400'
                      : 'text-white/60 hover:bg-white/5 active:bg-white/10 hover:text-white/90',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon size={18} className="flex-shrink-0 text-white/50" aria-hidden="true" />
                  <span
                    className={cn(
                      'whitespace-nowrap transition-opacity duration-300',
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
        'border-t border-white/10 space-y-0.5',
        'transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-3'
      )}>
        {/* Pro badge (only when expanded) */}
        <div
          className={cn(
            'rounded-xl bg-white/5 border border-white/10 overflow-hidden',
            'transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0 border-0' : 'h-auto opacity-100 p-3 mb-3'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">Free Plan</span>
            
          </div>
          <div className="text-xs text-white/50">Free for all teams</div>
        </div>

        {/* User info */}
        <div
          className={cn(
            'rounded-xl bg-white/5 overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0' : 'h-auto opacity-100 px-3 py-2.5 mb-2'
          )}
        >
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          <p className="text-xs text-white/50 truncate">{subtitle}</p>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          title={isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-3 rounded-[10px] text-[13px] font-medium min-h-[44px]',
            'text-white/60 hover:bg-red-500/10 hover:text-red-400',
            'transition-colors duration-150 ease-out active:scale-[0.98]',
            isCollapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <IconLogOut size={18} className="flex-shrink-0 text-white/50" aria-hidden="true" />
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-300',
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
