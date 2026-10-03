'use client';

import { createContext, Suspense, use, useContext, type ReactNode } from 'react';
import type { ChQDetailCore, ChQDetailSecondary } from '../../data/qualifiers';
import { Skeleton } from '../../ui/States';

/**
 * The part of a qualifier's page that streams in after its standings (owner rule 6): the round courses with their tees and pars, and
 * the hole-by-hole cards. The server sends the core first and the rest as a promise (`ChQDetailLoad.secondary`); each section that
 * needs it reads it through `Streamed`, inside its own Suspense, with a skeleton of its final size, so nothing else waits for it and
 * nothing moves when it lands. The promise never rejects: a read that failed is a flag in it, drawn as that section's own notice.
 */

/** The detail as the page gets it: the core, and the streamed part either as a promise beside it or, for a fixture, already in it. */
export type ChQDetailView = ChQDetailCore & Partial<ChQDetailSecondary>;

type Source = PromiseLike<ChQDetailSecondary>;

const SecondaryContext = createContext<Source | null>(null);
export const SecondaryProvider = SecondaryContext.Provider;

/** What the sections show when the streamed part never arrived: the failures the server would have flagged. */
export const FAILED_SECONDARY: ChQDetailSecondary = { holes: {}, holesError: true, roundCourses: [], par: null, coursesError: true };

/** A promise already kept, which `use()` reads at once without suspending: for a page handed the whole detail (a fixture, the preview, a test). */
export function fulfilled<T>(value: T): PromiseLike<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
}

/** The streamed fields of a whole detail. A page given none of them says its sections did not load rather than drawing them empty. */
export function secondaryOf(d: Partial<ChQDetailSecondary>): ChQDetailSecondary {
  return {
    holes: d.holes ?? FAILED_SECONDARY.holes,
    holesError: d.holesError ?? FAILED_SECONDARY.holesError,
    roundCourses: d.roundCourses ?? FAILED_SECONDARY.roundCourses,
    par: d.par ?? FAILED_SECONDARY.par,
    coursesError: d.coursesError ?? FAILED_SECONDARY.coursesError,
  };
}

/**
 * The loader's promise never rejects, but a stream that is cut off in the browser does: answer that with the same per-section failures,
 * so the sections draw their notices and not the page's error. A source already kept is returned as it is.
 */
export function settled(source: Source): Source {
  const status = (source as { status?: string }).status;
  if (status === 'fulfilled') return source;
  if (status === 'rejected') return fulfilled(FAILED_SECONDARY);
  return Promise.resolve(source).then((v) => v, () => FAILED_SECONDARY);
}

/**
 * Draws `children` with the streamed part once it is in, and `fallback` (a skeleton of the section's final size) until then. Only this
 * section waits: the Suspense is its own, so the standings around it stay drawn.
 */
export function Streamed({ fallback, children }: { fallback: ReactNode; children: (s: ChQDetailSecondary) => ReactNode }) {
  const source = useContext(SecondaryContext);
  if (!source) return <>{fallback}</>;
  return (
    <Suspense fallback={fallback}>
      <Read source={source}>{children}</Read>
    </Suspense>
  );
}

function Read({ source, children }: { source: Source; children: (s: ChQDetailSecondary) => ReactNode }) {
  return <>{children(use(source))}</>;
}

/** The Par line under the Course fact while the pars stream in: one line of the line's own height. */
export function ParLineSkeleton() {
  return <Skeleton width={56} height={16} radius={4} />;
}

/** Course per round while it streams in: a row for each round, on the list's own classes so each row has the final height. */
export function CoursesSkeleton({ rounds }: { rounds: number }) {
  return (
    <ol className="ch-qf-list" aria-busy="true" aria-label="Loading the courses" data-ch-code="CH-09410">
      {Array.from({ length: rounds }, (_, i) => (
        <li key={i}>
          <Skeleton width={24} height={24} radius={12} />
          <Skeleton width="55%" height={13} />
        </li>
      ))}
    </ol>
  );
}

/** A scorecard's table while it streams in: head, par row and score row of the table's own height. */
export function CardBodySkeleton() {
  return <Skeleton width="100%" height={82} radius={8} />;
}

/** A phone round's two nines while they stream in, each the height of the nine's own table. */
export function NinesSkeleton() {
  return (
    <>
      <Skeleton width="100%" height={94} radius={12} />
      <Skeleton width="100%" height={94} radius={12} />
    </>
  );
}
