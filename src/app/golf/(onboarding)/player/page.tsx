import type { Metadata } from 'next';
import { ClubhousePlayerOnboardRoute } from '@/clubhouse/routes/onboard';

// The tab and the app switcher name the step (GAP-R-08), not "GolfHelm".
export const metadata: Metadata = { title: 'Set up your profile' };

// A new player's questions after the account ("Your game", the photo, the member card), over the same
// completePlayerOnboarding with the same fields and join code (?joinCode=).
export default function PlayerOnboardingPage({ searchParams }: { searchParams?: Promise<{ joinCode?: string | string[] }> }) {
  return <ClubhousePlayerOnboardRoute searchParams={searchParams} />;
}
