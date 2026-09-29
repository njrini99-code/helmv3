import 'server-only';
import { Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadCalendar, parseView } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
import { EmptyState } from '../ui/States';
import { resolveClubhouseTeam } from './team';
import '../styles/calendar.css';

/**
 * /golf/dashboard/calendar in Clubhouse. Coaches plan the team schedule;
 * players see team events they can reply to and only their own classes.
 * `view`, `date` and `event` come from the URL so every state is linkable.
 */
export async function ClubhouseCalendarRoute({ view, date, event }: { view?: string; date?: string; event?: string }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return (
      <main className="ch-cal">
        <div className="ch-cal-surface" style={{ padding: 8 }}>
          <EmptyState
            icon={Users}
            title="You aren't on a team yet."
            body={session.coach ? 'The calendar fills in once your team is set up.' : 'Team events show here once a coach adds you to a team roster.'}
          />
        </div>
      </main>
    );
  }
  const data = await loadCalendar({
    role: team.role,
    teamId: team.teamId,
    viewerPlayerId: team.role === 'player' ? team.playerId : null,
    view: parseView(view),
    date,
  });
  return <Calendar data={data} initialEvent={event} />;
}
