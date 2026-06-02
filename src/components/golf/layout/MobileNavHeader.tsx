'use client';

/**
 * MobileNavHeader — thin shim over the canonical `<PageHeader>` primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into PageHeader. The
 * sticky hamburger/back top-bar implementation now lives in
 * `src/components/ui/page-header.tsx` as `variant="mobile-nav"`; this module
 * re-exports a wrapper so every existing `<MobileNavHeader …>` call site keeps
 * working byte-for-byte (same props, same behaviour, same look).
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl) + A7
 * (single semantic <h1> per page).
 *
 * ── Fairway redesign fork (ADDITIVE, flag-gated) ───────────────────────────
 * Under the Fairway shell (rendered only when the redesign flag is ON) the
 * AppShell OWNS the top chrome: the sticky glass FairwayTopBar and the mobile
 * hamburger + slide-in drawer. The legacy mobile-nav header is itself a sticky
 * top bar (`.golf-mobile-page-header`) whose default left affordance is a
 * `MobileMenuButton` hamburger — which, inside the shell, stacks a SECOND
 * sticky bar + hamburger over the glass top bar.
 *
 * So when `useRedesign()` is true we SUPPRESS the sticky top-bar wrapper and
 * the hamburger while KEEPING the page-owned content (title <h1>, subtitle,
 * action buttons, optional inline back link, breadcrumb, belowContent). The
 * page keeps its gutters + title exactly as the contract requires; the shell
 * owns the chrome. With the flag OFF this returns the original PageHeader
 * delegation BYTE-FOR-BYTE unchanged.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageHeader, type MobileNavHeaderProps as VariantProps } from '@/components/ui/page-header';
import { useRedesign } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { IconChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';

export type MobileNavHeaderProps = Omit<VariantProps, 'variant'>;

/**
 * Flag-ON layout: the page-owned title block WITHOUT the sticky
 * `.golf-mobile-page-header` wrapper and WITHOUT the hamburger (the Fairway
 * shell owns that chrome). Keeps the semantic <h1>, subtitle, action buttons,
 * optional inline (non-sticky) back link, breadcrumb, and the belowContent
 * slot. Uses the legacy warm-token utilities (NOT --fw-* tokens) because
 * non-migrated pages render this outside the `.fairway-ds` scope.
 */
function RedesignMobileNavHeader({
  title,
  subtitle,
  children,
  belowContent,
  className,
  backHref,
  backLabel,
  breadcrumb,
}: MobileNavHeaderProps) {
  const router = useRouter();

  const backNav = backHref ? (
    typeof backHref === 'string' ? (
      <Link
        href={backHref}
        onClick={() => {
          void triggerHaptic('light');
        }}
        className={cn(
          'inline-flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg lg:hidden',
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
          'inline-flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg lg:hidden',
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
    <div className={cn('max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5', className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      {backNav}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 leading-[1.08] font-medium tracking-[-0.022em] text-warm-900">
            {title}
          </h1>
          {subtitle &&
            (typeof subtitle === 'string' ? (
              <p className="text-warm-500 mt-0.5 text-xs md:text-sm">{subtitle}</p>
            ) : (
              <div className="text-warm-500 mt-0.5 text-xs md:text-sm min-w-0">{subtitle}</div>
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

export function MobileNavHeader(props: MobileNavHeaderProps) {
  const redesign = useRedesign();
  if (redesign) {
    return <RedesignMobileNavHeader {...props} />;
  }
  return <PageHeader variant="mobile-nav" {...props} />;
}
