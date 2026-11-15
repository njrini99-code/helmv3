import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadHours } from '../data/hours';
import { CalendarNoTeam } from '../screens/calendar/CalendarNoTeam';
import { PracticeHours } from '../screens/calendar/hours/PracticeHours';
import { resolveClubhouseTeam } from './team';
import '../styles/hours.css';

/**
 * /golf/dashboard/calendar/hours in Clubhouse (launch readiness F-03): the team's practice hours for a coach, a player's
 * own for a player. The team is the viewer's own (resolveClubhouseTeam), never one named in the address; `date` picks the
 * week (any day in it), and a date that isn't real falls back to this week.
 */
export async function ClubhouseCalendarHoursRoute({ date }: { date?: string }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) return <CalendarNoTeam coach={!!session.coach} />;
  const data = await loadHours({
    role: team.role,
    teamId: team.teamId,
    viewerPlayerId: team.role === 'player' ? team.playerId : null,
    coachId: team.role === 'coach' ? team.coachId : null,
    date,
  });
  return <PracticeHours data={data} />;
}
