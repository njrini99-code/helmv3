'use server';

/**
 * Cloud Course Library — Data Access Layer (Phase 2).
 *
 * The server-action surface over the Phase-1 tables (golf_course_tees,
 * golf_course_tee_holes, golf_team_saved_courses, + edit-history) and the
 * additive golf_courses cloud columns.
 *
 * Invariants enforced here (see docs/audits/COURSE_LIBRARY_AUDIT_2026-06-13.md):
 *  • SNAPSHOT SAFETY — nothing in this file touches golf_rounds / golf_holes /
 *    golf_shots. Editing a tee or its holes NEVER rewrites historical round
 *    truth; rounds snapshot par/yards at submit time and a tee only feeds
 *    new-round defaults (wired in Phase 3).
 *  • NO DESTRUCTIVE WRITES — course/tee deletion is SOFT (deleted_at). Hole-set
 *    edits use upsert + delete-surplus (stage-and-swap), never wipe-and-reinsert,
 *    so a transient failure can't lose hole data.
 *  • ATTRIBUTION — every create/edit stamps *_by_user_id = the actor and appends
 *    an append-only edit-history row. RLS independently pins these to auth.uid().
 *  • OPEN CONTRIBUTION — any authenticated user may add/edit cloud courses+tees.
 *    Team-saved rows are coach-managed (RLS: is_golf_team_coach).
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { isSuperAdminUserId } from '@/lib/admin/super-admin-shared';
import {
  normalizeName,
  isTeeComplete,
  sumPar,
  sumYards,
  diffFields,
  mapCourseRow,
  mapTeeRow,
  mapTeeHoleRow,
  mapSavedRow,
  isCourseImagePublicUrl,
  normalizeWebsiteUrl,
} from '@/lib/golf/course-library';
import type {
  GolfCourse,
  GolfCourseTee,
  GolfCourseTeeHole,
  GolfCourseTeeWithHoles,
  GolfTeamSavedCourse,
  GolfTeamSavedCourseWithCourse,
  GolfTeeCategory,
} from '@/lib/types/golf-course';
import type { Database } from '@/lib/types/database';

type CourseUpdate = Database['public']['Tables']['golf_courses']['Update'];
type TeeUpdate = Database['public']['Tables']['golf_course_tees']['Update'];

type Result<T> = { success: true; data: T } | { success: false; error: string };

const LIBRARY_PATHS = ['/golf/dashboard/courses', '/golf/dashboard/rounds'];
function revalidateLibrary() {
  for (const p of LIBRARY_PATHS) revalidatePath(p);
}

// ─────────────────────────────────────────────────────────────────────────────
// Actor / team resolution
// ─────────────────────────────────────────────────────────────────────────────

type Actor = {
  userId: string;
  teamId: string | null;
  isCoach: boolean;
  /**
   * The coach lookup FAILED, as distinct from returning no row. Both leave
   * `isCoach` false and both must keep the caller out — an authorization check
   * that could not run has not passed. The difference is only in what the
   * coach is then told, and "Only coaches can manage the course library" is the
   * wrong thing to tell one.
   */
  coachReadFailed: boolean;
};

/** Authenticated user + best-effort attribution team (coach's active team). */
async function getActor(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Actor | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Attribution team is best-effort: coaches get their active (cookie-aware)
  // team; players leave it null. created_by_user_id is the required attribution.
  let teamId: string | null = null;
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  // Not `return null` — null here means "not signed in", and this user plainly
  // is. Carry the failure instead so the gate below can keep them out while
  // saying something true about why.
  if (coachError) {
    await logServerError(
      `coach lookup failed while resolving the course-library actor: ${describeError(coachError)}`,
      { action: 'courseLibrary.getActor', featureArea: 'courses' },
      'warning'
    );
  }

  if (coach) {
    teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  }
  return {
    userId: user.id,
    teamId,
    isCoach: Boolean(coach),
    coachReadFailed: Boolean(coachError),
  };
}

/**
 * Course-library MANAGEMENT gate (Decision-1 option A — coach-open,
 * player-blocked; commit bc8b8372 already hides the create/edit/delete UI
 * controls from players in CourseLibraryClient.tsx and CourseDetailDrawer.tsx).
 * Returns an error string when the actor may NOT create/edit/delete a course,
 * tee, or tee's hole set; null when the actor is allowed to proceed. A super
 * admin always passes, matching the existing library-owned-row escape hatch.
 *
 * NOT applied to the `contributeCourseFromRound` growth path — a player
 * saving a round with a not-yet-cataloged course/tee is legitimate additive
 * catalog growth, not "managing the library", and that path calls the
 * `*Core`-equivalent (skipCoachGate) entry points directly. (#36/#187)
 *
 * FLAGGED DEVIATION (not silently decided): a fully-literal reading of the
 * #36/#187 acceptance text says a player "cannot INSERT" golf_courses /
 * golf_course_tees / golf_course_tee_holes. INSERT is intentionally left
 * open at BOTH layers (RLS: 20260719120000_course_library_role_scoping.sql;
 * app: this gate is skipped via skipCoachGate) specifically so
 * contributeCourseFromRound keeps working — every write in this file,
 * including that one, runs through the same user-context (RLS-bound)
 * Supabase client, with no service-role/SECURITY DEFINER bypass for that
 * flow. Treating "add a not-yet-cataloged row" the same as "edit/remove an
 * existing row" would be a scope call beyond what #36/#187 actually
 * reported (any authenticated player editing/removing ANY row). This is
 * called out explicitly here, in the migration, and in the round-2 PR
 * description pending an explicit owner confirmation — it is not assumed.
 */
function requireCoachActor(actor: Actor): string | null {
  if (actor.isCoach || isActorSuperAdmin(actor)) return null;
  // Still closed, but honest: a coach whose lookup failed is not a player, and
  // telling them they are one gives them nothing to do about it.
  if (actor.coachReadFailed) {
    return "Couldn't verify your coach access just now. Please try again.";
  }
  return 'Only coaches can manage the course library';
}

/** Resolve the caller's active team AS A COACH (team-library management gate). */
async function getCoachTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ userId: string; teamId: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in' };

  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  // Same split as getActor: refuse either way, but do not tell a coach they
  // are not one because a read fell over.
  if (coachError) {
    await logServerError(
      `coach lookup failed while resolving the team course library: ${describeError(coachError)}`,
      { action: 'courseLibrary.getCoachTeam', featureArea: 'courses' },
      'warning'
    );
    return { error: "Couldn't verify your coach access just now. Please try again." };
  }

  if (!coach) return { error: 'Only coaches can manage the team course library' };

  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) return { error: 'No active team found' };
  return { userId: user.id, teamId };
}

/**
 * True when a golf_courses row has NO human creator — i.e. it's a
 * staff-curated shared LIBRARY course (bulk-seeded via a reviewed script,
 * e.g. scripts/seed-course-library-scorecards.ts), not a coach/team's own
 * contribution. `created_by_user_id` is set on every row created through the
 * app (createCourse / contributeCourseFromRound both stamp the actor), so a
 * null value can only mean "nobody added this — it shipped with the
 * library." (#913 part 2 — ownership gating.)
 *
 * Library rows stay visible + usable by every team (tees, saves, rounds all
 * still work normally), but must not be renamed or removed by an arbitrary
 * coach — only a super admin may edit or remove them. Team/user-contributed
 * courses keep the pre-existing open-contribution model unchanged.
 */
function isLibraryOwnedCourseRow(row: { created_by_user_id?: unknown }): boolean {
  return row.created_by_user_id == null;
}

/** Cheap, DB-round-trip-free super-admin check (env-var allowlist), the same
 *  pattern src/app/golf/actions/auth.ts already uses outside /admin. */
function isActorSuperAdmin(actor: Actor): boolean {
  return isSuperAdminUserId(actor.userId, process.env.SUPER_ADMIN_USER_IDS);
}

// ─────────────────────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────────────────────

export interface ListCoursesOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

/** Active (non-deleted) cloud courses, optionally filtered by a search query. */
async function listCoursesImpl(opts: ListCoursesOptions = {}): Promise<GolfCourse[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  let q = supabase
    .from('golf_courses')
    .select('*')
    .is('deleted_at', null)
    .order('name')
    .range(offset, offset + limit - 1);

  const query = opts.query?.trim();
  if (query) {
    // Match on display name OR the dedup key (so "pinehurst 2" finds "Pinehurst No. 2").
    // SANITIZE: `.or()` takes a RAW PostgREST expression — a comma/paren/wildcard in
    // user input would inject extra OR-conditions (e.g. bypassing the deleted_at
    // guard). Strip the filter metacharacters before interpolating.
    const safe = (s: string) => s.replace(/[,()%*\\]/g, ' ').trim();
    const safeQuery = safe(query);
    const safeNorm = safe(normalizeName(query));
    if (safeQuery) {
      q = q.or(`name.ilike.%${safeQuery}%,normalized_name.ilike.%${safeNorm}%`);
    }
  }

  const { data, error } = await q;

  // This is the Cloud Course Library's own listing, and it is the FIRST thing a
  // player sees when adding a course to a round. An empty array here reads as
  // "no courses match" — or worse, on an unfiltered first load, as "the library
  // is empty" — so a dropped connection sends someone off to type a course name
  // by hand that we already have, creating the duplicate the library exists to
  // prevent.
  //
  // Still lenient rather than throwing: this feeds a picker inside a larger
  // form, and taking the round-entry flow down over it would be worse. But the
  // failure is recorded now, which the sibling reads in this file already do.
  if (error) {
    await logServerError(
      `[listCourses] course listing read failed — the library will look empty: ${describeError(error)}`,
      { action: 'courseLibrary.listCourses', featureArea: 'course_library' },
    );
    return [];
  }

  if (!data) return [];
  return data.map(mapCourseRow);
}

const observedListCourses = withAdminObserved(
  'listCourses',
  { sport: 'golf', feature: 'course_library' },
  listCoursesImpl,
);

export async function listCourses(opts: ListCoursesOptions = {}): Promise<GolfCourse[]> {
  return observedListCourses(opts);
}

/**
 * Strict variant of {@link listCourses} for the library PAGE load: it THROWS on
 * a hard DB error instead of masking it as an empty list. The lenient
 * `listCourses` (returns [] on error) stays for incidental callers; the page
 * needs failure to be distinguishable from genuinely-empty so the route
 * error boundary engages with a real "couldn't load — retry" state rather than
 * the cheerful "No courses yet" empty state (premium-scrub B3). (P339)
 */
async function listCoursesStrictImpl(opts: ListCoursesOptions = {}): Promise<GolfCourse[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  let q = supabase
    .from('golf_courses')
    .select('*')
    .is('deleted_at', null)
    .order('name')
    .range(offset, offset + limit - 1);

  const query = opts.query?.trim();
  if (query) {
    const safe = (s: string) => s.replace(/[,()%*\\]/g, ' ').trim();
    const safeQuery = safe(query);
    const safeNorm = safe(normalizeName(query));
    if (safeQuery) {
      q = q.or(`name.ilike.%${safeQuery}%,normalized_name.ilike.%${safeNorm}%`);
    }
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`listCourses failed: ${error.message}`);
  }
  return (data ?? []).map(mapCourseRow);
}

const observedListCoursesStrict = withAdminObserved(
  'listCoursesStrict',
  { sport: 'golf', feature: 'course_library' },
  listCoursesStrictImpl,
);

export async function listCoursesStrict(opts: ListCoursesOptions = {}): Promise<GolfCourse[]> {
  return observedListCoursesStrict(opts);
}

/**
 * Cloud courses the current player has recently played, most-recent first.
 * Derived from golf_rounds.course_id (populated when a round starts from a
 * library tee or is grown from a save). Rounds without a cloud course_id
 * (legacy / per-player quick-pick) simply don't appear. Coaches / no player → [].
 */
async function getRecentlyPlayedCoursesImpl(limit = 12): Promise<GolfCourse[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!player) return [];

  // This function returns a bare GolfCourse[], so there is no channel to
  // report a failure without changing its signature and the picker that
  // consumes it. The consequence of a failed read is mild — the player sees
  // none of the courses they play every week and has to search for one by
  // hand — so it stays lenient rather than throwing.
  //
  // Lenient must not mean invisible, though: "you have played nowhere" and
  // "we could not read your rounds" were the same empty array, and neither
  // left a trace. They are logged now.
  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('course_id, tee_id, round_date')
    .eq('player_id', player.id)
    .order('round_date', { ascending: false })
    .limit(200);
  if (roundsError) {
    await logServerError(
      `[getRecentlyPlayedCourses] rounds read failed — the player's recent courses will look empty: ${describeError(roundsError)}`,
      { action: 'courseLibrary.recentlyPlayed', featureArea: 'course_library', playerId: player.id },
    );
    return [];
  }
  if (!rounds || rounds.length === 0) return [];

  // Prefer course_id; fall back to the tee's course for any round that carries
  // only the tee link. (The round RPCs now persist course_id, but this keeps the
  // feed correct for historical rounds and any edge path.)
  const teeIds = [...new Set(
    rounds.filter((r) => !r.course_id && r.tee_id).map((r) => r.tee_id as string),
  )];
  const teeToCourse = new Map<string, string>();
  if (teeIds.length > 0) {
    const { data: teeRows } = await supabase
      .from('golf_course_tees')
      .select('id, course_id')
      .in('id', teeIds)
      .is('deleted_at', null);
    for (const t of teeRows ?? []) teeToCourse.set(t.id as string, t.course_id as string);
  }

  // Distinct course ids in recency order (first occurrence wins).
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const r of rounds) {
    const cid = (r.course_id as string | null)
      ?? (r.tee_id ? teeToCourse.get(r.tee_id as string) ?? null : null);
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      orderedIds.push(cid);
      if (orderedIds.length >= limit) break;
    }
  }
  if (orderedIds.length === 0) return [];

  // Only surface active courses; preserve recency order.
  const { data: courseRows, error: courseRowsError } = await supabase
    .from('golf_courses')
    .select('*')
    .in('id', orderedIds)
    .is('deleted_at', null);
  // Same leniency, same duty to say so: a failure here drops every course the
  // rounds above just resolved.
  if (courseRowsError) {
    await logServerError(
      `[getRecentlyPlayedCourses] course resolve failed — recent courses will look empty: ${describeError(courseRowsError)}`,
      { action: 'courseLibrary.recentlyPlayed', featureArea: 'course_library' },
    );
    return [];
  }
  if (!courseRows) return [];

  const byId = new Map(courseRows.map((c) => [c.id as string, mapCourseRow(c)]));
  return orderedIds.map((id) => byId.get(id)).filter((c): c is GolfCourse => !!c);
}

const observedGetRecentlyPlayedCourses = withAdminObserved(
  'getRecentlyPlayedCourses',
  { sport: 'golf', feature: 'course_library' },
  getRecentlyPlayedCoursesImpl,
);

export async function getRecentlyPlayedCourses(limit = 12): Promise<GolfCourse[]> {
  return observedGetRecentlyPlayedCourses(limit);
}

/** Active tee-set counts per course id (for card "N tees" labels). */
async function getCourseTeeCountsImpl(courseIds: string[]): Promise<Record<string, number>> {
  if (courseIds.length === 0) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  // PostgREST caps a single response at 1000 rows. A library of ~250 courses with
  // several tee sets each exceeds that, silently undercounting the "N tees" badge
  // for whichever courses fall past row 1000. Paginate with a stable `id` order.
  const { data } = await fetchAllRowsResult<{ id: string; course_id: string }>((from, to) =>
    supabase
      .from('golf_course_tees')
      .select('id, course_id')
      .is('deleted_at', null)
      .in('course_id', courseIds)
      .order('id', { ascending: true })
      .range(from, to),
    undefined,
    { table: 'golf_course_tees', action: 'getCourseTeeCounts', feature: 'course_library', sport: 'golf' },
  );
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const cid = r.course_id;
    counts[cid] = (counts[cid] ?? 0) + 1;
  }
  return counts;
}

const observedGetCourseTeeCounts = withAdminObserved(
  'getCourseTeeCounts',
  { sport: 'golf', feature: 'course_library' },
  getCourseTeeCountsImpl,
);

export async function getCourseTeeCounts(courseIds: string[]): Promise<Record<string, number>> {
  return observedGetCourseTeeCounts(courseIds);
}

/**
 * Strict variant of {@link getCourseTeeCounts} for the page load — THROWS on a
 * hard DB error instead of returning a silently-undercounted map, so a failed
 * read surfaces as a real error state rather than a misleadingly-empty page. (P339)
 */
async function getCourseTeeCountsStrictImpl(courseIds: string[]): Promise<Record<string, number>> {
  if (courseIds.length === 0) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data, error } = await fetchAllRowsResult<{ id: string; course_id: string }>((from, to) =>
    supabase
      .from('golf_course_tees')
      .select('id, course_id')
      .is('deleted_at', null)
      .in('course_id', courseIds)
      .order('id', { ascending: true })
      .range(from, to),
    undefined,
    { table: 'golf_course_tees', action: 'getCourseTeeCountsStrict', feature: 'course_library', sport: 'golf' },
  );
  if (error) {
    throw new Error(`getCourseTeeCounts failed: ${error.message}`);
  }
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const cid = r.course_id;
    counts[cid] = (counts[cid] ?? 0) + 1;
  }
  return counts;
}

const observedGetCourseTeeCountsStrict = withAdminObserved(
  'getCourseTeeCountsStrict',
  { sport: 'golf', feature: 'course_library' },
  getCourseTeeCountsStrictImpl,
);

export async function getCourseTeeCountsStrict(courseIds: string[]): Promise<Record<string, number>> {
  return observedGetCourseTeeCountsStrict(courseIds);
}

/** A course with its ACTIVE tee sets (carousel/detail payload). */
async function getCourseDetailImpl(
  courseId: string,
): Promise<{ course: GolfCourse; tees: GolfCourseTee[] } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: courseRow } = await supabase
    .from('golf_courses')
    .select('*')
    .eq('id', courseId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!courseRow) return null;

  const { data: teeRows } = await supabase
    .from('golf_course_tees')
    .select('*')
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('total_yards', { ascending: false, nullsFirst: false });

  return {
    course: mapCourseRow(courseRow),
    tees: (teeRows ?? []).map(mapTeeRow),
  };
}

const observedGetCourseDetail = withAdminObserved(
  'getCourseDetail',
  { sport: 'golf', feature: 'course_library' },
  getCourseDetailImpl,
);

export async function getCourseDetail(
  courseId: string,
): Promise<{ course: GolfCourse; tees: GolfCourseTee[] } | null> {
  return observedGetCourseDetail(courseId);
}

/**
 * Read-only hole rows for EVERY active tee of a course, keyed by tee id
 * (each sorted by hole_number). #913 part 3 — powers the course detail
 * sheet's compact "Holes" summary (par row + yardage row per tee) so a coach
 * can see the scorecard without opening tee-set edit. One extra round trip
 * per course-detail open; deliberately a separate action from
 * `getCourseDetail` (used by the new-round + tee-picker flows too) so those
 * hot paths never pay for hole data they don't render.
 */
async function getCourseTeeHolesImpl(courseId: string): Promise<Record<string, GolfCourseTeeHole[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: teeRows } = await supabase
    .from('golf_course_tees')
    .select('id')
    .eq('course_id', courseId)
    .is('deleted_at', null);
  const teeIds = (teeRows ?? []).map((t) => t.id as string);
  if (teeIds.length === 0) return {};

  const { data: holeRows } = await supabase
    .from('golf_course_tee_holes')
    .select('*')
    .in('tee_id', teeIds)
    .order('hole_number');

  const byTee: Record<string, GolfCourseTeeHole[]> = {};
  for (const row of holeRows ?? []) {
    const hole = mapTeeHoleRow(row);
    (byTee[hole.tee_id] ??= []).push(hole);
  }
  return byTee;
}

const observedGetCourseTeeHoles = withAdminObserved(
  'getCourseTeeHoles',
  { sport: 'golf', feature: 'course_library' },
  getCourseTeeHolesImpl,
);

export async function getCourseTeeHoles(
  courseId: string,
): Promise<Record<string, GolfCourseTeeHole[]>> {
  return observedGetCourseTeeHoles(courseId);
}

/** A single tee with its hole rows (ordered by hole_number). */
async function getTeeWithHolesImpl(teeId: string): Promise<GolfCourseTeeWithHoles | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: teeRow } = await supabase
    .from('golf_course_tees')
    .select('*')
    .eq('id', teeId)
    .maybeSingle();
  if (!teeRow) return null;

  const { data: holeRows } = await supabase
    .from('golf_course_tee_holes')
    .select('*')
    .eq('tee_id', teeId)
    .order('hole_number');

  return { ...mapTeeRow(teeRow), holes: (holeRows ?? []).map(mapTeeHoleRow) };
}

const observedGetTeeWithHoles = withAdminObserved(
  'getTeeWithHoles',
  { sport: 'golf', feature: 'course_library' },
  getTeeWithHolesImpl,
);

export async function getTeeWithHoles(teeId: string): Promise<GolfCourseTeeWithHoles | null> {
  return observedGetTeeWithHoles(teeId);
}

/** Hole-config defaults for the new-round flow, sourced from a tee set. The
 *  round form snapshots these into golf_holes at submit; the tee is provenance,
 *  not the live source of truth for an already-recorded round. */
export interface TeeRoundDefaults {
  teeId: string;
  teeName: string;
  category: GolfTeeCategory | null;
  courseId: string;
  courseName: string;
  courseCity: string | null;
  courseState: string | null;
  holesCount: number;
  isDraft: boolean;
  courseRating: number | null;
  slopeRating: number | null;
  holes: { holeNumber: number; par: number; yardage: number | null; handicapIndex: number | null }[];
  /**
   * Course imagery, carried so the round-setup screen can show the course the
   * player just picked without a second round-trip. The picker already holds
   * the full golf_courses row client-side when the tee is chosen, so these are
   * populated there rather than re-queried — see FairwayCoursePicker.pickTee.
   * Both optional: a tee picked through any other path simply falls back to
   * CourseImage's name-derived photo.
   */
  courseImageUrl?: string | null;
  courseNormalizedName?: string | null;
}

/** Load a tee set shaped as new-round defaults (Phase 4 tee picker calls this). */
async function getTeeRoundDefaultsImpl(teeId: string): Promise<TeeRoundDefaults | null> {
  const supabase = await createClient();
  const tee = await getTeeWithHoles(teeId);
  if (!tee || tee.deleted_at) return null;

  const { data: course } = await supabase
    .from('golf_courses')
    .select('name, city, state')
    .eq('id', tee.course_id)
    .maybeSingle();

  return {
    teeId: tee.id,
    teeName: tee.tee_name,
    category: tee.category,
    courseId: tee.course_id,
    courseName: (course?.name as string) ?? '',
    courseCity: (course?.city as string) ?? null,
    courseState: (course?.state as string) ?? null,
    holesCount: tee.holes_count,
    isDraft: tee.is_draft,
    courseRating: tee.course_rating,
    slopeRating: tee.slope_rating,
    holes: tee.holes
      .slice()
      .sort((a, b) => a.hole_number - b.hole_number)
      .map((h) => ({
        holeNumber: h.hole_number,
        par: h.par,
        yardage: h.yardage,
        handicapIndex: h.handicap_index,
      })),
  };
}

const observedGetTeeRoundDefaults = withAdminObserved(
  'getTeeRoundDefaults',
  { sport: 'golf', feature: 'course_library' },
  getTeeRoundDefaultsImpl,
);

export async function getTeeRoundDefaults(teeId: string): Promise<TeeRoundDefaults | null> {
  return observedGetTeeRoundDefaults(teeId);
}

/** Append-only course edit history, newest first. */
async function getCourseEditHistoryImpl(courseId: string, limit = 50) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('golf_course_edit_history')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  return data ?? [];
}

const observedGetCourseEditHistory = withAdminObserved(
  'getCourseEditHistory',
  { sport: 'golf', feature: 'course_library' },
  getCourseEditHistoryImpl,
);

export async function getCourseEditHistory(courseId: string, limit = 50) {
  return observedGetCourseEditHistory(courseId, limit);
}

/** The active team's saved courses, joined to course + default tee. */
async function getTeamSavedCoursesImpl(): Promise<GolfTeamSavedCourseWithCourse[]> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) {
    // Not a coach — resolve the PLAYER's active team so players (the picker's
    // primary users) see their team's saved library too. getActor() only
    // resolves a team for coaches, so look the player up via golf_team_members
    // here (mirrors getPlayerTeamId in golf.ts). RLS still lets a team's players
    // SELECT its saved courses.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!player) return [];
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership?.team_id) return [];
    return loadTeamSaved(supabase, membership.team_id as string);
  }
  return loadTeamSaved(supabase, ctx.teamId);
}

const observedGetTeamSavedCourses = withAdminObserved(
  'getTeamSavedCourses',
  { sport: 'golf', feature: 'course_library' },
  getTeamSavedCoursesImpl,
);

export async function getTeamSavedCourses(): Promise<GolfTeamSavedCourseWithCourse[]> {
  return observedGetTeamSavedCourses();
}

async function loadTeamSaved(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<GolfTeamSavedCourseWithCourse[]> {
  // Deliberately lenient — this feeds the course picker's "Saved" tab, where a
  // degraded tab is better than a broken picker (the user can still search).
  // Lenient must not mean silent, though: every one of these failures used to
  // render as "you haven't saved any courses", with nothing written down
  // anywhere, so nobody could tell a quiet library from a broken one.
  const { data: savedRows, error: savedError } = await supabase
    .from('golf_team_saved_courses')
    .select('*')
    .eq('team_id', teamId)
    .order('pinned', { ascending: false })
    .order('last_played_at', { ascending: false, nullsFirst: false });
  if (savedError) {
    await logServerError(
      `[getTeamSavedCourses] saved-courses read failed — the Saved tab will look empty: ${describeError(savedError)}`,
      { action: 'courseLibrary.getTeamSavedCourses', featureArea: 'course_library', teamId },
    );
    return [];
  }
  if (!savedRows || savedRows.length === 0) return [];

  const courseIds = [...new Set(savedRows.map((r) => r.course_id as string))];
  const teeIds = savedRows.map((r) => r.default_tee_id as string | null).filter(Boolean) as string[];

  // Mirror every other read path: never surface soft-deleted courses/tees. A
  // course soft-deleted from the global catalog must also vanish from each
  // team's saved library; a soft-deleted default tee resolves back to null.
  const [courseRes, teeRes] = await Promise.all([
    supabase.from('golf_courses').select('*').in('id', courseIds).is('deleted_at', null),
    teeIds.length
      ? supabase.from('golf_course_tees').select('*').in('id', teeIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Same leniency, same duty to say so. A failed courses read empties the map
  // below, and `if (!course) return null` then drops every saved row — which
  // reads as an empty library rather than as the outage it is.
  const teeError = 'error' in teeRes ? teeRes.error : null;
  if (courseRes.error || teeError) {
    await logServerError(
      `[getTeamSavedCourses] course/tee resolve failed — saved courses will be dropped: ${describeError(courseRes.error ?? teeError)}`,
      { action: 'courseLibrary.getTeamSavedCourses', featureArea: 'course_library', teamId },
    );
  }

  const courseById = new Map((courseRes.data ?? []).map((c) => [c.id as string, mapCourseRow(c)]));
  const teeById = new Map((teeRes.data ?? []).map((t) => [t.id as string, mapTeeRow(t)]));

  return savedRows
    .map((row) => {
      const course = courseById.get(row.course_id as string);
      if (!course) return null; // course soft- or hard-deleted out from under the save
      return {
        ...mapSavedRow(row),
        course,
        default_tee: row.default_tee_id ? teeById.get(row.default_tee_id as string) ?? null : null,
      } as GolfTeamSavedCourseWithCourse;
    })
    .filter((x): x is GolfTeamSavedCourseWithCourse => x !== null);
}

/**
 * Strict variant of {@link getTeamSavedCourses} for the page load — THROWS on a
 * hard DB error reading the saved-courses table so a failure can't masquerade as
 * "this team has saved nothing yet". Resolution of the active team mirrors the
 * lenient reader exactly (coach team, else player membership). (P339)
 */
async function getTeamSavedCoursesStrictImpl(): Promise<GolfTeamSavedCourseWithCourse[]> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!player) return [];
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership?.team_id) return [];
    return loadTeamSavedStrict(supabase, membership.team_id as string);
  }
  return loadTeamSavedStrict(supabase, ctx.teamId);
}

const observedGetTeamSavedCoursesStrict = withAdminObserved(
  'getTeamSavedCoursesStrict',
  { sport: 'golf', feature: 'course_library' },
  getTeamSavedCoursesStrictImpl,
);

export async function getTeamSavedCoursesStrict(): Promise<GolfTeamSavedCourseWithCourse[]> {
  return observedGetTeamSavedCoursesStrict();
}

async function loadTeamSavedStrict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<GolfTeamSavedCourseWithCourse[]> {
  const { data: savedRows, error } = await supabase
    .from('golf_team_saved_courses')
    .select('*')
    .eq('team_id', teamId)
    .order('pinned', { ascending: false })
    .order('last_played_at', { ascending: false, nullsFirst: false });
  if (error) {
    throw new Error(`getTeamSavedCourses failed: ${error.message}`);
  }
  if (!savedRows || savedRows.length === 0) return [];

  const courseIds = [...new Set(savedRows.map((r) => r.course_id as string))];
  const teeIds = savedRows.map((r) => r.default_tee_id as string | null).filter(Boolean) as string[];

  const [courseRes, teeRes] = await Promise.all([
    supabase.from('golf_courses').select('*').in('id', courseIds).is('deleted_at', null),
    teeIds.length
      ? supabase.from('golf_course_tees').select('*').in('id', teeIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // The docstring above promises this variant THROWS so a failure "can't
  // masquerade as 'this team has saved nothing yet'". That guarantee stopped at
  // the saved-courses read. It has to cover this fetch too, because the very
  // next block drops any saved row whose course is missing (`if (!course)
  // return null`) — so a failed courses read empties `courseById`, every row is
  // filtered out, and the page renders the exact empty library the strict
  // variant exists to prevent. The tees read matters less (a missing tee
  // resolves to null rather than dropping the row) but it is the same lie.
  const courseError = courseRes.error;
  const teeError = 'error' in teeRes ? teeRes.error : null;
  if (courseError || teeError) {
    throw new Error(
      `getTeamSavedCourses failed resolving saved courses: ${describeError(courseError ?? teeError)}`,
    );
  }

  const courseById = new Map((courseRes.data ?? []).map((c) => [c.id as string, mapCourseRow(c)]));
  const teeById = new Map((teeRes.data ?? []).map((t) => [t.id as string, mapTeeRow(t)]));

  return savedRows
    .map((row) => {
      const course = courseById.get(row.course_id as string);
      if (!course) return null;
      return {
        ...mapSavedRow(row),
        course,
        default_tee: row.default_tee_id ? teeById.get(row.default_tee_id as string) ?? null : null,
      } as GolfTeamSavedCourseWithCourse;
    })
    .filter((x): x is GolfTeamSavedCourseWithCourse => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSE WRITES
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCourseInput {
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  website?: string | null;
  imageUrl?: string | null;
  source?: string | null;
}

/**
 * Create a cloud course — DEDUP-AWARE. If an active course already shares the
 * normalized name, the existing course is returned (deduped: true) instead of
 * inserting a duplicate. (The hard unique guard lands in the gated dedup phase;
 * this is the app-level guard until then.)
 */
async function createCourseImpl(
  input: CreateCourseInput,
  opts: { skipCoachGate?: boolean } = {},
): Promise<Result<{ course: GolfCourse; deduped: boolean }>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  if (!opts.skipCoachGate) {
    const gateError = requireCoachActor(actor);
    if (gateError) return { success: false, error: gateError };
  }

  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Course name is required' };

  // P338 — scheme-normalize the website (prepend https:// when missing) and
  // reject an obviously-invalid value so we never persist a bare token that
  // would render as a broken relative link.
  const websiteRes = normalizeWebsiteUrl(input.website);
  if (!websiteRes.ok) {
    return { success: false, error: 'Enter a valid website URL (e.g. example.com)' };
  }

  const normalized = normalizeName(name);

  // Dedup: return the existing active course rather than minting a duplicate.
  const { data: existing } = await supabase
    .from('golf_courses')
    .select('*')
    .eq('normalized_name', normalized)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { success: true, data: { course: mapCourseRow(existing), deduped: true } };
  }

  const nowIso = new Date().toISOString();
  const { data: created, error } = await supabase
    .from('golf_courses')
    .insert({
      name,
      normalized_name: normalized,
      city: input.city ?? null,
      state: input.state ?? null,
      country: input.country ?? null,
      address: input.address ?? null,
      website: websiteRes.value,
      image_url: input.imageUrl ?? null,
      source: input.source ?? 'manual',
      created_by_user_id: actor.userId,
      created_by_team_id: actor.teamId,
      last_edited_by_user_id: actor.userId,
      last_edited_by_team_id: actor.teamId,
      last_edited_at: nowIso,
    })
    .select('*')
    .single();

  if (error || !created) {
    // Lost a create race (or a future unique guard tripped): return the winner
    // as a dedup hit rather than a user-facing error.
    if (error?.code === '23505') {
      const { data: raced } = await supabase
        .from('golf_courses')
        .select('*')
        .eq('normalized_name', normalized)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (raced) return { success: true, data: { course: mapCourseRow(raced), deduped: true } };
    }
    await logServerError(`createCourse failed: ${error?.message ?? 'no row'}`, {
      action: 'createCourse',
      featureArea: 'course-library',
      extra: { name, code: error?.code },
    });
    return { success: false, error: 'Failed to create course. Please try again.' };
  }

  await appendCourseHistory(supabase, created.id as string, actor, 'create', {
    name: { from: null, to: name },
  });
  revalidateLibrary();
  return { success: true, data: { course: mapCourseRow(created), deduped: false } };
}

const observedCreateCourse = withAdminObserved(
  'createCourse',
  { sport: 'golf', feature: 'course_library' },
  createCourseImpl,
);

export async function createCourse(
  input: CreateCourseInput,
): Promise<Result<{ course: GolfCourse; deduped: boolean }>> {
  return observedCreateCourse(input);
}

export interface UpdateCoursePatch {
  name?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  website?: string | null;
  imageUrl?: string | null;
}

/** Edit a cloud course (open contribution). Stamps last-edited + edit-history. */
async function updateCourseImpl(
  courseId: string,
  patch: UpdateCoursePatch,
): Promise<Result<GolfCourse>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  const gateError = requireCoachActor(actor);
  if (gateError) return { success: false, error: gateError };

  const { data: before } = await supabase
    .from('golf_courses')
    .select('*')
    .eq('id', courseId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!before) return { success: false, error: 'Course not found' };

  // #913 part 2 — library-owned rows (no human creator) can only be edited
  // by a super admin; team/user-contributed courses keep open contribution.
  if (isLibraryOwnedCourseRow(before) && !isActorSuperAdmin(actor)) {
    return { success: false, error: 'This is a shared library course — only an admin can edit it.' };
  }

  const update: CourseUpdate = {
    last_edited_by_user_id: actor.userId,
    last_edited_by_team_id: actor.teamId,
    last_edited_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { success: false, error: 'Course name cannot be empty' };
    update.name = name;
    update.normalized_name = normalizeName(name);
  }
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.country !== undefined) update.country = patch.country;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.website !== undefined) {
    // P338 — scheme-normalize + validate before persisting (see createCourse).
    const websiteRes = normalizeWebsiteUrl(patch.website);
    if (!websiteRes.ok) {
      return { success: false, error: 'Enter a valid website URL (e.g. example.com)' };
    }
    update.website = websiteRes.value;
  }
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;

  const { data: after, error } = await supabase
    .from('golf_courses')
    .update(update)
    .eq('id', courseId)
    .select('*')
    .single();
  if (error || !after) {
    await logServerError(`updateCourse failed: ${error?.message ?? 'no row'}`, {
      action: 'updateCourse', featureArea: 'course-library', extra: { courseId, code: error?.code },
    });
    // The partial-unique normalized_name index (Phase 5) rejects a rename that
    // collides with another active facility — surface that as a clear message.
    if (error?.code === '23505') {
      return { success: false, error: 'Another course already uses that name' };
    }
    return { success: false, error: 'Failed to update course' };
  }

  const changes = diffFields(
    before as Record<string, unknown>,
    { name: update.name, normalized_name: update.normalized_name, city: update.city,
      state: update.state, country: update.country, address: update.address,
      website: update.website, image_url: update.image_url },
    ['name', 'city', 'state', 'country', 'address', 'website', 'image_url'],
  );
  if (changes) await appendCourseHistory(supabase, courseId, actor, 'update', changes);

  revalidateLibrary();
  return { success: true, data: mapCourseRow(after) };
}

const observedUpdateCourse = withAdminObserved(
  'updateCourse',
  { sport: 'golf', feature: 'course_library' },
  updateCourseImpl,
);

export async function updateCourse(
  courseId: string,
  patch: UpdateCoursePatch,
): Promise<Result<GolfCourse>> {
  return observedUpdateCourse(courseId, patch);
}

/** Soft-delete a course (tombstone). Never hard-deletes — preserves any rounds/saves. */
async function softDeleteCourseImpl(courseId: string): Promise<Result<void>> {
  return setCourseDeleted(courseId, true);
}
async function restoreCourseImpl(courseId: string): Promise<Result<void>> {
  return setCourseDeleted(courseId, false);
}

const observedSoftDeleteCourse = withAdminObserved(
  'softDeleteCourse',
  { sport: 'golf', feature: 'course_library' },
  softDeleteCourseImpl,
);
export async function softDeleteCourse(courseId: string): Promise<Result<void>> {
  return observedSoftDeleteCourse(courseId);
}

const observedRestoreCourse = withAdminObserved(
  'restoreCourse',
  { sport: 'golf', feature: 'course_library' },
  restoreCourseImpl,
);
export async function restoreCourse(courseId: string): Promise<Result<void>> {
  return observedRestoreCourse(courseId);
}

async function setCourseDeleted(courseId: string, deleted: boolean): Promise<Result<void>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  const gateError = requireCoachActor(actor);
  if (gateError) return { success: false, error: gateError };

  // #913 part 2 — same library-ownership gate as updateCourse. Soft-delete
  // and restore are both writes to golf_courses.deleted_at, so they need the
  // same guard: an arbitrary coach may not remove (or un-remove) a shared
  // library row nobody on their team owns.
  const { data: courseRow } = await supabase
    .from('golf_courses')
    .select('created_by_user_id')
    .eq('id', courseId)
    .maybeSingle();
  if (!courseRow) return { success: false, error: 'Course not found' };
  if (isLibraryOwnedCourseRow(courseRow) && !isActorSuperAdmin(actor)) {
    return {
      success: false,
      error: deleted
        ? 'This is a shared library course — only an admin can remove it.'
        : 'This is a shared library course — only an admin can restore it.',
    };
  }

  const { error } = await supabase
    .from('golf_courses')
    .update({
      deleted_at: deleted ? new Date().toISOString() : null,
      last_edited_by_user_id: actor.userId,
      last_edited_by_team_id: actor.teamId,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', courseId);
  if (error) {
    // Restoring (deleted=false) re-enters the active partial-unique index; if an
    // active course already holds this normalized_name the index rejects it.
    if (!deleted && error.code === '23505') {
      return { success: false, error: 'Can’t restore — an active course already uses that name. Rename the active one first.' };
    }
    return { success: false, error: 'Failed to update course' };
  }

  await appendCourseHistory(supabase, courseId, actor, deleted ? 'soft_delete' : 'restore', null);
  revalidateLibrary();
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSE IMAGE  (client uploads directly to the public course-images bucket —
// avoids the 2 MB server-action body limit — then sets the validated URL here)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set golf_courses.image_url to a freshly-uploaded course photo. Accepts ONLY a
 * public URL we minted in our own course-images bucket (never an arbitrary
 * external URL). Goes through the audited updateCourse path (attribution +
 * edit-history).
 */
async function setCourseImageUrlImpl(
  courseId: string,
  imageUrl: string,
): Promise<Result<{ imageUrl: string }>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!isCourseImagePublicUrl(imageUrl, supabaseUrl)) {
    // RECORD WHAT WAS REJECTED, AND WHAT WE EXPECTED.
    //
    // A real coach hit this in production on 2026-08-09 and the log said only
    // "Invalid image URL" with `url: null` — so there was no way to tell
    // whether the upload had produced a strange URL, whether the server's
    // NEXT_PUBLIC_SUPABASE_URL differed from the browser's, or whether the env
    // var was empty (which this predicate also answers false for). The file was
    // already in the bucket by then: the upload succeeded, and only the check
    // on the way back failed, so the coach saw a red toast for a photo that had
    // in fact been stored.
    //
    // Neither value is a secret — the URL is public by construction and the
    // project ref ships in the client bundle — so both are logged verbatim.
    await logServerError(
      `setCourseImageUrl rejected an image URL. received=${JSON.stringify(imageUrl)} ` +
        `expectedPrefix=${JSON.stringify(`${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/course-images/`)} ` +
        `envPresent=${Boolean(supabaseUrl)}`,
      { action: 'courseLibrary.setCourseImageUrl', featureArea: 'course_library' },
      'warning',
    );
    return { success: false, error: 'Invalid image URL' };
  }

  const result = await updateCourse(courseId, { imageUrl });
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: { imageUrl } };
}

const observedSetCourseImageUrl = withAdminObserved(
  'setCourseImageUrl',
  { sport: 'golf', feature: 'course_library' },
  setCourseImageUrlImpl,
);

export async function setCourseImageUrl(
  courseId: string,
  imageUrl: string,
): Promise<Result<{ imageUrl: string }>> {
  return observedSetCourseImageUrl(courseId, imageUrl);
}

/** Clear a course's photo (keeps the storage object; only the uploader can purge it). */
async function removeCourseImageImpl(courseId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  const result = await updateCourse(courseId, { imageUrl: null });
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: undefined };
}

const observedRemoveCourseImage = withAdminObserved(
  'removeCourseImage',
  { sport: 'golf', feature: 'course_library' },
  removeCourseImageImpl,
);

export async function removeCourseImage(courseId: string): Promise<Result<void>> {
  return observedRemoveCourseImage(courseId);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEE WRITES  (NEVER touches golf_rounds / golf_holes — snapshot safety)
// ─────────────────────────────────────────────────────────────────────────────

export interface TeeHoleInput {
  holeNumber: number;
  par: number;
  yardage?: number | null;
  handicapIndex?: number | null;
}
export interface CreateTeeInput {
  teeName: string;
  teeColor?: string | null;
  category?: GolfTeeCategory | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  holesCount?: 9 | 18;
  source?: string | null;
  holes: TeeHoleInput[];
}

/** Add a tee set (+ its holes) to a course. Drafts when the hole set is incomplete. */
async function createTeeImpl(
  courseId: string,
  input: CreateTeeInput,
  opts: { skipCoachGate?: boolean } = {},
): Promise<Result<GolfCourseTeeWithHoles>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  if (!opts.skipCoachGate) {
    const gateError = requireCoachActor(actor);
    if (gateError) return { success: false, error: gateError };
  }

  const teeName = input.teeName?.trim();
  if (!teeName) return { success: false, error: 'Tee name is required' };

  const { data: course } = await supabase
    .from('golf_courses').select('id').eq('id', courseId).is('deleted_at', null).maybeSingle();
  if (!course) return { success: false, error: 'Course not found' };

  const holesCount = input.holesCount ?? 18;
  const rows = normalizeHoleInputs(input.holes).map(holeRow);
  const nowIso = new Date().toISOString();

  const { data: tee, error: teeErr } = await supabase
    .from('golf_course_tees')
    .insert({
      course_id: courseId,
      tee_name: teeName,
      normalized_tee_name: normalizeName(teeName),
      tee_color: input.teeColor ?? null,
      category: input.category ?? null,
      course_rating: input.courseRating ?? null,
      slope_rating: input.slopeRating ?? null,
      holes_count: holesCount,
      total_par: sumPar(rows),
      total_yards: sumYards(rows),
      is_draft: !isTeeComplete(holesCount, rows),
      source: input.source ?? 'manual',
      created_by_user_id: actor.userId,
      created_by_team_id: actor.teamId,
      last_edited_by_user_id: actor.userId,
      last_edited_by_team_id: actor.teamId,
      last_edited_at: nowIso,
    })
    .select('*')
    .single();

  if (teeErr || !tee) {
    // 23505 = the per-course unique (course_id, normalized_tee_name) guard tripped.
    if (teeErr?.code === '23505') {
      return { success: false, error: 'A tee with that name already exists on this course' };
    }
    await logServerError(`createTee failed: ${teeErr?.message ?? 'no row'}`, {
      action: 'createTee', featureArea: 'course-library', extra: { courseId, code: teeErr?.code },
    });
    return { success: false, error: 'Failed to create tee set' };
  }

  if (rows.length > 0) {
    const { error: holesErr } = await supabase
      .from('golf_course_tee_holes')
      .insert(rows.map((r) => ({ tee_id: tee.id as string, ...r })));
    if (holesErr) {
      await logServerError(`createTee holes failed: ${holesErr.message}`, {
        action: 'createTee', featureArea: 'course-library', extra: { teeId: tee.id },
      });
      // Soft-delete the just-created tee so we don't leave a holeless ghost.
      await supabase.from('golf_course_tees')
        .update({ deleted_at: new Date().toISOString() }).eq('id', tee.id as string);
      return { success: false, error: 'Failed to save tee holes' };
    }
  }

  await appendTeeHistory(supabase, tee.id as string, actor, 'create', {
    tee_name: { from: null, to: teeName },
    holes: { from: null, to: rows.length },
  });
  revalidateLibrary();
  return getTeeWithHoles(tee.id as string).then((t) =>
    t ? { success: true as const, data: t } : { success: false as const, error: 'Tee created but could not be reloaded' },
  );
}

const observedCreateTee = withAdminObserved(
  'createTee',
  { sport: 'golf', feature: 'course_library' },
  createTeeImpl,
);

export async function createTee(
  courseId: string,
  input: CreateTeeInput,
): Promise<Result<GolfCourseTeeWithHoles>> {
  return observedCreateTee(courseId, input);
}

export interface ContributeCourseInput {
  courseName: string;
  city?: string | null;
  state?: string | null;
  /** The tee the player labelled the round with (e.g. "White"); falls back to "Default". */
  teeName?: string | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  /** Per-hole pars/yards from the round setup. yardage 0/undefined ⇒ stored as null (unknown). */
  holes: TeeHoleInput[];
}

/**
 * Grow the cloud catalog from a REAL, explicitly-saved round (the "grow from
 * saves" path). Dedup-creates the facility via createCourse (the Phase-5 trigger
 * sets normalized_name; the UNIQUE index self-heals races) and, if that tee name
 * isn't already on the course, adds a tee carrying the round's hole pars/yards.
 *
 * Returns the resolved cloud courseId + teeId so the caller can link the round
 * (golf_rounds.course_id / tee_id) to the catalog. Purely ADDITIVE — touches only
 * golf_courses / golf_course_tees(+holes); NEVER golf_rounds/holes/shots, so the
 * round's own snapshot is unaffected. Best-effort by contract: the caller treats
 * failure as "round still submits, just unlinked".
 */
async function contributeCourseFromRoundImpl(
  input: ContributeCourseInput,
): Promise<Result<{ courseId: string; teeId: string | null }>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

  const name = input.courseName?.trim();
  if (!name) return { success: false, error: 'Course name is required' };

  // 1) Dedup-create the facility (createCourseImpl returns the existing row on a
  //    name match). Calls the ungated impl directly (skipCoachGate) — this is
  //    additive catalog growth from a player's own saved round, NOT "managing
  //    the library" (Decision-1 option A only blocks the latter for players;
  //    see requireCoachActor above and #36/#187).
  const courseRes = await createCourseImpl(
    { name, city: input.city ?? null, state: input.state ?? null, source: 'round' },
    { skipCoachGate: true },
  );
  if (!courseRes.success) return courseRes;
  const courseId = courseRes.data.course.id;

  // 2) Reuse a same-named tee if one already exists on the course (the per-course
  //    (course_id, normalized_tee_name) unique guard would otherwise 23505).
  const teeName = (input.teeName ?? '').trim() || 'Default';
  const normTee = normalizeName(teeName);
  const { data: existingTees } = await supabase
    .from('golf_course_tees')
    .select('id, normalized_tee_name')
    .eq('course_id', courseId)
    .is('deleted_at', null);
  const match = (existingTees ?? []).find((t) => (t.normalized_tee_name as string) === normTee);
  if (match) return { success: true, data: { courseId, teeId: match.id as string } };

  const teeRes = await createTeeImpl(
    courseId,
    {
      teeName,
      courseRating: input.courseRating ?? null,
      slopeRating: input.slopeRating ?? null,
      holesCount: input.holes.length === 9 ? 9 : 18,
      source: 'round',
      holes: input.holes.map((h) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        // A round may leave yardage at 0 ("not entered") — keep the catalog honest.
        yardage: typeof h.yardage === 'number' && h.yardage > 0 ? h.yardage : null,
      })),
    },
    { skipCoachGate: true },
  );
  // The facility link is what matters; a tee failure (incl. a race 23505) leaves
  // the course contributed with teeId null rather than failing the whole call.
  return { success: true, data: { courseId, teeId: teeRes.success ? teeRes.data.id : null } };
}

const observedContributeCourseFromRound = withAdminObserved(
  'contributeCourseFromRound',
  { sport: 'golf', feature: 'course_library' },
  contributeCourseFromRoundImpl,
);

export async function contributeCourseFromRound(
  input: ContributeCourseInput,
): Promise<Result<{ courseId: string; teeId: string | null }>> {
  return observedContributeCourseFromRound(input);
}

export interface UpdateTeePatch {
  teeName?: string;
  teeColor?: string | null;
  category?: GolfTeeCategory | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  holesCount?: 9 | 18;
  /** When provided, REPLACES the hole set via stage-and-swap (no wipe-and-reinsert). */
  holes?: TeeHoleInput[];
}

/**
 * Edit a tee set. Hole replacement is STAGE-AND-SWAP: upsert the new rows by
 * (tee_id, hole_number) FIRST, then delete only the surplus hole numbers. A
 * transient failure can never empty the hole set. Does NOT touch golf_rounds.
 */
async function updateTeeImpl(
  teeId: string,
  patch: UpdateTeePatch,
): Promise<Result<GolfCourseTeeWithHoles>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  const gateError = requireCoachActor(actor);
  if (gateError) return { success: false, error: gateError };

  const { data: before } = await supabase
    .from('golf_course_tees').select('*').eq('id', teeId).is('deleted_at', null).maybeSingle();
  if (!before) return { success: false, error: 'Tee not found' };

  const nowIso = new Date().toISOString();
  const update: TeeUpdate = {
    last_edited_by_user_id: actor.userId,
    last_edited_by_team_id: actor.teamId,
    last_edited_at: nowIso,
  };
  if (patch.teeName !== undefined) {
    const teeName = patch.teeName.trim();
    if (!teeName) return { success: false, error: 'Tee name cannot be empty' };
    update.tee_name = teeName;
    update.normalized_tee_name = normalizeName(teeName);
  }
  if (patch.teeColor !== undefined) update.tee_color = patch.teeColor;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.courseRating !== undefined) update.course_rating = patch.courseRating;
  if (patch.slopeRating !== undefined) update.slope_rating = patch.slopeRating;

  const holesCount = patch.holesCount ?? (before.holes_count as number);
  if (patch.holesCount !== undefined) update.holes_count = patch.holesCount;

  // ── Stage-and-swap the hole set (only when holes are provided) ──
  const nextRows = patch.holes ? normalizeHoleInputs(patch.holes).map(holeRow) : null;
  if (nextRows) {
    // Refuse to "replace" with an empty set — that would wipe every hole. Clearing
    // a hole set is not an editing operation; callers must keep ≥1 valid hole.
    if (nextRows.length === 0) {
      return { success: false, error: 'At least one valid hole is required to replace the hole set' };
    }
    // Upsert the new rows FIRST, so a transient failure can never empty the set.
    const upsertRows = nextRows.map((r) => ({ tee_id: teeId, ...r }));
    const { error: upErr } = await supabase
      .from('golf_course_tee_holes')
      .upsert(upsertRows, { onConflict: 'tee_id,hole_number' });
    if (upErr) {
      await logServerError(`updateTee upsert holes failed: ${upErr.message}`, {
        action: 'updateTee', featureArea: 'course-library', extra: { teeId },
      });
      return { success: false, error: 'Failed to update tee holes' };
    }
    // Delete ONLY the surplus holes (those no longer in the new set). keep is
    // always non-empty here, so this can never delete the whole set.
    const keep = nextRows.map((r) => r.hole_number);
    const { error: delErr } = await supabase
      .from('golf_course_tee_holes')
      .delete()
      .eq('tee_id', teeId)
      .not('hole_number', 'in', `(${keep.join(',')})`);
    if (delErr) {
      // Non-fatal: data is already correct; stale extra holes at worst.
      await logServerError(`updateTee prune holes failed: ${delErr.message}`, {
        action: 'updateTee', featureArea: 'course-library', extra: { teeId },
      });
    }
    update.total_par = sumPar(nextRows);
    update.total_yards = sumYards(nextRows);
    update.is_draft = !isTeeComplete(holesCount, nextRows);
  } else if (patch.holesCount !== undefined) {
    // holesCount changed without new holes — recompute draft from existing holes.
    const { data: existingHoles } = await supabase
      .from('golf_course_tee_holes').select('hole_number, par').eq('tee_id', teeId);
    update.is_draft = !isTeeComplete(holesCount, (existingHoles ?? []) as { hole_number: number; par: number }[]);
  }

  const { data: after, error } = await supabase
    .from('golf_course_tees').update(update).eq('id', teeId).select('*').single();
  if (error || !after) {
    await logServerError(`updateTee failed: ${error?.message ?? 'no row'}`, {
      action: 'updateTee', featureArea: 'course-library', extra: { teeId, code: error?.code },
    });
    return { success: false, error: 'Failed to update tee set' };
  }

  const changes = diffFields(
    before as Record<string, unknown>,
    { tee_name: update.tee_name, tee_color: update.tee_color, category: update.category,
      course_rating: update.course_rating, slope_rating: update.slope_rating,
      holes_count: update.holes_count, total_par: update.total_par, total_yards: update.total_yards },
    ['tee_name', 'tee_color', 'category', 'course_rating', 'slope_rating', 'holes_count', 'total_par', 'total_yards'],
  );
  if (changes || nextRows) {
    await appendTeeHistory(supabase, teeId, actor, 'update', {
      ...(changes ?? {}),
      ...(nextRows ? { holes: { from: null, to: nextRows.length } } : {}),
    });
  }

  revalidateLibrary();
  const reloaded = await getTeeWithHoles(teeId);
  return reloaded
    ? { success: true, data: reloaded }
    : { success: false, error: 'Tee updated but could not be reloaded' };
}

const observedUpdateTee = withAdminObserved(
  'updateTee',
  { sport: 'golf', feature: 'course_library' },
  updateTeeImpl,
);

export async function updateTee(
  teeId: string,
  patch: UpdateTeePatch,
): Promise<Result<GolfCourseTeeWithHoles>> {
  return observedUpdateTee(teeId, patch);
}

async function softDeleteTeeImpl(teeId: string): Promise<Result<void>> {
  return setTeeDeleted(teeId, true);
}
async function restoreTeeImpl(teeId: string): Promise<Result<void>> {
  return setTeeDeleted(teeId, false);
}

const observedSoftDeleteTee = withAdminObserved(
  'softDeleteTee',
  { sport: 'golf', feature: 'course_library' },
  softDeleteTeeImpl,
);
export async function softDeleteTee(teeId: string): Promise<Result<void>> {
  return observedSoftDeleteTee(teeId);
}

const observedRestoreTee = withAdminObserved(
  'restoreTee',
  { sport: 'golf', feature: 'course_library' },
  restoreTeeImpl,
);
export async function restoreTee(teeId: string): Promise<Result<void>> {
  return observedRestoreTee(teeId);
}

async function setTeeDeleted(teeId: string, deleted: boolean): Promise<Result<void>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  const gateError = requireCoachActor(actor);
  if (gateError) return { success: false, error: gateError };

  const { error } = await supabase
    .from('golf_course_tees')
    .update({
      deleted_at: deleted ? new Date().toISOString() : null,
      last_edited_by_user_id: actor.userId,
      last_edited_by_team_id: actor.teamId,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', teeId);
  if (error) return { success: false, error: 'Failed to update tee set' };

  await appendTeeHistory(supabase, teeId, actor, deleted ? 'soft_delete' : 'restore', null);
  revalidateLibrary();
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM-SAVED WRITES  (coach-gated; RLS enforces is_golf_team_coach)
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveTeamCourseOptions {
  defaultTeeId?: string | null;
  pinned?: boolean;
}

/** Save a course to the active team's library (idempotent upsert on team+course). */
async function saveTeamCourseImpl(
  courseId: string,
  opts: SaveTeamCourseOptions = {},
): Promise<Result<GolfTeamSavedCourse>> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const { data: existing } = await supabase
    .from('golf_team_saved_courses')
    .select('*')
    .eq('team_id', ctx.teamId)
    .eq('course_id', courseId)
    .maybeSingle();

  const payload = {
    team_id: ctx.teamId,
    course_id: courseId,
    default_tee_id: opts.defaultTeeId ?? existing?.default_tee_id ?? null,
    pinned: opts.pinned ?? existing?.pinned ?? false,
    created_by_user_id: existing?.created_by_user_id ?? ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('golf_team_saved_courses')
    .upsert(payload, { onConflict: 'team_id,course_id' })
    .select('*')
    .single();
  if (error || !data) {
    await logServerError(`saveTeamCourse failed: ${error?.message ?? 'no row'}`, {
      action: 'saveTeamCourse', featureArea: 'course-library', extra: { courseId, code: error?.code },
    });
    return { success: false, error: 'Failed to save course to team library' };
  }
  revalidateLibrary();
  return { success: true, data: mapSavedRow(data) };
}

const observedSaveTeamCourse = withAdminObserved(
  'saveTeamCourse',
  { sport: 'golf', feature: 'course_library' },
  saveTeamCourseImpl,
);

export async function saveTeamCourse(
  courseId: string,
  opts: SaveTeamCourseOptions = {},
): Promise<Result<GolfTeamSavedCourse>> {
  return observedSaveTeamCourse(courseId, opts);
}

/** Remove a course from the team library (a bookmark row — no round/stat data lost). */
async function unsaveTeamCourseImpl(courseId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const { error } = await supabase
    .from('golf_team_saved_courses')
    .delete()
    .eq('team_id', ctx.teamId)
    .eq('course_id', courseId);
  if (error) return { success: false, error: 'Failed to remove course from team library' };
  revalidateLibrary();
  return { success: true, data: undefined };
}

const observedUnsaveTeamCourse = withAdminObserved(
  'unsaveTeamCourse',
  { sport: 'golf', feature: 'course_library' },
  unsaveTeamCourseImpl,
);

export async function unsaveTeamCourse(courseId: string): Promise<Result<void>> {
  return observedUnsaveTeamCourse(courseId);
}

/** Set (or clear) the team's default tee for a saved course. */
async function setTeamCourseDefaultTeeImpl(
  courseId: string,
  teeId: string | null,
): Promise<Result<void>> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const { error } = await supabase
    .from('golf_team_saved_courses')
    .update({ default_tee_id: teeId, updated_at: new Date().toISOString() })
    .eq('team_id', ctx.teamId)
    .eq('course_id', courseId);
  if (error) return { success: false, error: 'Failed to set default tee' };
  revalidateLibrary();
  return { success: true, data: undefined };
}

const observedSetTeamCourseDefaultTee = withAdminObserved(
  'setTeamCourseDefaultTee',
  { sport: 'golf', feature: 'course_library' },
  setTeamCourseDefaultTeeImpl,
);

export async function setTeamCourseDefaultTee(
  courseId: string,
  teeId: string | null,
): Promise<Result<void>> {
  return observedSetTeamCourseDefaultTee(courseId, teeId);
}

/** Pin/unpin a saved course for the team. */
async function setTeamCoursePinnedImpl(
  courseId: string,
  pinned: boolean,
): Promise<Result<void>> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const { error } = await supabase
    .from('golf_team_saved_courses')
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq('team_id', ctx.teamId)
    .eq('course_id', courseId);
  if (error) return { success: false, error: 'Failed to update pin state' };
  revalidateLibrary();
  return { success: true, data: undefined };
}

const observedSetTeamCoursePinned = withAdminObserved(
  'setTeamCoursePinned',
  { sport: 'golf', feature: 'course_library' },
  setTeamCoursePinnedImpl,
);

export async function setTeamCoursePinned(
  courseId: string,
  pinned: boolean,
): Promise<Result<void>> {
  return observedSetTeamCoursePinned(courseId, pinned);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitize + de-dupe hole inputs by hole_number (last write wins), sorted. */
function normalizeHoleInputs(holes: TeeHoleInput[]): TeeHoleInput[] {
  const byNumber = new Map<number, TeeHoleInput>();
  for (const h of holes) {
    if (!Number.isInteger(h.holeNumber) || h.holeNumber < 1 || h.holeNumber > 18) continue;
    if (!Number.isInteger(h.par) || h.par < 3 || h.par > 6) continue;
    byNumber.set(h.holeNumber, h);
  }
  return [...byNumber.values()].sort((a, b) => a.holeNumber - b.holeNumber);
}

function holeRow(h: TeeHoleInput) {
  return {
    hole_number: h.holeNumber,
    par: h.par,
    yardage: typeof h.yardage === 'number' ? h.yardage : null,
    handicap_index: typeof h.handicapIndex === 'number' ? h.handicapIndex : null,
  };
}

async function appendCourseHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  actor: Actor,
  action: 'create' | 'update' | 'soft_delete' | 'restore',
  changes: Record<string, { from: unknown; to: unknown }> | null,
) {
  const { error } = await supabase.from('golf_course_edit_history').insert({
    course_id: courseId,
    edited_by_user_id: actor.userId,
    edited_by_team_id: actor.teamId,
    action,
    changes: changes as never,
  });
  if (error) {
    await logServerError(`appendCourseHistory failed: ${error.message}`, {
      action: 'appendCourseHistory', featureArea: 'course-library', extra: { courseId, code: error.code },
    });
  }
}

async function appendTeeHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teeId: string,
  actor: Actor,
  action: 'create' | 'update' | 'soft_delete' | 'restore',
  changes: Record<string, { from: unknown; to: unknown }> | null,
) {
  const { error } = await supabase.from('golf_course_tee_edit_history').insert({
    tee_id: teeId,
    edited_by_user_id: actor.userId,
    edited_by_team_id: actor.teamId,
    action,
    changes: changes as never,
  });
  if (error) {
    await logServerError(`appendTeeHistory failed: ${error.message}`, {
      action: 'appendTeeHistory', featureArea: 'course-library', extra: { teeId, code: error.code },
    });
  }
}
