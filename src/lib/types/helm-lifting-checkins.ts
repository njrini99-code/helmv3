// =============================================================================
// src/lib/types/helm-lifting-checkins.ts
//
// HAND-WRITTEN domain types for the Helm Lifting Lab check-in scheduling tables
// created by:
//   supabase/migrations/20260625000090_helm_lifting_soreness_weight_nutrition.sql
//
// Covers:
//   * helm_lifting_soreness_check_schedules
//   * helm_lifting_soreness_check_requests
//   * helm_lifting_weight_checkin_schedules
//   * helm_lifting_weight_checkin_requests
//   * helm_lifting_nutrition_plans
//   * helm_lifting_nutrition_plan_assignments
//
// Also re-exports ReadinessCheckin column additions (soreness_status, submitted_from)
// as augmentation types — actual row type stays in helm-lifting-data.ts.
//
// Access pattern: use fromUntyped(supabase, 'helm_lifting_...') and cast rows
// to these types. NEVER add these tables to database.ts.
// =============================================================================

// -----------------------------------------------------------------------------
// Shared enum unions (mirror CHECK constraints exactly)
// -----------------------------------------------------------------------------

/** Who the schedule or plan is assigned to. */
export type AssignmentType = 'team' | 'group' | 'athlete';

/** How often a check-in recurs. */
export type FrequencyType = 'once' | 'daily' | 'weekly' | 'custom';

/** Which body areas a soreness check focuses on. */
export type BodyFocus = 'full_body' | 'throwing_arm' | 'lower_body' | 'custom';

/** Lifecycle state for schedules, plans, and derived requests. */
export type ScheduleStatus = 'draft' | 'published' | 'archived';

/**
 * Per-request fulfillment state for a soreness check.
 * Note: weight requests use a narrower subset (no ready_to_go).
 */
export type SorenessCheckinStatus =
  | 'pending'
  | 'ready_to_go'
  | 'completed'
  | 'missed'
  | 'excused';

/** Per-request fulfillment state for a weight check-in. */
export type WeightCheckinStatus = 'pending' | 'completed' | 'missed' | 'excused';

/** Combined union for generic compliance displays. */
export type CheckinStatus = SorenessCheckinStatus | WeightCheckinStatus;

/** Who can see a schedule or plan. */
export type SorenessVisibility = 'staff' | 'performance_staff' | 'head_coach_only';

/** Who can see a nutrition plan. */
export type NutritionVisibility =
  | 'athlete_and_performance_staff'
  | 'performance_staff'
  | 'head_coach_only';

/** Format of a nutrition plan upload. */
export type PlanType = 'document' | 'link' | 'note';

/**
 * Soreness severity on the 0–10 scale (spec §6).
 *   0        = none
 *   1–2      = light
 *   3–4      = noticeable
 *   5–6      = moderate
 *   7–8      = high
 *   9–10     = severe
 *
 * Stored as an integer in soreness_maps.severity. Narrowed here for
 * documentation; TypeScript does not enforce integer range at compile time.
 */
export type SorenessSeverity = number;

/**
 * Fast-path status appended to helm_lifting_readiness_checkins (spec §8).
 *   'ready_to_go'       — one-tap completion, no body regions selected
 *   'reported_soreness' — athlete opened the body map and submitted
 */
export type SorenessStatus = 'ready_to_go' | 'reported_soreness';

/**
 * Submission surface for a readiness check-in (spec §8).
 * Analytics only — does not affect compliance counting.
 */
export type SubmittedFrom = 'player_today' | 'lift_session' | 'coach_entry';

// -----------------------------------------------------------------------------
// 1. helm_lifting_soreness_check_schedules
// -----------------------------------------------------------------------------

export interface SorenessCheckSchedule {
  readonly id: string;
  readonly organization_id: string;
  readonly sport: 'baseball' | 'golf';
  /** SOFT ref — not a hard FK; may be null for org-wide schedules. */
  readonly team_id: string | null;
  readonly created_by_coach_id: string | null;

  readonly title: string;
  readonly assignment_type: AssignmentType;
  /** Non-null when assignment_type = 'group'. */
  readonly group_id: string | null;
  /** Non-null when assignment_type = 'athlete'. */
  readonly athlete_id: string | null;

  readonly frequency_type: FrequencyType;
  /**
   * ISO day-of-week integers: 0 = Sunday … 6 = Saturday.
   * Null for 'once' and 'daily'; required for 'weekly' and 'custom'.
   */
  readonly days_of_week: number[] | null;
  /** ISO date string, e.g. '2026-08-01'. */
  readonly start_date: string;
  /** ISO date string; null = open-ended recurrence. */
  readonly end_date: string | null;
  /** HH:MM:SS time string; single target time (alternative to window). */
  readonly due_time: string | null;
  /** Window start HH:MM:SS; null when using due_time instead. */
  readonly due_window_start: string | null;
  /** Window end HH:MM:SS; null when using due_time instead. */
  readonly due_window_end: string | null;

  readonly body_focus: BodyFocus;
  /** SorenessRegionId strings — populated when body_focus = 'custom'. */
  readonly custom_regions: string[] | null;
  readonly instructions: string | null;

  readonly visibility: SorenessVisibility;
  readonly status: ScheduleStatus;

  readonly created_at: string;
  readonly updated_at: string;
}

export interface SorenessCheckScheduleInsert
  extends Omit<SorenessCheckSchedule, 'id' | 'created_at' | 'updated_at'> {
  readonly id?: string;
}

// -----------------------------------------------------------------------------
// 2. helm_lifting_soreness_check_requests
// -----------------------------------------------------------------------------

export interface SorenessCheckRequest {
  readonly id: string;
  /** Null for ad-hoc / one-off requests created outside a schedule. */
  readonly schedule_id: string | null;
  readonly organization_id: string;
  readonly sport: 'baseball' | 'golf';
  readonly team_id: string | null;
  readonly athlete_id: string;

  /** ISO date string: which day this request belongs to. */
  readonly due_date: string;
  /** Optional UTC timestamptz for exact deadline tracking. */
  readonly due_at: string | null;
  readonly status: SorenessCheckinStatus;

  /**
   * SOFT ref to helm_lifting_readiness_checkins.id.
   * Set when the athlete submits (either ready-to-go or full map).
   */
  readonly readiness_checkin_id: string | null;
  readonly completed_at: string | null;
  readonly reminder_sent_at: string | null;

  readonly created_at: string;
  readonly updated_at: string;
}

export interface SorenessCheckRequestInsert
  extends Omit<SorenessCheckRequest, 'id' | 'created_at' | 'updated_at'> {
  readonly id?: string;
}

// -----------------------------------------------------------------------------
// 3. helm_lifting_weight_checkin_schedules
// -----------------------------------------------------------------------------

export interface WeightCheckinSchedule {
  readonly id: string;
  readonly organization_id: string;
  readonly sport: 'baseball' | 'golf';
  readonly team_id: string | null;
  readonly created_by_coach_id: string | null;

  readonly title: string;
  readonly assignment_type: AssignmentType;
  readonly group_id: string | null;
  readonly athlete_id: string | null;

  readonly frequency_type: FrequencyType;
  readonly days_of_week: number[] | null;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly due_time: string | null;
  readonly due_window_start: string | null;
  readonly due_window_end: string | null;

  readonly instructions: string | null;
  readonly visibility: SorenessVisibility;
  readonly status: ScheduleStatus;

  readonly created_at: string;
  readonly updated_at: string;
}

export interface WeightCheckinScheduleInsert
  extends Omit<WeightCheckinSchedule, 'id' | 'created_at' | 'updated_at'> {
  readonly id?: string;
}

// -----------------------------------------------------------------------------
// 4. helm_lifting_weight_checkin_requests
// -----------------------------------------------------------------------------

export interface WeightCheckinRequest {
  readonly id: string;
  readonly schedule_id: string | null;
  readonly organization_id: string;
  readonly sport: 'baseball' | 'golf';
  readonly team_id: string | null;
  readonly athlete_id: string;

  readonly due_date: string;
  readonly due_at: string | null;
  readonly status: WeightCheckinStatus;

  /** FK to helm_lifting_bodyweight_entries.id; set when athlete submits weight. */
  readonly bodyweight_entry_id: string | null;
  readonly completed_at: string | null;
  readonly reminder_sent_at: string | null;

  readonly created_at: string;
  readonly updated_at: string;
}

export interface WeightCheckinRequestInsert
  extends Omit<WeightCheckinRequest, 'id' | 'created_at' | 'updated_at'> {
  readonly id?: string;
}

// -----------------------------------------------------------------------------
// 5. helm_lifting_nutrition_plans
// -----------------------------------------------------------------------------

export interface NutritionPlan {
  readonly id: string;
  readonly organization_id: string;
  readonly sport: 'baseball' | 'golf';
  readonly team_id: string | null;
  readonly created_by_coach_id: string | null;

  readonly title: string;
  readonly description: string | null;

  readonly plan_type: PlanType;

  /** Storage path in the 'lifting-nutrition' bucket. Null for link/note types. */
  readonly storage_path: string | null;
  readonly file_name: string | null;
  readonly file_type: string | null;
  /** File size in bytes. */
  readonly file_size: number | null;
  /** External URL for link-type plans. */
  readonly external_url: string | null;

  readonly visibility: NutritionVisibility;
  readonly status: ScheduleStatus;

  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface NutritionPlanInsert
  extends Omit<NutritionPlan, 'id' | 'created_at' | 'updated_at'> {
  readonly id?: string;
}

// -----------------------------------------------------------------------------
// 6. helm_lifting_nutrition_plan_assignments
// -----------------------------------------------------------------------------

export interface NutritionPlanAssignment {
  readonly id: string;
  readonly plan_id: string;
  readonly organization_id: string;
  readonly sport: 'baseball' | 'golf';

  readonly assignment_type: AssignmentType;
  /** SOFT ref when assignment_type = 'team'. */
  readonly team_id: string | null;
  readonly group_id: string | null;
  /** Non-null when assignment_type = 'athlete'. */
  readonly athlete_id: string | null;

  readonly assigned_by_coach_id: string | null;
  readonly assigned_at: string;

  /** Set when the athlete taps Acknowledge. */
  readonly acknowledged_at: string | null;

  readonly created_at: string;
}

export interface NutritionPlanAssignmentInsert
  extends Omit<NutritionPlanAssignment, 'id' | 'created_at'> {
  readonly id?: string;
}

// -----------------------------------------------------------------------------
// Convenience: readiness checkin augmentation (the two new columns added by
// 20260625000090_*). Import alongside the base row type when both are needed.
// -----------------------------------------------------------------------------

export interface ReadinessCheckinCheckinAugmentation {
  /** Null on legacy rows created before this migration. */
  readonly soreness_status: SorenessStatus | null;
  /** Null on legacy rows. */
  readonly submitted_from: SubmittedFrom | null;
}
