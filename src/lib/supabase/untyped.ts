/**
 * Utility for Supabase queries on tables/columns not yet in generated Database types.
 * Centralizes the type escape hatch so individual files don't need as-any casts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Known untyped table allowlist.
 * Extend this union when adding new hand-written type modules whose tables
 * are not yet in database.ts (i.e. pending a post-apply `db:types` regen).
 *
 * Wave 1 — Helm Lifting Lab identity + data tables
 * (supabase/migrations/20260625000000_* through 20260625000030_*)
 */
export type UntypedTable =
  // Helm Lifting Lab — identity & access
  | 'helm_lifting_coaches'
  | 'helm_lifting_coach_assignments'
  | 'helm_lifting_athletes'
  | 'helm_lifting_org_viewers'
  | 'helm_lifting_coach_invites'
  // Helm Lifting Lab — library & programs
  | 'helm_lifting_exercises'
  | 'helm_lifting_exercise_substitutions'
  | 'helm_lifting_groups'
  | 'helm_lifting_group_members'
  | 'helm_lifting_programs'
  | 'helm_lifting_weeks'
  | 'helm_lifting_days'
  | 'helm_lifting_sections'
  | 'helm_lifting_prescriptions'
  // Helm Lifting Lab — sessions & readiness
  | 'helm_lifting_program_assignments'
  | 'helm_lifting_sessions'
  | 'helm_lifting_session_exercises'
  | 'helm_lifting_set_results'
  | 'helm_lifting_readiness_checkins'
  | 'helm_lifting_soreness_maps'
  | 'helm_lifting_bodyweight_entries'
  | 'helm_lifting_availability_statuses'
  | 'helm_lifting_maxes'
  | 'helm_lifting_prs'
  | 'helm_lifting_import_runs'
  | 'helm_lifting_import_rows'
  // Wave 2 — Helm Lifting Lab check-in scheduling tables
  // (supabase/migrations/20260625000090_helm_lifting_soreness_weight_nutrition.sql)
  | 'helm_lifting_soreness_check_schedules'
  | 'helm_lifting_soreness_check_requests'
  | 'helm_lifting_weight_checkin_schedules'
  | 'helm_lifting_weight_checkin_requests'
  | 'helm_lifting_nutrition_plans'
  | 'helm_lifting_nutrition_plan_assignments'
  // fallback: any other table not yet in generated types
  | (string & Record<never, never>);

/**
 * Access a Supabase table that is not (yet) in the generated Database types.
 * This avoids scattering as-any casts across the codebase.
 * The eslint-disable is intentional and contained to this single utility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromUntyped(client: SupabaseClient<any>, table: UntypedTable): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client.from(table) as any;
}
