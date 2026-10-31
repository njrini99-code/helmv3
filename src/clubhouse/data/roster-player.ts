import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { readGolfPlayerProfiles } from '@/lib/golf/player-profiles';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, currentSeasonLabel, displayHandicap, fullName, loadTeamZone } from './season';

/**
 * The player's Roster (Clubhouse): their own team, read-only. It is a separate loader from the coach's on purpose
 * (data/roster.ts reads the join code, the join requests, the coach's private notes, every player's rounds, focus
 * areas and goals, and judges who "needs a look"; none of that is a teammate's to read).
 *
 * What a player sees of a teammate is what Fairway's player roster showed: name, class year and handicap. Scores
 * stay out, as everywhere a player is concerned (a player is set against the Tour, never against teammates).
 * The reads are RLS-scoped to the player's own team (the coaching staff too, wave 7: their names and roles head the list); only active members are listed, so a pending invite or a
 * removed player is never a teammate here. Nothing is selected that isn't shown: no email, phone, avatar or
 * hometown.
 */

export interface ChTeammate {
  id: string;
  name: string;
  classYear: string | null;
  /** For ordering by class only: it is not drawn. */
  gradYear: number | null;
  handicap: number | null;
  /** The signed-in player's own row: it reads "You", and is on the list like everyone else. */
  isYou: boolean;
}

/** One of the team's coaches, as a player's roster names them: name and role, nothing to open. */
export interface ChTeamCoach {
  id: string;
  name: string;
  /** "Head coach", their own title, or "Coach". */
  role: string;
}

export interface ChPlayerRoster {
  teamName: string;
  season: string | null;
  /** The team row didn't load: the name falls back, nothing else depends on it. */
  teamError: boolean;
  players: ChTeammate[];
  playersError: boolean;
  /** The team's coaching staff, head coach first. Null when it didn't load (logged): the group is left out, never "no coaches". */
  coaches?: ChTeamCoach[] | null;
}

export async function loadPlayerRoster(input: { teamId: string; playerId: string }): Promise<ChPlayerRoster> {
  const supabase = await createClient();
  const now = new Date();

  const [teamRes, membersRes, staffRes, tz] = await Promise.all([
    supabase.from('golf_teams').select('name').eq('id', input.teamId).maybeSingle(),
    // Teammates' display columns through golf_player_profiles: a player may no longer read a teammate's golf_players
    // row (security review S4).
    (async () => {
      const [members, profiles] = await Promise.all([
        supabase.from('golf_team_members').select('player_id').eq('team_id', input.teamId).eq('status', 'active'),
        readGolfPlayerProfiles(supabase, { teamIds: [input.teamId] }),
      ]);
      if (members.error) return { data: null, error: members.error };
      if (profiles.error) return { data: null, error: profiles.error };
      const active = new Set((members.data ?? []).map((m) => m.player_id));
      return { data: profiles.data.filter((p) => active.has(p.id)), error: null };
    })(),
    // The staff rows are readable by the team's players (golf_team_coach_staff_select); a coach's name and title by anyone signed in.
    supabase.from('golf_team_coach_staff').select('role, is_primary, coach:golf_coaches(id, full_name, title)').eq('team_id', input.teamId).limit(50),
    // The class year turns on 1 August in the team's zone (decision 9), as the coach's Roster reads it.
    loadTeamZone(supabase, input.teamId, 'roster'),
  ]);

  if (teamRes.error) chLogServer('roster', 'playerTeam', teamRes.error, 'teams');
  if (membersRes.error) chLogServer('roster', 'playerMembers', membersRes.error, 'teams');
  if (staffRes.error) chLogServer('roster', 'playerCoaches', staffRes.error, 'teams');

  const players: ChTeammate[] = (membersRes.error ? [] : (membersRes.data ?? []))
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      classYear: classYearLabel(p.graduation_year, now, tz),
      gradYear: p.graduation_year,
      handicap: displayHandicap(p),
      isYou: p.id === input.playerId,
    }));

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    // Computed from 1 August in the team's zone, never the stored free text (F-0002).
    season: currentSeasonLabel(now, tz),
    teamError: !!teamRes.error,
    players,
    playersError: !!membersRes.error,
    coaches: staffRes.error ? null : coachesOf((staffRes.data ?? []) as unknown as Staff[]),
  };
}

type Staff = { role: string | null; is_primary: boolean | null; coach: { id: string; full_name: string | null; title: string | null } | null };

/** The staff as the roster lists them: the head coach (or the primary one) first, then by name; a coach without a name is left out. */
export function coachesOf(rows: Staff[]): ChTeamCoach[] {
  const head = (r: Staff) => (r.role === 'head_coach' ? 0 : r.is_primary ? 1 : 2);
  return rows
    .filter((r): r is Staff & { coach: NonNullable<Staff['coach']> } => !!r.coach?.full_name?.trim())
    .sort((a, b) => head(a) - head(b) || a.coach.full_name!.localeCompare(b.coach.full_name!))
    .map((r) => ({ id: r.coach.id, name: r.coach.full_name!.trim(), role: r.role === 'head_coach' ? 'Head coach' : r.coach.title?.trim() || 'Coach' }));
}
