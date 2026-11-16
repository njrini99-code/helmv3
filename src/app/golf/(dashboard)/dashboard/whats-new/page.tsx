import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { NotRebuilt } from '@/clubhouse/shell/NotRebuilt';
import { ClubhouseWhatsNewRoute } from '@/clubhouse/routes/whats-new';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: "What's New",
  description: 'Lifecycle activity across your team in the past 7 days',
};

// ============================================================================
// PAGE
// ============================================================================

export default async function WhatsNewPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
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
    // the coach-only state IN PLACE instead of redirecting — same route,
    // same request, nothing new to fetch or render, message always visible.
    // Adopting that proven pattern here removes the redirect (and whatever
    // it was crashing on) entirely rather than papering over it.
    // The Clubhouse coach-only page (GAP-R-11), never the retired Fairway one: same route, rendered in place.
    return <NotRebuilt label="What’s new" coachOnly />;
  }

  // Clubhouse What's new: the coach's week of CoachHelm activity.
  return <ClubhouseWhatsNewRoute />;
}
