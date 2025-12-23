'use client';

import Link from 'next/link';
import { useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';
import { IconChevronLeft, IconSearch } from '@/components/icons';

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
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left: Menu toggle + Back + Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Menu toggle button */}
          <button
            onClick={handleMenuToggle}
            className={cn(
              'p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100',
              'transition-colors duration-150 active:scale-95',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40'
            )}
            aria-label="Toggle sidebar"
          >
            <MenuIcon />
          </button>

          {/* Back button */}
          {backHref && (
            <Link
              href={backHref}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all duration-200 active:scale-95"
            >
              <IconChevronLeft size={20} />
            </Link>
          )}

          {/* Title */}
          {title && (
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500 truncate">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {children}

          {/* Search button */}
          <button
            onClick={() => {
              // Could trigger a search modal
            }}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconSearch size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
