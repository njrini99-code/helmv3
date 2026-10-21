import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { FrontDoorProvider } from '@/clubhouse/routes/front-door';

/**
 * golf_clubhouse_front_door chooses the page that is drawn. `/golf/join` is a client page and `/golf/join/[code]` sits
 * under it, so the layout hands the flag to the page instead of replacing `children` (which would take the code route
 * with it). Flag off, both pages render exactly as before.
 */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <FrontDoorProvider on={isClubhouseFrontDoor()}>{children}</FrontDoorProvider>;
}
