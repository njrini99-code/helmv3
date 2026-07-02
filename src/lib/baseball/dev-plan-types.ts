/**
 * Shared development-plan goal types.
 *
 * Lives in a plain (non-'use server') module so client components — e.g.
 * `CreateDevPlanModal.tsx`, `PlanDetail.tsx` — can import these types
 * directly without going through a server-action file. `src/app/baseball/
 * actions/dev-plans.ts` re-exports the same names for backward
 * compatibility with existing server-action callers.
 *
 * Goal `id` MUST be a stable UUID persisted at creation time (see
 * `CreateDevPlanModal.handleSubmit`). Historically the create modal
 * generated a client-side id per goal for React `key`s but never
 * persisted it, so `parseGoals()` minted a brand-new random id on every
 * fetch — any id captured by the UI was stale by the next request,
 * making coach-created goals permanently uncompletable ("Goal not
 * found"). Every write path must round-trip `id`/`status`/`progress`.
 */

export type GoalStatus = 'not_started' | 'in_progress' | 'completed';

/** A goal as stored in the `goals` JSONB column of `baseball_developmental_plans`. */
export interface DevPlanGoal {
  id: string;
  title: string;
  description?: string;
  category?: string;
  progress: number; // 0-100
  status: GoalStatus;
  target_date?: string;
  coach_notes?: string;
  completed_at?: string;
  created_at: string;
}

/** Minimal player summary joined onto a plan for display purposes. */
export interface DevPlanPlayerSummary {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  grad_year: number | null;
}

/** Full plan with typed, parsed goals. */
export interface DevelopmentalPlanWithGoals {
  id: string;
  player_id: string;
  team_id: string | null;
  coach_id: string;
  title: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: DevPlanGoal[];
  created_at: string | null;
  updated_at: string | null;
  coach?: {
    id: string;
    full_name: string | null;
  } | null;
}

/** Plan with the owning player joined — used by the coach-facing detail view. */
export interface DevPlanWithPlayer extends DevelopmentalPlanWithGoals {
  player: DevPlanPlayerSummary | null;
}
