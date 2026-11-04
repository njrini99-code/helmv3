import { redirect } from 'next/navigation';
import { loadCoachPlan, loadPlayerPlan } from '../data/practice-plan';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { PracticePlanSheet } from '../screens/coachhelm/plan/sheet/PracticePlanSheet';
import { PlanPageActions } from '../screens/coachhelm/plan/PlanPageActions';
import '../styles/coachhelm-plan.css';

export async function PracticePlanRoute({ planId }: { planId: string }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  const load = session.player ? await loadPlayerPlan(planId, session.player.id) : await loadCoachPlan(planId);
  if (load.status !== 'ready') redirect('/golf/dashboard/calendar');
  return (
    <main className="ch-page" data-ch="practice-plan">
      <PlanPageActions plan={load.plan} playerPlanId={session.player ? planId : null} />
      <PracticePlanSheet plan={load.plan} />
    </main>
  );
}
