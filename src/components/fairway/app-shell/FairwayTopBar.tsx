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
 * At `<md` the crumb trail and ⌘K pill are desktop-only chrome
 * (docs/MOBILE_DOCTRINE.md rule 7). The leading slot instead carries the
 * STANDING DESTINATION TITLE — the name of the view you are on, rendered at
 * full opacity from first paint.
 *
 * 2026-07-25 — why it is standing and not scroll-gated. This slot used to be
 * empty at rest: the title lived in the bar's CENTER and cross-faded in only
 * once the page's in-content large title had scrolled under the bar, on the
 * theory that the in-content title answers "where am I" in the meantime. It
 * doesn't. Apple's own idiom (HIG, Navigation Bars) is ONE string at two
 * sizes — the compact bar title is the permanently-resident floor and only
 * the LARGE title comes and goes — whereas here the two were different
 * strings entirely: the dashboard's `h1` is a greeting ("Good afternoon,
 * Cole") and the bar faded in "Dashboard". At scroll 0 nothing named the
 * destination, and on `/dashboard/tasks` and `/dashboard/intelligence` (which
 * render no `h1` at all) nothing named it at any scroll position until you
 * moved. Now the bar always does.
 *
 * Leading-aligned, not optically centred: centring inside the remaining flex
 * space would need a magic reserve matching the action cluster's width (one
 * bell today; two items on baseball/admin) and silently drifts off-centre the
 * moment a shell adds an action — it was already 28px off-centre at 390px.
 * `min-w-0 flex-1 truncate` against the `flex-shrink-0` cluster cannot
 * collide at any width, and the label lands on the same left edge as the
 * page's own masthead below it — see the gutter note on the row itself.
 * ========================================================================== */

import { forwardRef, memo, useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
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
 * The nav bar surface: opaque cream at every width (owner OD-20, "opaque cream
 * plus a hairline on scroll"). No blur, no translucency. The bottom hairline is
 * transparent at the top of the page and fades in once content scrolls under
 * the bar (`data-scrolled`), the way an iOS navigation bar does. The border
 * width is always there, so the hairline appearing never shifts the layout.
 */
const barSurface = cn(
  'relative isolate [contain:layout_paint_style] bg-surface',
  'border-b border-transparent data-[scrolled=true]:border-border-subtle',
  'transition-[border-color] [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
  '[@media(forced-colors:active)]:bg-[Canvas]',
);

/** True once the document has scrolled past the top. Passive listener, rAF-free. */
function useScrolledPastTop(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 0);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, []);
  return scrolled;
}

export interface FairwayTopBarProps {
  /** Breadcrumb trail (last crumb = current page; rendered as plain text). */
  breadcrumbs?: readonly Breadcrumb[];
  /**
   * Phones only: a leading `‹ Parent` link on a pushed route, the way an iOS
   * navigation bar pops back (NAT-04). Omit on tab roots.
   */
  backLink?: Breadcrumb & { readonly href: string };
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
   * The FALLBACK name for the current destination, shown at `<md` in the
   * leading slot — `pageTitle ?? breadcrumbs.at(-1)?.label`, computed by
   * `AppShell` from props that only change on navigation (stable across
   * scroll, so `React.memo` stays effective). Overridden internally by
   * `LargeTitleContext`'s `registeredTitle` when the current page has
   * adopted `<FairwayLargeTitle>` (zero page edits required either way).
   */
  pageTitle?: string;
  /**
   * When a hub sub-nav strip renders immediately below the bar, drop the
   * bar's OWN bottom hairline at `<md` so the two read as one continuous
   * surface with a single hairline (the sub-nav's own bottom border).
   */
  flush?: boolean;
  /**
   * NAT-04 (opt-in, golf): the phone bar as an iOS navigation bar: 44pt tall
   * with the title centred at 17pt semibold. Desktop is unchanged. Off by
   * default so Baseball and Lift Lab keep their 64px bar.
   */
  nativeBar?: boolean;
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
    backLink,
    onSearchOpen,
    searchPlaceholder = 'Search or jump to…',
    searchSlot,
    actions,
    accentColor,
    pageTitle,
    flush,
    nativeBar,
    linkComponent,
    className,
  },
  ref,
) {
  const Link = linkComponent ?? DefaultLink;
  // Read internally (not a prop) so a page registering its own title never has
  // to round-trip through `AppShell` — `registeredTitle` (set by a mounted
  // `<FairwayLargeTitle>`) wins over the shell's stable `pageTitle` fallback
  // prop, giving the "zero page edits, upgrades automatically" contract
  // without AppShell ever touching context itself.
  const { registeredTitle } = useLargeTitle();
  const displayTitle = registeredTitle ?? pageTitle;
  const scrolled = useScrolledPastTop();

  return (
    <header
      data-slot="fw-topbar"
      data-scrolled={scrolled || undefined}
      ref={ref}
      // a11y: names the banner landmark with the current destination. On
      // routes whose in-content `h1` is a greeting (both dashboards) or absent
      // entirely (Tasks, Brief) this is the ONLY place the location string is
      // exposed to assistive tech — the visible span below is `aria-hidden`
      // because promoting it to a heading would put a second `h1`-level node
      // on every page (ARIA12; also strict-mode-fails the unscoped
      // `getByRole('heading', { level: 1 })` in e2e/golf-dashboard.spec.ts).
      aria-label={displayTitle || undefined}
      // `pt-[env(safe-area-inset-top)]` keeps the bar's contents clear of the
      // iOS status bar / notch (Capacitor `contentInset: 'never'` → the web owns
      // the safe area). The bar's cream fills the notch; 0 on non-notched/desktop.
      className={cn(
        barSurface,
        'sticky top-0 z-[var(--fw-z-sticky)] w-full pt-[env(safe-area-inset-top)]',
        // M1: `flush` (a sub-nav strip renders directly below and owns the
        // hairline) drops the bar's own bottom border at `<md` only.
        flush && 'max-md:border-b-0',
        className,
      )}
    >
      {/* Gutters: `px-4 sm:px-6 lg:px-8` — the SAME string every page root and
          `FairwayHubSubNav`'s own tab row already use. The bar was `px-6
          lg:px-8`, so at phone widths its standing title sat on a 24px rule
          while the page masthead directly below it — and the sub-nav strip
          that renders as part of this same sticky chrome unit — sat on 16px.
          Measured at 390px on every golf route: title left 24, content left 16.
          Nothing in the mobile frame shared a left edge. */}
      <div className={cn(nativeBar ? 'relative h-11 md:h-16' : 'h-16', 'flex items-center gap-3 px-4 sm:px-6 lg:px-8 xl:grid xl:grid-cols-[minmax(0,1fr)_340px_minmax(0,1fr)] xl:gap-6')}>
        {/* Leading slot — PHONE: the standing destination title. Present from
            first paint, never gated on scroll, never animated. `min-w-0
            flex-1` + `truncate` against the `flex-shrink-0` action cluster
            means it cannot collide or overflow at any width; it shares the
            row's `px-6` left edge with the page masthead below it.
            `aria-hidden` — the accessible name lives on the `<header>`
            landmark above, so this never becomes a second announced heading. */}
        {backLink ? (
          <Link
            href={backLink.href}
            aria-label={`Back to ${backLink.label}`}
            className="-ml-2 flex min-h-11 min-w-11 max-w-[40%] flex-shrink-0 items-center gap-0.5 rounded-fw-sm pr-1 font-fw-sans text-body-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-border-focus md:hidden"
          >
            <ChevronLeft className="h-6 w-6 flex-shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="truncate">{backLink.label}</span>
          </Link>
        ) : null}
        <div
          className="flex min-w-0 flex-1 items-center md:hidden"
          aria-hidden
          data-slot="fw-topbar-title"
        >
          {/* iOS large-title behaviour (DASH-05): when the page registered its
              own title it is already on screen as the page's large title, so
              the bar shows it only once that has scrolled away. */}
          <span
            className={cn(
              'pointer-events-none truncate font-fw-sans text-text-primary',
              nativeBar
                ? 'absolute left-1/2 top-1/2 max-w-[50%] -translate-x-1/2 -translate-y-1/2 text-center text-headline'
                : 'text-body-sm font-medium',
              'transition-opacity [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
              registeredTitle && !scrolled && 'opacity-0',
            )}
          >
            {displayTitle}
          </span>
        </div>

        {/* Leading slot — DESKTOP: the breadcrumb trail (rule 7: phones never
            get a crumb trail). */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="hidden min-w-0 flex-shrink md:block xl:col-start-1">
            <BreadcrumbTrail breadcrumbs={breadcrumbs} Link={Link} />
          </div>
        )}

        {/* At xl+ this gets its own fixed center grid column, independent of
            breadcrumb/action widths. md..xl retains the existing trailing
            layout, where the available content column is too narrow to safely
            reserve three desktop columns beside the expanded rail. */}
        <div className="ml-auto hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex md:flex-none md:basis-[340px] xl:col-start-2 xl:ml-0 xl:w-[340px] xl:basis-auto xl:justify-self-center">
          {searchSlot ??
            (onSearchOpen && (
              <Button
                type="button"
                variant="ghost"
                onClick={onSearchOpen}
                aria-label="Open command menu"
                aria-keyshortcuts="Meta+K Control+K"
                data-layout-region="center"
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

        {/* Action cluster — every breakpoint. */}
        {actions && <div className="flex flex-shrink-0 items-center gap-2 xl:col-start-3 xl:justify-self-end">{actions}</div>}
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
