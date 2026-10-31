import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadCalendar, parseNewType, parseView } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
import { CalendarNoTeam } from '../screens/calendar/CalendarNoTeam';
import { loadLiveRounds } from '../data/live-rounds';
import { resolveClubhouseTeam } from './team';
import { marksHint } from '../lib/phone-hint';
import '../styles/calendar.css';
// P-5: the tournament section of the editor, round mode and the round pills (and the course picker it reuses).
import '../styles/qualifiers.css';
import '../styles/tournament-fields.css';

/**
 * /golf/dashboard/calendar in Clubhouse. Coaches plan the team schedule;
 * players see team events they can reply to and only their own classes.
 * `view`, `date` and `event` come from the URL so every state is linkable;
 * `new=1` opens the event editor (Home's New event); `with=<playerId>` makes it
 * a 1:1 with that player (Roster's Plan 1:1); `type=<practice|qualifier|…>`
 * picks the new event's type (the phone Home's quick chips).
 */
export async function ClubhouseCalendarRoute({
  view,
  date,
  event,
  isNew,
  withPlayer,
  newType,
  setUp = false,
}: {
  view?: string;
  date?: string;
  event?: string;
  isNew?: boolean;
  withPlayer?: string;
  newType?: string;
  /** P-5 4.11.3: `?event=<id>&setup=1` from the season home's Set up from calendar: the editor with Track on. */
  setUp?: boolean;
}) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return <CalendarNoTeam coach={!!session.coach} />;
  }
  // The coach's calendar says which events have players on the course (P-6); read beside the calendar, never ahead of it. A failed
  // live read is an empty snapshot, never an error here.
  const [data, onCourse] = await Promise.all([
    loadCalendar({
      role: team.role,
      teamId: team.teamId,
      viewerPlayerId: team.role === 'player' ? team.playerId : null,
      coachId: team.role === 'coach' ? team.coachId : null,
      view: parseView(view),
      date,
      event,
      marks: await marksHint(),
    }),
    team.role === 'coach' ? loadLiveRounds({ teamId: team.teamId, viewer: { role: 'coach', playerId: null } }) : Promise.resolve(undefined),
  ]);
  return <Calendar data={data} onCourse={onCourse} initialEvent={event} initialNew={isNew} initialWith={withPlayer} initialType={parseNewType(newType)} initialSetUp={setUp} live />;
}
