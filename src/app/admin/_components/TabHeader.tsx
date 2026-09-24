import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The Bridge's tab header and its "Details" disclosure — one copy each.
 *
 * WHY THESE EXIST. Every tab hand-rolled its own masthead: an accent eyebrow
 * over a sentence-long h1 on one, `text-lg` on another, `text-2xl` on a third,
 * and no h1 at all on five. On a phone that meant two or three lines of
 * heading chrome before the first row, in a different size on every tab. The
 * mobile rework (owner-approved) is: ONE clear header per tab, and secondary
 * detail — methodology, governance pointers, how a number is counted — one
 * tap away behind "Details" instead of printed above the data on every visit.
 *
 * Both are server-safe (no hooks, no `'use client'`): most Bridge tabs are
 * async server components, and a native `<details>` needs no JS — the browser
 * owns open/closed, it works identically tapped on a phone, and it degrades to
 * visible text if CSS fails (see KpiSourceNote for the same reasoning).
 */

/**
 * One h1 — the tab's name — plus at most one line saying what it covers.
 *
 * A plain `<header>`, deliberately with no `aria-label`: overview-composition
 * pins the Overview's labelled sections, and a header is not a section.
 */
export function TabHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  /** One line. If it needs a second sentence, that sentence goes in `children`
   *  inside a DetailsDisclosure. */
  description?: ReactNode;
  /** Controls that belong beside the title; they wrap under it on a phone. */
  actions?: ReactNode;
  /** Usually a DetailsDisclosure. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 break-words text-h3 font-semibold text-warm-900 [overflow-wrap:anywhere] md:text-h2">
          {title}
        </h1>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="mt-0.5 max-w-3xl text-body-sm text-warm-600">{description}</p> : null}
      {children}
    </header>
  );
}

/**
 * Secondary detail, one tap away. The summary reads "Details" unless the
 * caller has a reason to say more — a dozen bespoke summary labels is the
 * drift this replaces.
 *
 * `group/details` is a NAMED group: these sit inside other `<details>` (the
 * incident card, the tracer rows), and a bare `group-open:` would rotate this
 * chevron whenever the OUTER disclosure opened.
 *
 * 44px tall on a coarse pointer (the same bump Fairway Button `sm` makes);
 * dense on a mouse.
 */
export function DetailsDisclosure({
  label = 'Details',
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn('group/details min-w-0', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded py-1 text-caption font-medium text-warm-600 hover:text-warm-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:pr-3">
        <ChevronRight
          size={12}
          aria-hidden
          className="shrink-0 transition-transform group-open/details:rotate-90 motion-reduce:transition-none"
        />
        {label}
      </summary>
      <div className="mt-1 space-y-1 break-words pb-1 text-caption leading-5 text-warm-600 [overflow-wrap:anywhere]">
        {children}
      </div>
    </details>
  );
}
