/**
 * v3 Player Genome — shared types (W33-pt1).
 *
 * Master plan Part XIII: 8 categories × 10 dimensions = 80 total. Each
 * dimension is implemented as a pure function under
 * src/lib/coachhelm/v3/genome/dimensions/<id>.ts and registered in
 * `registry.ts`. The orchestrator (`orchestrator.ts`) runs every
 * registered dimension for a player and upserts the result.
 */

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
 * Per Part XIII: each dimension requires ≥8 rounds. Below that the
 * orchestrator records `null` for the dimension (UI shows "needs more
 * rounds" in that slot).
 */
export const MIN_ROUNDS_PER_DIMENSION = 8;

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
  /** All hole-level rows in the window (for hole-sequence dims). */
  hole_scores: GenomeHoleScore[];
  /** Shot-level rows (for miss/lie/club dims). */
  shots: GenomeShot[];
}

export interface GenomeHoleScore {
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
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
  compute: (ctx: GenomeContext) => DimensionResult;
}

/** The vector stored on golf_player_genome.vector — key is dimension.id. */
export type GenomeVector = Record<string, DimensionResult>;
