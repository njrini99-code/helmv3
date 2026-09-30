import type { Metadata } from 'next';
import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { ClubhouseSignupRoute } from '@/clubhouse/routes/onboard';

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create your GolfHelm account to join your team and start tracking performance.',
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // golf_clubhouse_front_door chooses the page that is drawn: flag off renders
  // today's sign-up (`children`) untouched; flag on renders Clubhouse's, over
  // the same gate, signupAction and onboarding actions.
  if (isClubhouseFrontDoor()) return <ClubhouseSignupRoute />;
  return children;
}
