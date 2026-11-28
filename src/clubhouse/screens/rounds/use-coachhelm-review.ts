'use client';

import { useEffect, useRef } from 'react';
import { generateAndStoreRoundReview } from '@/app/golf/actions/round-review-system';
import { chReport } from '../../lib/track';

/**
 * The round's CoachHelm review (golf_round_reviews), written once when a completed round's review opens without one.
 * Fairway's review page did this on open (`useRoundReviewV2`'s auto-generate); that page was deleted with Fairway on
 * Nov 15 and nothing in Clubhouse asked since, so no review was written after it (the Bridge's "Reviews this week"
 * counts these rows, and a review a coach's visit writes tells the player it is ready).
 *
 * `ifMissing` makes the call idempotent (DATA-05: a stored review comes back as stored, never recomputed), and a first
 * write is not rate-limited, so a coach opening several unreviewed rounds in a row is fine. The ref only keeps one
 * mounted screen from asking twice (StrictMode's second effect), as `useRoundRecap` does. The screen draws nothing from
 * the answer: the review is written for the people and pages that read it later.
 *
 * A failure is quiet for the viewer. The action logs its own failures (it is observed as `round_review_ai`), and an
 * expected refusal (not completed, not theirs) needs no report; a throw (a dropped request) never reaches the action's
 * log, so it is reported. The next visit asks again because nothing was stored.
 */
export function useCoachHelmReview(roundId: string, playerId: string, pending: boolean): void {
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!pending || !playerId) return;
    if (askedFor.current === roundId) return;
    askedFor.current = roundId;
    generateAndStoreRoundReview(roundId, playerId, { ifMissing: true }).catch((err: unknown) =>
      chReport(err, { surface: 'rounds.review', action: 'rounds.coachhelm-review', severity: 'low' }),
    );
  }, [roundId, playerId, pending]);
}
