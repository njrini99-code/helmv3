/**
 * Masthead: the top of a golf screen (design-direction §4.1, §5 #3; ledger DS-12).
 *
 * One context line with at most one trailing action, the large title, the
 * verdict under it, and an optional segmented control. The context line is
 * sentence case, never an all-caps eyebrow (TYPE-03 supersedes the spec's
 * uppercase eyebrow). It replaces the stacked eyebrow + h1 + subtitle +
 * badge-row heads that each page built by hand.
 *
 * Not `ViewHeader`: that header carries its own segments, breadcrumbs and
 * desktop cover treatment, which §5 #3 calls too heavy for the field sheet.
 * Masthead is the small composition the spec asks for.
 *
 * The title is an h1 by default (every golf page has exactly one); pass
 * `level={2}` inside a sheet or a pushed panel that already has one. A string
 * title at level 1 is registered as the top bar's phone title.
 *
 * No hooks, so it renders on the server as well as in client trees.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RegisterLargeTitle } from './RegisterLargeTitle';

export interface MastheadProps {
  title: ReactNode;
  /** One short context line above the title: a date, a player, a window. */
  context?: ReactNode;
  /** One trailing action on the context row (the one-primary rule). */
  action?: ReactNode;
  /** The screen's verdict, usually a <VerdictLine size="lg" />. */
  verdict?: ReactNode;
  /** A 2–4 view switch (SegmentedLinks), 24 below the verdict. */
  segmented?: ReactNode;
  level?: 1 | 2;
  className?: string;
}

export function Masthead({ title, context, action, verdict, segmented, level = 1, className }: MastheadProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <header data-slot="masthead" className={cn('flex flex-col', className)}>
      {level === 1 && typeof title === 'string' ? <RegisterLargeTitle title={title} /> : null}
      {context || action ? (
        <div className="flex min-h-9 items-center justify-between gap-4">
          <p className="min-w-0 font-fw-sans text-footnote text-text-secondary">{context}</p>
          {action ? <div className="flex-shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <Heading
        className={cn(
          'font-fw-sans text-text-primary text-balance',
          level === 1 ? 'text-large-title' : 'text-title-2',
        )}
      >
        {title}
      </Heading>
      {verdict ? <div className="mt-2">{verdict}</div> : null}
      {segmented ? <div className="mt-6">{segmented}</div> : null}
    </header>
  );
}
