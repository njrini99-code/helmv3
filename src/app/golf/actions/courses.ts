'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CourseSetupData, GolfCourse, GolfCourseHole } from '@/lib/types/golf-course';

/**
 * Get all saved courses for the current user
 */
export async function getSavedCourses(): Promise<GolfCourse[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: courses, error } = await supabase
    .from('golf_courses')
    .select('*')
    .or(`created_by.eq.${user.id},is_public.eq.true`)
    .order('name');

  if (error) {
    console.error('Error fetching courses:', error);
    return [];
  }

  return courses || [];
}

/**
 * Get a single course with its holes
 */
export async function getCourseWithHoles(courseId: string): Promise<{
  course: GolfCourse | null;
  holes: GolfCourseHole[];
}> {
  const supabase = await createClient();

  const { data: course } = await supabase
    .from('golf_courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (!course) return { course: null, holes: [] };

  const { data: holes } = await supabase
    .from('golf_course_holes')
    .select('*')
    .eq('course_id', courseId)
    .order('hole_number');

  return { course, holes: holes || [] };
}

/**
 * Create a new course with hole configurations
 */
export async function createCourse(data: CourseSetupData): Promise<{
  success: boolean;
  courseId?: string;
  error?: string
}> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Calculate totals
  const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
  const totalYardage = data.holes.reduce((sum, h) => sum + h.yardage, 0);

  // Insert course
  const { data: course, error: courseError } = await supabase
    .from('golf_courses')
    .insert({
      name: data.name,
      city: data.city || null,
      state: data.state || null,
      course_rating: data.courseRating || null,
      slope_rating: data.slopeRating || null,
      default_tee_name: data.teeName || null,
      total_par: totalPar,
      total_yardage: totalYardage,
      created_by: user.id,
      is_public: false,
    })
    .select()
    .single();

  if (courseError) {
    // Check for duplicate
    if (courseError.code === '23505') {
      return { success: false, error: 'You already have a course with this name' };
    }
    return { success: false, error: courseError.message };
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

  revalidatePath('/player-golf/rounds');

  return { success: true, courseId: course.id };
}

/**
 * Update an existing course
 */
export async function updateCourse(
  courseId: string,
  data: Partial<CourseSetupData>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Verify ownership
  const { data: course } = await supabase
    .from('golf_courses')
    .select('created_by')
    .eq('id', courseId)
    .single();

  if (!course || course.created_by !== user.id) {
    return { success: false, error: 'Not authorized' };
  }

  // Update course info
  if (data.name || data.city || data.state) {
    await supabase
      .from('golf_courses')
      .update({
        name: data.name,
        city: data.city,
        state: data.state,
        course_rating: data.courseRating,
        slope_rating: data.slopeRating,
        default_tee_name: data.teeName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);
  }

  // Update holes if provided
  if (data.holes) {
    // Delete existing holes and re-insert
    await supabase.from('golf_course_holes').delete().eq('course_id', courseId);

    const holesData = data.holes.map(hole => ({
      course_id: courseId,
      hole_number: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage,
    }));

    await supabase.from('golf_course_holes').insert(holesData);

    // Update totals
    const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
    const totalYardage = data.holes.reduce((sum, h) => sum + h.yardage, 0);

    await supabase
      .from('golf_courses')
      .update({ total_par: totalPar, total_yardage: totalYardage })
      .eq('id', courseId);
  }

  revalidatePath('/player-golf/rounds');

  return { success: true };
}

/**
 * Delete a course
 */
export async function deleteCourse(courseId: string): Promise<{
  success: boolean;
  error?: string
}> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('golf_courses')
    .delete()
    .eq('id', courseId)
    .eq('created_by', user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/player-golf/rounds');

  return { success: true };
}
