import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { FrontDoorProvider } from '@/clubhouse/routes/front-door';

/**
 * golf_clubhouse_front_door chooses the page that is drawn. `/golf/coach` is a client page and `/golf/coach/pending`
 * sits under it, so the layout hands the flag to the page instead of replacing `children` (which would take the waiting
 * page with it). Flag off, both pages render exactly as before.
 */
export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <FrontDoorProvider on={isClubhouseFrontDoor()}>{children}</FrontDoorProvider>;
}
