import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadCalendar, parseView } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
import { CalendarNoTeam } from '../screens/calendar/CalendarNoTeam';
import { resolveClubhouseTeam } from './team';
import '../styles/calendar.css';

/**
 * /golf/dashboard/calendar in Clubhouse. Coaches plan the team schedule;
 * players see team events they can reply to and only their own classes.
 * `view`, `date` and `event` come from the URL so every state is linkable;
 * `new=1` opens the event editor (Home's New event); `with=<playerId>` makes it
 * a 1:1 with that player (Roster's Plan 1:1).
 */
export async function ClubhouseCalendarRoute({
  view,
  date,
  event,
  isNew,
  withPlayer,
}: {
  view?: string;
  date?: string;
  event?: string;
  isNew?: boolean;
  withPlayer?: string;
}) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return <CalendarNoTeam coach={!!session.coach} />;
  }
  const data = await loadCalendar({
    role: team.role,
    teamId: team.teamId,
    viewerPlayerId: team.role === 'player' ? team.playerId : null,
    coachId: team.role === 'coach' ? team.coachId : null,
    view: parseView(view),
    date,
  });
  return <Calendar data={data} initialEvent={event} initialNew={isNew} initialWith={withPlayer} />;
}
