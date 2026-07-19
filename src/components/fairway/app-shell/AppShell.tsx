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
 *   FairwaySidebar  → the rail (fixed on desktop; owns navigation there — no
 *                     mobile copy anymore, see M1 below)
 *   FairwayTopBar   → the ONE glass surface (breadcrumbs + ⌘K + actions)
 *   MoreNavSheet    → the ONE mobile overflow surface (see M1 below)
 *   RouteTransition → slow cinematic content reveal on navigation
 *
 * M1 (2026-07-10, docs/MOBILE_DOCTRINE.md Rule 6): the old slide-in mobile
 * DRAWER (a re-mounted `FairwaySidebar` behind a hand-rolled focus-trap +
 * Escape effect, opened by a top-bar hamburger) is RETIRED — vaul's `Sheet`
 * already provides focus-trap/Esc/scrim-click/focus-restore natively, and a
 * left drawer on a phone is the doctrine's banned pattern. The bridged
 * `mobileOpen`/`onMobileOpenChange` state this shell has always exposed now
 * drives `MoreNavSheet` instead — so any not-yet-migrated page that still
 * calls `setMobileOpen(true)` (via SidebarContext) opens the SAME sheet, not
 * a dead drawer.
 *
 * M1 (condensing-header, rules 2/7): the top bar + an optional `subNav` render
 * as ONE sticky chrome unit wrapped in `FairwayLargeTitleProvider` — at `<md`
 * the bar's center cross-fades in the page's condensed title once its
 * in-content large title (an adopted `<FairwayLargeTitle>`, or the breadcrumb
 * fallback) scrolls under it. The condense toggle lives entirely in that
 * provider's own state so a scroll-driven re-render never reaches this
 * component (see `LargeTitleContext.tsx`'s module doc).
 *
 * Layout / spacing (§A "light & airy"): page gutters 48–56px, the content column
 * sits on `bg-canvas` and is the brightest, warmest thing; the rail recedes.
 *
 * Scope: renders inside `.fairway-ds` on a `bg-canvas` page (the Fairway tokens
 * resolve here). Pages gate mounting on the redesign flag; the shell itself is
 * presentation-only and owns no data.
 * ========================================================================== */

import { forwardRef, useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { FAIRWAY_SCOPE } from '@/lib/redesign/flag';
import { useMediaQuery } from '@/hooks/use-media-query';
import { FairwaySidebar, type FairwaySidebarProps } from './FairwaySidebar';
import { FairwayTopBar, type FairwayTopBarProps } from './FairwayTopBar';
import { FairwayLargeTitleProvider, FairwayHeaderSentinel, FairwayContentAnchor } from './LargeTitleContext';
import { MoreNavSheet } from './MoreNavSheet';
import { RouteTransition } from './RouteTransition';
import type { Breadcrumb, NavSection, ShellLinkComponent, ShellUser } from './types';

/** Stable empty array — `bottomNavHrefs` defaults to this rather than a fresh
 *  `[]` literal every render (AppShell re-renders on every pathname change). */
const EMPTY_HREFS: readonly string[] = [];

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
   * M1 (condensing-header): a hub sub-tab strip rendered as part of the ONE
   * sticky chrome unit — immediately below the top bar, above the header
   * sentinel/`{children}`. Presence sets `flush` on the top bar (drops its
   * own bottom hairline at `<md` so bar+strip read as one surface) and adds
   * the strip's height to the condense observer's shrunk root. Memoize at
   * the call site exactly like `sidebarFooter`/`brand` (Decision 7).
   */
  subNav?: React.ReactNode;
  /**
   * M1 (condensing-header): the page's title, used ONLY as the top bar's
   * condensed-copy fallback on routes that haven't adopted
   * `<FairwayLargeTitle>` yet — `pageTitle ?? breadcrumbs.at(-1)?.label`.
   * A mounted `<FairwayLargeTitle>` always wins over this (see
   * `LargeTitleContext`'s `registeredTitle`). A plain string — never an
   * object/array — so it can't defeat any memoization downstream.
   */
  pageTitle?: string;
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
   * Controlled More-sheet open state. When omitted, the shell manages it
   * internally (mirrors the `collapsed` controlled/uncontrolled pattern above).
   * Pass these to bridge the sheet to an external nav context so OTHER triggers
   * (e.g. a not-yet-migrated page's own menu button) open the SAME sheet.
   */
  mobileOpen?: boolean;
  onMobileOpenChange?: (next: boolean) => void;

  /**
   * P413: a persistent mobile bottom-tab bar (rendered `md:hidden`). Additive —
   * when omitted the shell renders no mobile nav at all (no bar, no More
   * sheet trigger). The shell adds bottom content padding on mobile when
   * this is present so the bar never overlaps page content.
   */
  bottomNav?: React.ReactNode;

  /**
   * M1 (bridge-chrome): rendered inside `MoreNavSheet`'s `header` slot, above
   * the identity row — additive room for a per-product banner (Bridge mounts
   * its prod pill + "updated Xs ago" + a full-width Refresh button here).
   * Omitted (golf/baseball) is a no-op. Memoize at the call site exactly like
   * `sidebarFooter`/`moreSheetFooter`.
   */
  moreSheetHeader?: React.ReactNode;
  /**
   * M1: rendered inside `MoreNavSheet`'s pinned footer (Settings + Sign out —
   * product-specific side effects, so this is product-owned). Memoize at the
   * call site exactly like `sidebarFooter`.
   */
  moreSheetFooter?: React.ReactNode;
  /**
   * M1: the bottom bar's own hrefs — excluded from `MoreNavSheet`'s computed
   * overflow (`selectOverflow(sections, bottomNavHrefs)`) so a daily-loop
   * destination never ALSO shows up in the sheet. Memoize at the call site.
   */
  bottomNavHrefs?: readonly string[];
  /** M1: the More sheet's identity-row destination. */
  settingsHref?: string;
  /**
   * Verifier fix: forwarded verbatim to `MoreNavSheet`'s `sheetClassName` —
   * a scope class (e.g. BaseballHelm's `.living-annual`) applied directly to
   * the sheet's own portaled DOM node so its `--fw-color-*` re-points hold
   * even though vaul renders `Drawer.Content` into `document.body`, outside
   * this shell's React subtree. Omit on golf (never scoped).
   */
  sheetClassName?: string;

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
    subNav,
    pageTitle,
    accentColor,
    pathname,
    linkComponent,
    collapsed: collapsedProp,
    onCollapsedChange,
    collapsible = true,
    mobileOpen: mobileOpenProp,
    onMobileOpenChange,
    bottomNav,
    moreSheetHeader,
    moreSheetFooter,
    bottomNavHrefs,
    settingsHref,
    sheetClassName,
    children,
    disableRouteTransition = false,
    constrainContent = true,
    contentPadding = true,
    className,
  },
  ref,
) {
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

  // Close the mobile sheet on route change (vaul owns Esc/scrim-close/focus-
  // trap/focus-restore for the sheet itself while OPEN — this effect only
  // handles the "navigated to a new route" case).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Stable identity across pathname-only re-renders (perf packet
  // [shell-render-hygiene]) — paired with FairwaySidebar's React.memo below,
  // this keeps the desktop rail from re-rendering when a parent re-render
  // didn't actually change any of these inputs.
  const sidebarProps: Omit<FairwaySidebarProps, 'isMobile' | 'onNavigate' | 'collapsed' | 'onToggleCollapsed'> =
    useMemo(
      () => ({
        sections,
        user,
        brand,
        footer: sidebarFooter,
        identityExtra: sidebarIdentityExtra,
        pathname,
        linkComponent,
      }),
      [sections, user, brand, sidebarFooter, sidebarIdentityExtra, pathname, linkComponent],
    );

  // Gate the desktop rail's MOUNT (not just its CSS visibility) behind an
  // actual matchMedia check — perf packet [shell-render-hygiene] / scout
  // render-paint finding 2. Previously `<div className="hidden md:block">`
  // kept a second full FairwaySidebar tree alive at all times, CSS-hidden on
  // mobile; every nav-affecting re-render (badge ticks, route changes)
  // reconciled BOTH the desktop rail and the mobile drawer's copy even though
  // a phone can only ever show one. `useMediaQuery` is SSR-safe (server
  // snapshot = false, mobile-first) so the very first client render matches
  // the SSR markup exactly (neither renders the rail) — no hydration
  // mismatch — then corrects synchronously before paint on an actual desktop
  // viewport via useSyncExternalStore's snapshot check.
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const topBarProps: FairwayTopBarProps = {
    breadcrumbs,
    onSearchOpen,
    searchPlaceholder,
    searchSlot,
    actions: topBarActions,
    accentColor,
    linkComponent,
    // M1: the condensed-title FALLBACK (a mounted `<FairwayLargeTitle>`
    // always overrides this internally via context — see FairwayTopBar's own
    // doc comment). A plain string derived from props that only change on
    // navigation, so this stays stable across scroll.
    condensedTitle: pageTitle ?? breadcrumbs?.at(-1)?.label,
    flush: !!subNav,
  };

  // Desktop content column offset by the (collapsed) rail width.
  const railOffset = collapsed ? 'md:pl-[76px]' : 'md:pl-[260px]';

  return (
    <div
      ref={ref}
      // #18/#196: `MoreNavSheet` (vaul, `modal`) already marks this whole
      // subtree `aria-hidden` while open — Radix's built-in `hideOthers` does
      // that automatically — but `aria-hidden` alone only removes a subtree
      // from the ACCESSIBILITY tree; it does neither block Tab from focusing
      // an element inside it nor stop it from being hit-tested by a pointer
      // that lands outside the sheet's own scrim/content (e.g. a `position:
      // fixed` element with its own stacking context). `inert` (native,
      // supported since React 19 as a real DOM prop) additionally removes the
      // subtree from the tab order AND from hit-testing — the SAME guarantee
      // the (Radix-Dialog-based) Create Task Dialog already gets for free.
      // `MoreNavSheet`'s own rendered content lives in vaul's own body-level
      // portal, entirely OUTSIDE this div, so making this wrapper inert never
      // reaches into the sheet itself.
      inert={mobileOpen || undefined}
      className={cn(
        FAIRWAY_SCOPE,
        'relative min-h-dvh w-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary antialiased',
        className,
      )}
    >
      {/* ── Desktop rail (fixed) ──
          Mount gated on `isDesktop` (matchMedia) — see the doc comment above.
          The `hidden md:block` wrapper is kept as defense-in-depth (harmless
          if isDesktop and the CSS breakpoint ever briefly disagree) but the
          real cost-avoidance is not mounting the FairwaySidebar tree at all
          on phone-width viewports. */}
      {isDesktop && (
        <div className="hidden md:block">
          <FairwaySidebar
            {...sidebarProps}
            collapsed={collapsed}
            onToggleCollapsed={collapsible ? toggleCollapsed : undefined}
          />
        </div>
      )}

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
        {/* M1: the ONE condensing chrome unit — top bar, then an optional
            hub sub-nav strip immediately below it (both sticky; together
            they occlude the observer's shrunk root, see `hasSubNav` below),
            then the header sentinel, then the actual content. `enabled`
            mirrors the desktop-rail mount gate above so the observer never
            runs at md+ (the desktop masthead/breadcrumb never condenses).
            DEFECT FIX: `FairwayContentAnchor` (inside RouteTransition, not
            around it) registers the page's real first element as the
            observer's target — see LargeTitleContext.tsx's module doc —
            so condense fires once the true title has scrolled under the
            bar, not after ~1px because the static sentinel's resting
            position happened to cancel out the rootMargin shrink. */}
        <FairwayLargeTitleProvider enabled={!isDesktop} hasSubNav={!!subNav}>
          <FairwayTopBar {...topBarProps} />
          {subNav}
          <FairwayHeaderSentinel />

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
                <FairwayContentAnchor>{children}</FairwayContentAnchor>
              ) : (
                <RouteTransition routeKey={pathname}>
                  <FairwayContentAnchor>{children}</FairwayContentAnchor>
                </RouteTransition>
              )}
            </div>
          </main>
        </FairwayLargeTitleProvider>
      </div>

      {/* P413: persistent mobile bottom-tab bar (md:hidden, viewport-fixed). */}
      {bottomNav}

      {/* M1: the ONE mobile overflow surface — mount-gated on `!isDesktop`
          exactly like the bottom bar, so rotating across the `md` boundary
          with the sheet open closes it cleanly (unmount) rather than leaving
          an orphaned dialog. `mobileOpen`/`setMobileOpen` is the SAME bridged
          state a not-yet-migrated page's own menu button already toggles. */}
      {!isDesktop && (
        <MoreNavSheet
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sections={sections}
          excludeHrefs={bottomNavHrefs ?? EMPTY_HREFS}
          user={user}
          header={moreSheetHeader}
          footer={moreSheetFooter}
          settingsHref={settingsHref}
          pathname={pathname}
          linkComponent={linkComponent}
          sheetClassName={sheetClassName}
        />
      )}
    </div>
  );
});
