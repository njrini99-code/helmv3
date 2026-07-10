'use client';

/**
 * LargeTitleHeader — the page-owned title block WITHOUT a sticky top nav-bar
 * row (the Fairway shell owns that chrome via the sticky glass
 * FairwayTopBar; mobile overflow is the single `MoreNavSheet`, not a
 * hamburger/drawer — see `docs/MOBILE_DOCTRINE.md` rule 6). Keeps the
 * semantic <h1>, subtitle, action buttons, optional inline
 * (non-sticky) back link, breadcrumb, and the belowContent slot. Uses the
 * legacy warm-token utilities (NOT --fw-* tokens) because non-migrated pages
 * render this outside the `.fairway-ds` scope.
 *
 * M1 (condensing-header): registers `title` with the shell's condensed top
 * bar (`useLargeTitle().setRegisteredTitle`) so the bar's copy matches this
 * page's real `<h1>` exactly — no other wiring needed. Safe outside an
 * `AppShell`/`FairwayLargeTitleProvider` (e.g. legacy non-Fairway routes):
 * `useLargeTitle()` degrades to a no-op setter there.
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl) + A7
 * (single semantic <h1> per page).
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { LargeTitleHeaderProps as VariantProps } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { IconChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useLargeTitle } from '@/components/fairway/app-shell/LargeTitleContext';

export type LargeTitleHeaderProps = Omit<VariantProps, 'variant'>;

export function LargeTitleHeader({
  title,
  subtitle,
  children,
  belowContent,
  className,
  backHref,
  backLabel,
  breadcrumb,
}: LargeTitleHeaderProps) {
  const router = useRouter();
  const { setRegisteredTitle } = useLargeTitle();

  // M1 (condensing-header): unregister on unmount so navigating to a route
  // that hasn't adopted a large-title primitive never inherits a stale title
  // left behind by whichever page rendered last (LargeTitleContext's
  // registeredTitle contract).
  useEffect(() => {
    setRegisteredTitle(title);
    return () => setRegisteredTitle(null);
  }, [title, setRegisteredTitle]);

  const backNav = backHref ? (
    typeof backHref === 'string' ? (
      <Link
        href={backHref}
        onClick={() => {
          void triggerHaptic('light');
        }}
        className={cn(
          'inline-flex items-center gap-1 -ml-2 px-2 py-1 rounded-lg lg:hidden',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={20} />
        {backLabel && <span className="text-sm font-medium max-w-[140px] truncate">{backLabel}</span>}
      </Link>
    ) : (
      <Button
        variant="ghost"
        type="button"
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
          } else {
            router.push('/golf/dashboard');
          }
        }}
        className={cn(
          'inline-flex items-center gap-1 -ml-2 px-2 py-1 rounded-lg lg:hidden',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={20} />
        {backLabel && <span className="text-sm font-medium max-w-[140px] truncate">{backLabel}</span>}
      </Button>
    )
  ) : null;

  return (
    <div data-fw-title-anchor className={cn('max-w-7xl mx-auto px-4 md:px-6 pt-1 pb-3 md:py-5', className)}>
      {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
      {backNav}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 md:text-h1 leading-[1.05] font-medium tracking-[-0.022em] text-warm-900">
            {title}
          </h1>
          {subtitle &&
            (typeof subtitle === 'string' ? (
              <p className="text-warm-500 mt-1 text-sm md:text-base">{subtitle}</p>
            ) : (
              <div className="text-warm-500 mt-1 text-sm md:text-base min-w-0">{subtitle}</div>
            ))}
        </div>
        {children && (
          <div className="flex items-center gap-2 flex-shrink-0 [&_button]:whitespace-nowrap [&_a]:whitespace-nowrap">
            {children}
          </div>
        )}
      </div>
      {belowContent && <div className="mt-3">{belowContent}</div>}
    </div>
  );
}
