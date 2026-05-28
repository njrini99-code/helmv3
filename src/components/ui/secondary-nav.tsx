'use client';

/**
 * SecondaryNav — the single canonical in-section sub-navigation primitive.
 *
 * Wave W7A (information-architecture) introduces a consistent in-page tab bar
 * for sections that have sibling sub-views (Settings → Account / Notifications
 * / Coaching Intelligence; CRM → Pipeline / Inbox / Sequences / Insights /
 * Settings; etc.). Prior to W7A these were hand-rolled per surface with
 * divergent active treatments; this primitive standardises on:
 *
 *   - Desktop (sm+): a horizontal tab bar with a hairline baseline and a
 *     primary-600 underline + primary-700 label on the active item.
 *   - Mobile (<sm): a horizontally-scrollable chip row; the active chip is a
 *     filled primary-50 / primary-700 pill. No visible scrollbar.
 *
 * Each item is a real <Link> (soft client navigation, prefetch). The active
 * item is matched against `currentRoute` and carries aria-current="page".
 *
 * API:
 *   <SecondaryNav
 *     items={[
 *       { label: 'Account',      href: '/golf/dashboard/settings' },
 *       { label: 'Notifications', href: '/golf/dashboard/settings/notifications' },
 *     ]}
 *     currentRoute={pathname}
 *   />
 *
 * Audit reference: ultra-audit master synthesis A4 (nav sprawl) — one
 * in-section sub-nav surface, one active treatment.
 */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SecondaryNavItem {
  /** Visible label. */
  label: string;
  /** Target route. */
  href: string;
  /** Optional leading glyph (icon). */
  icon?: React.ReactNode;
  /**
   * Optional explicit match override. When provided, the item is considered
   * active if `currentRoute === match` OR `currentRoute` starts with
   * `match + '/'`. When omitted, `href` is used for the same comparison.
   */
  match?: string;
  /** Optional trailing badge/count. */
  badge?: React.ReactNode;
}

export interface SecondaryNavProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** The sub-nav items. */
  items: SecondaryNavItem[];
  /** The current pathname — used to compute the active item. */
  currentRoute: string;
  /** Optional aria-label for the nav landmark. */
  ariaLabel?: string;
}

/** Segment-boundary active match (mirrors GolfSidebar.isActive semantics). */
function isItemActive(currentRoute: string, item: SecondaryNavItem): boolean {
  const target = item.match ?? item.href;
  return currentRoute === target || currentRoute.startsWith(`${target}/`);
}

/**
 * SecondaryNav. See the file header for the full API + behaviour contract.
 */
export const SecondaryNav = React.forwardRef<HTMLElement, SecondaryNavProps>(
  ({ items, currentRoute, ariaLabel = 'Section navigation', className, ...props }, ref) => {
    if (items.length === 0) return null;

    return (
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={cn('w-full', className)}
        {...props}
      >
        {/* ===== Mobile: horizontally-scrollable chip row ===== */}
        <ul className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 sm:hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const active = isItemActive(currentRoute, item);
            return (
              <li key={`m-${item.href}`} className="flex-shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-warm-500 hover:text-warm-800 hover:bg-warm-100/60',
                  )}
                >
                  {item.icon}
                  {item.label}
                  {item.badge}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* ===== Desktop: tab bar with hairline baseline + primary underline ===== */}
        <ul className="hidden sm:flex items-center gap-6 border-b border-warm-200/60">
          {items.map((item) => {
            const active = isItemActive(currentRoute, item);
            return (
              <li key={`d-${item.href}`} className="-mb-px">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-medium transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-t-sm',
                    active
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-warm-500 hover:text-warm-800 hover:border-warm-300',
                  )}
                >
                  {item.icon}
                  {item.label}
                  {item.badge}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  },
);
SecondaryNav.displayName = 'SecondaryNav';
