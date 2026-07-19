import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getWhatsNewForCoach } from '@/app/golf/actions/whats-new';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayWhatsNew } from '@/components/fairway/pages/whats-new';
import { FeatureUnavailable } from '@/components/fairway';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: "What's New | CoachHelm",
  description: 'Lifecycle activity across your team in the past 7 days',
};

// ============================================================================
// PAGE
// ============================================================================

export default async function WhatsNewPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    // Player session — this is a coach-only feature. #201 root cause: this
    // branch used to `redirect('/golf/dashboard?message=…')` — a cross-page
    // hop whose query-string explanation the destination `/golf/dashboard`
    // route (`searchParams: Promise<{ range?: string }>`) never reads, so the
    // "coach-only feature" message silently vanished, and redirecting a
    // player away to the full dashboard (its own heavy data fetch: cached
    // dashboard payload, hub summary, join requests) opened a second,
    // unrelated render path where a real error could surface before the hop
    // finished. Every OTHER coach-only page in this app (Patterns, Insights,
    // Development) already solves "player hit a coach page" by rendering
    // `<FeatureUnavailable>` IN PLACE instead of redirecting — same route,
    // same request, nothing new to fetch or render, message always visible.
    // Adopting that proven pattern here removes the redirect (and whatever
    // it was crashing on) entirely rather than papering over it.
    return (
      <FeatureUnavailable
        title="What's New"
        message={
          player
            ? "What's New is a coach-only feature. Players can see their own activity from CoachHelm."
            : 'No coach or player profile found. Please complete onboarding.'
        }
        actionHref={player ? '/golf/dashboard/coachhelm' : '/golf/dashboard'}
        actionLabel={player ? 'Open CoachHelm' : 'Back to Dashboard'}
      />
    );
  }

  const result = await getWhatsNewForCoach();

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayWhatsNew
        success={result.success}
        error={result.error}
        items={result.items}
        truncated={result.truncated}
      />
    </div>
  );
}
