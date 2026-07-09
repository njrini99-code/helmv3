import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { CommandCenterFairway } from '@/components/baseball/command-center/CommandCenterFairway';
import { fairwayScope } from '@/lib/redesign/flag';
import { getCommandCenter } from '@/lib/baseball/read-models/command-center';
import { assembleCommandCenterClientProps } from '@/lib/baseball/read-models/command-center-adapter';
import { getCoachDailyContracts } from '@/lib/baseball/read-models/coach-daily-contracts';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';
import { Button } from '@/components/fairway';
import { EditorsLetter } from '@/components/baseball/living-annual';

export default async function CommandCenterPage() {
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const coach = session.coach;
  if (!coach) redirect('/baseball/player/today');

  if (!coach.organization_id) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
          <EditorsLetter
            ink="team"
            title="Set up your program"
            body="Before you can use the Command Center, you need to complete your program setup."
            signoff="— From the desk of CoachHelm"
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/baseball/dashboard/program">Complete setup</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const teamId = await resolveCoachTeamIdWithCookie(
    supabase,
    coach.organization_id,
    coach.id,
  );

  if (!teamId) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <CommandCenterFairway
          team={{ id: '', name: 'Your Program', teamType: coach.coach_type, inviteCode: null }}
          players={[]}
          coachId={coach.id}
          coachName={coach.full_name || 'Coach'}
          calendarEvents={[]}
          riskFeed={[]}
          riskFeedError={null}
        />
      </div>
    );
  }

  type TeamRow = { id: string; name: string; team_type: string; join_code: string | null };
  const { data: teamRow } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type, join_code')
    .eq('id', teamId)
    .maybeSingle() as { data: TeamRow | null };

  const teamMeta = {
    id: teamRow?.id ?? teamId,
    name: teamRow?.name ?? 'Your Program',
    teamType: teamRow?.team_type ?? coach.coach_type,
    inviteCode: teamRow?.join_code ?? null,
  };

  const [commandCenter, coachDailyContracts] = await Promise.all([
    getCommandCenter(teamId, { includeWeekEvents: true }),
    getCoachDailyContracts(teamId),
  ]);

  const assembled = assembleCommandCenterClientProps({
    team: teamMeta,
    model: commandCenter,
    coachDailyContracts,
  });

  return (
    <div className={fairwayScope('min-h-full')}>
      <CommandCenterFairway
        team={assembled.team}
        players={assembled.players}
        coachId={coach.id}
        coachName={coach.full_name || 'Coach'}
        calendarEvents={assembled.calendarEvents}
        riskFeed={assembled.riskFeed}
        riskFeedError={assembled.riskFeedError}
        coachDailyContracts={assembled.coachDailyContracts}
        summary={assembled.summary}
        loadState={assembled.loadState}
      />
    </div>
  );
}
