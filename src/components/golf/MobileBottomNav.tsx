'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconHome, IconUsers, IconCalendar, IconChartBar, IconMessage, IconSettings, IconGolf } from '@/components/icons';
import { useMobileNav } from '@/contexts/mobile-nav-context';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
}

const coachNavItems: NavItem[] = [
  { href: '/golf/dashboard', label: 'Home', icon: <IconHome size={22} /> },
  { href: '/golf/dashboard/roster', label: 'Roster', icon: <IconUsers size={22} /> },
  { href: '/golf/dashboard/calendar', label: 'Calendar', icon: <IconCalendar size={22} /> },
  { href: '/golf/dashboard/stats', label: 'Stats', icon: <IconChartBar size={22} /> },
  { href: '/golf/dashboard/settings', label: 'More', icon: <IconSettings size={22} /> },
];

const playerNavItems: NavItem[] = [
  { href: '/golf/dashboard', label: 'Home', icon: <IconHome size={22} /> },
  { href: '/golf/dashboard/rounds', label: 'Rounds', icon: <IconGolf size={22} /> },
  { href: '/golf/dashboard/calendar', label: 'Calendar', icon: <IconCalendar size={22} /> },
  { href: '/golf/dashboard/messages', label: 'Messages', icon: <IconMessage size={22} /> },
  { href: '/golf/dashboard/settings', label: 'More', icon: <IconSettings size={22} /> },
];

interface MobileBottomNavProps {
  isCoach?: boolean;
}

export function MobileBottomNav({ isCoach = true }: MobileBottomNavProps) {
  const pathname = usePathname();
  const navItems = isCoach ? coachNavItems : playerNavItems;
  const { isVisible } = useMobileNav();

  if (!isVisible) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 lg:hidden',
        'bg-white/95 backdrop-blur-xl',
        'border-t border-slate-200/60',
        'shadow-[0_-4px_20px_rgba(0,0,0,0.05)]'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/golf/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all duration-200',
                'min-w-[56px] min-h-[52px]',
                'active:scale-95',
                isActive
                  ? 'text-primary-600'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-primary-100/80 text-primary-600 shadow-sm'
                  : 'text-slate-400'
              )}>
                {item.icon}
              </div>
              <span className={cn(
                'text-xs font-medium transition-colors',
                isActive ? 'text-primary-600' : 'text-slate-500'
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
