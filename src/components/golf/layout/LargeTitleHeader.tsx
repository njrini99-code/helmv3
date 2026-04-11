'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import { IconChevronLeft } from '@/components/icons';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface LargeTitleHeaderProps {
  title: string;
  /**
   * Subtitle — accepts a plain string (auto-truncated) OR arbitrary JSX
   * (for status indicators, pulsing dots, date strings, etc.).
   * When a string is passed, the component applies `truncate`. When JSX is
   * passed, the caller is responsible for its own overflow handling.
   */
  subtitle?: React.ReactNode;
  /** Action buttons shown on the right (icons or short labels) */
  children?: React.ReactNode;
  /** Extra row below the title (filter chips, tabs, search bar, etc.) */
  belowContent?: React.ReactNode;
  /** Optional custom class name for the outer wrapper */
  className?: string;
  /** Optional scroll container ref — if omitted, uses nearest main[role="main"] */
  scrollContainerRef?: React.RefObject<HTMLElement>;
  /**
   * When set, shows a ← back chevron on mobile instead of the hamburger.
   * Pass a string href to render a Link, or `true` to use router.back().
   */
  backHref?: string | true;
  /** Optional label next to the chevron (e.g., "Roster") */
  backLabel?: string;
}

/** Scroll distance (px) at which the large title fully collapses into the top bar. */
const COLLAPSE_THRESHOLD = 40;

/**
 * Large-title page header that mimics iOS's signature "large title that
 * collapses on scroll" pattern.
 *
 * - At the top of the scroll container: big centered title + subtitle sits
 *   below the sticky top bar (which just shows the hamburger + actions).
 * - After scrolling ~40px: the large title fades/shrinks away and a compact
 *   version slides into the sticky top bar next to the hamburger.
 * - On desktop (lg+): collapses are disabled and the header renders as a
 *   standard title-left / actions-right layout.
 * - Respects `prefers-reduced-motion` by snapping between states with no
 *   transition.
 *
 * Drop-in replacement for `MobileNavHeader` with an added scroll behavior.
 */
export function LargeTitleHeader({
  title,
  subtitle,
  children,
  belowContent,
  className,
  scrollContainerRef,
  backHref,
  backLabel,
}: LargeTitleHeaderProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const backChevron = backHref ? (
    typeof backHref === 'string' ? (
      <Link
        href={backHref}
        onClick={() => {
          void triggerHaptic('light');
        }}
        className={cn(
          'flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg lg:hidden flex-shrink-0',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && (
          <span className="text-sm font-medium max-w-[80px] truncate">{backLabel}</span>
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
          'flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg lg:hidden flex-shrink-0',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && (
          <span className="text-sm font-medium max-w-[80px] truncate">{backLabel}</span>
        )}
      </button>
    )
  ) : null;

  // Detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Scroll listener — tracks collapse state based on scrollTop of the container
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Resolve the scroll container:
    // 1. Explicit ref
    // 2. Nearest main[role="main"] ancestor
    // 3. window
    let target: HTMLElement | Window = window;
    if (scrollContainerRef?.current) {
      target = scrollContainerRef.current;
    } else if (wrapperRef.current) {
      const main = wrapperRef.current.closest('main[role="main"]') as HTMLElement | null;
      if (main) target = main;
    }

    const getScrollTop = () =>
      target instanceof Window ? target.scrollY || window.pageYOffset : target.scrollTop;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setCollapsed(getScrollTop() > COLLAPSE_THRESHOLD);
        ticking = false;
      });
    };

    // Initialize immediately in case the container is already scrolled
    setCollapsed(getScrollTop() > COLLAPSE_THRESHOLD);

    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainerRef]);

  const transitionClass = reducedMotion ? '' : 'transition-all duration-300 ease-out';

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {/* ===== Sticky top bar ===== */}
      <div
        className={cn(
          'sticky top-0 z-20 border-b border-warm-200/30 backdrop-blur-xl',
          // Reproduce .golf-mobile-page-header styling inline (no class dependency)
        )}
        style={{
          backgroundColor: 'rgba(255, 254, 250, 0.72)',
          paddingTop: 'max(0.25rem, env(safe-area-inset-top))',
          // `backdrop-blur-xl` in Tailwind is already 24px, but set explicitly as a safeguard
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
          <div className="flex items-center justify-between gap-3">
            {/* Left: hamburger OR back chevron + (collapsed title on mobile) OR (full title on desktop) */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {backChevron ?? <MobileMenuButton />}

              {/* Desktop: always-visible full title block */}
              <div className="hidden lg:block min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight text-warm-900 truncate">
                  {title}
                </h1>
                {subtitle && (
                  typeof subtitle === 'string' ? (
                    <p className="text-warm-500 mt-0.5 text-sm truncate">{subtitle}</p>
                  ) : (
                    <div className="text-warm-500 mt-0.5 text-sm min-w-0">{subtitle}</div>
                  )
                )}
              </div>

              {/* Mobile: compact title that fades in once collapsed */}
              <div
                className={cn(
                  'lg:hidden min-w-0 flex-1',
                  transitionClass,
                  collapsed
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 -translate-y-1 pointer-events-none'
                )}
                aria-hidden={!collapsed}
              >
                <h2 className="text-lg font-semibold tracking-tight text-warm-900 truncate">
                  {title}
                </h2>
              </div>
            </div>

            {/* Right: action buttons */}
            {children && (
              <div className="flex items-center gap-2 flex-shrink-0 [&_button]:whitespace-nowrap [&_a]:whitespace-nowrap">
                {children}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Expanded large-title row (mobile only) ===== */}
      <div
        className={cn(
          'lg:hidden overflow-hidden',
          transitionClass,
          collapsed ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'
        )}
        aria-hidden={collapsed}
      >
        <div className="max-w-7xl mx-auto px-4 pt-2 pb-4">
          <h1
            className={cn(
              'text-3xl font-semibold tracking-tight text-warm-900 truncate',
              transitionClass
            )}
          >
            {title}
          </h1>
          {subtitle && (
            typeof subtitle === 'string' ? (
              <p className={cn('text-warm-500 mt-1 text-sm truncate', transitionClass)}>
                {subtitle}
              </p>
            ) : (
              <div className={cn('text-warm-500 mt-1 text-sm min-w-0', transitionClass)}>
                {subtitle}
              </div>
            )
          )}
        </div>
      </div>

      {/* ===== belowContent (filters / tabs) — always visible, below the header ===== */}
      {belowContent && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pb-3 md:pb-0 md:pt-3">
          {belowContent}
        </div>
      )}
    </div>
  );
}
