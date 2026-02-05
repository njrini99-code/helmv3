'use client';

import { useSidebar } from '@/contexts/sidebar-context';
import { IconMenu } from '@/components/icons';
import { cn } from '@/lib/utils';

interface MobileNavHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // For action buttons on the right
}

/**
 * Mobile-friendly page header with hamburger menu button
 * Use this in dashboard pages to provide consistent mobile navigation
 */
export function MobileNavHeader({ title, subtitle, children }: MobileNavHeaderProps) {
  const { toggleMobile } = useSidebar();

  return (
    <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger menu */}
            <button
              onClick={toggleMobile}
              className={cn(
                'lg:hidden p-2 -ml-2 rounded-xl',
                'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80',
                'transition-colors duration-150 active:scale-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
              )}
              aria-label="Open navigation menu"
            >
              <IconMenu size={22} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
              {subtitle && <p className="text-slate-500 mt-0.5 text-sm md:text-base truncate">{subtitle}</p>}
            </div>
          </div>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
