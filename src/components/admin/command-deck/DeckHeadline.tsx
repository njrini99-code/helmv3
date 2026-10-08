import type { PostureSentence } from '@/lib/admin/command-deck/posture';
import type { AllClearVerdict } from '@/lib/admin/incidents/all-clear';
import { RELEASE_WATCH_LABEL } from '@/lib/admin/incidents/release-context';
import { AllClearBanner } from '@/app/admin/_components/AllClearBanner';
import { PostureSentenceBanner } from './PostureSentence';

/** Where the Overview sends "Review the N older errors": the Incidents tab's
 *  own "Still open, quiet for 72h+" section. */
export const OLDER_OPEN_HREF = '/admin/errors#stale-unresolved-heading';

/**
 * The first line of the Command Deck: the all-clear banner when
 * `deriveAllClear` granted one, the posture sentence otherwise.
 *
 * One or the other, never both. On a calm board the posture sentence read
 * "HEALTHY · Production healthy · Release … · No repair currently running ·
 * No decisions waiting on you", which is five clauses to say one thing. The
 * banner says it once and keeps the two facts that still matter on a calm
 * day (the release state and any decision waiting) as quiet meta. Every
 * other state (blind, partial, degraded, critical, a fresh defect posture
 * cannot see) keeps the posture sentence exactly as before.
 */
export function DeckHeadline({
  verdict,
  posture,
  decisionCount,
}: {
  verdict: AllClearVerdict;
  posture: PostureSentence;
  /** `null` when the decision inbox could not be read: said, never hidden. */
  decisionCount: number | null;
}) {
  if (verdict.state === 'none') return <PostureSentenceBanner posture={posture} />;
  return <AllClearBanner claim={verdict} details={deckDetails(posture, decisionCount)} olderOpenHref={OLDER_OPEN_HREF} />;
}

function deckDetails(posture: PostureSentence, decisionCount: number | null): string[] {
  const watch = RELEASE_WATCH_LABEL[posture.releaseWatch].toLowerCase();
  const details = [posture.releaseSha ? `release ${posture.releaseSha.slice(0, 7)} ${watch}` : `release ${watch}`];
  if (decisionCount === null) {
    details.push('decision inbox unread');
  } else if (decisionCount > 0) {
    details.push(`${decisionCount} ${decisionCount === 1 ? 'decision' : 'decisions'} waiting on you`);
  }
  return details;
}
