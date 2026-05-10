'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import { IconChevronLeft } from '@/components/icons';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface MobileNavHeaderProps {
  title: string;
  /**
   * Subtitle — accepts a plain string (auto-truncated) or JSX (for status
   * indicators, pulsing dots, dates, etc.). String callers get automatic
   * truncation; ReactNode callers are responsible for their own overflow.
   */
  subtitle?: React.ReactNode;
  /** Action buttons shown on the right (icons or short labels) */
  children?: React.ReactNode;
  /** Extra row below the title (filter chips, tabs, search bar, etc.) */
  belowContent?: React.ReactNode;
  /** Optional custom class name for the outer wrapper */
  className?: string;
  /**
   * When set, show a ← back chevron instead of the hamburger menu button.
   * If a string href is provided, renders as a Link. Otherwise, calls
   * router.back() on click. Use this on sub/detail pages.
   */
  backHref?: string | true;
  /** Optional label next to the chevron (e.g., "Roster" or "Back") */
  backLabel?: string;
}

/**
 * Universal mobile-friendly page header with hamburger menu button.
 *
 * - Sticky at top with safe-area-inset-top padding (via .golf-mobile-page-header)
 * - Title always truncates — never wraps
 * - Action buttons (children) never wrap text or shrink
 * - Supports an optional belowContent slot for filters/tabs
 *
 * Use this component as the FIRST element in any dashboard page's return
 * to guarantee consistent top spacing, sticky behavior, and safe-area handling.
 */
export function MobileNavHeader({
  title,
  subtitle,
  children,
  belowContent,
  className,
  backHref,
  backLabel,
}: MobileNavHeaderProps) {
  const router = useRouter();

  const BackNav = backHref ? (
    typeof backHref === 'string' ? (
      <Link
        href={backHref}
        onClick={() => {
          void triggerHaptic('light');
        }}
        className={cn(
          'flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150 lg:hidden',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && (
          <span className="text-sm font-medium max-w-[140px] truncate">
            {backLabel}
          </span>
        )}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => {
          void triggerHaptic('light');
          if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
          } else {
            router.push('/golf/dashboard');
          }
        }}
        className={cn(
          'flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150 lg:hidden',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && (
          <span className="text-sm font-medium max-w-[140px] truncate">
            {backLabel}
          </span>
        )}
      </button>
    )
  ) : (
    <MobileMenuButton />
  );

  return (
    <div className={cn('golf-mobile-page-header', className)}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {BackNav}
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] md:text-[26px] leading-[1.08] font-medium tracking-[-0.022em] text-warm-900 truncate">
                {title}
              </h1>
              {subtitle && (
                typeof subtitle === 'string' ? (
                  <p className="text-warm-500 mt-0.5 text-xs md:text-sm truncate">
                    {subtitle}
                  </p>
                ) : (
                  <div className="text-warm-500 mt-0.5 text-xs md:text-sm min-w-0">
                    {subtitle}
                  </div>
                )
              )}
            </div>
          </div>
          {children && (
            <div className="flex items-center gap-2 flex-shrink-0 [&_button]:whitespace-nowrap [&_a]:whitespace-nowrap">
              {children}
            </div>
          )}
        </div>
        {belowContent && <div className="mt-3">{belowContent}</div>}
      </div>
    </div>
  );
}
