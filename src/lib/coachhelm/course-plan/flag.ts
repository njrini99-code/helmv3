/**
 * The Slice 7c flag (config/feature-flags.yml `coachhelm_course_plan_v1`,
 * off). Kept in its own module so the server actions and the Clubhouse route
 * can check it without importing each other.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const COURSE_PLAN_FLAG = 'coachhelm_course_plan_v1';

/** True when a coach may ask CoachHelm for a course plan. */
export function isCoursePlanEnabled(): boolean {
  return isFlagEnabled(COURSE_PLAN_FLAG);
}
