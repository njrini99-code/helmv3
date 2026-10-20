import type { Metadata } from 'next';
import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { ClubhouseSignInRoute } from '@/clubhouse/routes/auth';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your GolfHelm account to access your team dashboard.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // golf_clubhouse_front_door chooses the page that is drawn: flag off renders
  // today's login page (`children`) untouched; flag on renders Clubhouse's,
  // over the same loginAction.
  if (isClubhouseFrontDoor()) return <ClubhouseSignInRoute />;
  return children;
}
