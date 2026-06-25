'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Dumbbell,
  Home,
  Settings,
  Users,
  Activity,
  ClipboardList,
  Command,
  CalendarCheck,
  CalendarDays,
  BookOpen,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/lifting/dashboard', label: 'Home', icon: Home },
  { href: '/lifting/dashboard/today', label: 'Today', icon: CalendarDays },
  { href: '/lifting/dashboard/command', label: 'Command', icon: Command },
  { href: '/lifting/dashboard/athletes', label: 'Athletes', icon: Users },
  { href: '/lifting/dashboard/programs', label: 'Programs', icon: ClipboardList },
  { href: '/lifting/dashboard/exercises', label: 'Exercises', icon: BookOpen },
  { href: '/lifting/dashboard/sessions', label: 'Sessions', icon: Dumbbell },
  { href: '/lifting/dashboard/readiness', label: 'Readiness', icon: Activity },
  { href: '/lifting/dashboard/check-ins', label: 'Check-Ins', icon: CalendarCheck },
  { href: '/lifting/dashboard/groups', label: 'Groups', icon: BarChart3 },
  { href: '/lifting/dashboard/import', label: 'Import', icon: Upload },
];

export function LabNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Lab navigation" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        // Active if exact match or sub-route, but /lifting/dashboard is exact only
        const isActive =
          item.href === '/lifting/dashboard'
            ? pathname === '/lifting/dashboard'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1',
              isActive
                ? 'text-primary-700'
                : 'text-warm-600 hover:text-warm-900 hover:glass-subtle'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {isActive && (
              <motion.div
                layoutId="lab-nav-indicator"
                className="absolute inset-0 bg-primary-50 rounded-xl border border-primary-100"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <Icon className={cn('relative z-10 w-4 h-4 flex-shrink-0 transition-colors', isActive ? 'text-primary-600' : 'text-warm-400 group-hover:text-warm-600')} />
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}

      {/* Settings at bottom */}
      <div className="mt-auto pt-2 border-t border-white/20">
        <Link
          href="/lifting/dashboard/settings"
          className={cn(
            'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1',
            pathname.startsWith('/lifting/dashboard/settings')
              ? 'text-primary-700'
              : 'text-warm-600 hover:text-warm-900 hover:glass-subtle'
          )}
          aria-current={pathname.startsWith('/lifting/dashboard/settings') ? 'page' : undefined}
        >
          {pathname.startsWith('/lifting/dashboard/settings') && (
            <motion.div
              layoutId="lab-nav-indicator"
              className="absolute inset-0 bg-primary-50 rounded-xl border border-primary-100"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <Settings className={cn('relative z-10 w-4 h-4 flex-shrink-0 transition-colors', pathname.startsWith('/lifting/dashboard/settings') ? 'text-primary-600' : 'text-warm-400 group-hover:text-warm-600')} />
          <span className="relative z-10">Settings</span>
        </Link>
      </div>
    </nav>
  );
}
