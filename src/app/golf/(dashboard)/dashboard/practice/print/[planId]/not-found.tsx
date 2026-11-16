import { ClubhouseNotFound } from '@/clubhouse/shell/NotFound';

/**
 * A practice plan that answered with no row on this team, or a malformed id (CH-1306, GAP-S-21, GAP-S-24). A read that
 * failed never lands here: it is "This plan didn’t load" with Try again (GAP-S-03).
 */
export default function PlanNotFound() {
  return <ClubhouseNotFound thing="This plan" back={{ href: '/golf/dashboard/practice', label: 'Back to Practice' }} />;
}
