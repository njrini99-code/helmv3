'use client';

// =============================================================================
// HubSubNav — the shared horizontal sub-tab strip for BaseballHelm grouped hubs.
//
// The grouped-hubs nav architecture (approved 2026-06-24) condenses the old flat
// 11–13 sidebar tabs into a handful of top-level HUBS (Team, Stats, Development,
// Management, Recruiting, Academics). Each hub is a route segment whose layout.tsx
// renders THIS strip above {children} — a row of real <Link> tabs over the hub's
// EXISTING leaf routes. The strip is purely ADDITIVE: every leaf route keeps its
// own page; the hub adds a navigation layer above them so the sidebar can stay
// lean while every surface remains one click away.
//
// Modeled on the proven CoachHelm sub-nav primitive (Fairway): real route <Link>s
// (NOT a Radix tablist of non-tab links — invalid ARIA), longest-prefix active
// resolution so nested leaves still light their parent tab, aria-current="page"
// on the active tab, roving tabindex + arrow-key movement, a visible focus ring,
// and the underline GLIDES between tabs on the kit's cinematic settle curve
// (`EASE_GLIDE`, not a bouncy spring — reduced-motion honored). Retokened onto
// "The Living Annual" kit (docs/baseball/design-system-living-annual.md §4.2):
// `--paper` surface, `--hairline` border, `--grade-plus` green ink for the
// active tab — because hub pages render on the cream Living Annual surface,
// not the old flat-cream Fairway gradient. The dark styling stays on the
// sidebar. Renders at EVERY breakpoint: the `overflow-x-auto` row IS the
// mobile treatment (a horizontal scroll strip), not a desktop-only bar.
//
// PURE PRESENTATION. No data, no Supabase, no server actions. Each hub's layout
// passes its own tab list + accessible label.
// =============================================================================

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadMaxFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { DUR, EASE_GLIDE } from '@/components/baseball/living-annual';
import type { BaseballNavIcon } from '@/lib/baseball/nav-registry';
import type { BaseballCapability } from '@/lib/baseball/capabilities';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';

/**
 * Content column width shared with the page beneath this strip (Command
 * Center, Roster, Pipeline, Watchlist, …) so the tab row lines up with the
 * page content instead of stretching edge-to-edge while the page column sits
 * centered. Kept a plain literal (not a cross-module import) to avoid a
 * shell↔hub-sub-nav import cycle — CommandCenterFairway.tsx's own wrapper
 * hand-rolls the identical `max-w-[1400px]`.
 */
const HUB_CONTENT_MAX_WIDTH = 'max-w-[1400px]';

/**
 * #481 mustFix: the global CSS var this strip publishes its own rendered
 * height to (declared with a `0px` default in globals.css `:root`) — see
 * `useSubNavOffsetPublisher` below for why this must be MEASURED rather than
 * a hardcoded constant, and MessagesFairway.tsx / ConversationClient.tsx /
 * messages/[id]/loading.tsx for the consuming side.
 */
const SUBNAV_OFFSET_VAR = '--baseball-hub-subnav-offset';

/**
 * Publishes this mounted strip's real rendered height to `SUBNAV_OFFSET_VAR`
 * on the document root, so ANY leaf pane elsewhere in the tree (not just a
 * DOM descendant — a plain CSS custom property, inherited by ancestry) can
 * subtract exactly the chrome this strip actually occupies above it, on
 * whichever route currently mounts it. A hardcoded `44px`/`45px` constant
 * would silently drift from reality the moment tab count, OS text-size
 * scaling, or font metrics changed the strip's real height — measuring via
 * `ResizeObserver` (the `useScrollFade` idiom this codebase already uses,
 * see use-scroll-fade.ts) keeps it correct instead.
 *
 * A callback ref (not a `useRef` + effect pair keyed off a dependency) so it
 * survives node swaps/route changes correctly: React invokes it with `null`
 * on every detach (unmount, or this hub's `key` changing in
 * BaseballFairwayShell's `subNav` memo when the active hub switches),
 * immediately zeroing the var so a route that mounts no sub-nav at all next
 * never inherits a stale value left over from this one.
 */
function useSubNavOffsetPublisher() {
  const cleanupRef = React.useRef<(() => void) | null>(null);
  return React.useCallback((node: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) {
      document.documentElement.style.setProperty(SUBNAV_OFFSET_VAR, '0px');
      return;
    }
    const publish = () => {
      document.documentElement.style.setProperty(SUBNAV_OFFSET_VAR, `${node.offsetHeight}px`);
    };
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    ro?.observe(node);
    // Re-measure once layout has settled (mirrors useScrollFade's raf tick —
    // the strip's own mount frame can land before font/tab layout finalizes).
    const raf = requestAnimationFrame(publish);
    cleanupRef.current = () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HubSubNavTab {
  /** Stable id (React key, active resolution, test anchor). */
  id: string;
  /** Human label rendered on the tab. */
  label: string;
  /** Canonical destination route (absolute, starts with /baseball). */
  href: string;
  /** Optional leading icon (the GolfHelm icon set). */
  icon?: BaseballNavIcon;
  /**
   * Extra route prefixes (besides `href`) that should light THIS tab. Used when a
   * tab owns nested leaf routes (e.g. /stats/games, /stats/season under Stats).
   * Longest-prefix wins across every tab so the deepest leaf still resolves to
   * its parent tab.
   */
  matchPrefixes?: readonly string[];
  /** Staff capability required to show this tab (coaches only). */
  requiredCapability?: BaseballCapability;
  /** Staff must hold at least one of these capabilities (#370 / #408). */
  requiredAnyCapabilities?: readonly BaseballCapability[];
  /**
   * When set, this tab is only visible when the active team's program_type is
   * in this list (#367 — showcase-only org surfaces). Copied verbatim from the
   * registry entry's `allowedProgramTypes` by hub-definitions.ts — never
   * re-declared, so it can never drift from the registry's gate.
   */
  allowedProgramTypes?: readonly BaseballProgramType[];
}

export interface HubSubNavProps {
  /** The tabs for this hub, in visual order. */
  tabs: readonly HubSubNavTab[];
  /** Accessible label for the nav landmark (e.g. "Team sections"). */
  ariaLabel: string;
  className?: string;
}

// -----------------------------------------------------------------------------
// Active-tab resolution — longest-prefix match across all tabs.
// -----------------------------------------------------------------------------

function resolveActiveTabId(
  pathname: string | null,
  tabs: readonly HubSubNavTab[],
): string | null {
  if (!pathname) return null;
  let best: { id: string; len: number } | null = null;
  for (const t of tabs) {
    const prefixes = [t.href, ...(t.matchPrefixes ?? [])];
    for (const p of prefixes) {
      if (
        (pathname === p || pathname.startsWith(`${p}/`)) &&
        (!best || p.length > best.len)
      ) {
        best = { id: t.id, len: p.length };
      }
    }
  }
  return best?.id ?? null;
}

// -----------------------------------------------------------------------------
// HubSubNav
// -----------------------------------------------------------------------------

export function HubSubNav({ tabs, ariaLabel, className }: HubSubNavProps) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const reactId = React.useId();
  const underlineLayoutId = `bb-hub-subnav-underline-${reactId}`;

  // Active tab: first tab as the safe default until the pathname resolves.
  const resolvedId = resolveActiveTabId(pathname, tabs) ?? tabs[0]?.id ?? null;

  // Roving tabindex: only the active tab is in the tab order; arrows move focus.
  const itemRefs = React.useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === resolvedId),
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      const count = tabs.length;
      if (count === 0) return;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = (activeIndex + 1) % count;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (activeIndex - 1 + count) % count;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      itemRefs.current[next]?.focus();
    },
    [activeIndex, tabs.length],
  );

  // #481 mustFix: publish this strip's real rendered height so a leaf pane
  // elsewhere (Messages) can subtract it from a fixed dvh-based box height.
  // Called unconditionally (hooks must run every render) — the `tabs.length
  // === 0` branch below removes the `<nav>` from the tree, so React invokes
  // this same ref callback with `null` on that render, correctly zeroing the
  // published offset without any extra effect.
  const subNavRef = useSubNavOffsetPublisher();

  // Defense-in-depth: resolveActiveHub already suppresses a hub whose
  // visible-tab list is < 2 (a single tab has nowhere to navigate to), but
  // guard here too for any other caller that might pass a 1-tab list.
  if (tabs.length < 2) return null;

  return (
    <LazyMotion features={loadMaxFeatures} strict>
      <nav
        ref={subNavRef}
        aria-label={ariaLabel}
        data-slot="hub-sub-nav"
        className={cn(
          // Sticky beneath the glass top bar, which is present at EVERY
          // breakpoint (not desktop-only) — a bare `top-0` here would collide
          // with it on mobile. `--golf-mobile-header-offset` (set on the
          // shared AppShell content column = topbar height + safe-area-inset)
          // is the same var the golf FairwayHubSubNav/ViewAsBanner siblings
          // key off of; `md:top-16` (passed by BaseballFairwayShell via
          // `className`) overrides it for the fixed-height desktop top bar.
          'sticky top-[var(--golf-mobile-header-offset)] z-20 w-full',
          'border-b border-[color:var(--hairline)] bg-[color:var(--paper)]',
          className,
        )}
      >
        <ul
          className={cn(
            'mx-auto flex items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            HUB_CONTENT_MAX_WIDTH,
          )}
        >
          {tabs.map((t, i) => {
            const isActive = t.id === resolvedId;
            const Icon = t.icon;
            return (
              // flex min-w-0 (not shrink-0): #905 — at 320/390px a hub capped
              // at ≤3 tabs (Ruling 2) can still exceed the viewport once icon
              // + padding + a longer label ("Postgame Review", "Operations")
              // are summed. `min-w-0` zeroes this flex item's shrink floor,
              // but that alone is HALF the mechanism: without `flex` the li
              // stays display:list-item, so the anchor inside is never a flex
              // item — it keeps its natural `whitespace-nowrap` width, the
              // label's `truncate` never gets width pressure, and the li
              // shrinking just lets the anchor overflow it (CI forensics:
              // strip scrollWidth 325 vs clientWidth 320 at a 320px viewport
              // with fonts loaded — earlier green runs measured before the
              // webfont swap and passed by a few px of fallback-font luck).
              // `flex` makes the li the anchor's flex container so the
              // anchor's own min-w-0 (below) lets the span truncate — tabs
              // shrink-to-fit first, falling back to the strip's horizontal
              // scroll only once even truncated tabs don't fit (mirrors the
              // FairwayBottomNav min-w-0 fix, #899).
              <li key={t.id} className="relative flex min-w-0">
                <Link
                  href={t.href}
                  ref={(node) => {
                    itemRefs.current[i] = node;
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={onKeyDown}
                  data-active={isActive ? '' : undefined}
                  className={cn(
                    // `m-0` (#927): globals.css's blanket `li a` "inline link
                    // touch target" rule (meant for prose body text) matches
                    // this `<a>` too — a plain anchor inside an `<li>` — and,
                    // with no margin utility here to out-specificity it,
                    // applied its `margin: -0.375rem -0.125rem` unchallenged:
                    // +4px width and a 2px left shift on every tab, on top of
                    // whatever this tab's own content needed. `m-0` (a class
                    // selector) beats the rule's `li a` (two type selectors)
                    // on specificity and neutralizes it; the global rule is
                    // now also scoped to exclude `nav`-shaped anchors (this
                    // strip is a `<nav>`) so this can't silently recur here.
                    // min-w-0: as a flex item of the (now flex) li this zeroes
                    // the min-width:auto content floor so the label span's
                    // truncate can engage — see the li comment above.
                    'group relative inline-flex min-w-0 select-none items-center gap-2 whitespace-nowrap m-0',
                    'rounded-t-lg px-3.5 pb-3 pt-3 text-sm font-medium min-h-[44px]',
                    'transition-colors duration-150 ease-out',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--paper)]',
                    isActive
                      ? 'text-grade-plus'
                      : 'text-text-tertiary hover:text-text-primary',
                  )}
                >
                  {Icon && (
                    <Icon
                      size={16}
                      aria-hidden="true"
                      className={cn(
                        'flex-shrink-0 transition-colors duration-150',
                        isActive
                          ? 'text-grade-plus'
                          : 'text-text-tertiary group-hover:text-text-secondary',
                      )}
                    />
                  )}
                  {/* min-w-0 + truncate: the tab's actual shrink mechanism —
                      the label is the flex item whose default min-content
                      floor (full nowrap text width) must be zeroed for the
                      `<li>`'s min-w-0 above to have anywhere to give the
                      space back to. Icon stays full-size (fixed 16px SVG,
                      never the thing that should disappear first). */}
                  <span className="relative min-w-0 truncate">{t.label}</span>

                  {/* The gliding active underline (layoutId; honors reduced-motion).
                      Kit cinematic settle curve — a glide, never a bouncy spring
                      (spec §4.4 "cinematic ease-out only"). */}
                  {isActive && (
                    <m.span
                      layoutId={reduceMotion ? undefined : underlineLayoutId}
                      aria-hidden="true"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-grade-plus"
                      transition={reduceMotion ? { duration: 0 } : { duration: DUR.rule, ease: EASE_GLIDE }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </LazyMotion>
  );
}
