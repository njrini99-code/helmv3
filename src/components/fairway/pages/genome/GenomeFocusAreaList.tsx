'use client';

/**
 * This player's open focus areas, with the outcome capture loop intact
 * (Improved / No change / Worsened → recordFocusAreaOutcome → refresh).
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FocusAreaCard, type FocusAreaCardData } from '@/components/fairway/pages/coachhelm/FocusAreaCard';
import { InsufficientData } from '@/components/fairway/feedback';
import { recordFocusAreaOutcome, type FocusAreaOutcome } from '@/app/golf/actions/development';

export function GenomeFocusAreaList({
  playerId,
  focusAreas,
  readFailed = false,
}: {
  playerId: string;
  focusAreas: FocusAreaCardData[];
  readFailed?: boolean;
}) {
  const router = useRouter();
  // A completed area with no recorded verdict stays here: its row is where the
  // "How did it go?" capture lives (#1290).
  const shown = focusAreas.filter((fa) => fa.status !== 'completed' || !fa.outcome_status);

  async function handleRecordOutcome(fa: FocusAreaCardData, outcome: FocusAreaOutcome) {
    const res = await recordFocusAreaOutcome(fa.id, outcome);
    if (res.success) router.refresh();
    return res;
  }

  return (
    <section aria-labelledby="genome-focus" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="genome-focus" className="font-fw-sans text-h3 text-text-primary">
          Focus areas
        </h2>
        <Link
          href={`/golf/dashboard/intelligence?view=players&player=${playerId}`}
          className="-mr-2 inline-flex h-11 items-center rounded-fw-md px-2 font-fw-sans text-body-sm font-medium text-accent-700 active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Manage
        </Link>
      </div>
      {readFailed ? (
        <p className="border-t border-border-strong pt-3 font-fw-sans text-body-sm text-text-secondary">
          Focus areas couldn&rsquo;t be loaded. Refresh to try again.
        </p>
      ) : shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 border-t border-border-strong pt-4 lg:grid-cols-2">
          {shown.map((fa, i) => (
            <FocusAreaCard
              key={fa.id}
              focusArea={fa}
              // eslint-disable-next-line jsx-a11y/aria-role
              role="coach"
              index={i}
              onRecordOutcome={handleRecordOutcome}
            />
          ))}
        </div>
      ) : (
        <div className="border-t border-border-strong pt-3">
          <InsufficientData
            compact
            title="No open focus areas"
            description="Open a skill's evidence above and make it a focus area to close the loop."
          />
        </div>
      )}
    </section>
  );
}
