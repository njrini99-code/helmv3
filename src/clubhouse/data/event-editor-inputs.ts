'use server';

import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveClubhouseTeam } from '../routes/team';
import { loadCalendar } from './calendar';
import type { ChCalEvent, ChCalPerson } from '../screens/calendar/model';
import { chLogServer } from '../lib/track-server';

/** What the event editor needs when it opens away from Calendar (MAC-03): the week's events, the roster and the team's clock. */
export interface ChEventEditorInputs {
  events: ChCalEvent[];
  people: ChCalPerson[];
  peopleError: boolean;
  timezone: string;
  today: string;
  nowHour: number;
  tournamentsEnabled: boolean;
  teamId: string;
}

/**
 * The event editor's inputs for the signed-in coach, read when Home's Add event or a quick chip is pressed, so the sheet
 * opens on Home instead of leaving for Calendar (production audit 2026-11-15, MAC-03). Same reads as Calendar's week, under
 * the coach's own RLS-scoped client. The role and the team come from the session, never from the browser. Null for anyone
 * who is not a coach and on any failure, a degraded read included (events, timezone, busy time or classes): the caller
 * then goes to Calendar's `?new=1`, as before, where those reads have their own notices, so the editor never treats a
 * missing read as free time or saves on a default timezone.
 */
export async function getEventEditorInputs(): Promise<ChEventEditorInputs | null> {
  try {
    const session = await getGolfSessionProfile();
    if (!session) return null;
    const team = await resolveClubhouseTeam(session);
    if (team?.role !== 'coach') return null;
    const data = await loadCalendar({ role: 'coach', teamId: team.teamId, viewerPlayerId: null, coachId: team.coachId, view: 'week' });
    if (data.eventsError || data.settingsError || data.busyError || data.classesError) return null;
    return {
      events: data.events,
      people: data.people,
      peopleError: !!data.membersError,
      timezone: data.timezone,
      today: data.today,
      nowHour: data.nowHour,
      tournamentsEnabled: !!data.tournamentsEnabled,
      teamId: data.teamId,
    };
  } catch (err) {
    chLogServer('home', 'eventEditorInputs', err, 'calendar');
    return null;
  }
}
