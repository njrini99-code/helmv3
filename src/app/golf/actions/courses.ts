'use server';

/**
 * ⚠️ DEPRECATED — DO NOT WIRE. Superseded by the cloud Course Library
 * (`@/app/golf/actions/course-library.ts`). As of 2026-06-14 this module has ZERO
 * importers. It is retained only for reference and must not be re-introduced:
 * `updateCourse` here does a DELETE-then-INSERT on hole rows (a destructive write
 * that can wipe a course's holes on a transient failure — see
 * feedback_golf_no_destructive_writes). Use `course-library.ts updateTee`'s
 * stage-and-swap instead. Prefer deleting this file once confirmed unreferenced.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CourseSetupData, GolfCourse, GolfCourseHole } from '@/lib/types/golf-course';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';

/**
 * Get all saved courses for the current user
 * Note: golf_courses table has a simpler schema than GolfCourse type
 * We cast results to match the expected type, filling in missing fields
 */
async function getSavedCoursesImpl(): Promise<GolfCourse[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: courses, error } = await supabase
    .from('golf_courses')
    .select('*')
    .order('name');

  if (error || !courses) {
    return [];
  }

  // Map database rows to GolfCourse type, providing defaults for missing fields
  return courses.map((course: Record<string, unknown>) => ({
    id: course.id as string,
    name: course.name as string,
    city: (course.city as string) ?? null,
    state: (course.state as string) ?? null,
    country: (course.country as string) ?? null,
    course_rating: (course.course_rating as number) ?? null,
    slope_rating: (course.slope_rating as number) ?? null,
    default_tee_name: null,
    default_tee_color: null,
    total_yardage: null,
    total_par: (course.par as number) ?? null,
    created_by: null,
    is_public: true,
    created_at: (course.created_at as string) ?? null,
    updated_at: null,
  }));
}

const observedGetSavedCourses = withAdminObserved(
  'getSavedCourses',
  { sport: 'golf', feature: 'course_library' },
  getSavedCoursesImpl,
);

export async function getSavedCourses(): Promise<GolfCourse[]> {
  return observedGetSavedCourses();
}

/**
 * Get a single course with its holes
 * Note: golf_courses table has a simpler schema than GolfCourse type
 */
async function getCourseWithHolesImpl(courseId: string): Promise<{
  course: GolfCourse | null;
  holes: GolfCourseHole[];
}> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { course: null, holes: [] };

    const { data: courseData } = await supabase
      .from('golf_courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (!courseData) return { course: null, holes: [] };

  // Map to GolfCourse type
  const course: GolfCourse = {
    id: courseData.id,
    name: courseData.name,
    city: courseData.city ?? null,
    state: courseData.state ?? null,
    country: courseData.country ?? null,
    course_rating: courseData.course_rating ?? null,
    slope_rating: courseData.slope_rating ?? null,
    default_tee_name: null,
    default_tee_color: null,
    total_yardage: null,
    total_par: courseData.par ?? null,
    created_by: null,
    is_public: true,
    created_at: courseData.created_at ?? null,
    updated_at: null,
  };

  const { data: holesData } = await supabase
    .from('golf_course_holes')
    .select('*')
    .eq('course_id', courseId)
    .order('hole_number');

  // Map holes to GolfCourseHole type
  const holes: GolfCourseHole[] = (holesData || []).map((h: Record<string, unknown>) => ({
    id: h.id as string,
    course_id: h.course_id as string,
    hole_number: h.hole_number as number,
    par: h.par as number,
    yardage: (h.yardage as number) ?? 0,
    handicap_index: (h.handicap_index as number) ?? null,
  }));

    return { course, holes };
  } catch (err) {
    await logServerError(`getCourseWithHoles failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'getCourseWithHoles',
      featureArea: 'courses',
      extra: { courseId },
    });
    return { course: null, holes: [] };
  }
}

const observedGetCourseWithHoles = withAdminObserved(
  'getCourseWithHoles',
  { sport: 'golf', feature: 'course_library' },
  getCourseWithHolesImpl,
);

export async function getCourseWithHoles(courseId: string): Promise<{
  course: GolfCourse | null;
  holes: GolfCourseHole[];
}> {
  return observedGetCourseWithHoles(courseId);
}

/**
 * Create a new course with hole configurations
 * Note: golf_courses table has a simpler schema - only basic fields like name, city, state, par, course_rating, slope_rating
 */
async function createCourseImpl(data: CourseSetupData): Promise<{
  success: boolean;
  courseId?: string;
  error?: string
}> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Calculate total par from holes
  const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);

  // Insert course with only the columns that exist in the database
  const { data: course, error: courseError } = await supabase
    .from('golf_courses')
    .insert({
      name: data.name,
      city: data.city || null,
      state: data.state || null,
      course_rating: data.courseRating || null,
      slope_rating: data.slopeRating || null,
      par: totalPar,
      holes: data.holes.length,
    })
    .select()
    .single();

  if (courseError) {
    // Check for duplicate
    if (courseError.code === '23505') {
      return { success: false, error: 'You already have a course with this name' };
    }
    await logServerError(`createCourse failed: ${courseError.message}`, {
      action: 'createCourse',
      featureArea: 'courses',
      extra: { courseName: data.name, errorCode: courseError.code },
    });
    return { success: false, error: 'Failed to create course. Please try again.' };
  }

  // Insert holes
  const holesData = data.holes.map(hole => ({
    course_id: course.id,
    hole_number: hole.holeNumber,
    par: hole.par,
    yardage: hole.yardage,
  }));

  const { error: holesError } = await supabase
    .from('golf_course_holes')
    .insert(holesData);

  if (holesError) {
    // Rollback course if holes fail
    await supabase.from('golf_courses').delete().eq('id', course.id);
    return { success: false, error: 'Failed to save hole configurations' };
  }

  revalidatePath('/golf/dashboard/rounds');

  return { success: true, courseId: course.id };
}

const observedCreateCourse = withAdminObserved(
  'createCourse',
  { sport: 'golf', feature: 'course_library' },
  createCourseImpl,
);

export async function createCourse(data: CourseSetupData): Promise<{
  success: boolean;
  courseId?: string;
  error?: string
}> {
  return observedCreateCourse(data);
}

/**
 * Update an existing course
 * Note: golf_courses table has a simpler schema without created_by or total_yardage
 */
async function updateCourseImpl(
  courseId: string,
  data: Partial<CourseSetupData>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Verify course exists (no ownership check since table doesn't have created_by)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: course } = await (supabase as any)
    .from('golf_courses')
    .select('id')
    .eq('id', courseId)
    .single();

  if (!course) {
    return { success: false, error: 'Course not found' };
  }

  // Update course info
  if (data.name || data.city || data.state) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: infoError } = await (supabase as any)
      .from('golf_courses')
      .update({
        name: data.name,
        city: data.city,
        state: data.state,
        course_rating: data.courseRating,
        slope_rating: data.slopeRating,
      })
      .eq('id', courseId);
    // The Phase-5 partial-unique normalized_name index can reject a rename that
    // collides with another active course. This UPDATE previously swallowed its
    // error and returned success — surface it instead of silently no-op'ing.
    if (infoError) {
      if (infoError.code === '23505') {
        return { success: false, error: 'A course with that name already exists' };
      }
      await logServerError(`updateCourse failed: ${infoError.message}`, {
        action: 'updateCourse',
        featureArea: 'courses',
        extra: { courseId, errorCode: infoError.code },
      });
      return { success: false, error: 'Failed to update course' };
    }
  }

  // Update holes if provided
  if (data.holes) {
    // Delete existing holes and re-insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('golf_course_holes').delete().eq('course_id', courseId);

    const holesData = data.holes.map(hole => ({
      course_id: courseId,
      hole_number: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('golf_course_holes').insert(holesData);

    // Update par total
    const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_courses')
      .update({ par: totalPar, holes: data.holes.length })
      .eq('id', courseId);
  }

  revalidatePath('/golf/dashboard/rounds');

  return { success: true };
}

const observedUpdateCourse = withAdminObserved(
  'updateCourse',
  { sport: 'golf', feature: 'course_library' },
  updateCourseImpl,
);

export async function updateCourse(
  courseId: string,
  data: Partial<CourseSetupData>
): Promise<{ success: boolean; error?: string }> {
  return observedUpdateCourse(courseId, data);
}

/**
 * Delete a course
 * Note: golf_courses table doesn't have created_by column
 */
async function deleteCourseImpl(courseId: string): Promise<{
  success: boolean;
  error?: string
}> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Delete course (no ownership check since table doesn't have created_by)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('golf_courses')
    .delete()
    .eq('id', courseId);

  if (error) {
    await logServerError(`deleteCourse failed: ${error.message}`, {
      action: 'deleteCourse',
      featureArea: 'courses',
      extra: { courseId, errorCode: error.code },
    });
    return { success: false, error: 'Failed to delete course. Please try again.' };
  }

  revalidatePath('/golf/dashboard/rounds');

  return { success: true };
}

const observedDeleteCourse = withAdminObserved(
  'deleteCourse',
  { sport: 'golf', feature: 'course_library' },
  deleteCourseImpl,
);

export async function deleteCourse(courseId: string): Promise<{
  success: boolean;
  error?: string
}> {
  return observedDeleteCourse(courseId);
}
