'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

export interface MobileNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface MobileBottomNavProps {
  items: MobileNavItem[];
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function MobileBottomNav({ items, className }: MobileBottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'lg:hidden', // Hide on desktop
        'bg-cream-50/95 backdrop-blur-xl',
        'border-t border-warm-200',
        'shadow-lg',
        'safe-area-pb', // iOS safe area padding
        className
      )}
    >
      <div className="grid grid-cols-4 gap-1 px-2 py-2">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 min-h-[44px]',
                'px-3 py-2 rounded-xl',
                'transition-all duration-200',
                'active:scale-95',
                active
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50 active:bg-warm-100'
              )}
            >
              {/* Icon with badge */}
              <div className="relative">
                <Icon className={cn('h-6 w-6', active && 'scale-110')} aria-hidden="true" />
                {item.badge && item.badge > 0 && (
                  <span
                    className="
                      absolute -top-1 -right-1
                      min-w-[18px] h-[18px]
                      px-1
                      bg-primary-600 text-white
                      text-label font-bold
                      rounded-full
                      flex items-center justify-center
                      ring-2 ring-white
                    "
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-xs font-medium truncate max-w-full',
                  active && 'font-semibold'
                )}
              >
                {item.label}
              </span>

              {/* Active indicator */}
              {active && (
                <div
                  className="
                    absolute bottom-0 left-1/2 -translate-x-1/2
                    w-8 h-1
                    bg-primary-600 rounded-full
                  "
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Coach navigation
import { HomeIcon, UsersIcon, CalendarIcon, MessageSquareIcon } from 'lucide-react';

<MobileBottomNav
  items={[
    { label: 'Home', href: '/dashboard', icon: HomeIcon },
    { label: 'Roster', href: '/dashboard/roster', icon: UsersIcon },
    { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquareIcon, badge: 3 },
  ]}
/>

// Example 2: Player navigation
import { HomeIcon, TrophyIcon, VideoIcon, SettingsIcon } from 'lucide-react';

<MobileBottomNav
  items={[
    { label: 'Home', href: '/player', icon: HomeIcon },
    { label: 'Journey', href: '/player/journey', icon: TrophyIcon },
    { label: 'Videos', href: '/player/videos', icon: VideoIcon },
    { label: 'Settings', href: '/player/settings', icon: SettingsIcon },
  ]}
/>

// Add to layout to show on all pages
// Make sure to add padding to main content: pb-20 or pb-24
*/
