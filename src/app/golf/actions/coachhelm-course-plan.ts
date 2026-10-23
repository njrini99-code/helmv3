'use server';

/**
 * CoachHelm course plan (Slice 7c, flag `coachhelm_course_plan_v1`, off).
 *
 * On a coach's request (no event source carries a course yet: production has
 * 1,957 `golf_events` rows and none with `course_id`), lists the courses a
 * player has three or more countable rounds on, and builds the plan for one
 * of them from the player's own hole and shot history there
 * (src/lib/coachhelm/course-plan/build-plan.ts, pure).
 *
 * Read only: nothing is written. The caller must coach a team the player is
 * active on (golf_team_coach_staff ∩ golf_team_members); RLS scopes the reads
 * as well. Flag off: `{ status: 'not_available' }` and nothing is read.
 *
 * The player's own copy (chs-21) is two more actions, `listMyCoursePlanCourses`
 * and `getMyCoursePlan`, which take no player id: the player is the session's
 * own `golf_players` row, so a player can only ever read their own plan. They
 * answer the player's lines only, never the coach's copy.
 */

import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { filterCountableRounds } from '@/lib/golf/round-countable';
import { isCoursePlanEnabled } from '@/lib/coachhelm/course-plan/flag';
import { buildCoursePlan, eligibleCourses, type CoursePlan, type CoursePlanCourse, type CoursePlanHole, type CoursePlanShot } from '@/lib/coachhelm/course-plan/build-plan';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type CoursePlanFailure = { status: 'not_available' } | { status: 'forbidden' } | { status: 'failed' };
export type CoursePlanCoursesResult = CoursePlanFailure | { status: 'ok'; courses: CoursePlanCourse[] };
export type CoursePlanResult = CoursePlanFailure | { status: 'ok'; plan: CoursePlan };

/** The player's own plan: their lines in their voice, nothing of the coach's copy. */
export type MyCoursePlan =
  | { status: 'too_few'; courseName: string; rounds: number }
  | { status: 'plan'; courseName: string; rounds: number; title: string; lines: string[]; thinLine: string | null; emptyLine: string | null };
export type MyCoursePlanResult = CoursePlanFailure | { status: 'ok'; plan: MyCoursePlan };

/** Newest rounds read on the course, and elsewhere for the three-putt comparison. */
const COURSE_ROUNDS_MAX = 30;
const ELSEWHERE_ROUNDS_MAX = 40;
/** Rounds read to find the player's courses. */
const ROUNDS_MAX = 400;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RLS = (action: string) => ({ action, feature: 'coachhelm_ai_engine' as const, sport: 'golf' as const });

interface RoundRow {
  id: string;
  course_id: string | null;
  course_name: string | null;
  round_date: string;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
}

async function failed(action: string, what: string, extra: Record<string, unknown> = {}): Promise<CoursePlanFailure> {
  await logServerError(`${action}: ${what}`, { action, feature: 'coachhelm_ai_engine', featureArea: 'coachhelm_course_plan', ...extra }, 'warning');
  return { status: 'failed' };
}

/** True when the session user coaches a team the player is active on; null when a read failed. */
async function coachesPlayer(supabase: ServerClient, userId: string, playerId: string): Promise<boolean | null> {
  const [coachRes, memberRes] = await Promise.all([
    supabase.from('golf_coaches').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).eq('status', 'active'),
  ]);
  if (coachRes.error || memberRes.error) return null;
  const coachId = coachRes.data?.id;
  if (!coachId) return false;
  const teams = new Set((memberRes.data ?? []).map((m) => m.team_id).filter(Boolean));
  if (teams.size === 0) return false;
  const { data: staff, error } = await supabase.from('golf_team_coach_staff').select('team_id').eq('coach_id', coachId);
  if (error) return null;
  return (staff ?? []).some((s) => s.team_id && teams.has(s.team_id));
}

/** The player's countable completed rounds, newest first; null when the read failed. */
async function countableRounds(supabase: ServerClient, playerId: string): Promise<RoundRow[] | null> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('id, course_id, course_name, round_date, holes_played, total_score, front_nine, back_nine, total_putts')
    .eq('player_id', playerId)
    .eq('is_test', false)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .order('id', { ascending: true })
    .limit(ROUNDS_MAX);
  if (error) return null;
  return filterCountableRounds((data ?? []) as RoundRow[]);
}

interface PlanContext {
  supabase: ServerClient;
  userId: string;
  playerId: string;
}

/** Session, flag and coach check shared by the coach's two actions. */
async function open(action: string, playerId: string): Promise<PlanContext | CoursePlanFailure> {
  if (!isCoursePlanEnabled()) return { status: 'not_available' };
  if (!UUID.test(playerId)) return { status: 'forbidden' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'forbidden' };
  const ok = await coachesPlayer(supabase, user.id, playerId);
  if (ok === null) return failed(action, 'coach lookup failed', { userId: user.id, playerId });
  if (!ok) return { status: 'forbidden' };
  return { supabase, userId: user.id, playerId };
}

/**
 * Session and flag check for the player's own two actions. The player is the session user's own `golf_players` row, never
 * an id from the caller, so a player reads only their own rounds (RLS scopes the reads to their own rows as well). A user
 * with no player row (a coach) is refused.
 */
async function openSelf(action: string): Promise<PlanContext | CoursePlanFailure> {
  if (!isCoursePlanEnabled()) return { status: 'not_available' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'forbidden' };
  const { data: player, error } = await supabase.from('golf_players').select('id').eq('user_id', user.id).maybeSingle();
  if (error) return failed(action, 'player lookup failed', { userId: user.id });
  if (!player?.id) return { status: 'forbidden' };
  return { supabase, userId: user.id, playerId: player.id };
}

async function listCourses(action: string, ctx: PlanContext): Promise<CoursePlanCoursesResult> {
  const rounds = await countableRounds(ctx.supabase, ctx.playerId);
  if (!rounds) return failed(action, 'rounds read failed', { userId: ctx.userId, playerId: ctx.playerId });
  return { status: 'ok', courses: eligibleCourses(rounds.map((r) => ({ courseId: r.course_id, courseName: r.course_name, roundDate: r.round_date }))) };
}

async function listCoursePlanCoursesImpl(playerId: string): Promise<CoursePlanCoursesResult> {
  const action = 'listCoursePlanCourses';
  const ctx = await open(action, playerId);
  if ('status' in ctx) return ctx;
  return listCourses(action, ctx);
}

async function getCoursePlanImpl(playerId: string, courseId: string): Promise<CoursePlanResult> {
  const action = 'getCoursePlan';
  const ctx = await open(action, playerId);
  if ('status' in ctx) return ctx;
  return buildPlan(action, ctx, courseId);
}

async function listMyCoursePlanCoursesImpl(): Promise<CoursePlanCoursesResult> {
  const action = 'listMyCoursePlanCourses';
  const ctx = await openSelf(action);
  if ('status' in ctx) return ctx;
  return listCourses(action, ctx);
}

/** The player's lines only: the coach's copy (third person, the Plan: lines) is not sent to the player. */
function playerCopy(plan: CoursePlan): MyCoursePlan {
  if (plan.status === 'too_few') return plan;
  return { status: 'plan', courseName: plan.courseName, rounds: plan.rounds, title: plan.player.title, lines: plan.player.lines, thinLine: plan.player.thinLine, emptyLine: plan.player.emptyLine };
}

async function getMyCoursePlanImpl(courseId: string): Promise<MyCoursePlanResult> {
  const action = 'getMyCoursePlan';
  const ctx = await openSelf(action);
  if ('status' in ctx) return ctx;
  const res = await buildPlan(action, ctx, courseId);
  return res.status === 'ok' ? { status: 'ok', plan: playerCopy(res.plan) } : res;
}

async function buildPlan(action: string, ctx: PlanContext, courseId: string): Promise<CoursePlanResult> {
  if (!UUID.test(courseId)) return { status: 'forbidden' };
  const { supabase, userId, playerId } = ctx;
  const rounds = await countableRounds(supabase, playerId);
  if (!rounds) return failed(action, 'rounds read failed', { userId, playerId });
  const here = rounds.filter((r) => r.course_id === courseId).slice(0, COURSE_ROUNDS_MAX);
  const courseName = here.find((r) => r.course_name?.trim())?.course_name?.trim() ?? 'This course';
  const elsewhereIds = rounds.filter((r) => r.course_id !== courseId).slice(0, ELSEWHERE_ROUNDS_MAX).map((r) => r.id);
  const hereIds = here.map((r) => r.id);
  if (hereIds.length === 0) return { status: 'ok', plan: { status: 'too_few', courseName, rounds: 0 } };

  const [holesRes, shotsRes] = await Promise.all([
    fetchAllRowsResult<{ id: string; round_id: string; hole_number: number; par: number; score: number | null; putts: number | null; penalty_strokes: number | null; yardage: number | null }>(
      (from, to) =>
        supabase
          .from('golf_holes')
          .select('id, round_id, hole_number, par, score, putts, penalty_strokes, yardage')
          .in('round_id', [...hereIds, ...elsewhereIds])
          .order('id', { ascending: true })
          .range(from, to),
      undefined,
      { table: 'golf_holes', ...RLS(action) },
    ),
    fetchAllRowsResult<{ id: string; round_id: string; hole_number: number; shot_number: number; shot_type: string | null; club_type: string | null; miss_direction: string | null; result: string | null; penalty_type: string | null; distance_to_hole_before: number | null; distance_unit_before: string | null }>(
      (from, to) =>
        supabase
          .from('golf_shots')
          .select('id, round_id, hole_number, shot_number, shot_type, club_type, miss_direction, result, penalty_type, distance_to_hole_before, distance_unit_before')
          .in('round_id', hereIds)
          .order('id', { ascending: true })
          .range(from, to),
      undefined,
      { table: 'golf_shots', ...RLS(action) },
    ),
  ]);
  if (holesRes.error || shotsRes.error) return failed(action, 'history read failed', { userId, playerId, errorCode: holesRes.error?.code ?? shotsRes.error?.code });

  const hereSet = new Set(hereIds);
  const holes: CoursePlanHole[] = [];
  const elsewhereRounds = new Set<string>();
  let elsewhereThree = 0;
  for (const h of holesRes.data ?? []) {
    if (hereSet.has(h.round_id)) {
      holes.push({ roundId: h.round_id, holeNumber: h.hole_number, par: h.par, score: h.score, putts: h.putts, penaltyStrokes: h.penalty_strokes, yardage: h.yardage });
    } else if (h.putts != null) {
      elsewhereRounds.add(h.round_id);
      if (h.putts >= 3) elsewhereThree += 1;
    }
  }
  const shots: CoursePlanShot[] = (shotsRes.data ?? []).map((s) => ({
    roundId: s.round_id,
    holeNumber: s.hole_number,
    shotNumber: s.shot_number,
    shotType: s.shot_type,
    clubType: s.club_type,
    missDirection: s.miss_direction,
    result: s.result,
    penaltyType: s.penalty_type,
    distanceBefore: s.distance_to_hole_before,
    distanceUnitBefore: s.distance_unit_before,
  }));
  const plan = buildCoursePlan({ courseName, roundIds: hereIds, holes, shots, elsewhere: { rounds: elsewhereRounds.size, threePutts: elsewhereThree } });
  return { status: 'ok', plan };
}

const observedList = withAdminObserved('listCoursePlanCourses', { sport: 'golf', feature: 'coachhelm_ai_engine' }, listCoursePlanCoursesImpl);
const observedGet = withAdminObserved('getCoursePlan', { sport: 'golf', feature: 'coachhelm_ai_engine' }, getCoursePlanImpl);
const observedListMine = withAdminObserved('listMyCoursePlanCourses', { sport: 'golf', feature: 'coachhelm_ai_engine' }, listMyCoursePlanCoursesImpl);
const observedGetMine = withAdminObserved('getMyCoursePlan', { sport: 'golf', feature: 'coachhelm_ai_engine' }, getMyCoursePlanImpl);

/** Courses the player has three or more countable rounds on (coach only). */
export async function listCoursePlanCourses(playerId: string): Promise<CoursePlanCoursesResult> {
  return observedList(playerId);
}

/** The course plan for one player on one course (coach only). */
export async function getCoursePlan(playerId: string, courseId: string): Promise<CoursePlanResult> {
  return observedGet(playerId, courseId);
}

/** The signed-in player's own courses with three or more countable rounds (player only; no id is taken). */
export async function listMyCoursePlanCourses(): Promise<CoursePlanCoursesResult> {
  return observedListMine();
}

/** The signed-in player's own plan for one course, their lines only (player only; no player id is taken). */
export async function getMyCoursePlan(courseId: string): Promise<MyCoursePlanResult> {
  return observedGetMine(courseId);
}
