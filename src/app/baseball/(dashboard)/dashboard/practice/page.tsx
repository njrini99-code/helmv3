import { PracticePlannerClient } from '@/components/baseball/practice-planner/PracticePlannerClient';
import { fairwayScope } from '@/lib/redesign/flag';

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
 *
 * `PracticePlannerClient` renders "The Living Annual" kit (P4.12.a): no
 * `isRedesignEnabled` fork (the shell flag already gates the whole subtree,
 * per the command-center precedent), always the kit version, wrapped in the
 * `.fairway-ds` scope exactly like `command-center/page.tsx`.
 */
export default function BaseballPracticePage() {
  return (
    <div className={fairwayScope('min-h-full')}>
      <PracticePlannerClient />
    </div>
  );
}
