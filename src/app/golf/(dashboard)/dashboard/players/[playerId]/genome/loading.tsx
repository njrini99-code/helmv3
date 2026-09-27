import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Genome first paint: masthead (name, archetype, verdict, meta row) → the
 * strand stage (title + Team/Tour switch, the band, the readout) → the first
 * ledger rows. Mirrors CoachGenomeView's spacing so nothing jumps on hydrate.
 */
const LEDGER_ROWS = ['r1', 'r2', 'r3'] as const;

export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-4 md:px-8 md:pt-8"
      >
        <span className="sr-only">Loading genome…</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48 md:h-10 md:w-72" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-1 h-5 w-full max-w-[60ch]" />
          <Skeleton className="h-5 w-3/4 max-w-[48ch]" />
          <Skeleton className="mt-3 h-4 w-64" />
        </div>
        <div className="mt-8 rounded-card border border-border-subtle bg-surface px-4 pb-4 pt-4 md:mt-10 md:px-6 md:pb-6 md:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-1.5 h-3 w-44" />
            </div>
            <Skeleton className="h-11 w-[168px] rounded-full" />
          </div>
          <Skeleton className="mt-5 h-[152px] w-full rounded-fw-md" />
          <div className="mt-4 border-t border-border-subtle pt-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-64" />
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <div className="border-t border-border-strong">
            {LEDGER_ROWS.map((k) => (
              <div key={k} className="flex min-h-14 items-center justify-between border-b border-border-subtle py-2.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
