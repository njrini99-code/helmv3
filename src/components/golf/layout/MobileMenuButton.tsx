'use client';

import { useSidebar } from '@/contexts/sidebar-context';
import { IconMenu } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Standalone mobile hamburger menu button (client component).
 * Drop this into any server component page header to add mobile sidebar toggle.
 * Only visible on screens below lg breakpoint.
 */
export function MobileMenuButton() {
  const { toggleMobile } = useSidebar();

  return (
    <button
      onClick={toggleMobile}
      className={cn(
        'lg:hidden p-2.5 -ml-2 rounded-xl',
        'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80',
        'transition-colors duration-150 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
      )}
      aria-label="Open navigation menu"
    >
      <IconMenu size={22} />
    </button>
  );
}
