/**
 * Row: one line of a grouped list (design-direction §4.3, §5 #7; ledger DS-12).
 *
 * Leading slot (a 28pt avatar or a 20pt glyph), a title with an optional
 * one-line subtitle, a trailing value (usually a <MetricValue />) with an
 * optional second value under it, and a chevron when the row pushes. It
 * replaces tile grids and card-per-item lists: rows sit on one RowGroup,
 * separated by hairlines that start at the text's leading edge, with no card
 * chrome of their own (DS-E4).
 *
 * The title wraps to two lines and never truncates a name, course or event.
 * A row is 44pt tall with one line and 60pt with a subtitle.
 *
 * A row with `href` renders a Next link; with `onClick`, a button; otherwise a
 * plain block. The whole row is the one target: no buttons inside a row. A
 * press tints `surface-sunken`; a list row does not scale (fwPressSurface is
 * for cards).
 *
 * No hooks, so it renders on the server as well as in client trees.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  value?: ReactNode;
  /** A second trailing line under `value` (13, secondary). */
  valueSub?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Thin data: the title in secondary ink (pair with value "Needs 3 more rounds"). */
  ghost?: boolean;
  /** Accessible name when the visible title is not enough. */
  'aria-label'?: string;
  className?: string;
}

const BASE = 'group/row flex w-full items-stretch pl-4 text-left font-fw-sans';

const INTERACTIVE =
  'outline-none transition-colors duration-100 active:bg-surface-sunken motion-reduce:transition-none ' +
  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus';

export function Row({
  title,
  subtitle,
  leading,
  value,
  valueSub,
  href,
  onClick,
  ghost = false,
  className,
  ...rest
}: RowProps) {
  const body = (
    <>
      {leading ? <span className="flex flex-shrink-0 items-center pr-3">{leading}</span> : null}
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 border-b border-border-subtle py-2.5 pr-4 group-last/row:border-b-0',
          subtitle ? 'min-h-[60px]' : 'min-h-11',
        )}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 break-words text-body',
              ghost ? 'text-text-secondary' : 'text-text-primary',
            )}
          >
            {title}
          </span>
          {subtitle ? <span className="block truncate text-footnote text-text-secondary">{subtitle}</span> : null}
        </span>
        {value != null || valueSub != null ? (
          <span className="flex flex-shrink-0 flex-col items-end text-right">
            {value != null ? <span className="text-body tabular-nums text-text-primary">{value}</span> : null}
            {valueSub != null ? (
              <span className="text-footnote tabular-nums text-text-secondary">{valueSub}</span>
            ) : null}
          </span>
        ) : null}
        {href ? (
          <ChevronRight aria-hidden="true" className="size-4 flex-shrink-0 text-text-tertiary" strokeWidth={2} />
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} data-slot="row" aria-label={rest['aria-label']} className={cn(BASE, INTERACTIVE, className)}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      // eslint-disable-next-line helm/no-raw-button -- a full-width list row, not a styled control
      <button
        type="button"
        data-slot="row"
        onClick={onClick}
        aria-label={rest['aria-label']}
        className={cn(BASE, INTERACTIVE, className)}
      >
        {body}
      </button>
    );
  }
  return (
    <div data-slot="row" className={cn(BASE, className)}>
      {body}
    </div>
  );
}

/** The inset group rows sit on: one rounded, hairlined, opaque block. */
export function RowGroup({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      data-slot="row-group"
      className={cn('overflow-hidden rounded-fw-sm border border-border-subtle bg-surface', className)}
    >
      {children}
    </div>
  );
}
