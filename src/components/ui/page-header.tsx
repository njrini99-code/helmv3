'use client';

/**
 * PageHeader — the single canonical page-header primitive.
 *
 * Wave W2E consolidated six hand-rolled sibling headers into ONE component
 * exposing four behaviour- AND look-preserving variants. Each variant
 * reproduces its original sibling exactly (title size, actions slot, back
 * button, plinth/blur treatment); the title always renders as a semantic
 * <h1>.
 *
 *   variant="default"      Editorial "magazine cover" hero — Fraunces serif
 *                          eyebrow above a Geist display <h1>. (legacy
 *                          <PageHeader eyebrow title subtitle actions /> API)
 *   variant="large-title"  iOS-native UINavigationController large-title mode
 *                          (sticky blurred nav bar + scroll-collapsing large
 *                          title). Was <LargeTitleHeader>.
 *   variant="mobile-nav"   Sticky hamburger/back top bar with a truncating
 *                          title. Was <MobileNavHeader>.
 *   variant="plinth"       Glass plinth detail header — back link + status
 *                          snapshot + identity + action buttons on a
 *                          bg-white/70 backdrop-blur-xl rounded-2xl shadow-glass
 *                          surface. Was <CoachPageHeader>.
 *
 * The thin sibling shims (LargeTitleHeader, MobileNavHeader, CoachPageHeader,
 * CalendarHeader, PremiumRoundHeader, SupportHeader) now re-export wrappers
 * around this primitive so no caller had to change its call site shape.
 *
 * Audit reference: ultra-audit master synthesis A4 (header sprawl) + A7
 * (semantic heading hierarchy — exactly one <h1> per page surface).
 *
 * The brief calls for a Fraunces serif eyebrow above a Geist sans
 * display title — Rivian and NEO both use this composition to anchor
 * a hero section. Used at the top of CoachHelm command center, Player
 * Hub, Round Review, and any page that earns a true hero treatment.
 *
 * Composition:
 *   <Eyebrow>Today's CoachHelm</Eyebrow>
 *   <PageTitle>Three players need attention before practice.</PageTitle>
 *   <PageSubtitle>Tap the player to open the prescribed plan.</PageSubtitle>
 *
 * Or use the convenience compound:
 *   <PageHeader eyebrow="Today's CoachHelm" title="…" subtitle="…" />
 */

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { deriveBreadcrumbItems } from '@/components/ui/breadcrumb';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Menu, Globe } from 'lucide-react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import { IconChevronLeft } from '@/components/icons';
import { cn } from '@/lib/utils';
import { triggerHaptic, isNativeApp } from '@/lib/utils/capacitor';
import { Button, IconButton } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSidebarSafe } from '@/contexts/sidebar-context';
import { useFormatDate, useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Optional accent dot color before the eyebrow text. Use semantic tokens. */
  accent?: 'primary' | 'sage' | 'amber' | 'rose' | 'none';
}

/**
 * Editorial eyebrow — Fraunces serif, uppercase, 11px, 0.16em tracking.
 * The serif companion is the only legitimate place serifs appear in the
 * product chrome; everything else is Geist.
 */
export const Eyebrow = React.forwardRef<HTMLParagraphElement, EyebrowProps>(
  ({ className, accent = 'none', children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        'font-serif text-[11px] uppercase tracking-[0.16em] text-warm-500',
        'inline-flex items-center gap-2',
        className,
      )}
      {...props}
    >
      {accent !== 'none' && (
        <span
          aria-hidden
          className={cn(
            'h-1 w-1 rounded-full',
            accent === 'primary' && 'bg-primary-500',
            accent === 'sage' && 'bg-sage-600',
            accent === 'amber' && 'bg-helm-amber',
            accent === 'rose' && 'bg-rose-500',
          )}
        />
      )}
      {children}
    </p>
  ),
);
Eyebrow.displayName = 'Eyebrow';

/**
 * Display-grade page title. Geist Sans, weight 500, large + airy.
 * Letter-spacing tightens at this size to keep the editorial feel.
 */
export const PageTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- content provided via children prop by caller
    <h1
      ref={ref}
      className={cn(
        'font-display text-[34px] sm:text-[40px] md:text-[48px] font-medium leading-[1.05] tracking-[-0.022em] text-warm-900',
        'max-w-[28ch]',
        className,
      )}
      {...props}
    />
  ),
);
PageTitle.displayName = 'PageTitle';

/**
 * Subtitle below the page title. Warm-500, 16-18px, generous line height.
 */
export const PageSubtitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        'text-[16px] sm:text-[17px] leading-[1.55] text-warm-500',
        'max-w-[52ch]',
        className,
      )}
      {...props}
    />
  ),
);
PageSubtitle.displayName = 'PageSubtitle';

// ============================================================================
// Variant: default — editorial "magazine cover" hero
// ============================================================================

interface DefaultHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'default';
  eyebrow?: string;
  eyebrowAccent?: EyebrowProps['accent'];
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional right-rail content (CTA, metadata pills) — desktop only on md+ */
  actions?: React.ReactNode;
  /**
   * Optional breadcrumb trail rendered above the eyebrow/title. Pass a
   * `<Breadcrumb … />` element (or `<Breadcrumb auto />`) to give deep routes
   * a visible trail back to their section root.
   */
  breadcrumb?: React.ReactNode;
}

function DefaultHeader({
  className,
  eyebrow,
  eyebrowAccent,
  title,
  subtitle,
  actions,
  breadcrumb,
  forwardedRef,
  ...props
}: DefaultHeaderProps & { forwardedRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="flex flex-col gap-3">
      {breadcrumb}
      <div
        ref={forwardedRef}
        className={cn(
          'flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6',
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-3">
          {eyebrow && <Eyebrow accent={eyebrowAccent}>{eyebrow}</Eyebrow>}
          <PageTitle>{title}</PageTitle>
          {subtitle && <PageSubtitle>{subtitle}</PageSubtitle>}
        </div>
        {actions && <div className="flex items-center gap-2 md:flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// Shared back-navigation chevron (large-title + mobile-nav variants)
// ============================================================================

/**
 * Resolve the breadcrumb-parent href for a pathname — the second-to-last crumb
 * in the derived trail. Used as the deterministic smart-back fallback so a
 * deep-linked / cold-started page lands on its logical parent (not a blind
 * router.back() into nothing, nor a hardcoded dashboard). Returns null for
 * root pages (a single-crumb trail has no parent).
 */
function breadcrumbParentHref(pathname: string | null): string | null {
  if (!pathname) return null;
  const items = deriveBreadcrumbItems(pathname);
  if (items.length < 2) return null;
  const parent = items[items.length - 2];
  return parent?.href ?? null;
}

function BackChevron({
  backHref,
  backLabel,
  router,
  className,
  labelClassName,
}: {
  backHref: string | true;
  backLabel?: string;
  router: ReturnType<typeof useRouter>;
  className: string;
  labelClassName: string;
}) {
  const pathname = usePathname();

  if (typeof backHref === 'string') {
    return (
      <Link
        href={backHref}
        onClick={() => {
          void triggerHaptic('light');
        }}
        className={className}
        aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
      >
        <IconChevronLeft size={22} />
        {backLabel && <span className={labelClassName}>{backLabel}</span>}
      </Link>
    );
  }
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => {
        void triggerHaptic('light');
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          // No history (deep link / native cold start): land on the
          // breadcrumb parent, falling back to the dashboard root.
          router.push(breadcrumbParentHref(pathname) ?? '/golf/dashboard');
        }
      }}
      className={className}
      aria-label={backLabel ? `Back to ${backLabel}` : 'Go back'}
    >
      <IconChevronLeft size={22} />
      {backLabel && <span className={labelClassName}>{backLabel}</span>}
    </Button>
  );
}

// ============================================================================
// Variant: large-title — iOS UINavigationController large-title mode
// ============================================================================

export interface LargeTitleHeaderProps {
  variant: 'large-title';
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
  /**
   * Optional breadcrumb trail rendered above the large title (desktop) and the
   * scroll-away title (mobile). Pass a `<Breadcrumb … />` element.
   */
  breadcrumb?: React.ReactNode;
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
function LargeTitleHeader({
  title,
  subtitle,
  children,
  belowContent,
  className,
  scrollContainerRef,
  backHref,
  backLabel,
  breadcrumb,
}: Omit<LargeTitleHeaderProps, 'variant'>) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<HTMLElement | Window | null>(null);
  const scrolledRef = useRef(false);

  // Tap compact title → scroll to top (iOS native behavior).
  const handleTapTitle = () => {
    const target = scrollTargetRef.current;
    if (!target) return;
    try {
      if (target instanceof Window) {
        target.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      } else {
        target.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    } catch {
      // no-op
    }
  };

  const backChevron = backHref ? (
    <BackChevron
      backHref={backHref}
      backLabel={backLabel}
      router={router}
      className={cn(
        'flex items-center gap-1 -ml-2 px-2 h-11 rounded-lg lg:hidden flex-shrink-0',
        'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      )}
      labelClassName="text-subhead font-medium max-w-[120px] truncate"
    />
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
        const next = getScrollTop() > COLLAPSE_THRESHOLD;
        if (next !== scrolledRef.current) {
          scrolledRef.current = next;
          setScrolled(next);
        }
        ticking = false;
      });
    };

    const initialScrolled = getScrollTop() > COLLAPSE_THRESHOLD;
    scrolledRef.current = initialScrolled;
    setScrolled(initialScrolled);
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainerRef]);

  // iOS easing; falls back to instant if reduced motion
  const transitionClass = reducedMotion
    ? ''
    : 'transition-opacity duration-200 [transition-timing-function:cubic-bezier(0.25,0.1,0.25,1)]';

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
            <Button variant="ghost"
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
            </Button>

            {/* Desktop: always-visible full title block on the left.
                Apple-native minimal — Geist regular at iOS-equivalent
                proportions. No editorial flourishes, no display weight,
                just title + optional quiet subtitle on warm cream. */}
            <div className="hidden lg:flex flex-1 min-w-0 ml-3 items-center">
              <div className="min-w-0 flex-1">
                {breadcrumb && <div className="mb-0.5">{breadcrumb}</div>}
                <h1 className="text-h1 leading-[1.08] font-medium tracking-[-0.022em] text-warm-900 truncate">
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
          Apple-native iOS large title. 34pt-equivalent (UIKit
          UINavigationItem largeTitle), Geist medium, restrained tracking.
          No eyebrow, no hairline, no glass tray — just the title sitting
          on warm cream and scrolling away naturally. Zero flicker. */}
      <div className="lg:hidden max-w-7xl mx-auto px-4 pt-0.5 pb-3">
        {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
        <h1 className="text-h1 leading-[1.05] font-medium tracking-[-0.018em] text-warm-900 truncate">
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

// ============================================================================
// Variant: mobile-nav — sticky hamburger/back top bar
// ============================================================================

export interface MobileNavHeaderProps {
  variant: 'mobile-nav';
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
  /**
   * Optional breadcrumb trail rendered above the title row. Pass a
   * `<Breadcrumb … />` element to give deep routes a visible trail back to
   * their section root (complements the ← back chevron on detail pages).
   */
  breadcrumb?: React.ReactNode;
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
function MobileNavHeader({
  title,
  subtitle,
  children,
  belowContent,
  className,
  backHref,
  backLabel,
  breadcrumb,
}: Omit<MobileNavHeaderProps, 'variant'>) {
  const router = useRouter();

  const BackNav = backHref ? (
    <BackChevron
      backHref={backHref}
      backLabel={backLabel}
      router={router}
      className={cn(
        'flex items-center gap-1 -ml-2 px-2 py-2 rounded-lg',
        'text-warm-600 hover:text-warm-900 hover:bg-warm-100/60 active:bg-warm-200/60',
        'transition-colors duration-150 lg:hidden',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      )}
      labelClassName="text-sm font-medium max-w-[140px] truncate"
    />
  ) : (
    <MobileMenuButton />
  );

  return (
    <div className={cn('golf-mobile-page-header', className)}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {BackNav}
            <div className="min-w-0 flex-1">
              <h1 className="text-h2 leading-[1.08] font-medium tracking-[-0.022em] text-warm-900 truncate">
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

// ============================================================================
// Variant: plinth — glass plinth detail header (back + status + actions)
// ============================================================================

export interface PlinthHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  variant: 'plinth';
  /** Back link target (rendered as a Link). */
  backHref?: string;
  /** Back link label text. */
  backLabel?: string;
  /** Optional override for the back-link leading glyph (defaults to a chevron). */
  backIcon?: React.ReactNode;
  /** Optional right-aligned status snapshot rendered next to the back row. */
  status?: React.ReactNode;
  /** Whether to render the back row at all (back link + status). */
  showTopRow?: boolean;
  /** Optional leading glyph before the title (e.g. a star). */
  titleIcon?: React.ReactNode;
  /** Page title — semantic <h1>. */
  title: React.ReactNode;
  /** Optional inline meta shown after the title (e.g. "· Head Coach"). */
  titleMeta?: React.ReactNode;
  /** Meta row beneath the title (school / conference / division …). */
  meta?: React.ReactNode;
  /** Optional callout row (e.g. overdue follow-up) beneath the meta. */
  callout?: React.ReactNode;
  /** Action buttons (email / call / schedule / staff page …). */
  actions?: React.ReactNode;
}

/**
 * Glass plinth detail header. Mirrors the per-record detail page header:
 * a back link + status snapshot row above an identity block (title + meta)
 * with right-aligned action buttons — all on a
 * `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass`
 * surface.
 */
function PlinthHeader({
  className,
  backHref,
  backLabel = 'Back',
  backIcon,
  status,
  showTopRow = true,
  titleIcon,
  title,
  titleMeta,
  meta,
  callout,
  actions,
  forwardedRef,
  ...props
}: Omit<PlinthHeaderProps, 'variant'> & { forwardedRef?: React.Ref<HTMLElement> }) {
  return (
    <header
      ref={forwardedRef}
      className={cn(
        'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass px-6 py-5',
        className,
      )}
      {...props}
    >
      {showTopRow && (
        <div className="flex items-center justify-between mb-4">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-warm-500 hover:text-warm-800 font-medium transition-colors"
            >
              {backIcon ?? <IconChevronLeft size={14} />}
              {backLabel}
            </Link>
          ) : (
            <span />
          )}

          {/* Quick status snapshot */}
          {status && <div className="flex items-center gap-2">{status}</div>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {titleIcon}
            <h1 className="text-2xl font-bold text-warm-900 tracking-tight truncate">
              {title}
            </h1>
            {titleMeta && (
              <span className="text-sm text-warm-500 truncate">{titleMeta}</span>
            )}
          </div>
          {meta && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-warm-600">
              {meta}
            </div>
          )}
          {callout}
        </div>

        {/* Action buttons */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}

// ============================================================================
// Variant: calendar — calendar control bar (title + nav + view/tz/add)
// ============================================================================

export type CalendarView = 'day' | 'week' | 'month';

export interface CalendarHeaderProps {
  variant: 'calendar';
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddEvent?: () => void;
  teamTimezone?: string;
  secondaryTimezone?: string | null;
  onSecondaryTimezoneChange?: (tz: string | null) => void;
}

const TZ_OPTIONS = [
  { value: 'America/New_York', label: 'ET' },
  { value: 'America/Chicago', label: 'CT' },
  { value: 'America/Denver', label: 'MT' },
  { value: 'America/Los_Angeles', label: 'PT' },
  { value: 'America/Phoenix', label: 'AZ' },
  { value: 'Pacific/Honolulu', label: 'HI' },
] as const;

function CalendarHeader({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  onAddEvent,
  teamTimezone,
  secondaryTimezone,
  onSecondaryTimezoneChange,
}: Omit<CalendarHeaderProps, 'variant'>) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const sidebar = useSidebarSafe();
  const toggleMobile = sidebar?.toggleMobile ?? (() => {});
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);

  const getTitle = () => {
    if (view === 'day') {
      // Mobile: "Apr 11" — desktop: "Thursday, April 11, 2026"
      if (isMobile) {
        return currentDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }

    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      const startYear = ws.getFullYear();
      const endYear = we.getFullYear();
      const startMonth = format(ws, 'MMM');
      const endMonth = format(we, 'MMM');

      if (startYear !== endYear) {
        // Cross year: "Dec 30, 2024 - Jan 5, 2025"
        return `${format(ws, 'MMM d, yyyy')} – ${format(we, 'MMM d, yyyy')}`;
      } else if (startMonth !== endMonth) {
        // Cross month: "Dec 30 - Jan 5, 2025"
        return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
      } else {
        // Same month: "Jan 6 - 12, 2025"
        return `${format(ws, 'MMM d')} – ${format(we, 'd, yyyy')}`;
      }
    }

    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 md:py-5 flex-shrink-0 min-w-0">
      {/* Left: Title + Nav */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        <IconButton variant="default"
          type="button"
          onClick={toggleMobile}
          className={cn(
            'lg:hidden p-2.5 -ml-2 rounded-2xl',
            'text-warm-500 hover:text-warm-700 hover:bg-warm-100/65',
            'transition-colors duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
          )}
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </IconButton>

        {/* Editorial title — sculptural, light weight */}
        <h2 className="text-h3 md:text-h2 font-medium text-warm-900 tracking-[-0.022em] truncate min-w-0">
          {getTitle()}
        </h2>

        {/* Navigation — borderless arrows */}
        <div className="flex items-center gap-0.5 ml-1">
          <IconButton variant="default"
            type="button"
            onClick={() => onNavigate('prev')}
            aria-label={`Previous ${view}`}
            className={cn(
              'rounded-full transition-colors duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
              'text-warm-500 hover:text-warm-800 hover:bg-cream-100/70',
              isMobile ? 'w-10 h-10' : 'w-9 h-9',
              'flex items-center justify-center'
            )}
          >
            <ChevronLeft className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </IconButton>
          <IconButton variant="default"
            type="button"
            onClick={() => onNavigate('next')}
            aria-label={`Next ${view}`}
            className={cn(
              'rounded-full transition-colors duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
              'text-warm-500 hover:text-warm-800 hover:bg-cream-100/70',
              isMobile ? 'w-10 h-10' : 'w-9 h-9',
              'flex items-center justify-center'
            )}
          >
            <ChevronRight className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </IconButton>
        </div>

        <Button variant="ghost"
          type="button"
          onClick={() => onNavigate('today')}
          className="pill-soft"
        >
          Today
        </Button>
      </div>

      {/* Right: View Toggle + Add Event */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* View Toggle — soft segmented control */}
        {!isMobile && (
          <div
            role="radiogroup"
            aria-label="Calendar view"
            className="inline-flex rounded-full p-1 bg-cream-100/70 ring-1 ring-warm-200/50"
          >
            {(['day', 'week', 'month'] as const).map((v) => (
              <Button variant="ghost"
                type="button"
                key={v}
                role="radio"
                aria-checked={view === v}
                onClick={() => onViewChange(v)}
                className={cn(
                  'px-4 py-1.5 text-[12.5px] font-medium rounded-full transition-colors duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                  view === v
                    ? 'bg-cream-50 text-warm-900 shadow-[0_1px_2px_rgba(58,50,40,0.05),0_4px_10px_rgba(58,50,40,0.04)]'
                    : 'text-warm-500 hover:text-warm-700'
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        )}

        {/* Timezone Toggle — desktop only */}
        {/* Secondary-timezone overlay toggle. De-emphasized ghost control (not
            variant="primary", which competed with the Add Event CTA) with a
            visible tooltip so the globe glyph isn't ambiguous. Shows the chosen
            timezone label inline when active. */}
        {!isMobile && onSecondaryTimezoneChange && (
          <DropdownMenu open={tzDropdownOpen} onOpenChange={setTzDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost"
                type="button"
                onClick={() => void triggerHaptic('light')}
                title={secondaryTimezone ? `Second timezone: ${secondaryTimezone}` : 'Show a second timezone'}
                aria-label={secondaryTimezone ? `Second timezone: ${secondaryTimezone}. Change or remove` : 'Show a second timezone on the calendar'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium transition-colors duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                  secondaryTimezone
                    ? 'px-3 py-1.5 bg-primary-50/70 text-primary-700 hover:bg-primary-100/70'
                    : 'px-2.5 py-1.5 text-warm-400 hover:text-warm-700 hover:bg-cream-100/65'
                )}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className={cn('text-[11.5px]', !secondaryTimezone && 'sr-only')}>
                  {secondaryTimezone
                    ? (TZ_OPTIONS.find(t => t.value === secondaryTimezone)?.label ?? secondaryTimezone.split('/').pop())
                    : 'Timezone'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {secondaryTimezone && (
                <>
                  <DropdownMenuItem
                    onSelect={() => { void triggerHaptic('light'); onSecondaryTimezoneChange(null); }}
                    className="text-warm-500"
                  >
                    Remove overlay
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {TZ_OPTIONS
                .filter(tz => tz.value !== teamTimezone)
                .map(tz => (
                  <DropdownMenuItem
                    key={tz.value}
                    onSelect={() => { void triggerHaptic('light'); onSecondaryTimezoneChange(tz.value); }}
                    selected={secondaryTimezone === tz.value}
                  >
                    {tz.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Add Event — soft primary pill */}
        {onAddEvent && !isMobile && (
          <Button variant="primary"
            type="button"
            onClick={onAddEvent}
            className={cn(
              'group inline-flex items-center gap-2 px-5 py-2 rounded-full text-body-sm font-medium tracking-[-0.005em]',
              'bg-primary-600/95 text-white',
              'shadow-[0_3px_10px_rgba(22,163,74,0.18)]',
              'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:bg-primary-700 hover:shadow-[0_6px_18px_rgba(22,163,74,0.24)]'
            )}
          >
            <Plus className="w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-90" />
            Add Event
          </Button>
        )}
      </div>
    </header>
  );
}

// ============================================================================
// Variant: round — premium round summary card (player + score + stats)
// ============================================================================

export interface RoundHeaderProps {
  variant: 'round';
  playerName: string;
  playerAvatarUrl?: string | null;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  roundDate: string;
  roundType: string | null;
  totalScore: number | null;
  scoreToPar: number | null;
  totalPutts: number | null;
  totalFairwaysHit: number | null;
  totalFairways: number | null;
  totalGir: number | null;
  totalGirPossible: number | null;
  frontNine: number | null;
  backNine: number | null;
  courseRating: number | null;
  courseSlope: number | null;
  teesPlayed: string | null;
  notes: string | null;
}

const roundStatReveal = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.35 + i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

function RoundHeader({
  playerName,
  playerAvatarUrl,
  courseName,
  courseCity,
  courseState,
  roundDate,
  roundType,
  totalScore,
  scoreToPar,
  totalPutts,
  totalFairwaysHit,
  totalFairways,
  totalGir,
  totalGirPossible,
  frontNine,
  backNine,
  courseRating,
  courseSlope,
  teesPlayed,
  notes,
}: Omit<RoundHeaderProps, 'variant'>) {
  const prefersReducedMotion = useReducedMotion();
  const { scoreDisplay: scoreDisplayMode } = useAppearancePreferences();

  const toParLabel = scoreToPar === null || scoreToPar === undefined
    ? '--'
    : scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;

  // In 'raw' mode, suppress the to-par sub-label (raw score already shown prominently)
  const scoreDisplay = scoreDisplayMode === 'to_par' ? toParLabel : null;

  const scoreColor = scoreToPar === null || scoreToPar === undefined
    ? 'text-warm-600'
    : scoreToPar < 0 ? 'text-primary-600' : scoreToPar > 0 ? 'text-red-600' : 'text-warm-600';

  const fmtDate = useFormatDate();
  const formattedDate = fmtDate(roundDate);

  const stats = [
    {
      label: 'Putts',
      value: totalPutts ?? '--',
      sub: null,
    },
    {
      label: 'Fairways',
      value: totalFairwaysHit !== null && totalFairways ? `${totalFairwaysHit}/${totalFairways}` : '--',
      sub: totalFairwaysHit !== null && totalFairways && totalFairways > 0
        ? `${Math.round((totalFairwaysHit / totalFairways) * 100)}%`
        : null,
    },
    {
      label: 'Greens',
      value: totalGir !== null && totalGirPossible ? `${totalGir}/${totalGirPossible}` : '--',
      sub: totalGir !== null && totalGirPossible && totalGirPossible > 0
        ? `${Math.round((totalGir / totalGirPossible) * 100)}%`
        : null,
    },
    {
      label: 'Front / Back',
      value: `${frontNine ?? '--'} / ${backNine ?? '--'}`,
      sub: null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card variant="glass" padding="none" className="overflow-hidden shadow-sm">
        <div className="p-6 sm:p-8">
          {/* Player info + score */}
          <div className="flex items-start justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, ease: [0.16, 1, 0.3, 1] })}
              className="flex items-center gap-4"
            >
              <Avatar
                src={playerAvatarUrl}
                name={playerName}
                size="xl"
              />
              <div>
                <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em]">{playerName}</h2>
                <p className="text-sm text-warm-500 mt-0.5">{formattedDate}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-sm font-medium text-warm-700">{courseName}</span>
                  {courseCity && courseState && (
                    <span className="text-xs text-warm-400">{courseCity}, {courseState}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {roundType && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 capitalize border border-warm-200/50">
                      {roundType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {courseRating && (
                    <span className="text-xs text-warm-400">Rating: {courseRating}</span>
                  )}
                  {courseSlope && (
                    <span className="text-xs text-warm-400">Slope: {courseSlope}</span>
                  )}
                  {teesPlayed && (
                    <span className="text-xs text-warm-400">Tees: {teesPlayed}</span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Score display */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] })}
              className="text-right flex-shrink-0"
            >
              <div className="text-display font-light tracking-[-0.025em] text-warm-900 tabular-nums">
                {totalScore ?? '--'}
              </div>
              {scoreDisplay !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.35, duration: 0.35 })}
                  className={cn('text-xl font-medium', scoreColor)}
                >
                  {scoreDisplay}
                </motion.div>
              )}
              {frontNine !== null && backNine !== null && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.45, duration: 0.3 })}
                  className="text-xs text-warm-400 mt-1 tabular-nums"
                >
                  {frontNine} / {backNine}
                </motion.p>
              )}
            </motion.div>
          </div>

          {/* Stats row */}
          <div className="mt-6 pt-6 border-t border-warm-200/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                variants={roundStatReveal}
                initial="hidden"
                animate="visible"
                className="rounded-xl bg-warm-50/50 p-3"
              >
                <p className="text-xs text-warm-400 font-medium">{stat.label}</p>
                <p className="text-h3 font-medium text-warm-900 tracking-[-0.015em] tabular-nums mt-0.5">{stat.value}</p>
                {stat.sub && (
                  <p className="text-xs text-warm-400 mt-0.5">{stat.sub}</p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </Card>

      {/* Notes */}
      {notes && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] })}
        >
          <Card variant="glass">
            <div className="p-5">
              <p className="text-sm font-medium text-warm-700 mb-2">Round Notes</p>
              <p className="text-sm text-warm-600 leading-relaxed">{notes}</p>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Variant: support — marketing/support top bar (brand + home link)
// ============================================================================

export interface SupportHeaderProps {
  variant: 'support';
}

function SupportHeader() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const homeHref = isNative ? '/golf/login' : '/';

  return (
    <header>
      <Card variant="overlay"
        hover={false}
        padding="none"
        className="rounded-none border-x-0 border-t-0 border-b border-warm-200/60 shadow-none"
      >
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            href={homeHref}
            className="flex items-center gap-2 text-warm-900 font-semibold hover:opacity-80 transition-opacity"
          >
            <span className="text-xl">Helm Sports Labs</span>
          </Link>
          {!isNative && (
            <Link
              href="/"
              className="text-sm text-warm-600 hover:text-warm-900 transition-colors"
            >
              Home
            </Link>
          )}
        </div>
      </Card>
    </header>
  );
}

// ============================================================================
// PageHeader — variant dispatcher
// ============================================================================

export type PageHeaderProps =
  | DefaultHeaderProps
  | LargeTitleHeaderProps
  | MobileNavHeaderProps
  | PlinthHeaderProps
  | CalendarHeaderProps
  | RoundHeaderProps
  | SupportHeaderProps;

/**
 * Convenience compound for the most common hero pattern. Spaces the
 * eyebrow + title + subtitle on the brief's exaggerated rhythm
 * (eyebrow → 16px → title → 12px → subtitle).
 *
 * For non-default variants this dispatches to the matching variant
 * implementation (each reproduces its original sibling exactly).
 */
export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (props, ref) => {
    switch (props.variant) {
      case 'large-title': {
        const { variant: _v, ...rest } = props;
        void _v;
        return <LargeTitleHeader {...rest} />;
      }
      case 'mobile-nav': {
        const { variant: _v, ...rest } = props;
        void _v;
        return <MobileNavHeader {...rest} />;
      }
      case 'plinth': {
        const { variant: _v, ...rest } = props;
        void _v;
        return <PlinthHeader {...rest} forwardedRef={ref as React.Ref<HTMLElement>} />;
      }
      case 'calendar': {
        const { variant: _v, ...rest } = props;
        void _v;
        return <CalendarHeader {...rest} />;
      }
      case 'round': {
        const { variant: _v, ...rest } = props;
        void _v;
        return <RoundHeader {...rest} />;
      }
      case 'support': {
        return <SupportHeader />;
      }
      case 'default':
      default: {
        const { variant: _v, ...rest } = props as DefaultHeaderProps;
        void _v;
        return (
          <DefaultHeader
            {...rest}
            forwardedRef={ref as React.Ref<HTMLDivElement>}
          />
        );
      }
    }
  },
);
PageHeader.displayName = 'PageHeader';
