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
 *   • mobile (<md) gets an opaque `bg-surface` unconditionally (no blur) —
 *     a `sticky` header over constantly-scrolling content is the worst
 *     compositing case on phone-class GPUs. The inset specular lines stay
 *     at every breakpoint. md+ keeps the full blur/saturate glass.
 *
 * Holds: breadcrumb trail, a persistent search / ⌘K command entry, and a
 * right-aligned action cluster. Content scrolls UNDER it (sticky, z-sticky).
 *
 * M1 (2026-07-10, condensing-header): at `<md` the crumb trail and ⌘K pill
 * are desktop-only chrome (docs/MOBILE_DOCTRINE.md rule 7) — the leading
 * slot is EMPTY at rest; the bar's center instead cross-fades in the page's
 * CONDENSED title once the in-content large title scrolls under it (the iOS
 * large-title idiom). `condensed`/the registered title are read from
 * `LargeTitleContext` internally (never a prop) so a scroll toggle re-renders
 * only this component, never `AppShell`/`FairwaySidebar`.
 * ========================================================================== */

import { forwardRef, memo } from 'react';
import { cn } from '@/lib/utils';
import { IconSearch } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useLargeTitle } from './LargeTitleContext';
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
  // Mobile (<md): opaque matte, no blur — a `sticky` header over
  // constantly-scrolling content is the worst compositing case on
  // phone-class GPUs, so it gets the opaque surface unconditionally here.
  // md+: full warm glass (blur/saturate) as before. No shadow utilities:
  // the unconditional inset [box-shadow:...] below must survive at md+.
  'bg-surface md:bg-[var(--fw-glass-bg)]',
  'md:supports-[backdrop-filter]:backdrop-blur-[var(--fw-blur-glass)]',
  'md:supports-[backdrop-filter]:backdrop-saturate-[var(--fw-glass-saturate)]',
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
  /**
   * Optional accent (any CSS color / `var(...)`) — renders a 2px underline at
   * the bar's bottom edge that cross-fades when it changes. Used by the
   * men's/women's active-team toggle; omit for the default glass border only.
   */
  accentColor?: string;
  /**
   * M1 (condensing-header): the FALLBACK condensed title shown at `<md` once
   * scrolled — `pageTitle ?? breadcrumbs.at(-1)?.label`, computed by
   * `AppShell` from props that only change on navigation (stable across
   * scroll, so `React.memo` stays effective). Overridden internally by
   * `LargeTitleContext`'s `registeredTitle` when the current page has
   * adopted `<FairwayLargeTitle>` (zero page edits required either way).
   */
  condensedTitle?: string;
  /**
   * M1: when a hub sub-nav strip renders immediately below the bar, drop the
   * bar's OWN bottom hairline at `<md` so the two read as one continuous
   * surface with a single hairline (the sub-nav's own bottom border).
   */
  flush?: boolean;
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
            // Only the LAST crumb may shrink. Every <li> used to be
            // `min-w-0`, so flex distributed the squeeze evenly across the
            // whole trail and at 768 — where the 256px rail is still expanded
            // and the search field is fixed-width — the bar rendered a literal
            // "D.. / C..", 19-29px per crumb with ~45px hidden each (audit
            // P-28). Ancestors keep their intrinsic width; the current page,
            // which the reader can also see in the page's own h1, absorbs it.
            <li
              key={crumb.label + i}
              className={cn(
                'flex items-center gap-1.5',
                isLast ? 'min-w-0' : 'shrink-0',
              )}
            >
              {i > 0 && (
                <span className="select-none text-text-tertiary" aria-hidden>
                  /
                </span>
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className={cn(
                    'whitespace-nowrap rounded-fw-sm px-0.5 text-text-secondary',
                    'transition-colors [transition-duration:var(--fw-dur-fast)] hover:text-text-primary',
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

// React.memo (perf packet [shell-render-hygiene]): AppShell re-renders this on
// every pathname change; memo skips re-render when its props are unchanged.
export const FairwayTopBar = memo(forwardRef<HTMLElement, FairwayTopBarProps>(function FairwayTopBar(
  {
    breadcrumbs,
    onSearchOpen,
    searchPlaceholder = 'Search or jump to…',
    searchSlot,
    actions,
    accentColor,
    condensedTitle,
    flush,
    linkComponent,
    className,
  },
  ref,
) {
  const Link = linkComponent ?? DefaultLink;
  // M1: read internally (not a prop) so a scroll-driven `condensed` toggle
  // re-renders only THIS component — `registeredTitle` (set by a mounted
  // `<FairwayLargeTitle>`) wins over the shell's stable `condensedTitle`
  // fallback prop, giving the "zero page edits, upgrades automatically"
  // contract without AppShell ever touching context itself.
  const { condensed, registeredTitle } = useLargeTitle();
  const displayTitle = registeredTitle ?? condensedTitle;

  return (
    <header
      ref={ref}
      // `pt-[env(safe-area-inset-top)]` keeps the bar's contents clear of the
      // iOS status bar / notch (Capacitor `contentInset: 'never'` → the web owns
      // the safe area). The glass tints UP into the notch; 0 on non-notched/desktop.
      className={cn(
        glassSurface,
        'sticky top-0 z-[var(--fw-z-sticky)] w-full pt-[env(safe-area-inset-top)]',
        // M1: `flush` (a sub-nav strip renders directly below) drops the
        // bar's OWN bottom hairline at `<md` ONLY — the two glass classes
        // below are re-declared (not toggled by a shared variable) so this
        // stays a plain, mergeable Tailwind class list; `max-md:` scopes it
        // to phone (md:+ keeps its own hairline regardless of `flush`).
        flush && 'max-md:border-b-0 max-md:[box-shadow:inset_0_1px_0_0_var(--fw-glass-highlight)]',
        className,
      )}
    >
      <div className="flex h-16 items-center gap-3 px-6 lg:px-8">
        {/* Location indicator — desktop only (>=md). At `<md` the leading
            slot is EMPTY at rest (condensing-header §3/Decision 4): the
            in-content large title answers "where am I" instead, and once it
            scrolls away the condensed title below takes over. */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="hidden min-w-0 flex-shrink md:block">
            <BreadcrumbTrail breadcrumbs={breadcrumbs} Link={Link} />
          </div>
        )}

        {/* Center slot — mobile: the condensed page title, cross-fading in
            once the in-content large title scrolls under the bar (pure CSS
            transition on an IntersectionObserver-driven class toggle — no
            scroll listener, no layout animation). Desktop: the persistent
            search / ⌘K command entry, unchanged. Same flex-1/ml-auto shell as
            before so the desktop layout is byte-for-byte identical; only the
            CONTENTS differ per breakpoint via two mutually-exclusive
            `md:hidden` / `hidden md:flex` children (rule 7: no desktop chrome
            on phones). */}
        <div className="ml-auto flex min-w-0 flex-1 items-center gap-3 md:flex-none md:basis-[340px]">
          <div
            className="flex min-w-0 flex-1 items-center justify-center md:hidden"
            aria-hidden
            data-slot="fw-topbar-condensed-title"
          >
            <span
              className={cn(
                'pointer-events-none truncate font-fw-sans text-body-sm font-medium text-text-primary',
                'transition-[opacity,transform] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]',
                'motion-reduce:transition-none motion-reduce:translate-y-0',
                condensed ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              {displayTitle}
            </span>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex">
            {searchSlot ??
              (onSearchOpen && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onSearchOpen}
                  aria-label="Open command menu"
                  aria-keyshortcuts="Meta+K Control+K"
                  className={cn(
                    'group flex h-10 min-h-0 w-full max-w-[340px] items-center justify-start gap-2.5 rounded-fw-sm px-3',
                    'bg-surface-sunken/80 text-text-tertiary',
                    'border border-border-subtle',
                    'transition-[color,background-color,box-shadow] [transition-duration:var(--fw-dur-fast)]',
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
                </Button>
              ))}
          </div>
        </div>

        {/* Action cluster — every breakpoint. */}
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* Active-team accent underline — overlays the glass bottom border, cross-
          fades on team switch. Sits above the `before:` sheen (later in DOM). */}
      {accentColor && (
        <div
          aria-hidden
          data-testid="fw-accent-underline"
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-[2px]',
            'transition-[background-color] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none',
          )}
          style={{ backgroundColor: accentColor }}
        />
      )}
    </header>
  );
}));
