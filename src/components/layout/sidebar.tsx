'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  IconHome,
  IconUsers,
  IconSettings,
  IconLogOut,
  IconCalendar,
  IconHelp,
  IconChevronLeft,
  IconChevronRight,
  IconChartBar,
  IconClipboardList,
  IconMessageSquare,
  IconMap,
  IconFileText,
} from '@/components/icons';
import { useUnreadCount } from '@/hooks/use-unread-count';
import { useSidebar } from '@/contexts/sidebar-context';
import { Button } from '@/components/ui/button';

// =============================================================================
// GOLF-ONLY SIDEBAR (post BaseballHelm shell unification, Coherence Ruling
// 2026-07-08 — see docs/baseball/COHERENCE_RULING_2026-07-08.md Ruling 1)
//
// This component historically rendered BOTH GolfHelm's flat nav AND
// BaseballHelm's "Grouped-Hubs" nav (a condensed set of top-level hubs, each
// landing on its first child route, with a sub-tab strip rendered by the
// legacy `BaseballDashboardShell`). The baseball hub-building logic (5 legacy
// coach-type nav arrays, `buildCondensedBaseballNavigation`, the showcase
// org/team split, and every other baseball-only branch) has been deleted —
// BaseballHelm now renders through `BaseballFairwayShell.tsx`, which owns its
// own parallel nav-section builders (`buildCoachHubSections` /
// `buildPlayerNavSections` / `buildShowcaseOrgSections` /
// `buildShowcaseTeamSections`) and never imports this file.
//
// The `isGolf` branch below is preserved byte-identical. Only the golf nav
// array (`golfCoachNav`) and the generic rendering scaffolding it needs
// remain.
// =============================================================================

type SidebarHubItem = {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>;
  badge?: boolean;
  /** Route prefixes that mark this hub item active (defaults to [href]). */
  hubPrefixes?: string[];
};

// Golf Coach navigation (flat — golf keeps its own nav model; unchanged).
const golfCoachNav: SidebarHubItem[] = [
  { name: 'Dashboard', href: '/golf/dashboard', icon: IconHome },
  { name: 'Roster', href: '/golf/dashboard/roster', icon: IconUsers },
  { name: 'Rounds', href: '/golf/dashboard/rounds', icon: IconClipboardList },
  { name: 'Stats', href: '/golf/dashboard/stats', icon: IconChartBar },
  { name: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar },
  { name: 'Documents', href: '/golf/dashboard/documents', icon: IconFileText },
  { name: 'Messages', href: '/golf/dashboard/messages', icon: IconMessageSquare, badge: true },
  { name: 'Travel', href: '/golf/dashboard/travel', icon: IconMap },
];

// Secondary navigation (coach) — Settings + Program now live in the Management
// hub, so "More" carries only the always-available Help link for coaches.
const coachSecondaryNav = [
  { name: 'Help', href: '/help', icon: IconHelp },
];

// Secondary navigation (player) — players have no Management hub, so Settings
// stays in the "More" group.
const playerSecondaryNav = [
  { name: 'Settings', href: '/baseball/dashboard/settings', icon: IconSettings },
  { name: 'Help', href: '/help', icon: IconHelp },
];

/**
 * Dashboard / "home" hrefs that must match EXACTLY (never light via a startsWith
 * prefix, since every nested route starts with the dashboard root).
 */
const EXACT_MATCH_HREFS = new Set<string>([
  '/golf/dashboard',
]);

/**
 * Whether a top-level (hub or flat) sidebar item is active for the current path.
 * A hub item lights when the pathname matches its href OR any route inside the
 * hub (`hubPrefixes`); home/dashboard items match exactly.
 */
function isHubItemActive(item: SidebarHubItem, pathname: string): boolean {
  const prefixes = item.hubPrefixes ?? [item.href];
  for (const p of prefixes) {
    if (pathname === p) return true;
    if (!EXACT_MATCH_HREFS.has(p) && pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

interface SidebarProps {
  isMobile?: boolean;
}

export function Sidebar({ isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, coach, player, signOut } = useAuth();
  const { unreadCount } = useUnreadCount();
  const { collapsed, setCollapsed, setMobileOpen } = useSidebar();

  // Determine sport-specific dashboard href based on pathname
  const isGolf = pathname.startsWith('/golf');
  const dashboardHref = isGolf ? '/golf/dashboard' : '/baseball/dashboard';

  // Determine navigation based on role, coach type, and mode
  const getNavigation = (): SidebarHubItem[] => {
    if (isGolf) {
      return golfCoachNav;
    }
    return [];
  };

  const navigation = getNavigation();
  const secondaryNav = user?.role === 'coach' ? coachSecondaryNav : playerSecondaryNav;
  const displayName = coach?.full_name || (player ? `${player.first_name} ${player.last_name}` : 'User');
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
        'transition-[width] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
        'will-change-[width]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        !isMobile && 'fixed left-0 top-0 z-40'
      )}
    >
      {/* Collapse Toggle Button (desktop only) */}
      {!isMobile && (
        <Button variant="ghost"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-5 top-6 z-50',
            'w-10 h-10 rounded-full bg-[#1C1917] border border-white/20',
            'flex items-center justify-center',
            'shadow-lg hover:bg-warm-50/10 active:bg-warm-50/15 hover:border-warm-50/30',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/40'
          )}
        >
          {isCollapsed ? (
            <IconChevronRight size={14} className="text-white/70" aria-hidden="true" />
          ) : (
            <IconChevronLeft size={14} className="text-white/70" aria-hidden="true" />
          )}
        </Button>
      )}
      {/* Logo */}
      <div className={cn(
        'h-16 shrink-0 flex items-center border-b border-white/10',
        'transition-[padding] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
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
                'transition-[opacity,transform] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
              )}
            >
              <Image
                src="/anim/helm-baseball-icon.png"
                alt="BaseballHelm"
                width={300}
                height={300}
                className="w-10 h-10 object-contain"
                priority
                unoptimized
              />
            </div>
            {/* Full logo + text (shown when expanded) */}
            <div
              aria-hidden={isCollapsed}
              className={cn(
                'flex items-center gap-2 transition-[opacity,transform] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
                isCollapsed ? 'opacity-0 scale-75 absolute' : 'opacity-100 scale-100'
              )}
            >
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                <Image
                  src="/anim/helm-baseball-icon.png"
                  alt=""
                  width={300}
                  height={300}
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

      {/* Navigation
          `min-h-0` is required here: this is a flex child inside a
          `flex flex-col h-dvh` column alongside the fixed-height logo header
          and the non-growing bottom (Settings/Sign-out) block. Without an
          explicit min-height, some WebKit builds (notably Capacitor's iOS
          WKWebView) size this item to its content instead of the remaining
          flex space, which pushes the bottom block off-screen and clips the
          list's last item(s) behind it. `pb-8` (vs. the `pt-4` top inset)
          gives the last item real breathing room at the scroll end instead
          of ending flush against the bottom block's top border, and the
          inline styles enable native momentum scrolling on touch devices
          without letting an exhausted scroll chain up into the page. */}
      <nav
        className={cn(
          'flex-1 min-h-0 pt-4 pb-8 overflow-y-auto overflow-x-hidden custom-scrollbar',
          'transition-[padding] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
          isCollapsed ? 'px-2' : 'px-3'
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Section Label */}
        {!isCollapsed && (
          <p className="px-3 py-2 text-label font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
            Team
          </p>
        )}

        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = isHubItemActive(item, pathname);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 py-3 rounded-md text-body-sm font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out will-change-transform',
                    'active:scale-[0.98]',
                    isActive
                      ? 'bg-warm-50/10 text-primary-400 border-l-[3px] border-primary-500 nav-item-active'
                      : 'text-white/60 hover:bg-warm-50/5 active:bg-warm-50/10 hover:text-white/90',
                    isCollapsed ? 'justify-center px-2' : 'px-3'
                  )}
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className={cn(
                      'flex-shrink-0 transition-colors duration-150',
                      isActive ? 'text-primary-400 nav-item-active-icon' : 'text-white/50'
                    )}
                  />
                  {/* Text - animates out */}
                  <span
                    className={cn(
                      'flex-1 whitespace-nowrap transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
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
                    'flex items-center gap-3 py-3 rounded-md text-body-sm font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out',
                    isActive
                      ? 'bg-warm-50/10 text-primary-400 nav-item-active'
                      : 'text-white/60 hover:bg-warm-50/5 active:bg-warm-50/10 hover:text-white/90',
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

      {/* Bottom section (Settings / Sign-out) — pinned below the scrollable
          nav by normal flex flow (not `position: sticky`); `shrink-0` keeps
          it at its natural content height so it never gets compressed by
          the flex layout on short viewports, which would otherwise let its
          own content (or the nav list above it) overlap/clip. */}
      <div className={cn(
        'shrink-0 border-t border-white/10 space-y-0.5',
        'transition-[padding] duration-300',
        isCollapsed ? 'p-2' : 'p-3'
      )}>
        {/* Pro badge (only when expanded) */}
        <div
          className={cn(
            'rounded-xl bg-warm-50/5 border border-warm-50/10 overflow-hidden',
            'transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
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
            'rounded-xl bg-warm-50/5 overflow-hidden transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]',
            isCollapsed ? 'h-0 opacity-0 p-0 mb-0' : 'h-auto opacity-100 px-3 py-2.5 mb-2'
          )}
        >
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          <p className="text-xs text-white/50 truncate">{subtitle}</p>
        </div>

        {/* Sign out */}
        <Button variant="danger"
          onClick={handleSignOut}
          aria-label="Sign out"
          title={isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-3 py-3 rounded-md text-body-sm font-medium min-h-[44px]',
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
        </Button>
      </div>
    </aside>
  );
}
