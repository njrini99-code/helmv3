'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { resolveCourseId } from './golf-action-shared';
import type { ActionResult } from './golf-action-shared';

// ============================================================================
// SAVED COURSES - Player's saved course configurations
// ============================================================================

/** Hole configuration for a saved course */
export interface SavedCourseHoleConfig {
  holeNumber: number;
  par: number;
  yardage: number;
}
/** Saved course data returned to client */
export interface SavedCourse {
  id: string;
  courseId: string | null;
  courseName: string;
  courseCity: string | null;
  courseState: string | null;
  courseRating: number | null;
  courseSlope: number | null;
  teesPlayed: string | null;
  holesPerRound: number;
  holeConfigs: SavedCourseHoleConfig[];
  lastUsedAt: string;
  createdAt: string;
}
/** DB row shape for golf_player_courses.
 *  Extended fields (city, state, rating, slope, tees, holeConfigs) are stored
 *  as JSON inside the `notes` column because those columns don't exist on the table.
 */
interface SavedCourseRow {
  id: string;
  course_id: string | null;
  course_name: string;
  notes: string | null;
  last_played_at: string | null;
  created_at: string;
}
/** Shape of the JSON stored in the notes column */
interface SavedCourseNotes {
  city?: string | null;
  state?: string | null;
  rating?: number | null;
  slope?: number | null;
  tees?: string | null;
  holesPerRound?: number;
  holeConfigs?: SavedCourseHoleConfig[];
}
/** Input for saving a course configuration */
export interface SaveCourseInput {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  holesPerRound: number;
  holeConfigs: SavedCourseHoleConfig[];
}
/**
 * Get all saved courses for the current player
 * Returns courses sorted by most recently used
 */
async function getPlayerSavedCoursesImpl(): Promise<ActionResult<SavedCourse[]>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Get the player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    return { success: false, error: 'Player profile not found' };
  }

  // Fetch saved courses (table has extended columns not in generated types)
  const { data: courses, error } = await fromUntyped(supabase, 'golf_player_courses')
    .select('*')
    .eq('player_id', player.id)
    .order('last_played_at', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to load saved courses' };
  }

  // Transform to client format — extended fields are stored in the `notes` JSON column
  const savedCourses: SavedCourse[] = ((courses || []) as SavedCourseRow[]).map((course) => {
    let parsed: SavedCourseNotes = {};
    if (course.notes) {
      try { parsed = JSON.parse(course.notes) as SavedCourseNotes; } catch { /* ignore */ }
    }
    return {
      id: course.id,
      courseId: course.course_id ?? null,
      courseName: course.course_name,
      courseCity: parsed.city ?? null,
      courseState: parsed.state ?? null,
      courseRating: parsed.rating ?? null,
      courseSlope: parsed.slope ?? null,
      teesPlayed: parsed.tees ?? null,
      holesPerRound: parsed.holesPerRound ?? 18,
      holeConfigs: parsed.holeConfigs || [],
      lastUsedAt: course.last_played_at ?? '',
      createdAt: course.created_at ?? '',
    };
  });

  return { success: true, data: savedCourses };
}
const observedGetPlayerSavedCourses = withAdminObserved(
  'getPlayerSavedCourses',
  { sport: 'golf', feature: 'course_library' },
  getPlayerSavedCoursesImpl,
);
export async function getPlayerSavedCourses(): Promise<ActionResult<SavedCourse[]>> {
  return observedGetPlayerSavedCourses();
}
/**
 * Save a new course configuration or update existing one
 */
async function savePlayerCourseImpl(input: SaveCourseInput): Promise<ActionResult<SavedCourse>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Get the player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    return { success: false, error: 'Player profile not found' };
  }

  // Check if course with same name already exists
  // Note: The code expects extended columns (course_city, course_state, etc.) that may not exist in all deployments
  const { data: existing } = await fromUntyped(supabase, 'golf_player_courses')
    .select('id')
    .eq('player_id', player.id)
    .ilike('course_name', input.courseName)
    .maybeSingle();

  // Try to resolve course_id from golf_courses by name
  const resolvedCourseId = await resolveCourseId(supabase, input.courseName);

  // Course data with extended fields - stored as JSON in notes if extended columns don't exist
  const courseData = {
    player_id: player.id,
    course_id: resolvedCourseId,
    course_name: input.courseName,
    notes: JSON.stringify({
      city: input.courseCity,
      state: input.courseState,
      rating: input.courseRating,
      slope: input.courseSlope,
      tees: input.teesPlayed,
      holesPerRound: input.holesPerRound,
      holeConfigs: input.holeConfigs,
    }),
    last_played_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let result: { data: Record<string, unknown> | null; error: { message: string } | null };
  if (existing) {
    // Update existing course
    result = await fromUntyped(supabase, 'golf_player_courses')
      .update(courseData)
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    // Insert new course
    result = await fromUntyped(supabase, 'golf_player_courses')
      .insert(courseData)
      .select()
      .single();
  }

  if (result.error) {
    return { success: false, error: 'Failed to save course configuration' };
  }

  const course = result.data as unknown as SavedCourseRow;
  let parsed: SavedCourseNotes = {};
  if (course.notes) {
    try { parsed = JSON.parse(course.notes) as SavedCourseNotes; } catch { /* ignore */ }
  }
  const savedCourse: SavedCourse = {
    id: course.id,
    courseId: course.course_id ?? null,
    courseName: course.course_name,
    courseCity: parsed.city ?? null,
    courseState: parsed.state ?? null,
    courseRating: parsed.rating ?? null,
    courseSlope: parsed.slope ?? null,
    teesPlayed: parsed.tees ?? null,
    holesPerRound: parsed.holesPerRound ?? 18,
    holeConfigs: parsed.holeConfigs || [],
    lastUsedAt: course.last_played_at ?? '',
    createdAt: course.created_at ?? '',
  };

  return { success: true, data: savedCourse };
}
const observedSavePlayerCourse = withAdminObserved(
  'savePlayerCourse',
  { sport: 'golf', feature: 'course_library' },
  savePlayerCourseImpl,
);
export async function savePlayerCourse(input: SaveCourseInput): Promise<ActionResult<SavedCourse>> {
  return observedSavePlayerCourse(input);
}
/**
 * Update the last_used_at timestamp for a saved course
 */
async function touchSavedCourseImpl(courseId: string): Promise<ActionResult<void>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Update last_used_at (RLS will ensure ownership)
  // Note: golf_player_courses table uses last_played_at instead of last_used_at
  const { error } = await supabase.from('golf_player_courses')
    .update({ last_played_at: new Date().toISOString() })
    .eq('id', courseId);

  if (error) {
    return { success: false, error: 'Failed to update course' };
  }

  return { success: true, data: undefined };
}
const observedTouchSavedCourse = withAdminObserved(
  'touchSavedCourse',
  { sport: 'golf', feature: 'course_library' },
  touchSavedCourseImpl,
);
export async function touchSavedCourse(courseId: string): Promise<ActionResult<void>> {
  return observedTouchSavedCourse(courseId);
}
/**
 * RecentPlayedCourse — a saved course enriched with the player's
 * historical round count. Used by the new-round quick-pick tile grid.
 */
export interface RecentPlayedCourse extends SavedCourse {
  /** Total finished/in-progress rounds the player has logged at this course */
  roundCount: number;
  /** ISO date of the most recent round at this course (falls back to lastUsedAt) */
  lastPlayedAt: string;
}
/**
 * Get the player's recently-played courses for the "New Round" quick-pick.
 *
 * Source of truth: `golf_player_courses` (the saved-course record). We
 * enrich each row with a play count derived from `golf_rounds` so the
 * tile can show "{N} rounds". Matching is by `course_id` when present,
 * otherwise case-insensitive `course_name`.
 *
 * Sorted by `last_played_at` DESC, capped to `limit` (default 8).
 */
async function getRecentCoursesForPlayerImpl(
  limit = 8,
): Promise<ActionResult<RecentPlayedCourse[]>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    return { success: false, error: 'Player profile not found' };
  }

  // Pull saved courses for the player (ordered by last played)
  const { data: courses, error } = await fromUntyped(supabase, 'golf_player_courses')
    .select('*')
    .eq('player_id', player.id)
    .order('last_played_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, error: 'Failed to load recent courses' };
  }

  const savedRows = (courses || []) as SavedCourseRow[];

  // Empty fast-path — no saved courses yet, no need to query rounds
  if (savedRows.length === 0) {
    return { success: true, data: [] };
  }

  // Pull this player's rounds in one shot so we can build a count map.
  // We only need the matching keys + round_date for fallback ordering.
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('course_id, course_name, round_date')
    .eq('player_id', player.id)
    .eq('is_test', false);

  const roundsList = (rounds || []) as Array<{
    course_id: string | null;
    course_name: string | null;
    round_date: string | null;
  }>;

  // Build a count map keyed by course_id (preferred) and lowercased course_name
  const countById = new Map<string, number>();
  const lastDateById = new Map<string, string>();
  const countByName = new Map<string, number>();
  const lastDateByName = new Map<string, string>();

  for (const r of roundsList) {
    const date = r.round_date ?? '';
    if (r.course_id) {
      countById.set(r.course_id, (countById.get(r.course_id) ?? 0) + 1);
      const prev = lastDateById.get(r.course_id);
      if (!prev || (date && date > prev)) lastDateById.set(r.course_id, date);
    }
    if (r.course_name) {
      const key = r.course_name.toLowerCase().trim();
      countByName.set(key, (countByName.get(key) ?? 0) + 1);
      const prev = lastDateByName.get(key);
      if (!prev || (date && date > prev)) lastDateByName.set(key, date);
    }
  }

  const enriched: RecentPlayedCourse[] = savedRows.map((course) => {
    let parsed: SavedCourseNotes = {};
    if (course.notes) {
      try { parsed = JSON.parse(course.notes) as SavedCourseNotes; } catch { /* ignore */ }
    }

    // Resolve play count: prefer course_id match, fall back to course_name
    const nameKey = course.course_name.toLowerCase().trim();
    const roundCount = course.course_id
      ? (countById.get(course.course_id) ?? countByName.get(nameKey) ?? 0)
      : (countByName.get(nameKey) ?? 0);
    const derivedLastPlayed = course.course_id
      ? (lastDateById.get(course.course_id) ?? lastDateByName.get(nameKey))
      : lastDateByName.get(nameKey);

    return {
      id: course.id,
      courseId: course.course_id ?? null,
      courseName: course.course_name,
      courseCity: parsed.city ?? null,
      courseState: parsed.state ?? null,
      courseRating: parsed.rating ?? null,
      courseSlope: parsed.slope ?? null,
      teesPlayed: parsed.tees ?? null,
      holesPerRound: parsed.holesPerRound ?? 18,
      holeConfigs: parsed.holeConfigs ?? [],
      lastUsedAt: course.last_played_at ?? '',
      createdAt: course.created_at ?? '',
      roundCount,
      lastPlayedAt: derivedLastPlayed || course.last_played_at || '',
    };
  });

  return { success: true, data: enriched };
}
const observedGetRecentCoursesForPlayer = withAdminObserved(
  'getRecentCoursesForPlayer',
  { sport: 'golf', feature: 'course_library' },
  getRecentCoursesForPlayerImpl,
);
export async function getRecentCoursesForPlayer(
  limit = 8,
): Promise<ActionResult<RecentPlayedCourse[]>> {
  return observedGetRecentCoursesForPlayer(limit);
}
