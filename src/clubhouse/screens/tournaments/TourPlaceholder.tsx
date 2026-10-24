'use client';

import type { ReactNode } from 'react';
import { useChPhone } from '../../lib/use-phone';
import { EmptyState, Skeleton } from '../../ui/States';
import type { ChTourLoad } from './types';
import '../../styles/tournaments.css';

/**
 * The base's stand-in for a Tournaments view that its lane has not built yet (README.md in this folder). It keeps the
 * view's final props contract honest in the preview: `load` draws the page's loading (CH-16401) and failed (CH-16201)
 * states the real view will keep, and `ready` says plainly that the view isn't built yet (CH-16301), with one line
 * read from the view's own data so the fixture is visibly wired. A lane replaces its view's body and drops this.
 */
export function TourPlaceholder({
  view,
  eyebrow,
  title,
  name,
  detail,
  load = 'ready',
  phone: forced,
}: {
  /** The view's area, for `data-ch-tour-view` (tests and shots find a view by it). */
  view: string;
  eyebrow: string;
  title: string;
  /** What the view is called, when the head's title is the data's own ("Oakmont Fall Classic"): "The event desk". */
  name?: string;
  /** One line read from the view's data: "Oakmont Fall Classic · Oct 5 to 7". */
  detail: ReactNode;
  load?: ChTourLoad;
  phone?: boolean;
}) {
  const auto = useChPhone();
  const phone = forced ?? auto;
  const cls = 'ch-tour ch-tour-ph' + (phone ? ' is-phone' : '');
  if (load === 'loading') {
    return (
      <main className={cls} aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`} data-ch-code="CH-16401" data-ch-tour-view={view} data-canopy="">
        <header className="ch-tour-head" data-canopy-head="">
          <Skeleton width={150} height={13} />
          <Skeleton width={260} height={36} radius={10} />
        </header>
        <Skeleton width="100%" height={180} radius={12} />
      </main>
    );
  }
  return (
    <main className={cls} aria-labelledby={`ch-tour-${view}-title`} data-ch-tour-view={view} data-canopy={phone ? undefined : ''}>
      <header className="ch-tour-head" data-canopy-head={phone ? undefined : ''}>
        <span className="ch-tour-head__k">{eyebrow}</span>
        <h1 id={`ch-tour-${view}-title`}>{title}</h1>
      </header>
      {load === 'failed' ? (
        <EmptyState size="page" tone="danger" code="CH-16201" title="Tournaments didn’t load" body="Nothing is lost. Your events and scores are still saved; try again in a moment." />
      ) : (
        <EmptyState
          size="page"
          code="CH-16301"
          title={`${name ?? title} isn’t built yet`}
          body={
            <>
              <span className="ch-tour-ph__detail ch-num">{detail}</span>
              <br />
              Its data, types and preview states are ready. The view is drawn from the Tournaments boards in its own pass.
            </>
          }
        />
      )}
    </main>
  );
}
