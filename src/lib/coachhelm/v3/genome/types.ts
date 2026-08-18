/**
 * v3 Player Genome — shared types (W33-pt1).
 *
 * Master plan Part XIII: 8 categories × 10 dimensions = 80 total. Each
 * dimension is implemented as a pure function under
 * src/lib/coachhelm/v3/genome/dimensions/<id>.ts and registered in
 * `registry.ts`. The orchestrator (`orchestrator.ts`) runs every
 * registered dimension for a player and upserts the result.
 */

/**
 * Trailing window, in days, that every genome computation reads.
 *
 * Lives here rather than in ./orchestrator.ts because that module imports the
 * service-role admin client; a `'use client'` surface importing the constant
 * from there would pull the admin client into the browser bundle. This file
 * has no imports at all, so it is safe from either side. The orchestrator
 * re-exports it as `WINDOW_DAYS` so there is exactly one source of truth.
 *
 * The UI must SAY this number. `rounds_basis` counts rounds inside the window,
 * not a career total, and a coach comparing "Computed on 6 rounds" here
 * against "Area averages from 16 rounds" on the Game Fingerprint has no way to
 * reconcile them otherwise — measured on Luke Wise 2026-08-18: 16 career
 * rounds, 3 in the last 90 days.
 */
export const GENOME_WINDOW_DAYS = 90;

export const GENOME_CATEGORIES = [
  'miss_tendencies',
  'pressure_response',
  'recovery_patterns',
  'course_type_affinity',
  'weather_sensitivity',
  'stamina',
  'learning_velocity',
  'strategic_profile',
] as const;
export type GenomeCategory = (typeof GENOME_CATEGORIES)[number];



/**
 * Result of one dimension computation. value=null means "insufficient
 * data" — the UI treats this as locked. confidence is 0-1; the UI uses
 * it to size the radar dot.
 */
export interface DimensionResult {
  value: number | string | null;
  /** 0-1; 1 = full confidence. null when value is null. */
  confidence: number | null;
  /** Optional human label for tooltips (e.g. "Left bias", "Steady"). */
  label?: string;
}

/**
 * Per-dimension input bundle the orchestrator hands to every dimension's
 * compute(). Loaded once per player so dimensions don't each hit the DB.
 */
export interface GenomeContext {
  player_id: string;
  /** Completed rounds in the last 90 days (used by most dimensions). */
  recent_rounds_count: number;
  /** Per-round metadata — round_type lets pressure/practice dims split. */
  rounds: GenomeRound[];
  /** All hole-level rows in the window (for hole-sequence dims). */
  hole_scores: GenomeHoleScore[];
  /** Shot-level rows (for miss/lie/club dims). */
  shots: GenomeShot[];
}

export interface GenomeRound {
  id: string;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
}

export interface GenomeHoleScore {
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
  /**
   * Green in regulation. Nullable because `golf_holes.gir` is — a hole logged
   * without it cannot be classified either way, and `scrambling_rate` skips it
   * rather than guessing (a null read as "missed" would invent attempts).
   */
  gir: boolean | null;
}

export interface GenomeShot {
  round_id: string;
  hole_number: number | null;
  shot_type: string | null;
  club_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  /** Unit of distance_to_hole_after ('feet'|'yards'); needed to convert leaves
   *  to feet for the scrambling-rate save threshold (CANON: UNITS). Optional so
   *  fixtures may omit it (absent ⇒ treated as feet). */
  distance_unit_after?: string | null;
  miss_direction: string | null;
  is_penalty: boolean | null;
}

/**
 * The pure-function contract every dimension implements.
 *
 * compute() decides for itself whether the supplied context has enough
 * data to produce a value (most dims require ≥8 rounds; some need
 * more specific data like a shot-source bucket). On insufficient data
 * the dimension returns `{ value: null, confidence: null }`.
 */
export interface GenomeDimension {
  id: string;
  category: GenomeCategory;
  /** Short human label for the dim, used by the UI radar + tooltips. */
  label: string;
  /** Min rounds this specific dim requires. Defaults to MIN_ROUNDS_PER_DIMENSION. */
  min_rounds?: number;
  /**
   * True for a dimension whose `compute()` is a permanent stub — no data
   * source exists yet, so it can NEVER resolve regardless of how many
   * rounds a player logs (e.g. `weather_sensitivity_stub` — no
   * weather/temperature tracking in shot data at all). Distinct from the
   * ordinary "needs more rounds" locked state, which resolves once the
   * player has enough sample size. Drives a separate "Not tracked" UI
   * treatment so coaches don't read it as "will unlock eventually."
   */
  neverAvailable?: boolean;
  compute: (ctx: GenomeContext) => DimensionResult;
}

/** The vector stored on golf_player_genome.vector — key is dimension.id. */
export type GenomeVector = Record<string, DimensionResult>;
