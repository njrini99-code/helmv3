import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
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
 *
 * COHERENCE_RULING_2026-07-08 Ruling 2 (item 7): this route is the COACH
 * planning surface; the nav already sends players to their canonical
 * `/baseball/player/practice` view (nav-registry.ts's `practice-planner`
 * playerHref). A player landing here directly (bookmark, typed URL) is
 * server-redirected to that canonical surface instead — staff/coach
 * rendering below is unchanged.
 */
export default async function BaseballPracticePage() {
  const context = await getActiveBaseballContext();
  if (context?.activeRole === 'player') {
    redirect('/baseball/player/practice');
  }

  return (
    <div className={fairwayScope('min-h-full')}>
      <PracticePlannerClient />
    </div>
  );
}
