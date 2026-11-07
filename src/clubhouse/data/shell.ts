import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { isCoachHelmEnabledForCoach } from '@/lib/coachhelm/v2/gate';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { TEAM_BOARD_FIRST_VIEW } from '@/lib/coachhelm/v3/team-board/flag';
import type { ChHelmViews } from '../shell/context';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { fullName } from './season';
import { toParOf } from '../live/model';

export interface ChShellData {
  /** Null when the read failed: the badge hides rather than claiming zero. */
  pendingJoinRequests: number | null;
  /**
   * A coach's Team Hub badge: tasks past their due date (on the team's clock) that a player still has to finish. Coach
   * only, read once with the shell (one head count, no joins to the client); null when unread or for a player, so the
   * badge hides rather than claiming zero.
   */
  overdueTasks?: number | null;
  /** The team's time zone: where the global light's sun is until the course location is set (P001-A1). */
  timezone?: string;
  /** The team's course location (Settings > Team), the global light's place; null until set or before its migration. */
  course?: { lat: number; lng: number } | null;
  /** CoachHelm is on for the signed-in coach (the global, team and coach switches), so the shell offers the Ask sheet. */
  askAvailable?: boolean;
  /** The top-bar Helm key and Glass quick chat (coachhelm_quick_chat_v1), on top of `askAvailable`. */
  quickChat?: boolean;
  /** coachhelm_practice_plans_v1: the quick chat offers its plan tile. */
  practicePlans?: boolean;
  /** Which of CoachHelm's views are on, for its strips (useHelmViews). */
  helmViews?: ChHelmViews;
  /** The signed-in player's round in progress, touched in the last 12 hours (P001-C1): the Resume accessory. */
  roundInProgress?: ChRoundInProgress | null;
  /** The signed-in coach is this team's head coach: the identity line says "Head coach". False when unread (plain "Coach"). */
  viewerIsHeadCoach?: boolean;
  /** golf_tournaments_v1 is on (P016): the Tournaments nav entry and its routes. Set by the dashboard layout, server side. */
  tournaments?: boolean;
  /**
   * P-10: `class_awareness_v1` is on. Read once with the shell and handed to the client by context (useClassAwareness),
   * because the flag registry is server-only. Off or absent: no class RPC is called anywhere and no column is sent.
   */
  classAwareness?: boolean;
}

/** One of the coach's players, as the palette lists them: the id it opens and the name it shows. Nothing more. */
export interface ChShellPerson {
  id: string;
  name: string;
}

export interface ChRoundInProgress {
  id: string;
  course: string;
  /** The hole the player is on, when the round has recorded one. */
  hole: number | null;
  /** Strokes over or under par through the holes scored (P-6): the Dock's "Hole 12 · −2". Null until a hole is scored. */
  toPar?: number | null;
  /** Whose round it is: discarding it from the Dock clears that player's copy on this device too. */
  playerId?: string;
}

/** A round untouched for this long is not "in progress" for the accessory; the Rounds library still lists it. */
export const ROUND_IN_PROGRESS_FRESH_MS = 12 * 60 * 60_000;

/**
 * The shell's own reads: the sidebar's next-event card, the Roster badge and,
 * for a player, the round in progress. All degrade to "hidden" on failure; the
 * shell must never take a page down.
 */
/**
 * How many of the team's tasks are overdue with work still open: a task due before `today` (the team's date) with at
 * least one assignment not completed. One head count: the inner embed makes the database keep only tasks that have an
 * open assignment, so no rows or ids come back and the 1,000-row cap never applies. RLS scopes it to the coach's team.
 * Null when the read failed. A task nobody was assigned is not counted: there is no one to chase.
 */
export async function countOverdueTasks(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, today: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('golf_tasks')
    .select('id, golf_task_assignments!inner(id)', { count: 'exact', head: true })
    .eq('team_id', teamId)
    // A QA run's task is hidden on every task surface (loadTeamHub), so the badge must not count it either.
    .eq('is_test', false)
    .is('parent_task_id', null)
    .lt('due_date', today)
    .or('status.is.null,status.neq.completed', { referencedTable: 'golf_task_assignments' });
  if (error) {
    chLogServer('shell', 'overdueTasks', error, 'tasks');
    return null;
  }
  return count ?? 0;
}

/**
 * The coach's players, names and ids only, for the palette (owner, decision 16). Active members only: RLS on
 * golf_players (user_is_coach_of_golf_player) matches active members, so an inactive one would come back empty anyway.
 * RLS scopes it to the coach's own team; a roster is well under the row cap. Each row is rebuilt as `{ id, name }`, so
 * no other column can reach the client. Null on failure.
 *
 * Read only when the palette first opens (data/palette-people.ts), never with the shell: the shell rides
 * every page's HTML, which the site's service worker keeps in Cache Storage, and the decision says in memory only.
 */
export async function loadPalettePeople(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string): Promise<ChShellPerson[] | null> {
  const { data, error } = await supabase
    .from('golf_team_members')
    .select('player:golf_players(id, first_name, last_name)')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .limit(1000);
  if (error) {
    chLogServer('shell', 'palettePeople', error, 'teams');
    return null;
  }
  type P = { id: string; first_name: string | null; last_name: string | null };
  return ((data ?? []) as Array<{ player: P | null }>).flatMap((m) => (m.player?.id ? [{ id: m.player.id, name: fullName(m.player) }] : []));
}

export async function loadClubhouseShell(teamId: string | undefined, playerId?: string | null, coachId?: string | null): Promise<ChShellData> {
  if (!teamId) return { pendingJoinRequests: null };
  const supabase = await createClient();
  // The team's zone is read once and shared: the coach's overdue count needs today's date in it, and runs beside the rest.
  const zoneRead = Promise.resolve(supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle());
  const [joinRes, tzRes, roundRes, askOn, courseRes, staffRes, overdueTasks] = await Promise.all([
    supabase
      .from('golf_team_join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'pending'),
    zoneRead,
    // The player's own round in progress (RLS: a player reads their own rounds). Only a fresh one is a round "on the course".
    playerId
      ? supabase
          .from('golf_rounds')
          .select('id, course_name, current_hole, golf_holes(par, score)')
          .eq('player_id', playerId)
          .eq('is_test', false)
          .eq('status', 'in_progress')
          .gte('updated_at', new Date(Date.now() - ROUND_IN_PROGRESS_FRESH_MS).toISOString())
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve(null),
    // The coach's Ask sheet follows CoachHelm's own switch (as the Ask page does); a lookup that fails hides the key.
    coachId
      ? isCoachHelmEnabledForCoach(coachId).then(
          (gate) => gate.effectivelyEnabled,
          (err: unknown) => {
            chLogServer('shell', 'coachHelmGate', err, 'coachhelm');
            return false;
          },
        )
      : Promise.resolve(false),
    // The light's place (migration 20261008150000, held for the owner's apply). Its own read, so a missing column only
    // leaves the light on the time zone: it never touches the reads above. The generated types gain the columns at db:types.
    (supabase.from('golf_team_settings') as unknown as CourseQuery)
      .select('course_latitude, course_longitude')
      .eq('team_id', teamId)
      .maybeSingle(),
    // The coach's own staff row on this team (RLS: a coach on the team reads its staff rows), for the identity line.
    coachId
      ? supabase.from('golf_team_coach_staff').select('role').eq('team_id', teamId).eq('coach_id', coachId).limit(5)
      : Promise.resolve(null),
    // A coach's Team Hub badge. A failed zone read falls back to the product default, as below.
    coachId
      ? zoneRead
          .then((zone) => countOverdueTasks(supabase, teamId, todayIsoInZone((!zone.error && zone.data?.timezone) || 'America/New_York')))
          .catch((err: unknown) => {
            chLogServer('shell', 'overdueTasks', err, 'tasks');
            return null;
          })
      : Promise.resolve(null),
  ]);
  // A failed timezone read falls back to the product default, same as dashboard-data.
  const timezone = (!tzRes.error && tzRes.data?.timezone) || 'America/New_York';

  // CH-1208: the Roster badge hides. Logged.
  if (joinRes.error) {
    chLogServer('shell', 'joinRequests', joinRes.error, 'teams');
  }
  if (roundRes?.error) {
    chLogServer('shell', 'roundInProgress', roundRes.error, 'rounds');
  }
  // A failed read leaves the plain "Coach": the label only ever falls back to the lesser title.
  if (staffRes?.error) {
    chLogServer('shell', 'staffRole', staffRes.error, 'teams');
  }
  const round = roundRes && !roundRes.error ? roundRes.data : null;

  return {
    pendingJoinRequests: joinRes.error ? null : (joinRes.count ?? 0),
    ...(coachId ? { overdueTasks } : {}),
    timezone,
    askAvailable: askOn,
    quickChat: askOn,
    practicePlans: true,
    helmViews: { playerAsk: true, team: TEAM_BOARD_FIRST_VIEW === 'hole' },
    classAwareness: isFlagEnabled('class_awareness_v1'),
    course: courseOf(courseRes),
    roundInProgress: round && playerId ? { id: round.id, course: round.course_name?.trim() || 'Your round', hole: round.current_hole ?? null, toPar: toParOf(round.golf_holes ?? []), playerId } : null,
    viewerIsHeadCoach: !!staffRes && !staffRes.error && (staffRes.data ?? []).some((row) => row.role === 'head_coach'),
  };
}

type CourseRow = { course_latitude: number | null; course_longitude: number | null };
type CourseQuery = {
  select(cols: string): { eq(c: string, v: string): { maybeSingle(): Promise<{ data: CourseRow | null; error: { code?: string; message?: string } | null }> } };
};

/** The course point, or null: unset, unread, or the columns not there yet (42703 / PGRST204, logged only when it is something else). */
function courseOf(res: { data: CourseRow | null; error: { code?: string; message?: string } | null }): { lat: number; lng: number } | null {
  if (res.error) {
    const missing = res.error.code === '42703' || res.error.code === 'PGRST204';
    if (!missing) chLogServer('shell', 'courseLocation', res.error, 'teams');
    return null;
  }
  const lat = res.data?.course_latitude;
  const lng = res.data?.course_longitude;
  return lat != null && lng != null ? { lat, lng } : null;
}
