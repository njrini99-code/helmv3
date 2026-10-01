import 'server-only';
import { Lock, SearchX, Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import { loadQualifierDetail, loadQualifierForm, loadQualifierList, loadQualifierSelection } from '../data/qualifiers';
import { QualifiersList } from '../screens/qualifiers/QualifiersList';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { QualifierSelection } from '../screens/qualifiers/QualifierSelection';
import { RefreshNotice } from '../ui/RefreshNotice';
import { EmptyState } from '../ui/States';
import { Button } from '../ui/Button';
import { resolveClubhouseTeam } from './team';
import '../styles/qualifiers.css';

export type ChQView = 'list' | 'mine' | 'detail' | 'new' | 'edit' | 'selection';

/**
 * Qualifiers in Clubhouse, every address rendered in place (D-23, never a
 * redirect):
 *   /qualifiers            list, coach and player
 *   /my-qualifiers         a player's own entries (a coach sees the list)
 *   /qualifiers/[id]       detail, coach and player
 *   /qualifiers/new        create, coach only
 *   /qualifiers/[id]/edit  edit, coach only
 *   /qualifiers/[id]/selection  Manage selections, coach only
 */
export async function ClubhouseQualifiersRoute({ view, id }: { view: ChQView; id?: string }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) return <QualifiersNoTeam coach={!!session.coach} />;
  const playerId = team.role === 'player' ? team.playerId : null;

  if (view === 'list' || view === 'mine') {
    const mode = view === 'mine' && team.role === 'player' ? 'mine' : 'all';
    return <QualifiersList data={await loadQualifierList({ role: team.role, teamId: team.teamId, playerId, mode })} />;
  }

  if ((view === 'new' || view === 'edit' || view === 'selection') && team.role !== 'coach') return <CoachOnly view={view} id={id} />;
  if (view === 'new') {
    const form = await loadQualifierForm({ teamId: team.teamId, qualifierId: null });
    return form ? <QualifierForm data={form} /> : <NotFound />;
  }
  if (!id || !isUuid(id)) return <NotFound />;
  if (view === 'selection') {
    const sel = await loadQualifierSelection({ teamId: team.teamId, qualifierId: id });
    if (sel.kind === 'missing') return <NotFound />;
    // CH-09218: a failed read is never shown as "not on your team".
    if (sel.kind === 'error') return <SelectionDidNotLoad />;
    return <QualifierSelection data={sel.data} />;
  }
  if (view === 'edit') {
    const form = await loadQualifierForm({ teamId: team.teamId, qualifierId: id });
    return form ? <QualifierForm data={form} /> : <NotFound />;
  }
  const detail = await loadQualifierDetail({ role: team.role, teamId: team.teamId, playerId, qualifierId: id });
  if (!detail) return <NotFound />;
  // The standings, facts and squad are sent now; the courses and the scorecards follow as a promise the sections read in place (owner rule 6).
  const { secondary, ...core } = detail;
  return <QualifierDetail data={core} secondary={secondary} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="ch-qf">{children}</main>
  );
}

export function QualifiersNoTeam({ coach }: { coach: boolean }) {
  return (
    <Frame>
      <EmptyState
        size="page"
        code="CH-09309"
        icon={Users}
        title="You aren’t on a team yet"
        body={coach ? 'Qualifiers fill in once your team is set up.' : 'Your team’s qualifiers show here once a coach adds you to a team roster.'}
      />
    </Frame>
  );
}

function NotFound() {
  return (
    <Frame>
      <EmptyState
        size="page"
        code="CH-09310"
        icon={SearchX}
        title="That qualifier isn’t on your team"
        body="It may have been deleted, or the link is from another team."
        action={
          <Button size="sm" href="/golf/dashboard/qualifiers">
            Back to qualifiers
          </Button>
        }
      />
    </Frame>
  );
}

const COACH_ONLY_TITLE: Record<'new' | 'edit' | 'selection', string> = {
  new: 'Only coaches create qualifiers',
  edit: 'Only coaches edit qualifiers',
  selection: 'Only coaches pick the squad',
};

function CoachOnly({ view, id }: { view: 'new' | 'edit' | 'selection'; id?: string }) {
  const back = view !== 'new' && id && isUuid(id);
  return (
    <Frame>
      <EmptyState
        size="page"
        code="CH-09311"
        icon={Lock}
        title={COACH_ONLY_TITLE[view]}
        body={
          view === 'selection'
            ? 'You’ll see the squad on the qualifier once your coach confirms it.'
            : 'You can see your team’s qualifiers and where you stand in the ones you’re entered in.'
        }
        action={
          <Button size="sm" href={back ? `/golf/dashboard/qualifiers/${id}` : '/golf/dashboard/qualifiers'}>
            {back ? 'Back to the qualifier' : 'See your qualifiers'}
          </Button>
        }
      />
    </Frame>
  );
}

function SelectionDidNotLoad() {
  return (
    <Frame>
      <RefreshNotice code="CH-09218" title="Selections didn’t load." body="Nothing has changed. Try again; the error has been reported." />
    </Frame>
  );
}
