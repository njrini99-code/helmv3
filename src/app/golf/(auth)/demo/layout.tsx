import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { ClubhouseDemoRoute } from '@/clubhouse/routes/auth';

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  // golf_clubhouse_front_door chooses the page that is drawn: flag off renders today's demo page (`children`) untouched;
  // flag on renders Clubhouse's, over the same enterDemo.
  if (isClubhouseFrontDoor()) return <ClubhouseDemoRoute />;
  return children;
}
