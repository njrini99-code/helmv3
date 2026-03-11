'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconHome, IconUsers, IconCalendar, IconChartBar, IconMessage, IconGolf, IconBell } from '@/components/icons';
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
  { href: '/golf/dashboard/alerts', label: 'Alerts', icon: <IconBell size={24} /> },
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
        'bg-white/95 backdrop-blur-md',
        'border-t border-warm-200/60',
        'shadow-[0_-4px_20px_rgba(0,0,0,0.08)]',
        'will-change-transform',
        isVisible ? '' : 'translate-y-full pointer-events-none'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/golf/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => {
                triggerHaptic('light');
                if (isActive) {
                  e.preventDefault();
                  document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all duration-200',
                'min-w-[60px] min-h-[48px]',
                'active:scale-95 touch-manipulation',
                isActive
                  ? 'text-primary-600'
                  : 'text-warm-400 hover:text-warm-600'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={cn(
                'relative p-1.5 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-primary-100/80 text-primary-600 shadow-sm'
                  : 'text-warm-400'
              )}>
                {item.icon}
                {item.label === 'Messages' && badges.messages > 0 && (
                  <span className="absolute -top-1 -right-1.5">
                    <CountBadge count={badges.messages} variant="danger" />
                  </span>
                )}
                {item.label === 'Alerts' && badges.total > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-500 ring-2 ring-white" />
                )}
              </div>
              <span className={cn(
                'text-label font-medium transition-colors',
                isActive ? 'text-primary-600' : 'text-warm-500'
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
