'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RoundReviewSkeleton } from '@/clubhouse/screens/rounds/RoundsSkeleton';

/**
 * Continue Round for a round that is no longer in progress.
 *
 * The page used to `redirect()` here. That is fine on a plain navigation, but
 * this page is also re-rendered inside the submit action's response: the
 * submit calls `revalidatePath`, so Next re-renders the route the player is on
 * — this one — and by then the round is completed. A `redirect()` thrown in
 * that render surfaced as React #441 (digest NEXT_REDIRECT) and the route's
 * error boundary told a player whose round had just saved "We couldn't load
 * your saved scorecard" (production: 2026-09-06, -07, -15, -20).
 *
 * Rendering a client-side replace instead works in every render context and
 * lands on the same page the success overlay navigates to.
 */
export function CompletedRoundRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  // The review's own skeleton while the replace lands (GAP-R-11): never a flash of the retired Fairway look. The line and
  // the link stay for a screen reader, and for the rare browser where the replace doesn't run.
  return (
    <>
      <RoundReviewSkeleton />
      <p className="ch-sr-only" role="status" aria-live="polite">
        This round is complete. Opening your round…{' '}
        <Link href={href} replace>
          View round
        </Link>
      </p>
    </>
  );
}
