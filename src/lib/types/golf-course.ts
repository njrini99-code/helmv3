// ============================================================================
// Golf Course Types
// ----------------------------------------------------------------------------
// Cloud Course Library (Phase 1+): a course is a FACILITY (e.g. "Pinehurst No. 2")
// that owns MANY tee sets. Tee sets own per-hole pars/yards. Teams save courses
// to a personal library with a default tee. Rounds reference a tee for defaults
// but STILL snapshot par/yards into golf_holes — editing a tee never rewrites
// historical round truth. All cloud writes are open-contribution + audited.
// ============================================================================

/** Free-form tee classification — intentionally NOT a binary-gender enum. The
 *  `string & {}` tail keeps the union open for future/custom values while still
 *  giving autocomplete for the common ones. */
export type GolfTeeCategory =
  | 'mens'
  | 'womens'
  | 'tournament'
  | 'mixed'
  | 'senior'
  | 'junior'
  | 'custom'
  | (string & {});

/** Append-only edit-history actions. */
export type GolfCourseEditAction = 'create' | 'update' | 'soft_delete' | 'restore';

export interface GolfCourse {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  default_tee_name: string | null;
  default_tee_color: string | null;
  total_yardage: number | null;
  total_par: number | null;
  created_by: string | null;
  is_public: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  // ── Cloud Course Library (Phase 1, additive — all nullable) ──────────────
  /** Dedup key from golf_normalize_name(name): lower/trim, drop No./#/Number. */
  normalized_name?: string | null;
  slug?: string | null;
  address?: string | null;
  website?: string | null;
  image_url?: string | null;
  /** Provenance: 'manual' | 'import' | 'seed' | … */
  source?: string | null;
  created_by_user_id?: string | null;
  created_by_team_id?: string | null;
  last_edited_by_user_id?: string | null;
  last_edited_by_team_id?: string | null;
  last_edited_at?: string | null;
  /** Soft-delete tombstone; null = active. */
  deleted_at?: string | null;
}

export interface GolfCourseHole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  yardage: number;
  handicap_index: number | null;
}

// ── Tee sets ────────────────────────────────────────────────────────────────

/** A tee set on a course (Championship/Blue/White/Women's/custom). One ACTIVE
 *  tee per normalized name per course; archival is soft-delete. */
export interface GolfCourseTee {
  id: string;
  course_id: string;
  tee_name: string;
  /** golf_normalize_name(tee_name); backs the per-course uniqueness guard. */
  normalized_tee_name: string;
  tee_color: string | null;
  category: GolfTeeCategory | null;
  total_yards: number | null;
  total_par: number | null;
  course_rating: number | null;
  slope_rating: number | null;
  /** 9 or 18 (CHECK-constrained). */
  holes_count: number;
  source: string | null;
  /** Incomplete tee sets are drafts — manageable, but not for official tracking. */
  is_draft: boolean;
  created_by_user_id: string | null;
  created_by_team_id: string | null;
  last_edited_by_user_id: string | null;
  last_edited_by_team_id: string | null;
  last_edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-tee, per-hole par/yardage. Unique on (tee_id, hole_number). */
export interface GolfCourseTeeHole {
  id: string;
  tee_id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
  handicap_index: number | null;
  created_at: string;
  updated_at: string;
}

// ── Team-saved courses ────────────────────────────────────────────────────────

/** A course saved to a team's library, with a default tee + play stats.
 *  Team-scoped: members read, coaches write. */
export interface GolfTeamSavedCourse {
  id: string;
  team_id: string;
  course_id: string;
  default_tee_id: string | null;
  pinned: boolean;
  last_played_at: string | null;
  times_played: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Edit history (append-only audit) ─────────────────────────────────────────

export interface GolfCourseEditHistory {
  id: string;
  course_id: string;
  edited_by_user_id: string | null;
  edited_by_team_id: string | null;
  action: GolfCourseEditAction;
  /** Shape: `{ field: { from, to } }`. */
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

export interface GolfCourseTeeEditHistory {
  id: string;
  tee_id: string;
  edited_by_user_id: string | null;
  edited_by_team_id: string | null;
  action: GolfCourseEditAction;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

// ── Composites (joined shapes the UI/DAL hand back) ──────────────────────────

/** A tee set with its hole rows attached (ordered by hole_number). */
export interface GolfCourseTeeWithHoles extends GolfCourseTee {
  holes: GolfCourseTeeHole[];
}

/** A course with all its active tee sets — the carousel/detail payload. */
export interface GolfCourseWithTees extends GolfCourse {
  tees: GolfCourseTee[];
}

/** A team-saved row joined to its course + resolved default tee. */
export interface GolfTeamSavedCourseWithCourse extends GolfTeamSavedCourse {
  course: GolfCourse;
  default_tee: GolfCourseTee | null;
}

// ── Setup / draft DTOs ───────────────────────────────────────────────────────

export interface HoleConfig {
  holeNumber: number;
  par: number;
  yardage: number;
}

export interface CourseSetupData {
  name: string;
  city: string | null;
  state: string | null;
  courseRating: number | null;
  slopeRating: number | null;
  teeName: string | null;
  holes: HoleConfig[];
}
