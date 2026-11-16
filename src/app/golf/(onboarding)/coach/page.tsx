import type { Metadata } from 'next';
import { CoachOnboard } from '@/clubhouse/screens/onboard/CoachOnboard';

// The tab and the app switcher name the step (GAP-R-08), not "GolfHelm".
export const metadata: Metadata = { title: 'Set up your team' };

// A new head coach's program setup, in Clubhouse: the same entry check (resolveGolfCoachEntry) and
// completeCoachOnboarding. /golf/coach/pending sits under this segment and draws its own page.
export default function GolfCoachOnboardingPage() {
  return <CoachOnboard />;
}
