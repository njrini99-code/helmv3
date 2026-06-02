'use client';

/**
 * LargeTitleHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * iOS-native large-title implementation now lives in
 * `src/components/ui/page-header.tsx` as `variant="large-title"`; this module
 * re-exports a wrapper so every existing `<LargeTitleHeader …>` call site keeps
 * working byte-for-byte (same props, same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl) + A7
 * (single semantic <h1> per page).
 *
 * ── Fairway redesign fork (ADDITIVE, flag-gated) ───────────────────────────
 * Under the Fairway shell (rendered only when the redesign flag is ON) the
 * AppShell OWNS the top chrome: the sticky glass FairwayTopBar and the mobile
 * hamburger + slide-in drawer. The legacy large-title header emits its OWN
 * sticky nav-bar row plus a `MobileMenuButton` hamburger — which, inside the
 * shell, stacks a SECOND sticky bar + hamburger over the glass top bar.
 *
 * So when `useRedesign()` is true we SUPPRESS the legacy sticky nav-bar row and
 * the hamburger while KEEPING the page-owned content (large title <h1>,
 * subtitle, action buttons, optional back link, breadcrumb, belowContent). The
 * page keeps its gutters + title exactly as the contract requires; the shell
 * owns the chrome. With the flag OFF this returns the original PageHeader
 * delegation BYTE-FOR-BYTE unchanged.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageHeader, type LargeTitleHeaderProps as VariantProps } from '@/components/ui/page-header';
import { useRedesign } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { IconChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';

export type LargeTitleHeaderProps = Omit<VariantProps, 'variant'>;

/**
 * Flag-ON layout: the page-owned title block WITHOUT the sticky top nav-bar
 * row and WITHOUT the hamburger (the Fairway shell owns that chrome). Keeps the
 * semantic <h1>, subtitle, action buttons, optional inline (non-sticky) back
 * link, breadcrumb, and the belowContent slot. Uses the legacy warm-token
 * utilities (NOT --fw-* tokens) because non-migrated pages render this outside
 * the `.fairway-ds` scope.
 */
function RedesignLargeTitleHeader({
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
    <div className={cn('max-w-7xl mx-auto px-4 md:px-6 pt-1 pb-3 md:py-5', className)}>
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

export function LargeTitleHeader(props: LargeTitleHeaderProps) {
  const redesign = useRedesign();
  if (redesign) {
    return <RedesignLargeTitleHeader {...props} />;
  }
  return <PageHeader variant="large-title" {...props} />;
}
