import { ClubhouseNotFound } from '@/clubhouse/shell/NotFound';

/** Practice's 404 (CH-1306, GAP-S-24): an address under Practice that answered with nothing, with the way back to Practice. */
export default function PracticeNotFound() {
  return <ClubhouseNotFound back={{ href: '/golf/dashboard/practice', label: 'Back to Practice' }} />;
}
