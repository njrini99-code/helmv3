import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, displayHandicap, fullName } from './season';

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

type Member = {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    graduation_year: number | null;
    handicap: number | null;
    handicap_index: number | null;
  } | null;
};

export async function loadPlayerRoster(input: { teamId: string; playerId: string }): Promise<ChPlayerRoster> {
  const supabase = await createClient();
  const now = new Date();

  const [teamRes, membersRes, staffRes] = await Promise.all([
    supabase.from('golf_teams').select('name, season').eq('id', input.teamId).maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('player:golf_players(id, first_name, last_name, graduation_year, handicap, handicap_index)')
      .eq('team_id', input.teamId)
      .eq('status', 'active'),
    // The staff rows are readable by the team's players (golf_team_coach_staff_select); a coach's name and title by anyone signed in.
    supabase.from('golf_team_coach_staff').select('role, is_primary, coach:golf_coaches(id, full_name, title)').eq('team_id', input.teamId).limit(50),
  ]);

  if (teamRes.error) chLogServer('roster', 'playerTeam', teamRes.error, 'teams');
  if (membersRes.error) chLogServer('roster', 'playerMembers', membersRes.error, 'teams');
  if (staffRes.error) chLogServer('roster', 'playerCoaches', staffRes.error, 'teams');

  const players: ChTeammate[] = ((membersRes.error ? [] : (membersRes.data ?? [])) as unknown as Member[])
    .flatMap((m) => (m.player ? [m.player] : []))
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      classYear: classYearLabel(p.graduation_year, now),
      gradYear: p.graduation_year,
      handicap: displayHandicap(p),
      isYou: p.id === input.playerId,
    }));

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    season: teamRes.data?.season ?? null,
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
