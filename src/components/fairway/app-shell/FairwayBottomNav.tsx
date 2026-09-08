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

import { memo, useId } from 'react';
import { LayoutGroup, m } from 'framer-motion';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { NavPendingDot } from './NavPending';
import { IconLayoutGrid } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { fwHaptic } from '@/lib/fairway/haptics';
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
  const layoutId = useId();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const moreSelected = Boolean(moreOpen || moreActive);
  const spring = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.8 };
  const pill = (active: boolean) => active && (
    <m.span aria-hidden data-slot="nav-active-pill" layoutId={`${layoutId}-selection`}
      className="pointer-events-none absolute inset-0 rounded-full fw-nav-selection border shadow-soft"
      transition={spring} />
  );
  const badge = (count: number | undefined, cap = 99) => Boolean(count && count > 0) && (
    <span className="absolute -right-2 -top-1.5 min-w-[16px] rounded-full bg-accent-600 px-1 text-center font-fw-mono text-eyebrow font-semibold leading-4 tabular-nums text-text-on-accent">
      {count! > cap ? `${cap}+` : count}
    </span>
  );
  const control = 'group relative m-0 flex h-12 min-h-[44px] w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus';

  return (
    <nav data-slot="fw-bottom-nav" aria-label="Primary"
      className={cn('pointer-events-none fixed inset-x-0 bottom-0 z-[var(--fw-z-nav)] px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom,0px))] md:hidden', className)}>
      <LayoutGroup id={layoutId}>
        <ul className="pointer-events-auto relative flex h-14 items-stretch gap-0.5 rounded-full fw-glass-chrome border p-1 shadow-raise">
          {items.map((item) => {
            const routeActive = item.active ?? (item.activeMatch && pathname ? item.activeMatch(pathname) : matchActive(item.href, pathname));
            const active = Boolean(routeActive && !moreSelected);
            const Icon = item.icon;
            return (
              <m.li key={item.href} layout={reduced ? false : 'position'} transition={spring} whileTap={reduced ? undefined : { scale: 0.97 }}
                className={active ? 'min-w-max' : 'min-w-[44px]'} style={{ flex: active ? '1 0 auto' : '1 1 0' }}>
                <Link href={item.href} aria-current={routeActive ? 'page' : undefined} aria-label={item.label}
                  onClick={() => fwHaptic('selection')}
                  className={cn(control, active ? 'text-text-on-accent' : 'text-text-tertiary hover:text-text-secondary')}>
                  {pill(active)}
                  <m.span layout={reduced ? false : 'position'} transition={spring} className="relative z-10 inline-flex shrink-0 motion-reduce:transition-none">
                    <Icon size={21} aria-hidden className="flex-shrink-0" />
                    {badge(item.badge)}
                  </m.span>
                  <span className={cn('relative z-10 min-w-0 max-w-full truncate font-fw-sans text-caption font-semibold', !active && 'sr-only')}>
                    {item.shortLabel ?? item.label}
                  </span>
                  <span className="absolute right-1 top-1"><NavPendingDot className="ml-0" /></span>
                </Link>
              </m.li>
            );
          })}
          {onMoreOpen && (
            <m.li layout={reduced ? false : 'position'} transition={spring} whileTap={reduced ? undefined : { scale: 0.97 }} className={moreSelected ? 'min-w-max' : 'min-w-[44px]'} style={{ flex: moreSelected ? '1 0 auto' : '1 1 0' }}>
              <Button type="button" variant="ghost" haptic="light" aria-haspopup="dialog" aria-expanded={moreOpen ?? false}
                aria-label={moreLabel} onClick={onMoreOpen}
                className={cn(control, 'bg-transparent hover:bg-transparent', moreSelected ? 'text-text-on-accent' : 'text-text-tertiary')}>
                {pill(moreSelected)}
                <m.span layout={reduced ? false : 'position'} transition={spring} className="relative z-10 inline-flex shrink-0">
                  <MoreIcon size={21} aria-hidden className="flex-shrink-0" />
                  {badge(moreBadge, 9)}
                </m.span>
                <span className={cn('relative z-10 min-w-0 max-w-full truncate font-fw-sans text-caption font-semibold', !moreSelected && 'sr-only')}>{moreLabel}</span>
              </Button>
            </m.li>
          )}
        </ul>
      </LayoutGroup>
    </nav>
  );
});
FairwayBottomNav.displayName = 'FairwayBottomNav';
