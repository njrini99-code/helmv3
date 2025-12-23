'use client';

import { useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';

// Animated hamburger icon that transforms to X
function MenuIcon({ open }: { open: boolean }) {
  return (
    <div className="w-5 h-5 flex flex-col justify-center items-center gap-[5px]">
      <span
        className={cn(
          'block h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out origin-center',
          open && 'rotate-45 translate-y-[7px]'
        )}
      />
      <span
        className={cn(
          'block h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out',
          open && 'opacity-0 scale-0'
        )}
      />
      <span
        className={cn(
          'block h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out origin-center',
          open && '-rotate-45 -translate-y-[7px]'
        )}
      />
    </div>
  );
}

interface DashboardHeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export function DashboardHeader({ title, children }: DashboardHeaderProps) {
  const { collapsed, toggle, toggleMobile, mobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="h-16 px-4 lg:px-6 flex items-center gap-4">
        {/* Menu Toggle Button - Always visible */}
        <button
          onClick={() => {
            // On mobile, toggle mobile menu; on desktop, toggle collapse
            if (window.innerWidth < 1024) {
              toggleMobile();
            } else {
              toggle();
            }
          }}
          className={cn(
            'p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100',
            'transition-colors duration-150 active:scale-95',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <MenuIcon open={mobileOpen} />
        </button>

        {/* Title */}
        {title && (
          <h1 className="text-lg font-semibold text-slate-900 truncate">
            {title}
          </h1>
        )}

        {/* Right side content */}
        {children && (
          <div className="ml-auto flex items-center gap-3">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
