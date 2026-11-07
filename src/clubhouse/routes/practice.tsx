import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { practiceTables } from '@/lib/golf/practice-db';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { PlanFormat } from '../screens/coachhelm/plan/format/PlanFormat';
import { loadCoachPlan, loadPlanDrills, loadPlayerPlan, loadPlayerPractice } from '../data/practice-plan';
import { PrintStudio } from '../screens/practice/PrintStudio';
import { CoachPlanBar } from '../screens/practice/CoachPlanBar';
import { PlanRun } from '../screens/practice/PlanRun';
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
import type { PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import { loadDrill, loadDrills, loadGroups, loadTemplates } from '../data/practice-library';
import { DrillPage, DrillsPage, GroupsPage, TemplatesPage } from '../screens/practice/LibraryPages';
import { PLAN_STARTERS } from '../screens/practice/starters';
import '../styles/coachhelm-plan.css';
import '../styles/practice.css';

const OFF = (
  <main className="ch-page" data-ch="practice">
    <EmptyState size="page" title="Practice isn’t on yet" body="Practice plans aren’t on for your team yet. Your practices are on the Calendar." action={<Button href="/golf/dashboard/calendar">Go to Calendar</Button>} />
  </main>
);
const FAILED = (
  <main className="ch-page" data-ch="practice">
    <EmptyState size="page" tone="danger" title="Practice didn’t load" body="Your plans are safe. Try again." action={<Button href="/golf/dashboard/practice">Try again</Button>} />
  </main>
);

/** Practice, the tab: the coach's plans with New plan, or the player's published ones. The page checks the flag. */
export async function PracticeHomeRoute({ newPlan, template, event }: { newPlan?: boolean; template?: string; event?: string }) {
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
  // Use on a template: New plan opens with it as the start. An unknown one just opens New plan.
  const starter = template ? PLAN_STARTERS.find((t) => t.id === template) : undefined;
  let from: { name: string; body: PlanBodyV2 } | null = starter ? { name: starter.name, body: starter.body } : null;
  if (template && !starter) {
    const saved = await loadTemplates(team.teamId);
    const hit = saved.status === 'ready' ? saved.data.find((t) => t.id === template) : undefined;
    if (hit) from = { name: hit.name, body: hit.body };
  }
  return <PracticeHome data={load.data} openNew={!!newPlan} newEvent={event ?? null} template={from} />;
}

/** The coach's team for a Practice tab; a player goes to their own Practice. */
async function coachTeam(): Promise<{ teamId: string } | null> {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  if (session.role === 'player') redirect('/golf/dashboard/practice');
  const team = await resolveClubhouseTeam(session);
  return team && team.role !== 'player' ? { teamId: team.teamId } : null;
}
const NO_TEAM = (
  <main className="ch-page" data-ch="practice">
    <NoTeam code="CH-13395" coach body="Once you’re on a team, practice plans show here." />
  </main>
);

export async function PracticeDrillsRoute() {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadDrills(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return FAILED;
  return <DrillsPage teamId={team.teamId} team={load.data.team} library={load.data.library} />;
}

export async function PracticeDrillRoute({ drillId }: { drillId: string }) {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadDrill(team.teamId, drillId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return FAILED;
  if (!load.data) {
    return (
      <main className="ch-page" data-ch="practice">
        <EmptyState size="page" title="This drill isn’t available" body="It may have been archived." action={<Button href="/golf/dashboard/practice/drills">Back to Drills</Button>} />
      </main>
    );
  }
  return <DrillPage teamId={team.teamId} drill={load.data} />;
}

export async function PracticeGroupsRoute() {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadGroups(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return FAILED;
  return <GroupsPage teamId={team.teamId} groups={load.data.groups} roster={load.data.roster} />;
}

export async function PracticeTemplatesRoute() {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadTemplates(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return FAILED;
  return <TemplatesPage teamId={team.teamId} templates={load.data} />;
}

/** The print studio, a coach's (N-00 4.14). A plan that won't load says so rather than printing nothing. */
export async function PracticePrintRoute({ planId }: { planId: string }) {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const [load, drills] = await Promise.all([loadCoachPlan(planId), loadPlanDrills(planId).catch(() => [])]);
  if (load.status !== 'ready') {
    return (
      <main className="ch-page" data-ch="practice">
        <EmptyState size="page" title="This plan isn’t available" body="It may have been removed." action={<Button href="/golf/dashboard/practice">Back to Practice</Button>} />
      </main>
    );
  }
  return <PrintStudio plan={load.plan} drills={drills} draft={load.coach?.status.status === 'draft'} planHref={`/golf/dashboard/practice/plan/${planId}`} />;
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
      <PlanPageActions plan={load.plan} playerPlanId={player ? planId : null} coachBar={!player && load.coach ? <CoachPlanBar status={load.coach.status} /> : null} />
      {!player && load.coach?.start && load.coach.status.status === 'published' && <PlanRun planId={planId} title={load.coach.status.title} version={load.coach.status.version} body={load.coach.body} start={load.coach.start} zone={load.coach.zone} serverNow={Date.now()} />}
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
