import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { practiceTables } from '@/lib/golf/practice-db';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { PlanFormat } from '../screens/coachhelm/plan/format/PlanFormat';
import { loadCoachPlan, loadPlayerPlan, loadPlayerPractice } from '../data/practice-plan';
import { PlayerPractice } from '../screens/coachhelm/plan/player/PlayerPractice';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { PracticePlanSheet } from '../screens/coachhelm/plan/sheet/PracticePlanSheet';
import { PlanPageActions } from '../screens/coachhelm/plan/PlanPageActions';
import '../styles/coachhelm-plan.css';

export async function PracticePlanRoute({ planId }: { planId: string }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  // A coach who also has a player row is a coach, as the session says.
  const player = session.role === 'player' ? session.player : null;
  const load = player ? await loadPlayerPlan(planId, player.id) : await loadCoachPlan(planId);
  if (load.status !== 'ready') {
    return (
      <main className="ch-page" data-ch="practice-plan">
        <EmptyState size="page" title="This plan isn’t available" body="It may have been removed, or it isn’t published yet." action={<Button href="/golf/dashboard/calendar">Go to Calendar</Button>} />
      </main>
    );
  }
  if (player) {
    const practice = await loadPlayerPractice(planId, player.id);
    if (practice.status === 'ready') return <PlayerPractice data={practice.data} planId={planId} everyone={<PracticePlanSheet plan={load.plan} />} />;
  }
  return (
    <main className="ch-page" data-ch="practice-plan">
      <PlanPageActions plan={load.plan} playerPlanId={player ? planId : null} />
      <PracticePlanSheet plan={load.plan} />
    </main>
  );
}

/** Practice › Plan format, coach only. The current format's name and the published count are read here; a missing table reads as today's standard. */
export async function PlanFormatRoute() {
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) redirect('/golf/dashboard/calendar');
  const [{ data: format }, { count }, { data: next }] = await Promise.all([
    practiceTables(sb).from('golf_practice_plan_formats').select('name').eq('team_id', ctx.team_id).maybeSingle(),
    practiceTables(sb).from('golf_practice_plans').select('id', { count: 'exact', head: true }).eq('team_id', ctx.team_id).not('published_version', 'is', null),
    // S-FMT.see: the newest plan, shown in the format. A missing table reads as none, and the link stays away.
    practiceTables(sb).from('golf_practice_plans').select('id, title').eq('team_id', ctx.team_id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return <PlanFormat teamId={ctx.team_id} current={(format as { name?: string } | null)?.name ?? 'GolfHelm standard'} published={count ?? 0} see={next ? { label: `See ${(next as { title?: string }).title ?? 'your plan'} in it`, href: `/golf/dashboard/practice/plan/${(next as { id: string }).id}` } : null} />;
}
