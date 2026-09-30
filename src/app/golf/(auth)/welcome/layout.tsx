import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { ClubhouseWelcomeRoute } from '@/clubhouse/routes/auth';

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // golf_clubhouse_front_door chooses the page that is drawn: flag off renders
  // today's welcome page (`children`) untouched; flag on renders Clubhouse's.
  if (isClubhouseFrontDoor()) return <ClubhouseWelcomeRoute />;
  return children;
}
