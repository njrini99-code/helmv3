'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Animated hamburger icon that transforms to X when open.
 * Used as the default icon for MobileMenuButton.
 */
function AnimatedMenuIcon({ open }: { open: boolean }) {
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

/**
 * Static hamburger icon (no animation).
 */
function StaticMenuIcon({ className }: { className?: string }) {
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

type MobileMenuButtonTheme = 'light' | 'warm' | 'dark';

interface MobileMenuButtonProps {
  onClick: () => void;
  /** Whether the menu is currently open (for animated icon) */
  open?: boolean;
  /** Use animated hamburger-to-X icon */
  animated?: boolean;
  /** Color theme */
  theme?: MobileMenuButtonTheme;
  /** Hide on desktop (lg:hidden) */
  mobileOnly?: boolean;
  /** Additional class names */
  className?: string;
  /** Accessible label */
  'aria-label'?: string;
}

const themeStyles: Record<MobileMenuButtonTheme, string> = {
  light: 'text-warm-500 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200',
  warm: 'text-warm-400 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200',
  dark: 'text-warm-400 hover:text-white hover:bg-white/10 active:bg-white/15',
};

/**
 * Shared mobile menu button component.
 * Consolidates 5 different hamburger button implementations into one.
 *
 * @example
 * // Animated (baseball dashboard)
 * <MobileMenuButton onClick={toggle} open={isOpen} animated theme="light" />
 *
 * // Static (golf dark header)
 * <MobileMenuButton onClick={toggle} theme="warm" mobileOnly />
 */
export function MobileMenuButton({
  onClick,
  open = false,
  animated = false,
  theme = 'warm',
  mobileOnly = false,
  className,
  'aria-label': ariaLabel = 'Toggle menu',
}: MobileMenuButtonProps) {
  return (
    <Button variant="ghost"
      onClick={onClick}
      className={cn(
        'min-w-[44px] min-h-[44px] p-3 rounded-xl',
        'flex items-center justify-center',
        'transition-colors duration-150 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        themeStyles[theme],
        mobileOnly && 'lg:hidden',
        className
      )}
      aria-label={ariaLabel}
    >
      {animated ? (
        <AnimatedMenuIcon open={open} />
      ) : (
        <StaticMenuIcon />
      )}
    </Button>
  );
}

