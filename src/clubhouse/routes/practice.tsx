import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { FAILURE_COPY } from '../ui/Notices';
import { RefreshNotice } from '../ui/RefreshNotice';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/utils/uuid';
import { createClient } from '@/lib/supabase/server';
import { practiceTables } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { chLogServer } from '../lib/track-server';
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
/**
 * A Practice page whose read failed (GAP-S-06): named for the page that failed, the one failure line (FAILURE_COPY), and
 * no action of its own. The danger EmptyState brings PageRetry, which re-runs this page in place; a second "Try again"
 * that went to Practice home was the old shape.
 */
const failed = (what: string, className = 'ch-page') => (
  <main className={className} data-ch="practice">
    <EmptyState size="page" tone="danger" title={`${what} didn’t load`} body={FAILURE_COPY.page} />
  </main>
);

/** The team's sheet format didn't read (GAP-S-03): the plan shows in the standard format, and says so. */
const FORMAT_UNREAD = <RefreshNotice code="CH-13286" title="Your plan format didn’t load" body="This plan is shown in the standard format for now. Nothing you saved is lost. Try again." />;

/** A malformed id is a wrong link, not an outage (GAP-S-21, GAP-R-15): the Practice not-found page, with its way back. */
function idOrNotFound(id: string): string {
  if (!isUuid(id)) notFound();
  return id;
}

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
    if (load.status === 'failed') return failed('Practice');
    return <PlayerPracticeHome data={load.data} />;
  }
  const load = await loadCoachPracticeHome(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return failed('Practice');
  // Use on a template: New plan opens with it as the start. An unknown one just opens New plan; one whose read failed
  // opens New plan too, and the sheet says the template didn't load (GAP-S-37) instead of starting blank unsaid.
  const starter = template ? PLAN_STARTERS.find((t) => t.id === template) : undefined;
  let from: { name: string; body: PlanBodyV2 } | null = starter ? { name: starter.name, body: starter.body } : null;
  let templateFailed = false;
  if (template && !starter) {
    const saved = await loadTemplates(team.teamId);
    templateFailed = saved.status === 'failed';
    const hit = saved.status === 'ready' ? saved.data.find((t) => t.id === template) : undefined;
    if (hit) from = { name: hit.name, body: hit.body };
  }
  return <PracticeHome data={load.data} openNew={!!newPlan} newEvent={event ?? null} template={from} templateFailed={templateFailed} />;
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
  if (load.status === 'failed') return failed('Drills');
  return <DrillsPage teamId={team.teamId} team={load.data.team} library={load.data.library} />;
}

export async function PracticeDrillRoute({ drillId }: { drillId: string }) {
  idOrNotFound(drillId);
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadDrill(team.teamId, drillId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return failed('This drill');
  // No such drill on this team: the Practice not-found page (one not-found voice, GAP-S-24).
  if (!load.data) notFound();
  return <DrillPage teamId={team.teamId} drill={load.data} />;
}

export async function PracticeGroupsRoute() {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadGroups(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return failed('Groups');
  return <GroupsPage teamId={team.teamId} groups={load.data.groups} roster={load.data.roster} />;
}

export async function PracticeTemplatesRoute() {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const load = await loadTemplates(team.teamId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return failed('Templates');
  return <TemplatesPage teamId={team.teamId} templates={load.data} />;
}

/** The print studio, a coach's (N-00 4.14). A plan that won't load says so rather than printing nothing. */
export async function PracticePrintRoute({ planId }: { planId: string }) {
  idOrNotFound(planId);
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  // A drills read that fails is not "this plan has no drills": the studio says the appendix is missing instead of printing a plan that looks whole.
  const [load, drills] = await Promise.all([loadCoachPlan(planId), loadPlanDrills(planId).then((list) => ({ list, unread: false }), () => ({ list: [], unread: true }))]);
  if (load.status === 'unavailable') return OFF;
  // A read that failed is never "it may have been removed" (GAP-S-03); only a plan that answered with nothing is not found.
  if (load.status === 'failed') return failed('This plan');
  if (load.status !== 'ready') notFound();
  return <PrintStudio plan={load.plan} drills={drills.list} drillsUnread={drills.unread} draft={load.coach?.status.status === 'draft'} planHref={`/golf/dashboard/practice/plan/${planId}`} />;
}

/** The builder, a coach's. A player on this address gets their own plan page's address; nothing of a draft reaches them. */
export async function PracticeBuilderRoute({ planId, fill }: { planId: string; fill?: boolean }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  idOrNotFound(planId);
  if (session.role === 'player') redirect(`/golf/dashboard/practice/plan/${planId}`);
  const load = await loadPlanForBuilder(planId);
  if (load.status === 'unavailable') return OFF;
  if (load.status === 'failed') return failed('This plan', 'ch-page ch-prc-planpage');
  if (load.status !== 'ready') notFound();
  return <Builder key={`${planId}:${load.data.version}`} data={load.data} autoFill={!!fill} />;
}

export async function PracticePlanRoute({ planId }: { planId: string }) {
  idOrNotFound(planId);
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/dashboard/calendar');
  // A coach who also has a player row is a coach, as the session says.
  const player = session.role === 'player' ? session.player : null;
  const load = player ? await loadPlayerPlan(planId, player.id) : await loadCoachPlan(planId);
  // Practice not on this database yet is its own state, the one the tab shows: never "it may have been removed".
  if (load.status === 'unavailable') return OFF;
  // A failed read is "didn't load" with Try again (GAP-S-03); only an answer of no plan (deleted, another team's, or not
  // published yet for a player) is the not-found page.
  if (load.status === 'failed') return failed('This plan', 'ch-page ch-prc-planpage');
  if (load.status !== 'ready') notFound();
  if (player) {
    const practice = await loadPlayerPractice(planId, player.id);
    if (practice.status === 'ready') return <PlayerPractice data={practice.data} planId={planId} everyone={<>{load.formatFailed && FORMAT_UNREAD}<PlanPageActions plan={load.plan} playerPlanId={null} inPage /><PracticePlanSheet plan={load.plan} /></>} />;
  }
  return (
    <main className="ch-page ch-prc-planpage" data-ch="practice-plan" aria-labelledby="ch-prc-plan-title">
      {load.formatFailed && FORMAT_UNREAD}
      <PlanPageActions plan={load.plan} playerPlanId={player ? planId : null} printHref={player ? null : `/golf/dashboard/practice/print/${planId}`} coachBar={!player && load.coach ? <CoachPlanBar status={load.coach.status} after={load.coach.start && load.coach.status.status === 'published' ? <PlanRun planId={planId} title={load.coach.status.title} version={load.coach.status.version} body={load.coach.body} start={load.coach.start} zone={load.coach.zone} serverNow={Date.now()} /> : null} /> : null} />
      <PracticePlanSheet plan={load.plan} />
    </main>
  );
}

/**
 * Practice › Plan format, coach only. The current format's name and the published count are read here; a missing table
 * (or none set) reads as today's standard. A read that FAILS is said (GAP-S-07): never "GolfHelm standard" or "0
 * published" standing in for what couldn't be read, and no new format can be set over one that didn't read. A player
 * goes to their own Practice, as every other Practice page sends them (GAP-R-15), and a coach with no team gets NoTeam,
 * not a silent jump to Calendar.
 */
export async function PlanFormatRoute() {
  const team = await coachTeam();
  if (!team) return NO_TEAM;
  const sb = await createClient();
  const [format, published, next] = await Promise.all([
    practiceTables(sb).from('golf_practice_plan_formats').select('name').eq('team_id', team.teamId).maybeSingle(),
    practiceTables(sb).from('golf_practice_plans').select('id', { count: 'exact', head: true }).eq('team_id', team.teamId).not('published_version', 'is', null),
    // S-FMT.see: the newest plan, shown in the format. A missing table reads as none, and the link stays away.
    practiceTables(sb).from('golf_practice_plans').select('id, title').eq('team_id', team.teamId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const unread = (e: { code?: string } | null) => !!e && !isPracticeMissing(e.code);
  const parts: Array<'format' | 'published'> = [];
  if (unread(format.error)) parts.push('format');
  if (unread(published.error)) parts.push('published');
  if (format.error && parts.includes('format')) chLogServer('practice.format', 'format', format.error, 'practice_plans');
  if (published.error && parts.includes('published')) chLogServer('practice.format', 'published count', published.error, 'practice_plans');
  const plan = next.error ? null : (next.data as { id: string; title?: string } | null);
  return (
    <PlanFormat
      teamId={team.teamId}
      unread={parts}
      current={(format.data as { name?: string } | null)?.name ?? 'GolfHelm standard'}
      published={parts.includes('published') ? null : (published.count ?? 0)}
      see={plan ? { label: `See ${plan.title ?? 'your plan'} in it`, href: `/golf/dashboard/practice/plan/${plan.id}` } : null}
    />
  );
}
