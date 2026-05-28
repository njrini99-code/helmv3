'use client';

import { cn } from '@/lib/utils';
import { IconMenu } from '@/components/icons';
import { useSidebarSafe } from '@/contexts/sidebar-context';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { IconButton } from '@/components/ui/button';

interface MobileMenuButtonProps {
  className?: string;
  /** Override click handler (defaults to sidebar toggleMobile) */
  onClick?: () => void;
  /** Aria label for accessibility */
  label?: string;
}

/**
 * Standardized mobile hamburger/menu button.
 * Uses the sidebar context to toggle mobile navigation.
 * Shows only on mobile (lg:hidden).
 *
 * Design spec:
 * - 44×44px touch target (p-2.5 on 22px icon)
 * - active:scale-95 for tactile tap feedback
 * - touch-manipulation for instant tap response (no 300ms delay)
 * - Consistent hover/focus ring across all dashboard pages
 */
export function MobileMenuButton({ className, onClick, label = 'Open navigation menu' }: MobileMenuButtonProps) {
  // Use the safe variant — some surfaces (auth pages, edge SSR) render this
  // button outside a SidebarProvider, and throwing was being captured by
  // Sentry as a noisy uncaught exception. When no sidebar is mounted, fall
  // back to no-op state so the button renders inert without crashing.
  const ctx = useSidebarSafe();
  const toggleMobile = ctx?.toggleMobile;
  const mobileOpen = ctx?.mobileOpen ?? false;

  const handleClick = () => {
    void triggerHaptic('light');
    if (onClick) {
      onClick();
    } else if (toggleMobile) {
      toggleMobile();
    }
  };

  return (
    <IconButton variant="default"
      type="button"
      onClick={handleClick}
      className={cn(
        'lg:hidden p-2.5 -ml-2 rounded-xl flex-shrink-0',
        'text-warm-500 hover:text-warm-700 hover:bg-warm-100/80',
        'transition-colors duration-150',
        'active:scale-95 active:bg-warm-200/60',
        'touch-manipulation',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        className
      )}
      aria-label={label}
      aria-expanded={mobileOpen}
      aria-controls="mobile-sidebar"
    >
      <IconMenu size={22} />
    </IconButton>
  );
}
