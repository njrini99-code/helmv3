import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseCoachHelmRoute } from '@/clubhouse/routes/coachhelm';

export const metadata: Metadata = {
  title: 'CoachHelm',
  description: 'AI-powered insights, predictions, and focus areas for your golf performance.',
};

/**
 * E-3 (audit 2026-11-19, F-15): a section switch back to CoachHelm within 30 s paints the board it showed, from the
 * router's own copy, instead of its skeleton for 1.5–3 s. CoachHelm is never fetched ahead or refreshed unasked (CH-R1:
 * its loaders record each insight they return as shown), so keeping what was shown is the one way to make a revisit
 * instant: no read runs, nothing new is shown, nothing is recorded. Past 30 s (the Clubhouse freshness window,
 * CH_TAB_FRESH_MS) the page is read again as it opens. A save that revalidates drops the copy.
 */
export const unstable_dynamicStaleTime = 30;

export default async function CoachHelmPage({ searchParams }: { searchParams: Promise<{ view?: string; player?: string; c?: string; section?: string; open?: string; insight?: string; at?: string; from?: string }> }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse CoachHelm: one page for coaches and players, drawn in place (no redirect: see golf-conditional-redirect.test.ts).
  return <ClubhouseCoachHelmRoute {...(await searchParams)} />;
}
