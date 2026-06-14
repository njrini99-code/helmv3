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
} from '@/lib/golf/course-library';
import type {
  GolfCourse,
  GolfCourseTee,
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

type Actor = { userId: string; teamId: string | null };

/** Authenticated user + best-effort attribution team (coach's active team). */
async function getActor(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Actor | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Attribution team is best-effort: coaches get their active (cookie-aware)
  // team; players leave it null. created_by_user_id is the required attribution.
  let teamId: string | null = null;
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (coach) {
    teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  }
  return { userId: user.id, teamId };
}

/** Resolve the caller's active team AS A COACH (team-library management gate). */
async function getCoachTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ userId: string; teamId: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be logged in' };

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return { error: 'Only coaches can manage the team course library' };

  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) return { error: 'No active team found' };
  return { userId: user.id, teamId };
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
export async function listCourses(opts: ListCoursesOptions = {}): Promise<GolfCourse[]> {
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
  if (error || !data) return [];
  return data.map(mapCourseRow);
}

/**
 * Cloud courses the current player has recently played, most-recent first.
 * Derived from golf_rounds.course_id (populated when a round starts from a
 * library tee or is grown from a save). Rounds without a cloud course_id
 * (legacy / per-player quick-pick) simply don't appear. Coaches / no player → [].
 */
export async function getRecentlyPlayedCourses(limit = 12): Promise<GolfCourse[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!player) return [];

  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('course_id, round_date')
    .eq('player_id', player.id)
    .not('course_id', 'is', null)
    .order('round_date', { ascending: false })
    .limit(200);
  if (!rounds || rounds.length === 0) return [];

  // Distinct course ids in recency order (first occurrence wins).
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const r of rounds) {
    const cid = r.course_id as string | null;
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      orderedIds.push(cid);
      if (orderedIds.length >= limit) break;
    }
  }
  if (orderedIds.length === 0) return [];

  // Only surface active courses; preserve recency order.
  const { data: courseRows } = await supabase
    .from('golf_courses')
    .select('*')
    .in('id', orderedIds)
    .is('deleted_at', null);
  if (!courseRows) return [];

  const byId = new Map(courseRows.map((c) => [c.id as string, mapCourseRow(c)]));
  return orderedIds.map((id) => byId.get(id)).filter((c): c is GolfCourse => !!c);
}

/** Active tee-set counts per course id (for card "N tees" labels). */
export async function getCourseTeeCounts(courseIds: string[]): Promise<Record<string, number>> {
  if (courseIds.length === 0) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase
    .from('golf_course_tees')
    .select('course_id')
    .is('deleted_at', null)
    .in('course_id', courseIds);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const cid = r.course_id as string;
    counts[cid] = (counts[cid] ?? 0) + 1;
  }
  return counts;
}

/** A course with its ACTIVE tee sets (carousel/detail payload). */
export async function getCourseDetail(
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

/** A single tee with its hole rows (ordered by hole_number). */
export async function getTeeWithHoles(teeId: string): Promise<GolfCourseTeeWithHoles | null> {
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
}

/** Load a tee set shaped as new-round defaults (Phase 4 tee picker calls this). */
export async function getTeeRoundDefaults(teeId: string): Promise<TeeRoundDefaults | null> {
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

/** Append-only course edit history, newest first. */
export async function getCourseEditHistory(courseId: string, limit = 50) {
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

/** The active team's saved courses, joined to course + default tee. */
export async function getTeamSavedCourses(): Promise<GolfTeamSavedCourseWithCourse[]> {
  const supabase = await createClient();
  const ctx = await getCoachTeam(supabase);
  if ('error' in ctx) {
    // Players can still READ the team library (RLS allows team players to select).
    const actor = await getActor(supabase);
    if (!actor?.teamId) return [];
    return loadTeamSaved(supabase, actor.teamId);
  }
  return loadTeamSaved(supabase, ctx.teamId);
}

async function loadTeamSaved(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<GolfTeamSavedCourseWithCourse[]> {
  const { data: savedRows } = await supabase
    .from('golf_team_saved_courses')
    .select('*')
    .eq('team_id', teamId)
    .order('pinned', { ascending: false })
    .order('last_played_at', { ascending: false, nullsFirst: false });
  if (!savedRows || savedRows.length === 0) return [];

  const courseIds = [...new Set(savedRows.map((r) => r.course_id as string))];
  const teeIds = savedRows.map((r) => r.default_tee_id as string | null).filter(Boolean) as string[];

  // Mirror every other read path: never surface soft-deleted courses/tees. A
  // course soft-deleted from the global catalog must also vanish from each
  // team's saved library; a soft-deleted default tee resolves back to null.
  const [{ data: courseRows }, teeRes] = await Promise.all([
    supabase.from('golf_courses').select('*').in('id', courseIds).is('deleted_at', null),
    teeIds.length
      ? supabase.from('golf_course_tees').select('*').in('id', teeIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const courseById = new Map((courseRows ?? []).map((c) => [c.id as string, mapCourseRow(c)]));
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
export async function createCourse(
  input: CreateCourseInput,
): Promise<Result<{ course: GolfCourse; deduped: boolean }>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Course name is required' };

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
      website: input.website ?? null,
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
export async function updateCourse(
  courseId: string,
  patch: UpdateCoursePatch,
): Promise<Result<GolfCourse>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

  const { data: before } = await supabase
    .from('golf_courses')
    .select('*')
    .eq('id', courseId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!before) return { success: false, error: 'Course not found' };

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
  if (patch.website !== undefined) update.website = patch.website;
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

/** Soft-delete a course (tombstone). Never hard-deletes — preserves any rounds/saves. */
export async function softDeleteCourse(courseId: string): Promise<Result<void>> {
  return setCourseDeleted(courseId, true);
}
export async function restoreCourse(courseId: string): Promise<Result<void>> {
  return setCourseDeleted(courseId, false);
}

async function setCourseDeleted(courseId: string, deleted: boolean): Promise<Result<void>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

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
export async function setCourseImageUrl(
  courseId: string,
  imageUrl: string,
): Promise<Result<{ imageUrl: string }>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!isCourseImagePublicUrl(imageUrl, supabaseUrl)) {
    return { success: false, error: 'Invalid image URL' };
  }

  const result = await updateCourse(courseId, { imageUrl });
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: { imageUrl } };
}

/** Clear a course's photo (keeps the storage object; only the uploader can purge it). */
export async function removeCourseImage(courseId: string): Promise<Result<void>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };
  const result = await updateCourse(courseId, { imageUrl: null });
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: undefined };
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
export async function createTee(
  courseId: string,
  input: CreateTeeInput,
): Promise<Result<GolfCourseTeeWithHoles>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

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
export async function contributeCourseFromRound(
  input: ContributeCourseInput,
): Promise<Result<{ courseId: string; teeId: string | null }>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

  const name = input.courseName?.trim();
  if (!name) return { success: false, error: 'Course name is required' };

  // 1) Dedup-create the facility (createCourse returns the existing row on a name match).
  const courseRes = await createCourse({
    name,
    city: input.city ?? null,
    state: input.state ?? null,
    source: 'round',
  });
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

  const teeRes = await createTee(courseId, {
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
  });
  // The facility link is what matters; a tee failure (incl. a race 23505) leaves
  // the course contributed with teeId null rather than failing the whole call.
  return { success: true, data: { courseId, teeId: teeRes.success ? teeRes.data.id : null } };
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
export async function updateTee(
  teeId: string,
  patch: UpdateTeePatch,
): Promise<Result<GolfCourseTeeWithHoles>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

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

export async function softDeleteTee(teeId: string): Promise<Result<void>> {
  return setTeeDeleted(teeId, true);
}
export async function restoreTee(teeId: string): Promise<Result<void>> {
  return setTeeDeleted(teeId, false);
}

async function setTeeDeleted(teeId: string, deleted: boolean): Promise<Result<void>> {
  const supabase = await createClient();
  const actor = await getActor(supabase);
  if (!actor) return { success: false, error: 'You must be logged in' };

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
export async function saveTeamCourse(
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

/** Remove a course from the team library (a bookmark row — no round/stat data lost). */
export async function unsaveTeamCourse(courseId: string): Promise<Result<void>> {
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

/** Set (or clear) the team's default tee for a saved course. */
export async function setTeamCourseDefaultTee(
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

/** Pin/unpin a saved course for the team. */
export async function setTeamCoursePinned(
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
