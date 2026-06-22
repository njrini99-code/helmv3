'use client';

/**
 * ============================================================================
 * Fairway · AppShell (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The app frame (DESIGN-SYSTEM §6 "AppShell"): the warm-black recessive sidebar
 * + a cream-side glass top bar (content scrolls UNDER it) + a content region
 * with generous gutters, a breadcrumbs slot, a persistent search/command entry,
 * and a route-transition wrapper. The structural backbone reorganized pages
 * mount their content into.
 *
 * Composition (all from this group's own files):
 *   FairwaySidebar  → the rail (fixed on desktop; a slide-in glass drawer on mobile)
 *   FairwayTopBar   → the ONE glass surface (breadcrumbs + ⌘K + actions)
 *   RouteTransition → slow cinematic content reveal on navigation
 *
 * Layout / spacing (§A "light & airy"): page gutters 48–56px, the content column
 * sits on `bg-canvas` and is the brightest, warmest thing; the rail recedes.
 *
 * Scope: renders inside `.fairway-ds` on a `bg-canvas` page (the Fairway tokens
 * resolve here). Pages gate mounting on the redesign flag; the shell itself is
 * presentation-only and owns no data.
 * ========================================================================== */

import { forwardRef, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FAIRWAY_SCOPE } from '@/lib/redesign/flag';
import { IconX } from '@/components/icons';
import { FairwaySidebar, type FairwaySidebarProps } from './FairwaySidebar';
import { FairwayTopBar, type FairwayTopBarProps } from './FairwayTopBar';
import { RouteTransition } from './RouteTransition';
import type { Breadcrumb, NavSection, ShellLinkComponent, ShellUser } from './types';

export interface AppShellProps {
  /** Grouped nav for the rail (primary + secondary + …). */
  sections: readonly NavSection[];
  /** Identity block at the top of the rail. */
  user?: ShellUser;
  /** Brand wordmark slot for the rail. */
  brand?: React.ReactNode;
  /** Pinned rail footer (settings / sign-out). */
  sidebarFooter?: React.ReactNode;
  /**
   * Extra content rendered inside the sidebar identity block, below the
   * user name and team label. Used for the team-switcher (multi-team coaches).
   * Hidden when the rail is collapsed.
   */
  sidebarIdentityExtra?: React.ReactNode;

  /** Breadcrumb trail for the top bar. */
  breadcrumbs?: readonly Breadcrumb[];
  /** Opens the command menu (⌘K). Renders the persistent command entry. */
  onSearchOpen?: () => void;
  /** Placeholder for the command entry. */
  searchPlaceholder?: string;
  /** Replace the built-in command entry. */
  searchSlot?: React.ReactNode;
  /** Top-bar right action cluster. */
  topBarActions?: React.ReactNode;
  /**
   * Optional accent (any CSS color / `var(...)`) for an app that themes its top
   * chrome — renders a faint top wash behind the content column plus a 2px
   * underline under the glass top bar, both cross-fading when it changes. Omit
   * (the default) leaves the shell unthemed. Used by GolfHelm's men's/women's
   * active-team toggle.
   */
  accentColor?: string;

  /** Current pathname — drives nav active-state AND the route reveal key. */
  pathname?: string;
  /** Link element (pass Next's `<Link>` in the app; defaults to `<a>`). */
  linkComponent?: ShellLinkComponent;

  /** Controlled collapse. When omitted, the shell manages it internally. */
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  /** Hide the collapse affordance entirely. */
  collapsible?: boolean;

  /**
   * Controlled mobile-drawer open state. When omitted, the shell manages it
   * internally (mirrors the `collapsed` controlled/uncontrolled pattern above).
   * Pass these to bridge the drawer to an external nav context so OTHER triggers
   * (e.g. a not-yet-migrated page's own menu button) open the SAME drawer.
   */
  mobileOpen?: boolean;
  onMobileOpenChange?: (next: boolean) => void;

  /**
   * P413: a persistent mobile bottom-tab bar (rendered `md:hidden`). Additive —
   * when omitted the shell behaves exactly as before (hamburger drawer only).
   * The shell adds bottom content padding on mobile when this is present so the
   * bar never overlaps page content.
   */
  bottomNav?: React.ReactNode;

  /** The page content. */
  children: React.ReactNode;
  /** Disable the route-transition reveal (e.g. if a page owns its own motion). */
  disableRouteTransition?: boolean;
  /** Width-cap + center the content column. Default true (premium reading width). */
  constrainContent?: boolean;
  /**
   * Apply the content wrapper's own horizontal + top gutters and max-width.
   * Default true (the shell owns the page frame, e.g. fairway-preview). Pass
   * `false` when the PAGES own their gutters + titles (the legacy `<main>` had
   * no content padding); the bottom pad — which clears the iOS home indicator —
   * is KEPT regardless so home-indicator clearance never regresses.
   */
  contentPadding?: boolean;
  className?: string;
}

const DEFAULT_PLACEHOLDER = 'Search or jump to…';

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  {
    sections,
    user,
    brand,
    sidebarFooter,
    sidebarIdentityExtra,
    breadcrumbs,
    onSearchOpen,
    searchPlaceholder = DEFAULT_PLACEHOLDER,
    searchSlot,
    topBarActions,
    accentColor,
    pathname,
    linkComponent,
    collapsed: collapsedProp,
    onCollapsedChange,
    collapsible = true,
    mobileOpen: mobileOpenProp,
    onMobileOpenChange,
    bottomNav,
    children,
    disableRouteTransition = false,
    constrainContent = true,
    contentPadding = true,
    className,
  },
  ref,
) {
  const reduceMotion = useReducedMotion();

  // Uncontrolled collapse — seed from localStorage on first render so the
  // user's choice survives page navigation. SSR-safe: localStorage access
  // only runs in the effect (client side).
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fairway-sidebar-collapsed');
      if (stored === 'true') setInternalCollapsed(true);
    } catch {
      /* storage may be unavailable (private browsing, quota, etc.) */
    }
  }, []);

  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : internalCollapsed;

  const isMobileControlled = mobileOpenProp !== undefined;
  const mobileOpen = isMobileControlled ? mobileOpenProp : internalMobileOpen;

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    if (!isControlled) {
      setInternalCollapsed(next);
      try {
        localStorage.setItem('fairway-sidebar-collapsed', String(next));
      } catch {
        /* ignore storage errors */
      }
    }
    onCollapsedChange?.(next);
  }, [collapsed, isControlled, onCollapsedChange]);

  const setMobileOpen = useCallback((next: boolean) => {
    if (!isMobileControlled) setInternalMobileOpen(next);
    onMobileOpenChange?.(next);
  }, [isMobileControlled, onMobileOpenChange]);

  const closeMobile = useCallback(() => setMobileOpen(false), [setMobileOpen]);
  const openMobile = useCallback(() => setMobileOpen(true), [setMobileOpen]);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, setMobileOpen]);

  // Focus management for the mobile drawer (a11y): store the trigger, move focus
  // into the drawer, trap Tab/Shift+Tab within it, restore focus on close.
  // (Ported from the legacy GolfDashboardShell. Body-scroll-lock is handled by
  // SidebarProvider via the bridged mobileOpen — NOT duplicated here.)
  useEffect(() => {
    if (!mobileOpen || !drawerRef.current) return;

    // Remember whatever had focus before the drawer opened.
    triggerRef.current = document.activeElement;

    const drawer = drawerRef.current;
    const focusable = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    if (first) first.focus();

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      // Restore focus to the trigger when the drawer closes.
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [mobileOpen]);

  const sidebarProps: Omit<FairwaySidebarProps, 'isMobile' | 'onNavigate' | 'collapsed' | 'onToggleCollapsed'> = {
    sections,
    user,
    brand,
    footer: sidebarFooter,
    identityExtra: sidebarIdentityExtra,
    pathname,
    linkComponent,
  };

  const topBarProps: FairwayTopBarProps = {
    breadcrumbs,
    onSearchOpen,
    searchPlaceholder,
    searchSlot,
    actions: topBarActions,
    accentColor,
    onMenuOpen: openMobile,
    linkComponent,
  };

  // Desktop content column offset by the (collapsed) rail width.
  const railOffset = collapsed ? 'md:pl-[76px]' : 'md:pl-[260px]';

  return (
    <div
      ref={ref}
      className={cn(
        FAIRWAY_SCOPE,
        'relative min-h-dvh w-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary antialiased',
        className,
      )}
    >
      {/* ── Desktop rail (fixed) ── */}
      <div className="hidden md:block">
        <FairwaySidebar
          {...sidebarProps}
          collapsed={collapsed}
          onToggleCollapsed={collapsible ? toggleCollapsed : undefined}
        />
      </div>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div id="mobile-sidebar" className="fixed inset-0 z-[var(--fw-z-modal)] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            {/* Dim scrim (cheap, not blurred — §4.3) */}
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={closeMobile}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.18 : 0.28 }}
              className="absolute inset-0 bg-[rgb(28_25_23_/_0.28)]"
            />
            <motion.div
              ref={drawerRef}
              initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              transition={{ duration: reduceMotion ? 0.18 : 0.52, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-0 top-0 h-full w-[280px] max-w-[85vw] overflow-hidden rounded-r-[22px] shadow-fw-modal"
            >
              <FairwaySidebar {...sidebarProps} isMobile onNavigate={closeMobile} />
              {/* In-drawer close affordance */}
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Close navigation"
                className={cn(
                  'on-dark absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-fw-md',
                  'text-nav-text-dim transition-colors [transition-duration:var(--fw-dur-fast)]',
                  'hover:bg-nav-surface hover:text-nav-text active:translate-y-[0.5px]',
                )}
              >
                <IconX size={18} aria-hidden />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Content column (offset by the rail) ── */}
      <div
        className={cn('relative flex min-h-dvh flex-col transition-[padding] [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none', railOffset)}
        // In-page sticky sub-headers offset below the glass top bar (4rem tall
        // + the notch inset). The immersive branch sets this var elsewhere.
        style={{ '--golf-mobile-header-offset': 'calc(4rem + env(safe-area-inset-top, 0px))' } as React.CSSProperties}
      >
        {/* Faint accent wash: a low-alpha team tint bleeding down from the top,
            masked into transparency so it dissolves into the warm cream. Sits
            BEHIND the (translucent glass) top bar + content (z-[-1]); its
            background-color cross-fades when the active team changes. */}
        {accentColor && (
          <div
            aria-hidden
            data-testid="fw-accent-wash"
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-[-1] h-[220px]',
              '[mask-image:linear-gradient(180deg,#000_0%,transparent_100%)] [-webkit-mask-image:linear-gradient(180deg,#000_0%,transparent_100%)]',
              'transition-[background-color] [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none',
            )}
            style={{ backgroundColor: `color-mix(in oklch, ${accentColor} 12%, transparent)` }}
          />
        )}
        <FairwayTopBar {...topBarProps} />

        <main className="flex-1">
          <div
            className={cn(
              // The bottom pad clears the iOS home indicator (env() is 0 on
              // non-notched/desktop, so this is a no-op there) — KEPT in both
              // modes so home-indicator clearance never regresses.
              'pb-[calc(2rem+env(safe-area-inset-bottom,0px))]',
              // P413: when the mobile bottom-tab bar is mounted, add its height
              // (~56px) to the mobile bottom pad so it never overlaps content.
              // Desktop (md+) is unaffected — the bar is md:hidden.
              bottomNav && 'pb-[calc(2rem+56px+env(safe-area-inset-bottom,0px))] md:pb-[calc(2rem+env(safe-area-inset-bottom,0px))]',
              // Generous gutters (§A: 48–56px page gutters) + premium reading
              // width — applied only when the shell owns the page frame. When
              // `contentPadding` is false, PAGES own their gutters + titles
              // (matching the legacy <main> which had no content padding).
              contentPadding && 'px-6 pt-8 sm:px-8 lg:px-12 lg:pt-10',
              contentPadding && constrainContent && 'mx-auto w-full max-w-[1280px]',
            )}
          >
            {disableRouteTransition ? (
              children
            ) : (
              <RouteTransition routeKey={pathname}>{children}</RouteTransition>
            )}
          </div>
        </main>
      </div>

      {/* P413: persistent mobile bottom-tab bar (md:hidden, viewport-fixed). */}
      {bottomNav}
    </div>
  );
});
