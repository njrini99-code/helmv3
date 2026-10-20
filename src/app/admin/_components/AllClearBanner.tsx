import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { describeWindow, type AllClearClaim } from '@/lib/admin/incidents/all-clear';
import { LocalTime } from './LocalTime';

/**
 * The Bridge's all-clear headline: the one calm sentence a healthy screen
 * leads with, in place of a run of zero counts.
 *
 * It renders ONLY a claim `deriveAllClear` (`src/lib/admin/incidents/
 * all-clear.ts`) already granted, and its type cannot take a refusal: when
 * the verdict is `none`, the caller renders its ordinary posture or counts
 * instead. That keeps the honesty rule in one tested function rather than in
 * whichever screen draws a check mark.
 *
 * Two shapes, never a third:
 *   - `all-clear`: green check, "All clear", every source reading, checked
 *     time. The only place green is spent is the check itself.
 *   - `window-clear`: nothing needs action in the window, but older errors
 *     are still open. Same calm layout, a neutral check (not green), a title
 *     scoped to the window, and the backlog as the one action.
 *
 * Deliberately not a live region. The Overview re-renders every 30s
 * (`AutoRefresh`), and the "checked" time changes on each one; `role=status`
 * would announce the banner to a screen reader every half minute.
 */
export function AllClearBanner({
  claim,
  checkedLabel = 'checked',
  details = [],
  olderOpenHref,
  headingId = 'bridge-all-clear-heading',
}: {
  claim: AllClearClaim;
  /** The verb for the timestamp: "checked" on the Overview, "reconciled" on
   *  the Incidents tab, matching each screen's existing provenance wording. */
  checkedLabel?: string;
  /** Extra quiet facts for the meta line (release state, decisions). */
  details?: readonly ReactNode[];
  /** Where the backlog action goes when older errors are still open. */
  olderOpenHref: string;
  headingId?: string;
}) {
  const clear = claim.state === 'all-clear';
  const windowWords = describeWindow(claim.windowHours);
  const older = claim.olderOpenCount;
  const olderNoun = older === 1 ? 'error' : 'errors';

  const meta: ReactNode[] = [
    `${claim.sourcesReading} of ${claim.sourcesTotal} sources reading`,
    <>
      {checkedLabel} <LocalTime iso={claim.checkedAt} />
    </>,
    ...details,
  ];

  return (
    <Surface as="section" padding="sm" aria-labelledby={headingId} data-all-clear={claim.state}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full',
            clear ? 'bg-fw-success-bg text-fw-success-ink' : 'bg-surface-sunken text-text-secondary',
          )}
        >
          <CheckCircle2 size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-body-lg font-semibold text-text-primary md:text-h3">
            {clear ? 'All clear' : `Nothing new in ${windowWords}`}
          </h2>
          <p className="mt-0.5 max-w-prose text-body-sm text-text-secondary">
            No errors need action in the last {windowWords}.
            {clear ? null : ` ${older} older ${olderNoun} ${older === 1 ? 'is' : 'are'} still open but quiet.`}
          </p>
          {/* One fact per line on a phone (a wrapped row strands its "·"
              at a line end); one dotted row from `sm` up. */}
          <p className="mt-2 flex flex-col gap-y-0.5 font-fw-mono text-caption tabular-nums text-text-tertiary sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
            {meta.map((item, i) => (
              <Fragment key={i}>
                {i > 0 ? (
                  <span aria-hidden className="hidden sm:inline">
                    ·
                  </span>
                ) : null}
                <span>{item}</span>
              </Fragment>
            ))}
          </p>
          {clear ? null : (
            <Link
              href={olderOpenHref}
              className="mt-2 inline-flex items-center text-body-sm font-medium text-accent-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:min-h-11"
            >
              Review the {older} older {olderNoun} →
            </Link>
          )}
        </div>
      </div>
    </Surface>
  );
}
