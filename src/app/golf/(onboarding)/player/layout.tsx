import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { ClubhousePlayerOnboardRoute } from '@/clubhouse/routes/onboard';

/**
 * golf_clubhouse_front_door chooses the page that is drawn: flag off renders
 * today's player onboarding (`children`) untouched; flag on renders
 * Clubhouse's, which calls the same completePlayerOnboarding with the same
 * fields and join code.
 */
export default function PlayerOnboardingLayout({ children }: { children: React.ReactNode }) {
  if (isClubhouseFrontDoor()) return <ClubhousePlayerOnboardRoute />;
  return children;
}
