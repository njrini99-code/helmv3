import { ClubhouseNotFound } from '@/clubhouse/shell/NotFound';

/** A drill that isn't on this team's bank, or a malformed id (CH-1306, GAP-S-21, GAP-S-24), with the way back to Drills. */
export default function DrillNotFound() {
  return <ClubhouseNotFound thing="This drill" back={{ href: '/golf/dashboard/practice/drills', label: 'Back to Drills' }} />;
}
