'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';

// ============================================
// TYPES
// ============================================

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  sport: 'baseball' | 'golf';
  role: 'coach' | 'player';
  sections: NavSection[];
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function MobileSidebarDrawer({
  open,
  onClose,
  sport,
  role,
  sections,
  className,
}: MobileSidebarDrawerProps) {
  const pathname = usePathname();
  const { user } = useUser();

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="
            fixed inset-0 z-50
            bg-warm-900/50 backdrop-blur-sm
            animate-fade-in
            lg:hidden
          "
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-50',
          'w-[280px]',
          'bg-[#1C1917]',
          'flex flex-col',
          'transition-transform duration-300 ease-out',
          'lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="
                w-9 h-9 rounded-[10px]
                bg-gradient-to-br from-primary-500 to-primary-600
                flex items-center justify-center
                text-white text-lg
                shadow-lg shadow-primary-500/25
              "
            >
              {sport === 'golf' ? '⛳️' : '⚾️'}
            </div>
            <span className="font-bold text-lg text-white tracking-tight">
              {sport === 'golf' ? 'GolfHelm' : 'BaseballHelm'}
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="
              min-w-[44px] min-h-[44px] p-3 rounded-lg
              flex items-center justify-center
              text-warm-400 hover:text-white hover:bg-white/10 active:bg-white/15
              transition-colors
            "
            aria-label="Close menu"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="mb-6">
              {/* Section Label */}
              {section.label && (
                <div
                  className="
                    px-3 mb-2
                    text-[11px] font-semibold text-warm-500
                    uppercase tracking-wider
                  "
                >
                  {section.label}
                </div>
              )}

              {/* Nav Items */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group relative flex items-center gap-3',
                        'px-3 py-2.5 rounded-[10px]',
                        'transition-all duration-200',
                        active
                          ? 'bg-white/10 text-white'
                          : 'text-warm-400 hover:bg-white/5 active:bg-white/10 hover:text-white'
                      )}
                    >
                      {/* Active indicator bar */}
                      {active && (
                        <div
                          className="
                            absolute left-0 top-1/2 -translate-y-1/2
                            w-[3px] h-5
                            bg-primary-500
                            rounded-r-full
                          "
                        />
                      )}

                      {/* Icon */}
                      <Icon
                        className={cn(
                          'w-5 h-5 flex-shrink-0',
                          'transition-colors duration-200',
                          active
                            ? 'text-primary-400'
                            : 'text-warm-400 group-hover:text-white'
                        )}
                      />

                      {/* Label */}
                      <span className="text-sm font-medium flex-1">
                        {item.label}
                      </span>

                      {/* Badge */}
                      {item.badge && item.badge > 0 && (
                        <span
                          className="
                            flex items-center justify-center
                            min-w-[20px] h-5 px-1.5
                            bg-primary-600 text-white
                            text-[11px] font-bold
                            rounded-full
                          "
                        >
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile (Bottom) */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-white/5">
            {/* Avatar */}
            <div
              className="
                w-9 h-9 rounded-[10px]
                bg-gradient-to-br from-warm-600 to-warm-700
                flex items-center justify-center
                text-white font-semibold text-sm
                flex-shrink-0
              "
            >
              {user?.user_metadata?.first_name?.[0] || user?.email?.[0] || 'U'}
              {user?.user_metadata?.last_name?.[0] || ''}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.first_name || 'User'}{' '}
                {user?.user_metadata?.last_name || ''}
              </div>
              <div className="text-xs text-warm-500 truncate">
                {role === 'coach' ? 'Coach' : 'Player'}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example: In a dashboard layout
'use client';

import { useState } from 'react';
import { HomeIcon, UsersIcon, CalendarIcon, MessageSquareIcon } from 'lucide-react';
import { MobileSidebarDrawer } from '@/components/layout/mobile-sidebar-drawer';

export function DashboardLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navSections = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
        { label: 'Roster', href: '/dashboard/roster', icon: UsersIcon },
        { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
        { label: 'Messages', href: '/dashboard/messages', icon: MessageSquareIcon, badge: 3 },
      ],
    },
  ];

  return (
    <>
      <MobileSidebarDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sport="baseball"
        role="coach"
        sections={navSections}
      />

      <main>{children}</main>
    </>
  );
}
*/
