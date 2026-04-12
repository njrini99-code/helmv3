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
   * Subtitle — string (auto-truncated) or JSX (caller handles overflow).
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

/** Scroll distance (px) at which the compact title fully fades in. */
const COLLAPSE_THRESHOLD = 32;

/**
 * iOS-native large title header.
 *
 * Structure (mirrors UIKit UINavigationController large title mode):
 *
 * 1. **Sticky nav bar** — ~44pt, always at the top of the viewport.
 *    Contains [hamburger/back] [compact title fading in when scrolled]
 *    [action buttons]. Compact title only visible once the user has
 *    scrolled past the large title below.
 *
 * 2. **Large title row** — lives INSIDE the scrollable content, not in
 *    the sticky header. As the user scrolls, it moves up and off-screen
 *    naturally — no max-height animation, zero flicker.
 *
 * 3. **belowContent** — optional sticky row for filter chips or tabs.
 *
 * On desktop (lg+) the layout collapses into a standard single-row header
 * with the full title on the left and actions on the right.
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
  const [scrolled, setScrolled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<HTMLElement | Window | null>(null);

  // Tap compact title → scroll to top (iOS native behavior).
  const handleTapTitle = () => {
    const target = scrollTargetRef.current;
    if (!target) return;
    try {
      if (target instanceof Window) {
        target.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        target.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      // no-op
    }
  };

  const backChevron = backHref ? (
    typeof backHref === 'string' ? (
      <Link
        href={backHref}
        onClick={() => {
          void triggerHaptic('light');
        }}
        className={cn(
          'flex items-center gap-1 -ml-2 px-2 h-11 rounded-lg lg:hidden flex-shrink-0',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && (
          <span className="text-subhead font-medium max-w-[120px] truncate">{backLabel}</span>
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
          'flex items-center gap-1 -ml-2 px-2 h-11 rounded-lg lg:hidden flex-shrink-0',
          'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && (
          <span className="text-subhead font-medium max-w-[120px] truncate">{backLabel}</span>
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

  // Scroll listener — resolves the nearest scroll container and toggles
  // the compact-title visibility based on scrollTop.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let target: HTMLElement | Window = window;
    if (scrollContainerRef?.current) {
      target = scrollContainerRef.current;
    } else if (wrapperRef.current) {
      const main = wrapperRef.current.closest('main[role="main"]') as HTMLElement | null;
      if (main) target = main;
    }
    scrollTargetRef.current = target;

    const getScrollTop = () =>
      target instanceof Window ? target.scrollY || window.pageYOffset : target.scrollTop;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setScrolled(getScrollTop() > COLLAPSE_THRESHOLD);
        ticking = false;
      });
    };

    setScrolled(getScrollTop() > COLLAPSE_THRESHOLD);
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainerRef]);

  // iOS easing; falls back to instant if reduced motion
  const transitionClass = reducedMotion
    ? ''
    : 'transition-opacity duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]';

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {/* ===== Sticky nav bar — always ~44pt + safe area =====
          Key insight: backdrop-filter is ALWAYS on. Only the background
          tint + border opacity toggle based on scroll. Eliminates the
          flicker that comes from toggling backdrop-filter itself. */}
      <div
        className="sticky top-0 z-30"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          backgroundColor: scrolled ? 'rgba(255, 254, 250, 0.88)' : 'rgba(255, 254, 250, 0.001)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
          borderBottom: `0.5px solid ${scrolled ? 'rgba(120, 113, 108, 0.18)' : 'transparent'}`,
          transition: reducedMotion
            ? 'none'
            : 'background-color 220ms ease-out, border-bottom-color 220ms ease-out',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between gap-2 h-11 md:h-14">
            {/* Left: hamburger or back button */}
            <div className="flex items-center flex-shrink-0">
              {backChevron ?? <MobileMenuButton />}
            </div>

            {/* Center (mobile): compact title — tap to scroll to top */}
            <button
              type="button"
              onClick={handleTapTitle}
              aria-hidden={!scrolled}
              tabIndex={scrolled ? 0 : -1}
              className={cn(
                'lg:hidden flex-1 min-w-0 px-2 text-center',
                transitionClass,
                scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <span className="block text-headline text-warm-900 truncate">
                {title}
              </span>
            </button>

            {/* Desktop: always-visible full title block on the left */}
            <div className="hidden lg:flex flex-1 min-w-0 ml-3 items-center">
              <div className="min-w-0 flex-1">
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

      {/* ===== Large title — part of scrollable content (mobile only) =====
          Not sticky. Scrolls away naturally. Zero flicker. */}
      <div className="lg:hidden max-w-7xl mx-auto px-4 pt-0.5 pb-2">
        <h1 className="text-large-title text-warm-900 truncate">
          {title}
        </h1>
        {subtitle && (
          typeof subtitle === 'string' ? (
            <p className="text-warm-500 mt-1 text-subhead leading-tight truncate">{subtitle}</p>
          ) : (
            <div className="text-warm-500 mt-1 text-subhead leading-tight min-w-0">{subtitle}</div>
          )
        )}
      </div>

      {/* ===== belowContent (filters / tabs) ===== */}
      {belowContent && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pb-3 md:pb-0 md:pt-3">
          {belowContent}
        </div>
      )}
    </div>
  );
}
