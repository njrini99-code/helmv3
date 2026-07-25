'use client';

/**
 * ============================================================================
 * Fairway · AppShell · MoreNavSheet (M1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The ONE overflow surface for GolfHelm, BaseballHelm, AND Bridge (docs/
 * MOBILE_DOCTRINE.md Rule 6 — "More-sheet, not left drawer"). Opened by the
 * bottom bar's 5th "More" column (`FairwayBottomNav`'s `onMoreOpen`), this
 * re-materializes the SAME rail `sections` a page already builds — minus the
 * 4 hrefs already on the bottom bar (`more-nav.ts`'s `selectOverflow`) — as a
 * composed vaul bottom `Sheet`: identity row → grouped overflow rows (icon
 * tile + label + description + badge + chevron, never a flat list) → a
 * product-owned footer slot (Settings + Sign out).
 *
 * `peek={false}` — opens straight to content height (no half-detent drag);
 * `bg-elevated` opaque (no blur, §Performance floor); vaul owns focus-trap,
 * Esc-to-close, scrim-click-to-close, and focus-restore-to-trigger natively —
 * none of that is hand-rolled here (the retired AppShell drawer used to).
 *
 * The optional `header` slot renders above the identity row — additive room
 * for a per-product banner (Bridge mounts its prod pill + "updated Xs ago" +
 * a full-width Refresh button there in a later wave); omitted here, it's a
 * no-op.
 * ========================================================================== */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronRight } from '@/components/icons';
import { Sheet } from '@/components/fairway/overlays';
import { Avatar } from '@/components/fairway/controls/avatar';
import { selectOverflow, matchActive } from './more-nav';
import type { NavItem, NavSection, ShellLinkComponent, ShellUser } from './types';

const DefaultLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export interface MoreNavSheetProps {
  /** Controlled open state — bridged to AppShell's `mobileOpen`. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The FULL rail sections (same array the desktop sidebar renders). */
  sections: readonly NavSection[];
  /** The bottom bar's own hrefs — excluded from the computed overflow. */
  excludeHrefs: readonly string[];
  /** Identity block (avatar/name/team) — omitted when the caller has none. */
  user?: ShellUser;
  /** Rendered inside `<Sheet.Footer>` — product-specific (sign-out differs). */
  footer?: React.ReactNode;
  /** Identity row's destination. Defaults to `/settings` (both product
   *  shells always pass their real route; this is only a last-resort). */
  settingsHref?: string;
  pathname?: string;
  linkComponent?: ShellLinkComponent;
  /** Sheet a11y title (visually hidden). Default "More". */
  title?: string;
  /** Additive slot above the identity row (e.g. Bridge's prod pill + Refresh
   *  button in a later wave). Omitted here is a no-op. */
  header?: React.ReactNode;
  /**
   * Verifier fix: vaul's `Drawer.Portal` renders `Drawer.Content` into
   * `document.body` by default — OUTSIDE the DOM subtree of whatever React
   * ancestor scope-classes this sheet (e.g. BaseballHelm's `.living-annual`,
   * which re-points `--fw-color-*` to its deeper cream via a plain
   * descendant selector, `src/styles/baseball-living-annual.css`). Custom
   * properties inherit by DOM ancestry, not the React tree, so a portaled
   * sheet mounted from a scoped product falls back to `:root`'s default
   * (golf) values unless the scope class is applied directly to the
   * sheet's own DOM node. Forwarded onto `<Sheet className>`, which already
   * merges onto `Drawer.Content` (see Sheet.tsx) — declaring the scope
   * class directly on that element re-points its own custom properties
   * regardless of where in the DOM the portal renders it.
   */
  sheetClassName?: string;
}

interface OverflowRowProps {
  item: NavItem;
  active: boolean;
  Link: ShellLinkComponent;
}

function OverflowRow({ item, active, Link }: OverflowRowProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        // #177: `w-full overflow-hidden` — the row must never measure wider
        // than its sheet, even transiently (e.g. a badge/description longer
        // than expected before `truncate` can clip it). `min-w-0` lets the
        // flex child below actually shrink instead of pushing the row wide.
        'flex w-full min-h-[56px] min-w-0 items-center gap-3 overflow-hidden rounded-fw-md px-4 py-2',
        'transition-colors [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
        active ? 'bg-surface-sunken text-accent-700' : 'text-text-secondary hover:bg-surface-sunken/60',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-fw-md border border-border-subtle bg-surface-sunken',
        )}
      >
        <Icon
          size={18}
          aria-hidden
          className={cn('flex-shrink-0', active ? 'text-accent-700' : 'text-text-secondary')}
        />
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {item.label}
        </span>
        {item.description ? (
          <span className="block truncate font-fw-sans text-caption text-text-tertiary">
            {item.description}
          </span>
        ) : null}
      </span>
      {typeof item.badge === 'number' && item.badge > 0 ? (
        <span
          className={cn(
            'flex-shrink-0 min-w-[20px] max-w-[48px] truncate rounded-full px-1.5 py-0.5 text-center',
            'bg-accent-600 font-fw-mono text-eyebrow font-semibold leading-4 tabular-nums text-text-on-accent',
          )}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
      <IconChevronRight size={16} aria-hidden className="flex-shrink-0 text-text-tertiary" />
    </Link>
  );
}

// React.memo: mounted for the lifetime of the (usually-closed) mobile shell;
// AppShell re-renders on every pathname change, so memo skips recomputing the
// overflow rows unless `sections`/`excludeHrefs`/`pathname`/etc actually change.
export const MoreNavSheet = memo(function MoreNavSheet({
  open,
  onOpenChange,
  sections,
  excludeHrefs,
  user,
  footer,
  settingsHref = '/settings',
  pathname,
  linkComponent,
  title = 'More',
  header,
  sheetClassName,
}: MoreNavSheetProps) {
  const Link = linkComponent ?? DefaultLink;
  const overflow = selectOverflow(sections, excludeHrefs);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      peek={false}
      title={title}
      hideTitle
      className={sheetClassName}
    >
      <Sheet.Body>
        {header}

        {user ? (
          <Link
            href={settingsHref}
            className={cn(
              // #178: explicit 44px floor (WCAG 2.2 AA 2.5.8) — the row's
              // rendered height happens to clear it today (Avatar `md` +
              // padding) but that was incidental, not guaranteed; make it
              // explicit like `OverflowRow`'s `min-h-[56px]` and
              // `MoreSheetFooter`'s `min-h-[44px]`.
              'mb-2 flex min-h-[44px] w-full min-w-0 items-center gap-3 overflow-hidden rounded-fw-md px-2 py-2.5',
              'transition-colors [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none hover:bg-surface-sunken',
            )}
          >
            <Avatar decorative
              name={user.name}
              src={user.avatarUrl ?? undefined}
              size="md"
              square
              className="bg-gradient-to-br from-accent-400 to-accent-700 text-text-on-accent"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{user.name}</p>
              {user.teamName && (
                <p className="flex items-center gap-1.5 truncate font-fw-sans text-caption text-text-tertiary">
                  <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent-600" aria-hidden />
                  {user.teamName}
                </p>
              )}
            </div>
            <IconChevronRight size={16} aria-hidden className="flex-shrink-0 text-text-tertiary" />
          </Link>
        ) : null}

        {overflow.map((section, sIdx) => (
          <div key={section.heading ?? `section-${sIdx}`}>
            {sIdx > 0 && <div className="mx-4 my-1 border-t border-border-subtle" aria-hidden />}
            {section.heading && (
              <p
                className={cn(
                  'px-4 pb-2 font-fw-sans text-eyebrow uppercase text-text-tertiary',
                  sIdx === 0 ? 'pt-1' : 'pt-4',
                )}
              >
                {section.heading}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <OverflowRow
                  key={item.href}
                  item={item}
                  active={
                    item.active ??
                    (item.activeMatch && pathname ? item.activeMatch(pathname) : matchActive(item.href, pathname))
                  }
                  Link={Link}
                />
              ))}
            </div>
          </div>
        ))}
      </Sheet.Body>

      {footer ? (
        <Sheet.Footer className="flex-row items-center justify-between sm:justify-between">{footer}</Sheet.Footer>
      ) : null}
    </Sheet>
  );
});
