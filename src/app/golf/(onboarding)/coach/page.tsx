import { CoachOnboard } from '@/clubhouse/screens/onboard/CoachOnboard';

// A new head coach's program setup, in Clubhouse: the same entry check (resolveGolfCoachEntry) and
// completeCoachOnboarding. /golf/coach/pending sits under this segment and draws its own page.
export default function GolfCoachOnboardingPage() {
  return <CoachOnboard />;
}
