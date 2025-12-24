'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconHome, IconUsers, IconCalendar, IconChart, IconMessage } from '@/components/icons';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const coachNavItems: NavItem[] = [
  { href: '/golf/dashboard', label: 'Home', icon: <IconHome size={20} /> },
  { href: '/golf/dashboard/roster', label: 'Roster', icon: <IconUsers size={20} /> },
  { href: '/golf/dashboard/calendar', label: 'Calendar', icon: <IconCalendar size={20} /> },
  { href: '/golf/dashboard/stats', label: 'Stats', icon: <IconChart size={20} /> },
  { href: '/golf/dashboard/messages', label: 'Messages', icon: <IconMessage size={20} /> },
];

const playerNavItems: NavItem[] = [
  { href: '/golf/dashboard', label: 'Home', icon: <IconHome size={20} /> },
  { href: '/golf/dashboard/rounds', label: 'Rounds', icon: <IconChart size={20} /> },
  { href: '/golf/dashboard/calendar', label: 'Calendar', icon: <IconCalendar size={20} /> },
  { href: '/golf/dashboard/messages', label: 'Messages', icon: <IconMessage size={20} /> },
];

interface MobileBottomNavProps {
  isCoach?: boolean;
}

export function MobileBottomNav({ isCoach = true }: MobileBottomNavProps) {
  const pathname = usePathname();
  const navItems = isCoach ? coachNavItems : playerNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-slate-200 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/golf/dashboard' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[64px]',
                isActive 
                  ? 'text-green-600' 
                  : 'text-slate-500 active:bg-slate-100'
              )}
            >
              <div className={cn(
                'p-1 rounded-lg transition-colors',
                isActive && 'bg-green-100'
              )}>
                {item.icon}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
