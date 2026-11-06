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
import { NoTeam } from '../ui/NoTeam';
import { resolveClubhouseTeam } from './team';
import { loadCoachPracticeHome, loadPlayerPracticeHome, loadPlanForBuilder } from '../data/practice-home';
import { PracticeHome } from '../screens/practice/PracticeHome';
import { PlayerPracticeHome } from '../screens/practice/PlayerPracticeHome';
import { Builder } from '../screens/practice/builder/Builder';
import { isPracticePlansEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';
import '../styles/coachhelm-plan.css';
import '../styles/practice.css';

const OFF = (
  <main className="ch-page" data-ch="practice">
    <EmptyState size="page" title="Practice isn’t on yet" body="Practice plans aren’t on for your team yet. Your practices are on the Calendar." action={<Button href="/golf/dashboard/calendar">Go to Calendar</Button>} />
  </main>
);
const FAILED = (
  <main className="ch-page" data-ch="practice">
    <EmptyState size="page" tone="danger" title="Practice didn’t load" body="Your plans are safe. Check your connection and try again." action={<Button href="/golf/dashboard/practice">Try again</Button>} />
  </main>
);

/** Practice, the tab: the coach's plans with New plan, or the player's published ones. The page checks the flag. */
export async function PracticeHomeRoute({ newPlan }: { newPlan?: boolean }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return (
      <main className="ch-page" data-ch="practice">
        <NoTeam code="CH-13395" coach={session.role !== 'player'} body="Once you’re on a team, practice plans show here." />
      </main>
    );
  }
  if (team.role === 'player') {
    const load = await loadPlayerPracticeHome(team.teamId, team.playerId);
    if (load.status === 'unavailable') return OFF;
    if (load.status === 'failed') return FAILED;
    return <PlayerPracticeHome data={load.data} />;
  }
  const load = await loadCoachPracticeHome(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return FAILED;
  return <PracticeHome data={load.data} askOn={isPracticePlansEnabled()} openNew={!!newPlan} />;
}

/** The builder, a coach's. A player on this address gets their own plan page's address; nothing of a draft reaches them. */
export async function PracticeBuilderRoute({ planId, fill }: { planId: string; fill?: boolean }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  if (session.role === 'player') redirect(`/golf/dashboard/practice/plan/${planId}`);
  const load = await loadPlanForBuilder(planId);
  if (load.status === 'unavailable') return OFF;
  if (load.status !== 'ready') {
    return (
      <main className="ch-page ch-prc-planpage" data-ch="practice-plan">
        <EmptyState size="page" title="This plan isn’t available" body="It may have been removed." action={<Button href="/golf/dashboard/practice">Go to Practice</Button>} />
      </main>
    );
  }
  return <Builder key={`${planId}:${load.data.version}`} data={load.data} autoFill={!!fill} />;
}

export async function PracticePlanRoute({ planId }: { planId: string }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  // A coach who also has a player row is a coach, as the session says.
  const player = session.role === 'player' ? session.player : null;
  const load = player ? await loadPlayerPlan(planId, player.id) : await loadCoachPlan(planId);
  if (load.status !== 'ready') {
    return (
      <main className="ch-page ch-prc-planpage" data-ch="practice-plan">
        <EmptyState size="page" title="This plan isn’t available" body="It may have been removed, or it isn’t published yet." action={<Button href="/golf/dashboard/calendar">Go to Calendar</Button>} />
      </main>
    );
  }
  if (player) {
    const practice = await loadPlayerPractice(planId, player.id);
    if (practice.status === 'ready') return <PlayerPractice data={practice.data} planId={planId} everyone={<><PlanPageActions plan={load.plan} playerPlanId={null} /><PracticePlanSheet plan={load.plan} /></>} />;
  }
  return (
    <main className="ch-page ch-prc-planpage" data-ch="practice-plan">
      <PlanPageActions plan={load.plan} playerPlanId={player ? planId : null} editHref={player ? null : `/golf/dashboard/practice/plan/${planId}/edit`} />
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
