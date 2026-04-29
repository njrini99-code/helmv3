'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconHome, IconUsers, IconCalendar, IconChartBar, IconMessage, IconGolf, IconBell, IconSparkles } from '@/components/icons';
import { CountBadge } from '@/components/ui/badge';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useNotificationBadges } from '@/contexts/notification-badge-context';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
}

const coachNavItems: NavItem[] = [
  { href: '/golf/dashboard', label: 'Home', icon: <IconHome size={24} /> },
  { href: '/golf/dashboard/roster', label: 'Roster', icon: <IconUsers size={24} /> },
  { href: '/golf/dashboard/calendar', label: 'Calendar', icon: <IconCalendar size={24} /> },
  { href: '/golf/dashboard/stats', label: 'Stats', icon: <IconChartBar size={24} /> },
  // Insights is the canonical CoachHelm surface; /alerts route still works for bookmarks but is no longer in nav.
  { href: '/golf/dashboard/insights', label: 'Insights', icon: <IconSparkles size={24} /> },
];

const playerNavItems: NavItem[] = [
  { href: '/golf/dashboard', label: 'Home', icon: <IconHome size={24} /> },
  { href: '/golf/dashboard/rounds', label: 'Rounds', icon: <IconGolf size={24} /> },
  { href: '/golf/dashboard/calendar', label: 'Calendar', icon: <IconCalendar size={24} /> },
  { href: '/golf/dashboard/messages', label: 'Messages', icon: <IconMessage size={24} /> },
  { href: '/golf/dashboard/announcements', label: 'Alerts', icon: <IconBell size={24} /> },
];

interface MobileBottomNavProps {
  isCoach?: boolean;
}

export function MobileBottomNav({ isCoach = true }: MobileBottomNavProps) {
  const pathname = usePathname();
  const navItems = isCoach ? coachNavItems : playerNavItems;
  const { isVisible } = useMobileNav();
  const { triggerHaptic } = useHapticFeedback();
  const badges = useNotificationBadges();

  return (
    <nav
      aria-label="Mobile navigation"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 lg:hidden',
        'min-h-[var(--golf-mobile-bottom-nav-offset)]',
        'bg-cream-50/92 backdrop-blur-xl',
        'border-t border-warm-200/35',
        'will-change-transform',
        isVisible ? '' : 'translate-y-full pointer-events-none'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', transition: 'transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/golf/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              onClick={(e) => {
                triggerHaptic('light');
                if (isActive) {
                  e.preventDefault();
                  document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                'min-w-[60px] min-h-[48px] touch-manipulation',
                isActive ? 'text-primary-700' : 'text-warm-400 hover:text-warm-600'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={cn(
                'relative px-2.5 py-1 rounded-full transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isActive ? 'bg-primary-50/85 text-primary-700' : 'text-warm-400'
              )}>
                {item.icon}
                {item.label === 'Messages' && badges.messages > 0 && (
                  <span className="absolute -top-1 -right-1.5">
                    <span aria-live="polite" aria-atomic="true" className="contents">
                    <CountBadge count={badges.messages} variant="danger" />
                    </span>
                  </span>
                )}
                {(item.label === 'Insights' || item.label === 'Alerts') && badges.total > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary-500 ring-2 ring-cream-50" role="status" aria-label="New insights available" />
                )}
              </div>
              <span className={cn(
                'text-[10px] font-medium tracking-[0.01em] transition-colors duration-500',
                isActive ? 'text-primary-700' : 'text-warm-500'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
