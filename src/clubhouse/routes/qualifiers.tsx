import 'server-only';
import { Lock, SearchX, Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import { loadQualifierDetail, loadQualifierForm, loadQualifierList } from '../data/qualifiers';
import { QualifiersList } from '../screens/qualifiers/QualifiersList';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { EmptyState } from '../ui/States';
import { Button } from '../ui/Button';
import { resolveClubhouseTeam } from './team';
import '../styles/qualifiers.css';

export type ChQView = 'list' | 'mine' | 'detail' | 'new' | 'edit';

/**
 * Qualifiers in Clubhouse, every address rendered in place (D-23, never a
 * redirect):
 *   /qualifiers            list, coach and player
 *   /my-qualifiers         a player's own entries (a coach sees the list)
 *   /qualifiers/[id]       detail, coach and player
 *   /qualifiers/new        create, coach only
 *   /qualifiers/[id]/edit  edit, coach only
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

  if ((view === 'new' || view === 'edit') && team.role !== 'coach') return <CoachOnly edit={view === 'edit'} id={id} />;
  if (view === 'new') {
    const form = await loadQualifierForm({ teamId: team.teamId, qualifierId: null });
    return form ? <QualifierForm data={form} /> : <NotFound />;
  }
  if (!id || !isUuid(id)) return <NotFound />;
  if (view === 'edit') {
    const form = await loadQualifierForm({ teamId: team.teamId, qualifierId: id });
    return form ? <QualifierForm data={form} /> : <NotFound />;
  }
  const detail = await loadQualifierDetail({ role: team.role, teamId: team.teamId, playerId, qualifierId: id });
  return detail ? <QualifierDetail data={detail} /> : <NotFound />;
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

function CoachOnly({ edit, id }: { edit: boolean; id?: string }) {
  return (
    <Frame>
      <EmptyState
        size="page"
        code="CH-09311"
        icon={Lock}
        title={edit ? 'Only coaches edit qualifiers' : 'Only coaches create qualifiers'}
        body="You can see your team’s qualifiers and where you stand in the ones you’re entered in."
        action={
          <Button size="sm" href={edit && id && isUuid(id) ? `/golf/dashboard/qualifiers/${id}` : '/golf/dashboard/qualifiers'}>
            {edit ? 'Back to the qualifier' : 'See your qualifiers'}
          </Button>
        }
      />
    </Frame>
  );
}
