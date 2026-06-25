import { PracticePlannerClient } from '@/components/baseball/practice-planner/PracticePlannerClient';

export const metadata = {
  title: 'Practice Planner',
};

/**
 * Practice Planner Lite (Wave 8).
 *
 * The page itself is a thin server boundary; data is fetched through the
 * RLS-governed `getTeamPractices` action inside the client component (so staff
 * see all team practices and players see only published ones, with no duplicate
 * auth logic here). All mutations are capability-gated server actions.
 */
export default function BaseballPracticePage() {
  return <PracticePlannerClient />;
}
