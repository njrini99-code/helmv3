'use client';

/**
 * ============================================================================
 * Fairway · FairwayTopBar (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The cream-side sticky top app bar — the CANONICAL Liquid Glass surface
 * (DESIGN-SYSTEM §4.3 allow-list #1: "floats over scrolling content, content
 * slides under it"). This is the ONE glass surface the shell renders.
 *
 * Recipe (§4.3 warm glass — cream-tinted over cream, NEVER white over gray):
 *   • bg = --fw-glass-bg (warm cream ~62%) + backdrop-blur + saturate.
 *   • bright specular top rim (--fw-glass-border) + inner highlight line
 *     (--fw-glass-highlight) + faint warm base edge.
 *   • `before:` pseudo carries the cheap universal top sheen (Safari/FF too).
 *   • reduced-transparency / forced-colors → collapses to opaque `bg-surface`
 *     + `shadow-soft` (Apple's own a11y lesson; spec §4.3).
 *   • mobile (<=768px) downshifts blur via --fw-blur-mobile.
 *
 * Holds: breadcrumb trail, a persistent search / ⌘K command entry, and a
 * right-aligned action cluster. Content scrolls UNDER it (sticky, z-sticky).
 * ========================================================================== */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { IconMenu, IconSearch } from '@/components/icons';
import type { Breadcrumb, ShellLinkComponent } from './types';

const DefaultLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

/**
 * The warm Liquid-Glass surface classes, expressed inline from the --fw-glass-*
 * tokens (Wave 1 cannot add a global `.glass` class). Includes the
 * reduced-transparency / forced-colors fallback to an opaque matte surface.
 */
const glassSurface = cn(
  'relative isolate [contain:layout_paint_style]',
  'bg-[var(--fw-glass-bg)]',
  'supports-[backdrop-filter]:backdrop-blur-[var(--fw-blur-mobile)] md:supports-[backdrop-filter]:backdrop-blur-[var(--fw-blur-glass)]',
  'supports-[backdrop-filter]:backdrop-saturate-[var(--fw-glass-saturate)]',
  'border-b border-[var(--fw-glass-border)]',
  '[box-shadow:inset_0_1px_0_0_var(--fw-glass-highlight),inset_0_-1px_0_0_var(--fw-glass-border-bot)]',
  // Cheap universal top sheen (works without backdrop-filter support).
  "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
  'before:bg-gradient-to-b before:from-white/25 before:via-white/[0.04] before:to-transparent',
  // Apple a11y fallback: opaque matte when transparency/contrast is reduced.
  'motion-reduce:transition-none',
  '[@media(prefers-reduced-transparency:reduce)]:bg-surface',
  '[@media(prefers-reduced-transparency:reduce)]:supports-[backdrop-filter]:backdrop-blur-none',
  '[@media(prefers-reduced-transparency:reduce)]:shadow-soft',
  '[@media(prefers-reduced-transparency:reduce)]:before:hidden',
  '[@media(forced-colors:active)]:bg-[Canvas]',
);

export interface FairwayTopBarProps {
  /** Breadcrumb trail (last crumb = current page; rendered as plain text). */
  breadcrumbs?: readonly Breadcrumb[];
  /**
   * Persistent search / command entry. When `onSearchOpen` is provided, the bar
   * renders the canonical ⌘K command button. Pass `searchSlot` to fully replace it.
   */
  onSearchOpen?: () => void;
  /** Placeholder text inside the command entry. */
  searchPlaceholder?: string;
  /** Replace the built-in command entry entirely. */
  searchSlot?: React.ReactNode;
  /** Right-aligned action cluster (primary CTA, avatar menu, etc.). */
  actions?: React.ReactNode;
  /** Mobile hamburger handler — renders the menu affordance when present. */
  onMenuOpen?: () => void;
  /** Link element (defaults to a plain `<a>`). */
  linkComponent?: ShellLinkComponent;
  className?: string;
}

function BreadcrumbTrail({
  breadcrumbs,
  Link,
}: {
  breadcrumbs: readonly Breadcrumb[];
  Link: ShellLinkComponent;
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 font-fw-sans text-body-sm">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <li key={crumb.label + i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span className="select-none text-text-tertiary" aria-hidden>
                  /
                </span>
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className={cn(
                    'truncate rounded-fw-sm px-0.5 text-text-secondary',
                    'transition-colors duration-[var(--fw-dur-fast)] hover:text-text-primary',
                  )}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn('truncate', isLast ? 'font-medium text-text-primary' : 'text-text-secondary')}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const FairwayTopBar = forwardRef<HTMLElement, FairwayTopBarProps>(function FairwayTopBar(
  { breadcrumbs, onSearchOpen, searchPlaceholder = 'Search or jump to…', searchSlot, actions, onMenuOpen, linkComponent, className },
  ref,
) {
  const Link = linkComponent ?? DefaultLink;

  return (
    <header
      ref={ref}
      className={cn(glassSurface, 'sticky top-0 z-[var(--fw-z-sticky)] w-full', className)}
    >
      <div className="flex h-16 items-center gap-3 px-6 lg:px-8">
        {/* Mobile menu affordance */}
        {onMenuOpen && (
          <button
            type="button"
            onClick={onMenuOpen}
            aria-label="Open navigation"
            className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-fw-md md:hidden',
              'text-text-secondary transition-colors duration-[var(--fw-dur-fast)]',
              'hover:bg-surface-sunken hover:text-text-primary active:translate-y-[0.5px]',
            )}
          >
            <IconMenu size={20} aria-hidden />
          </button>
        )}

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="hidden min-w-0 flex-shrink md:block">
            <BreadcrumbTrail breadcrumbs={breadcrumbs} Link={Link} />
          </div>
        )}

        {/* Persistent search / command entry */}
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3 md:flex-none md:basis-[340px]">
          {searchSlot ??
            (onSearchOpen && (
              <button
                type="button"
                onClick={onSearchOpen}
                aria-label="Open command menu"
                aria-keyshortcuts="Meta+K Control+K"
                className={cn(
                  'group flex h-10 w-full max-w-[340px] items-center gap-2.5 rounded-fw-sm px-3',
                  'bg-surface-sunken/80 text-text-tertiary',
                  'border border-border-subtle',
                  'transition-[color,background-color,box-shadow] duration-[var(--fw-dur-fast)]',
                  'hover:bg-surface-sunken hover:text-text-secondary hover:shadow-soft active:translate-y-[0.5px]',
                )}
              >
                <IconSearch size={16} aria-hidden className="flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left font-fw-sans text-body-sm">
                  {searchPlaceholder}
                </span>
                <kbd
                  aria-hidden
                  className="hidden flex-shrink-0 items-center gap-0.5 rounded-fw-sm border border-border-subtle bg-surface px-1.5 py-0.5 font-fw-mono text-caption leading-none text-text-tertiary sm:inline-flex"
                >
                  ⌘K
                </kbd>
              </button>
            ))}
        </div>

        {/* Action cluster */}
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
});
