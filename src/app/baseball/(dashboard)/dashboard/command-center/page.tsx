import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { CommandCenterClient } from '@/components/baseball/command-center/CommandCenterClient';
import { CommandCenterFairway } from '@/components/baseball/command-center/CommandCenterFairway';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { getCommandCenter } from '@/lib/baseball/read-models/command-center';
import { assembleCommandCenterClientProps } from '@/lib/baseball/read-models/command-center-adapter';
import { getCoachDailyContracts } from '@/lib/baseball/read-models/coach-daily-contracts';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';

export default async function CommandCenterPage() {
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const coach = session.coach;
  if (!coach) redirect('/baseball/player/today');

  if (!coach.organization_id) {
    return (
      <div className="min-h-dvh bg-cream-100">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-12">
          <div className="glass-standard rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-semibold text-warm-900 mb-4">
              Set Up Your Program
            </h1>
            <p className="text-warm-600 mb-6">
              Before you can use the Command Center, you need to complete your program setup.
            </p>
            <a
              href="/baseball/dashboard/program"
              className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-lg font-medium transition-colors"
            >
              Complete Setup
            </a>
          </div>
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
    if (isRedesignEnabled()) {
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
    return (
      <CommandCenterClient
        team={{ id: '', name: 'Your Program', teamType: coach.coach_type, inviteCode: null }}
        players={[]}
        coachId={coach.id}
        coachName={coach.full_name || 'Coach'}
        calendarEvents={[]}
        riskFeed={[]}
        riskFeedError={null}
      />
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

  if (isRedesignEnabled()) {
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

  return (
    <CommandCenterClient
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
  );
}
