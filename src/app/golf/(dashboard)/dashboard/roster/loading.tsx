import { RosterSkeleton } from '@/clubhouse/screens/roster/RosterSkeleton';
// The Roster sheet is imported here, on the server, not by the client skeleton: a sheet a client component imports lands
// ahead of the shared sheets (controls.css) in the page's styles and can change the loaded page (Practice, 6dd3d9ec4c).
import '@/clubhouse/styles/roster.css';

export default function Loading() {
  return <RosterSkeleton />;
}
