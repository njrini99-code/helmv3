'use client';

/**
 * ============================================================================
 * Fairway · AppShell · FairwayBottomNav (ADDITIVE)  — P413
 * ----------------------------------------------------------------------------
 * A persistent mobile bottom-tab bar for the role's 4 daily-loop destinations
 * (docs/MOBILE_DOCTRINE.md Rule 10). On mobile (the primary surface for a
 * player logging rounds in the field) the ONLY navigation used to be the
 * hamburger → slide-in drawer → tap round-trip; this gives one-tap access to
 * the core destinations (Nielsen #7: flexibility & efficiency), keeping the
 * More sheet (`MoreNavSheet`) for the long tail.
 *
 * Mobile-only (`md:hidden`) — desktop keeps the recessive rail. Fixed to the
 * bottom of the viewport with a `safe-area-inset-bottom` pad so it clears the
 * iOS home indicator. Sits at `--fw-z-nav` (below the sheet/modal/toast so the
 * More sheet's scrim and any overlay always cover it).
 *
 * Active-state mirrors FairwaySidebar's `matchActive` (segment-boundary) and
 * honors a per-item `activeMatch` predicate for cluster rows (e.g. CoachHelm).
 * Each tab is a >=44px touch target (full-height column) with a visible 2px
 * focus ring (WCAG 2.2 AA) and an honest numeric badge (rendered only when > 0).
 *
 * M1 (2026-07-10, docs/MOBILE_DOCTRINE.md Rule 6/10): a 5th column — a
 * `<Button>`, never a `<Link>` — renders when `onMoreOpen` is passed. It
 * opens `MoreNavSheet`, the ONE overflow surface (the retired hamburger →
 * left-drawer round-trip). `moreActive` lights it exactly like a destination
 * tab when the CURRENT ROUTE is one of the sheet's overflow items;
 * `moreBadge` is the aggregate of every hidden destination's unread count
 * (`more-nav.ts`'s `summarizeMoreTab`) so a badge is never silently lost by
 * being off the bar.
 * ========================================================================== */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { IconLayoutGrid } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { FairwayIcon, NavItem, ShellLinkComponent } from './types';

/** Segment-boundary active match (mirrors FairwaySidebar's `matchActive`). */
function matchActive(href: string, pathname?: string): boolean {
  if (!pathname) return false;
  const segments = href.split('/').filter(Boolean);
  if (segments.length <= 2) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export interface FairwayBottomNavProps {
  /** The role's 4 daily-loop destinations (docs/MOBILE_DOCTRINE.md Rule 10). */
  items: readonly NavItem[];
  /** Current pathname — drives active-state. */
  pathname?: string;
  /** Link element (Next's `<Link>` in the app; `<a>` in isolation/tests). */
  linkComponent?: ShellLinkComponent;
  className?: string;
  /** Opens the More sheet. Presence renders the 5th column as a `<button>`
   *  (never a `<Link>` — it isn't a destination, it's an affordance). */
  onMoreOpen?: () => void;
  /** Lights the More column when the current route is an overflow
   *  destination (`more-nav.ts`'s `summarizeMoreTab`). */
  moreActive?: boolean;
  /** Aggregate badge across every hidden overflow destination. */
  moreBadge?: number;
  /** More column label. Default "More". */
  moreLabel?: string;
  /** More column icon. Default `IconLayoutGrid`. */
  moreIcon?: FairwayIcon;
  /** Whether the More sheet is CURRENTLY open — drives `aria-expanded` on the
   *  button. Distinct from `moreActive` (which reflects the current ROUTE,
   *  independent of whether the sheet happens to be open). Optional; the
   *  caller already holds this as the same bridged `mobileOpen` state it
   *  passes to `AppShell`. */
  moreOpen?: boolean;
}

const DefaultLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

// React.memo (perf packet [shell-render-hygiene]): mounted permanently on
// every mobile route; AppShell re-renders on every pathname change, so memo
// skips re-rendering the whole tab list when `items`/`pathname` are unchanged.
export const FairwayBottomNav = memo(function FairwayBottomNav({
  items,
  pathname,
  linkComponent,
  className,
  onMoreOpen,
  moreActive,
  moreBadge,
  moreLabel = 'More',
  moreIcon,
  moreOpen,
}: FairwayBottomNavProps) {
  const Link = linkComponent ?? DefaultLink;
  const MoreIcon = moreIcon ?? IconLayoutGrid;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Mobile-only; the desktop rail owns navigation on >=md.
        'fixed inset-x-0 bottom-0 z-[var(--fw-z-nav)] md:hidden',
        // FULLY opaque matte chrome on the canvas (fab-vs-nav fix, 2026-07-10):
        // was `bg-surface/95` — a `/95` alpha modifier is NOT opaque, it's 95%,
        // and Tailwind resolves that via `color-mix()` against whatever sits
        // behind this `fixed` bar. On routes with a saturated instrument chart
        // in the last scroll position under the bar (e.g. the Ribbon area
        // chart on CoachHelm Brief), the 5% show-through read as the bar being
        // "transparent" — the exact bug this fixes. `--fw-color-surface`'s own
        // header comment already declares surfaces "OPAQUE at rest — not
        // translucent" (design-tokens.css), and the sibling FairwayHubSubNav
        // and FairwayTopBar (<md) chrome already made this same opaque-at-rest
        // call for the identical reason (see FairwayHubSubNav.tsx's own
        // comment) — this bar was the one sibling that hadn't been fixed yet.
        // A hairline top border separates it from the scrolling content. No
        // backdrop-blur (cheap chrome) — a `fixed` bar this size sits over
        // moving content on every scroll frame, so it stays a flat,
        // cheap-to-composite matte.
        'border-t border-border-subtle bg-surface',
        // Clear the iOS home indicator.
        'pb-[env(safe-area-inset-bottom,0px)]',
        className,
      )}
    >
      {/* #905: no `justify-around`. Every column below is `flex: 1 1 0%`
          (min-w-0 `flex-1`), so flex-grow already consumes 100% of the row's
          width — `justify-content` only matters when there's leftover OR
          negative free space, and with 5 honest `flex-1` columns dividing
          an exact 320/390/430px row there never legitimately is any.
          CORRECTION (#927): the first pass here theorized `justify-around`
          (space-around) was falling back to `center` on overflow and
          shifting the row's start negative — plausible-sounding, but
          removing it left the measured "Home" [left -2, right 66] geometry
          byte-for-byte unchanged in CI, which means it was never the actual
          mechanism. The real cause was a global `li a` CSS rule (see
          globals.css's "Inline link touch targets" block) unconditionally
          margining every `<a>`-in-`<li>` app-wide, including these tabs —
          see the `m-0` comment on each `<Link>` below for the full
          writeup. Left here (harmless, and arguably the more predictable
          default) rather than reverted, now that it's known NOT to be the
          fix. */}
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active =
            item.active ??
            (item.activeMatch && pathname
              ? item.activeMatch(pathname)
              : matchActive(item.href, pathname));
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={cn(
                  // Full-height column ≥44px tall touch target. `min-w-0`
                  // overrides the flex item's default `min-width: auto` floor
                  // (the browser default lets a flex item refuse to shrink
                  // below its unbreakable content's natural width even with
                  // `flex: 1 1 0%` on the parent `<li>`) — without it, a long
                  // label (e.g. "Development", "Messages", or a mode's
                  // exposureNoun) can force this column past its 1/5 share of
                  // a 320/390px bar, overflowing the row by a few px.
                  //
                  // `m-0` (#927 real fix): globals.css's `li a` "inline link
                  // touch target" rule (meant for prose body text) matches
                  // this `<a>` too — it's a plain anchor inside an `<li>` —
                  // and applies `margin: -0.375rem -0.125rem` with NO
                  // Tailwind margin class here to out-specificity it (no
                  // rule = no contest to win). That silently added 4px width
                  // and shifted every tab 2px left of its true flex-computed
                  // position; on the FIRST column that pushed the box past
                  // the viewport's left edge — the exact "Home" [left -2,
                  // right 66] failure, and why the earlier justify-around /
                  // min-w-0 pass here (which never touched margin) left the
                  // measured geometry byte-for-byte unchanged. `m-0` beats
                  // `li a` on specificity (class > two type selectors) and
                  // neutralizes the leak at the component level; the global
                  // rule itself is now also scoped to exclude nav/tablist/
                  // toolbar anchors so this class of bug can't recur here.
                  'group relative flex min-h-[56px] min-w-0 m-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5',
                  'outline-none transition-colors [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
                  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
                  active ? 'text-accent-700' : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                <span className="relative inline-flex">
                  <Icon
                    size={22}
                    aria-hidden
                    className={cn('flex-shrink-0', active ? 'text-accent-700' : 'text-text-tertiary')}
                  />
                  {/* Honest numeric badge — only when count > 0. */}
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={cn(
                        'absolute -right-2 -top-1.5 min-w-[16px] rounded-full px-1 text-center',
                        'bg-accent-600 font-fw-mono text-eyebrow font-semibold leading-4 tabular-nums text-text-on-accent',
                      )}
                    >
                      {/* Same cap as the rail (FairwaySidebar). They disagreed —
                          10 unread read as "10" in the rail and "9+" here, for
                          the same count (audit 2026-07-24, M2). */}
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'max-w-full truncate font-fw-sans text-eyebrow normal-case tracking-normal',
                    active ? 'font-semibold' : 'font-normal',
                  )}
                >
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            </li>
          );
        })}
        {onMoreOpen && (
          <li className="min-w-0 flex-1">
            <Button
              type="button"
              variant="ghost"
              haptic="light"
              aria-haspopup="dialog"
              aria-expanded={moreOpen ?? false}
              aria-label={moreLabel}
              onClick={onMoreOpen}
              className={cn(
                // Full-height column ≥44px tall touch target — identical
                // rhythm to a tab column above (it isn't a destination, but
                // it must feel like one). `rounded-none` + zeroed padding
                // cancel <Button>'s own defaults so the column stays flush
                // with its 4 <Link> siblings (no corner radius, no min-height
                // floor fighting the shared 56px column height).
                'group relative flex min-h-[56px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-none px-1 py-1.5',
                'outline-none transition-colors [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
                'active:translate-y-[0.5px]',
                'bg-transparent hover:bg-transparent',
                moreActive ? 'text-accent-700' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              <span className="relative inline-flex">
                <MoreIcon
                  size={22}
                  aria-hidden
                  className={cn('flex-shrink-0', moreActive ? 'text-accent-700' : 'text-text-tertiary')}
                />
                {/* Aggregate overflow badge — only when the sum > 0. */}
                {moreBadge && moreBadge > 0 ? (
                  <span
                    className={cn(
                      'absolute -right-2 -top-1.5 min-w-[16px] rounded-full px-1 text-center',
                      'bg-accent-600 font-fw-mono text-eyebrow font-semibold leading-4 tabular-nums text-text-on-accent',
                    )}
                  >
                    {moreBadge > 9 ? '9+' : moreBadge}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'max-w-full truncate font-fw-sans text-eyebrow normal-case tracking-normal',
                  moreActive ? 'font-semibold' : 'font-normal',
                )}
              >
                {moreLabel}
              </span>
            </Button>
          </li>
        )}
      </ul>
    </nav>
  );
});
