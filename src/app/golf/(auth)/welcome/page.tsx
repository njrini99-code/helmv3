import { ClubhouseWelcomeRoute } from '@/clubhouse/routes/auth';

// Clubhouse's greeting after sign in: the stage is up straight away and the identity streams in (src/clubhouse/routes/auth.tsx).
export default function WelcomePage() {
  return <ClubhouseWelcomeRoute />;
}
