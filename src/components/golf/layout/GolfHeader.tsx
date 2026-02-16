'use client';

import Link from 'next/link';
import { useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';
import { IconChevronLeft } from '@/components/icons';

// Menu icon
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('w-5 h-5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

interface GolfHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  backHref?: string;
}

export function GolfHeader({ title, subtitle, children, backHref }: GolfHeaderProps) {
  const { toggle, toggleMobile } = useSidebar();

  const handleMenuToggle = () => {
    if (window.innerWidth < 1024) {
      toggleMobile();
    } else {
      toggle();
    }
  };

  return (
    <header className="h-16 glass-prominent border-b border-white/20 sticky top-0 z-30">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left: Menu toggle + Back + Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Menu toggle button */}
          <button
            onClick={handleMenuToggle}
            className={cn(
              'p-2.5 -ml-2 rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100',
              'transition-colors duration-150 active:scale-95',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
            )}
            aria-label="Toggle sidebar"
          >
            <MenuIcon />
          </button>

          {/* Back button */}
          {backHref && (
            <Link
              href={backHref}
              className="p-1.5 text-warm-400 hover:text-warm-600 rounded-lg hover:bg-warm-100 transition-all duration-200 active:scale-95"
              aria-label="Go back"
            >
              <IconChevronLeft size={20} />
            </Link>
          )}

          {/* Title */}
          {title && (
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-warm-900 tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-sm text-warm-500 truncate">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {children}
        </div>
      </div>
    </header>
  );
}
