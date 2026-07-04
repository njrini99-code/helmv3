'use client';

/**
 * ============================================================================
 * Fairway · AppShell · FairwayBottomNav (ADDITIVE)  — P413
 * ----------------------------------------------------------------------------
 * A persistent mobile bottom-tab bar for the 4–5 highest-frequency destinations.
 * On mobile (the primary surface for a player logging rounds in the field) the
 * ONLY navigation used to be the hamburger → slide-in drawer → tap round-trip;
 * this gives one-tap access to the core destinations (Nielsen #7: flexibility &
 * efficiency), keeping the drawer for the long tail.
 *
 * Mobile-only (`md:hidden`) — desktop keeps the recessive rail. Fixed to the
 * bottom of the viewport with a `safe-area-inset-bottom` pad so it clears the
 * iOS home indicator. Sits at `--fw-z-nav` (below the drawer/modal/toast so the
 * drawer scrim and any overlay always cover it).
 *
 * Active-state mirrors FairwaySidebar's `matchActive` (segment-boundary) and
 * honors a per-item `activeMatch` predicate for cluster rows (e.g. CoachHelm).
 * Each tab is a >=44px touch target (full-height column) with a visible 2px
 * focus ring (WCAG 2.2 AA) and an honest numeric badge (rendered only when > 0).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { NavItem, ShellLinkComponent } from './types';

/** Segment-boundary active match (mirrors FairwaySidebar's `matchActive`). */
function matchActive(href: string, pathname?: string): boolean {
  if (!pathname) return false;
  const segments = href.split('/').filter(Boolean);
  if (segments.length <= 2) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export interface FairwayBottomNavProps {
  /** The 4–5 highest-frequency destinations for the current role. */
  items: readonly NavItem[];
  /** Current pathname — drives active-state. */
  pathname?: string;
  /** Link element (Next's `<Link>` in the app; `<a>` in isolation/tests). */
  linkComponent?: ShellLinkComponent;
  className?: string;
}

const DefaultLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export function FairwayBottomNav({
  items,
  pathname,
  linkComponent,
  className,
}: FairwayBottomNavProps) {
  const Link = linkComponent ?? DefaultLink;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Mobile-only; the desktop rail owns navigation on >=md.
        'fixed inset-x-0 bottom-0 z-[var(--fw-z-nav)] md:hidden',
        // Glass-ish matte chrome on the canvas; a hairline top border separates
        // it from the scrolling content. No backdrop-blur (cheap chrome).
        'border-t border-border-subtle bg-surface/95 supports-[backdrop-filter]:bg-surface/80 supports-[backdrop-filter]:backdrop-blur-md',
        // Clear the iOS home indicator.
        'pb-[env(safe-area-inset-bottom,0px)]',
        className,
      )}
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const active =
            item.active ||
            (item.activeMatch && pathname
              ? item.activeMatch(pathname)
              : matchActive(item.href, pathname));
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={cn(
                  // Full-height column ≥44px tall touch target.
                  'group relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5',
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
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'max-w-full truncate font-fw-sans text-eyebrow normal-case tracking-normal',
                    active ? 'font-semibold' : 'font-normal',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
