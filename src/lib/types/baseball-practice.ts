// =============================================================================
// src/lib/types/baseball-practice.ts
//
// Wave 8 / packet: practice-planner
//
// HAND-WRITTEN Row/Insert/Update types for the practice tables created by
// supabase/migrations/20260624000060_baseball_practices.sql. We cannot run
// `db:types` regen in this environment (no live apply), so these mirror the
// migration DDL exactly and are the single source of truth for the practice
// feature until a re-export is wired into the generated types by the integration
// agent. Do NOT edit src/lib/types/index.ts or baseball-extended.ts here.
// =============================================================================

// ---- Enums (mirror the CHECK constraints in the migration) -----------------

/** baseball_practices.status */
export type BaseballPracticeStatus = 'draft' | 'published' | 'completed';

/** baseball_practice_attendance.status */
export type BaseballPracticeAttendanceStatus =
  | 'present'
  | 'limited'
  | 'absent'
  | 'excused';

// ---- baseball_practices -----------------------------------------------------

export interface BaseballPracticeRow {
  id: string;
  team_id: string;
  event_id: string | null;
  title: string;
  focus: string | null;
  status: BaseballPracticeStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  /**
   * Marks the team's single "Signal backlog" draft practice (is_backlog=true).
   * Converted Intelligence Board signals land here; coaches drag them into
   * scheduled practices. This practice is never published and is visually
   * distinguished from regular practices in the planner list.
   */
  is_backlog?: boolean | null;
}

export interface BaseballPracticeInsert {
  id?: string;
  team_id: string;
  event_id?: string | null;
  title: string;
  focus?: string | null;
  status?: BaseballPracticeStatus;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballPracticeUpdate {
  id?: string;
  team_id?: string;
  event_id?: string | null;
  title?: string;
  focus?: string | null;
  status?: BaseballPracticeStatus;
  published_at?: string | null;
  updated_at?: string | null;
}

// ---- baseball_practice_blocks ----------------------------------------------

export interface BaseballPracticeBlockRow {
  id: string;
  team_id: string;
  practice_id: string;
  start_offset_min: number;
  duration_min: number;
  activity: string;
  location: string | null;
  coach_owner_id: string | null;
  created_at: string;
  updated_at: string | null;
  // --- Deepened fields (migrations 0200 + 0230). All optional + back-compat;
  // present at runtime via select('*') even when older callers ignore them. ---
  description?: string | null;
  station_type?: string | null;
  group_label?: string | null;
  equipment?: string | null;
  measurement_target?: string | null;
  is_measured?: boolean | null;
  visibility?: string | null;
  /** Human WHY shown on a signal/insight-converted block (V5 outline). */
  source_reason?: string | null;
  /** The insight this block was converted from, when applicable. */
  source_insight_id?: string | null;
  /** The signal this block was converted from (0230 round-trip). */
  source_signal_id?: string | null;
  /**
   * The postgame review item this block was converted from
   * (migration 20260624001800 round-trip — the Postgame -> practice-focus loop).
   */
  source_postgame_item_id?: string | null;
}

export interface BaseballPracticeBlockInsert {
  id?: string;
  team_id: string;
  practice_id: string;
  start_offset_min: number;
  duration_min: number;
  activity: string;
  location?: string | null;
  coach_owner_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballPracticeBlockUpdate {
  id?: string;
  team_id?: string;
  practice_id?: string;
  start_offset_min?: number;
  duration_min?: number;
  activity?: string;
  location?: string | null;
  coach_owner_id?: string | null;
  updated_at?: string | null;
}

// ---- baseball_practice_attendance ------------------------------------------

export interface BaseballPracticeAttendanceRow {
  id: string;
  team_id: string;
  practice_id: string;
  player_id: string;
  status: BaseballPracticeAttendanceStatus;
  reason: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BaseballPracticeAttendanceInsert {
  id?: string;
  team_id: string;
  practice_id: string;
  player_id: string;
  status: BaseballPracticeAttendanceStatus;
  reason?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballPracticeAttendanceUpdate {
  id?: string;
  team_id?: string;
  practice_id?: string;
  player_id?: string;
  status?: BaseballPracticeAttendanceStatus;
  reason?: string | null;
  updated_at?: string | null;
}

// ---- Composite read shapes used by the planner UI --------------------------

/** A block enriched with the owning coach's display name (joined read). */
export interface BaseballPracticeBlockWithOwner extends BaseballPracticeBlockRow {
  coach_owner_name: string | null;
}

/** A practice with its ordered blocks + attendance rows (planner read). */
export interface BaseballPracticeWithDetail extends BaseballPracticeRow {
  blocks: BaseballPracticeBlockWithOwner[];
  attendance: BaseballPracticeAttendanceRow[];
}
