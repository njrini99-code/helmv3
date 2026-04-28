/**
 * Lie-Specific Miss Pattern Analysis (V2 - Enhanced)
 *
 * Analyzes miss patterns broken down by lie type AND shot category to identify root causes.
 * This provides granular insights into how different lies affect shot outcomes,
 * enabling targeted coaching recommendations.
 *
 * V2 ENHANCEMENTS:
 * 1. Shot Category Analysis - Separate analysis for:
 *    - Driving (tee shots): fairway hit rate, miss direction, penalty risk
 *    - Approach by yardage (50-100, 100-150, 150-200, 200+): GIR, proximity, dispersion
 *    - Around the Green: up-and-down %, scramble success by lie
 *
 * 2. Dispersion Analysis - Beyond just miss direction:
 *    - Miss distance magnitude (how far off target)
 *    - Dispersion radius (spread of shots)
 *    - Danger zone tracking (misses into hazards/penalties)
 *    - Miss severity scoring (minor miss vs. disaster)
 *
 * 3. Granular Lie Context - Uses result to infer severity:
 *    - Rough miss that stays in play vs. rough miss into penalty
 *    - Sand save situation vs. buried lie
 *
 * Example insights:
 * - "Miss right 67% from fairway BUT miss left 45% from rough - suggests setup/stance issue"
 * - "From sand, miss short 80% - likely deceleration through impact"
 * - "Approaches from 150-200: Dispersion radius is 42 yards (tour avg: 28) - 1.5x wider spread"
 * - "Around the green from rough: 23% danger zone rate (penalties/bunkers)"
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// TYPES
// ============================================================================

/** Canonical lie types */
export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';

/** Miss direction categories */
type MissDirection = 'left' | 'right' | 'short' | 'long' | 'short_left' | 'short_right' | 'long_left' | 'long_right' | 'none';

/** Distance range for grouping */
interface DistanceRange {
  min: number;
  max: number;
  label: string;
}

/** Miss breakdown percentages */
interface MissBreakdown {
  left: number;       // percentage (0-100)
  right: number;      // percentage (0-100)
  short: number;      // percentage (0-100)
  long: number;       // percentage (0-100)
  shortLeft: number;  // percentage (0-100)
  shortRight: number; // percentage (0-100)
  longLeft: number;   // percentage (0-100)
  longRight: number;  // percentage (0-100)
}

/** Pattern for a specific lie type */
export interface LieSpecificPattern {
  lie: LieType;
  totalShots: number;
  missBreakdown: MissBreakdown;
  avgMissDistance: number;      // yards from target
  greenHitRate: number;         // percentage (0-100)
  penaltyRate: number;          // percentage (0-100)
  primaryMiss: MissDirection;   // most common miss direction
  primaryMissFrequency: number; // percentage of primary miss
  confidence: number;           // statistical confidence (0-1)
}

/** Distance-segmented lie pattern */
export interface DistanceRangeLiePattern {
  distanceRange: DistanceRange;
  lie: LieType;
  totalShots: number;
  missBreakdown: MissBreakdown;
  avgProximity: number;         // avg distance to hole after shot
  greenHitRate: number;
  primaryMiss: MissDirection;
  primaryMissFrequency: number;
}

/** Cross-lie comparison for root cause analysis */
export interface LieCrossComparison {
  lieA: LieType;
  lieB: LieType;
  primaryMissA: MissDirection;
  primaryMissB: MissDirection;
  frequencyA: number;
  frequencyB: number;
  patternsMatch: boolean;       // true if same miss direction dominates
  divergenceScore: number;      // 0-1, how different the patterns are
  insight: string;              // generated insight text
}

/** Root cause inference */
export interface RootCauseInsight {
  id: string;
  category: 'setup' | 'swing_plane' | 'contact' | 'club_selection' | 'mental' | 'technical';
  headline: string;
  body: string;
  evidence: string[];           // supporting data points
  confidence: number;           // 0-1
  recommendation: string;
  affectedLies: LieType[];
  strokeImpact: number;         // estimated strokes per round
}

/** Complete lie-specific analysis result */
export interface LieMissAnalysis {
  playerId: string;
  analyzedAt: string;
  totalShotsAnalyzed: number;

  // Per-lie patterns
  liePatterns: LieSpecificPattern[];

  // Distance-segmented patterns
  distanceRangePatterns: DistanceRangeLiePattern[];

  // Cross-lie comparisons
  crossComparisons: LieCrossComparison[];

  // Root cause insights
  rootCauseInsights: RootCauseInsight[];

  // V2: Shot category analysis
  shotCategoryAnalysis: ShotCategoryAnalysis;

  // V2: Dispersion analysis
  dispersionAnalysis: DispersionAnalysis;

  // Summary metrics
  summary: {
    worstLie: LieType;
    bestLie: LieType;
    mostConsistentLie: LieType;
    highestPenaltyLie: LieType;
    penaltyMultiplierRoughVsFairway: number;
  };
}

// ============================================================================
// V2 TYPES: SHOT CATEGORY ANALYSIS
// ============================================================================

/** Shot category type */
export type ShotCategory = 'driving' | 'approach' | 'around_green';

/** Approach distance bracket */
export interface ApproachBracket {
  min: number;
  max: number;
  label: string;
}

/** Driving analysis results */
interface DrivingAnalysis {
  totalDrives: number;
  fairwayHitRate: number;          // percentage
  avgDrivingDistance: number;       // yards
  missBreakdown: MissBreakdown;
  primaryMiss: MissDirection;
  primaryMissFrequency: number;
  penaltyRate: number;              // percentage of drives resulting in penalty
  dangerZoneRate: number;           // percentage into trouble (rough+sand+penalty)

  // Dispersion metrics
  dispersionRadius: number;         // yards - std deviation of landing spots
  leftMissAvgDistance: number;      // avg yards off fairway when missing left
  rightMissAvgDistance: number;     // avg yards off fairway when missing right

  // Outcome breakdown
  outcomeBreakdown: {
    fairway: number;                // percentage
    lightRough: number;             // result='rough' but playable
    heavyRough: number;             // inferred from penalty follow-up
    sand: number;                   // percentage
    penalty: number;                // percentage
    other: number;                  // percentage
  };

  confidence: number;
}

/** Approach analysis by distance bracket */
interface ApproachBracketAnalysis {
  bracket: ApproachBracket;
  totalShots: number;
  girRate: number;                  // greens in regulation percentage
  avgProximity: number;             // avg distance to hole after shot (feet)
  missBreakdown: MissBreakdown;
  primaryMiss: MissDirection;
  primaryMissFrequency: number;

  // V2: Dispersion metrics
  dispersionRadius: number;         // yards - std deviation from target
  avgMissDistance: number;          // avg yards from pin when missing green
  dangerZoneRate: number;           // percentage into sand/penalty

  // By lie breakdown
  fromFairwayGIR: number;           // GIR % when approaching from fairway
  fromRoughGIR: number;             // GIR % when approaching from rough
  fromSandGIR: number;              // GIR % when approaching from sand

  // Miss severity
  missSeverity: {
    minor: number;                  // < 10 yards from green edge
    moderate: number;               // 10-25 yards
    severe: number;                 // > 25 yards or penalty
  };

  confidence: number;
}

/** Around the green analysis */
interface AroundGreenAnalysis {
  totalShots: number;
  upAndDownRate: number;            // percentage
  avgProximityAfter: number;        // avg distance to hole after chip/pitch (feet)

  // By starting lie
  fromRough: {
    shots: number;
    upAndDownRate: number;
    avgProximity: number;
    dangerZoneRate?: number;         // chips into bunker/penalty
  };
  fromSand: {
    shots: number;
    upAndDownRate: number;
    avgProximity: number;
    sandSaveRate?: number;
  };
  fromFairway: {
    shots: number;
    upAndDownRate: number;
    avgProximity: number;
  };

  // Miss patterns
  missBreakdown: MissBreakdown;
  primaryMiss: MissDirection;
  primaryMissFrequency: number;

  // Distance control
  shortMissRate: number;            // percentage leaving it short
  longMissRate: number;             // percentage going long
  distanceControlScore: number;     // 0-100, higher is better

  confidence: number;
}

/** Complete shot category analysis */
export interface ShotCategoryAnalysis {
  driving: DrivingAnalysis | null;
  approachByBracket: ApproachBracketAnalysis[];
  aroundGreen: AroundGreenAnalysis | null;

  // Cross-category insights
  insights: ShotCategoryInsight[];
}

/** Insight from shot category analysis */
export interface ShotCategoryInsight {
  id: string;
  category: ShotCategory;
  bracket?: ApproachBracket;        // for approach insights
  headline: string;
  body: string;
  evidence: string[];
  severity: 'info' | 'warning' | 'critical';
  strokeImpact: number;
  recommendation: string;
}

// ============================================================================
// V2 TYPES: DISPERSION ANALYSIS
// ============================================================================

/** Dispersion pattern for a shot category */
interface DispersionPattern {
  category: ShotCategory;
  bracket?: ApproachBracket;

  // Core dispersion metrics
  avgDistanceFromTarget: number;    // yards
  stdDeviation: number;             // yards - the "dispersion radius"
  maxMissDistance: number;          // worst miss

  // Directional dispersion
  leftDispersion: number;           // avg miss distance when missing left
  rightDispersion: number;          // avg miss distance when missing right
  shortDispersion: number;          // avg miss distance when missing short
  longDispersion: number;           // avg miss distance when missing long

  // Shot shape (is there a consistent pattern?)
  hasConsistentShape: boolean;
  dominantMissDirection: MissDirection;
  dominantMissPercentage: number;

  // Danger zones
  dangerZoneHits: number;           // count
  dangerZoneRate: number;           // percentage
  dangerZoneTypes: {
    water: number;
    ob: number;
    bunker: number;
    deepRough: number;
  };
}

/** Miss severity classification */
interface MissSeverityBreakdown {
  perfect: number;                  // hit target (green/fairway)
  minor: number;                    // small miss, easy up-and-down
  moderate: number;                 // medium miss, challenging position
  severe: number;                   // big miss, difficult position
  disaster: number;                 // penalty or unplayable
}

/** Complete dispersion analysis */
export interface DispersionAnalysis {
  // By shot category
  drivingDispersion: DispersionPattern | null;
  approachDispersion: DispersionPattern[];  // one per bracket
  aroundGreenDispersion: DispersionPattern | null;

  // Overall severity breakdown
  overallSeverity: MissSeverityBreakdown;

  // Comparison to benchmarks
  comparisonToBenchmark: {
    category: ShotCategory;
    bracket?: ApproachBracket;
    playerDispersion: number;
    benchmarkDispersion: number;    // "tour average" or team average
    differential: number;           // how much wider/tighter
    percentileRank: number;         // 0-100, higher is tighter dispersion
  }[];

  // Key findings
  insights: DispersionInsight[];
}

/** Insight from dispersion analysis */
export interface DispersionInsight {
  id: string;
  category: ShotCategory;
  bracket?: ApproachBracket;
  headline: string;
  body: string;
  evidence: string[];
  strokeImpact: number;
  recommendation: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Standard distance ranges for analysis */
const DISTANCE_RANGES: DistanceRange[] = [
  { min: 0, max: 50, label: 'Wedge (0-50)' },
  { min: 50, max: 100, label: 'Short (50-100)' },
  { min: 100, max: 130, label: 'Mid-Short (100-130)' },
  { min: 130, max: 160, label: 'Mid (130-160)' },
  { min: 160, max: 190, label: 'Mid-Long (160-190)' },
  { min: 190, max: 220, label: 'Long (190-220)' },
  { min: 220, max: 500, label: 'Driver (220+)' },
];

/** Minimum shots needed for valid analysis */
const MIN_SAMPLE_SIZE = 5;

/** Minimum shots for lie-distance combination */
const MIN_LIE_DISTANCE_SAMPLE = 3;

/** Canonical lie types */
const LIE_TYPES: LieType[] = ['tee', 'fairway', 'rough', 'sand', 'green', 'other'];

// ============================================================================
// V2 CONSTANTS: SHOT CATEGORY & DISPERSION
// ============================================================================

/** Approach distance brackets for analysis */
const APPROACH_BRACKETS: ApproachBracket[] = [
  { min: 50, max: 100, label: '50-100 yards' },
  { min: 100, max: 150, label: '100-150 yards' },
  { min: 150, max: 200, label: '150-200 yards' },
  { min: 200, max: 300, label: '200+ yards' },
];

/** Dispersion benchmarks (college player averages) */
const DISPERSION_BENCHMARKS = {
  driving: {
    dispersionRadius: 25,           // yards std dev for good college player
    fairwayHitRate: 55,             // percentage
  },
  approach: {
    '50-100': { dispersionRadius: 12, girRate: 65 },
    '100-150': { dispersionRadius: 22, girRate: 50 },
    '150-200': { dispersionRadius: 32, girRate: 35 },
    '200+': { dispersionRadius: 45, girRate: 20 },
  },
  aroundGreen: {
    upAndDownRate: 50,              // percentage
    avgProximity: 8,                // feet
  },
};

/** Miss severity thresholds (yards from target) */
const MISS_SEVERITY_THRESHOLDS = {
  minor: 10,                        // up to 10 yards
  moderate: 25,                     // 10-25 yards
  severe: 50,                       // 25-50 yards
  // > 50 yards or penalty = disaster
};

// ============================================================================
// RAW SHOT INTERFACE
// ============================================================================

interface RawShot {
  id: string;
  round_id: string;
  hole_number: number;
  shot_number: number;
  shot_type: string;
  club_type: string;
  lie_before: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  miss_direction: string | null;
  shot_distance: number | null;
  result: string;
  is_penalty?: boolean;
  penalty_type?: string | null;  // 'ob' | 'water' | 'unplayable' | 'lost'
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts distance to yards
 */
function toYards(distance: number | null, unit: string | null): number | null {
  if (distance == null) return null;
  return unit === 'feet' ? distance / 3 : distance;
}

/**
 * Normalizes lie type to canonical form
 */
function normalizeLie(lie: string | null): LieType {
  if (!lie) return 'other';
  const lower = lie.toLowerCase();
  if (lower === 'tee' || lower === 'teebox') return 'tee';
  if (lower === 'fairway' || lower === 'fw') return 'fairway';
  if (lower === 'rough' || lower === 'primary_rough' || lower === 'secondary_rough') return 'rough';
  if (lower === 'sand' || lower === 'bunker' || lower === 'greenside_bunker' || lower === 'fairway_bunker') return 'sand';
  if (lower === 'green' || lower === 'fringe') return 'green';
  return 'other';
}

/**
 * Normalizes miss direction to canonical form
 */
/**
 * Normalize free-text miss direction (from shot logs) into the
 * canonical MissDirection union.
 *
 * Fixes LIVE-15: prior code had `lower === 'l'` for BOTH 'left' and 'long'.
 * The second branch was unreachable, so every 'long' (including 'long'
 * itself — which matches line 490 only after 'lng' was compressed) could
 * collide with 'l' on earlier inputs, silently misclassifying long misses.
 */
export function normalizeMissDirection(dir: string | null): MissDirection {
  if (!dir) return 'none';
  const lower = dir.toLowerCase().replace(/[^a-z]/g, '');

  // Handle compound directions
  if (lower.includes('short') && lower.includes('left')) return 'short_left';
  if (lower.includes('short') && lower.includes('right')) return 'short_right';
  if (lower.includes('long') && lower.includes('left')) return 'long_left';
  if (lower.includes('long') && lower.includes('right')) return 'long_right';

  // Handle simple directions — 'l' is LEFT only (was duplicated on 'long' too)
  if (lower === 'left' || lower === 'l') return 'left';
  if (lower === 'right' || lower === 'r') return 'right';
  if (lower === 'short' || lower === 's') return 'short';
  if (lower === 'long' || lower === 'lng') return 'long';

  return 'none';
}

/**
 * Creates empty miss breakdown
 */
function createEmptyMissBreakdown(): MissBreakdown {
  return {
    left: 0,
    right: 0,
    short: 0,
    long: 0,
    shortLeft: 0,
    shortRight: 0,
    longLeft: 0,
    longRight: 0,
  };
}

/**
 * Calculates confidence based on sample size
 */
function calculateConfidence(sampleSize: number): number {
  if (sampleSize >= 50) return 0.95;
  if (sampleSize >= 30) return 0.85;
  if (sampleSize >= 20) return 0.75;
  if (sampleSize >= 10) return 0.65;
  if (sampleSize >= 5) return 0.55;
  return 0.4;
}

// ============================================================================
// MAIN ANALYSIS CLASS
// ============================================================================

/**
 * Lie-Specific Miss Pattern Analyzer
 * Analyzes shot data to identify lie-dependent miss patterns and root causes
 */
class LieSpecificAnalyzer {
  private playerId: string;
  private shots: RawShot[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Main entry point - performs complete lie-specific analysis
   */
  async analyzeLieSpecificMissPatterns(): Promise<LieMissAnalysis | null> {
    await this.loadShots();

    if (this.shots.length < MIN_SAMPLE_SIZE * 3) {
      return null;
    }

    // Generate per-lie patterns
    const liePatterns = this.analyzeLiePatterns();

    // Generate distance-segmented patterns
    const distanceRangePatterns = this.analyzeDistanceRangePatterns();

    // Generate cross-lie comparisons
    const crossComparisons = this.generateCrossComparisons(liePatterns);

    // Infer root causes
    const rootCauseInsights = this.inferRootCauses(liePatterns, crossComparisons);

    // V2: Shot category analysis (driving, approach, around the green)
    const shotCategoryAnalysis = this.analyzeShotCategories();

    // V2: Dispersion analysis
    const dispersionAnalysis = this.analyzeDispersion();

    // Generate summary
    const summary = this.generateSummary(liePatterns);

    return {
      playerId: this.playerId,
      analyzedAt: new Date().toISOString(),
      totalShotsAnalyzed: this.shots.length,
      liePatterns,
      distanceRangePatterns,
      crossComparisons,
      rootCauseInsights,
      shotCategoryAnalysis,
      dispersionAnalysis,
      summary,
    };
  }

  /**
   * Loads shot data for the player
   */
  private async loadShots(): Promise<void> {
    const supabase = createAdminClient();

    // Get all completed rounds for this player
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', this.playerId)
      .eq('status', 'completed');

    if (!rounds || rounds.length === 0) {
      return;
    }

    const roundIds = rounds.map((r) => r.id);

    // Get all shots from those rounds (excluding putts)
    const { data: shots, error } = await supabase
      .from('golf_shots')
      .select('*')
      .in('round_id', roundIds)
      .not('shot_type', 'in', '("putt","putting")')
      .order('round_id')
      .order('hole_number')
      .order('shot_number');

    if (error || !shots) {
      return;
    }

    this.shots = shots as RawShot[];
  }

  /**
   * Analyzes patterns for each lie type
   */
  private analyzeLiePatterns(): LieSpecificPattern[] {
    const patterns: LieSpecificPattern[] = [];

    for (const lieType of LIE_TYPES) {
      const lieShots = this.shots.filter(
        (s) => normalizeLie(s.lie_before) === lieType
      );

      if (lieShots.length < MIN_SAMPLE_SIZE) continue;

      const missBreakdown = this.calculateMissBreakdown(lieShots);
      const { primaryMiss, primaryMissFrequency } = this.findPrimaryMiss(missBreakdown);
      const avgMissDistance = this.calculateAvgMissDistance(lieShots);
      const greenHitRate = this.calculateGreenHitRate(lieShots);
      const penaltyRate = this.calculatePenaltyRate(lieShots);

      patterns.push({
        lie: lieType,
        totalShots: lieShots.length,
        missBreakdown,
        avgMissDistance,
        greenHitRate,
        penaltyRate,
        primaryMiss,
        primaryMissFrequency,
        confidence: calculateConfidence(lieShots.length),
      });
    }

    return patterns;
  }

  /**
   * Analyzes patterns by distance range AND lie type
   */
  private analyzeDistanceRangePatterns(): DistanceRangeLiePattern[] {
    const patterns: DistanceRangeLiePattern[] = [];

    for (const range of DISTANCE_RANGES) {
      for (const lieType of LIE_TYPES) {
        const shots = this.shots.filter((s) => {
          const distance = toYards(s.distance_to_hole_before, s.distance_unit_before);
          if (!distance) return false;
          return (
            distance >= range.min &&
            distance < range.max &&
            normalizeLie(s.lie_before) === lieType
          );
        });

        if (shots.length < MIN_LIE_DISTANCE_SAMPLE) continue;

        const missBreakdown = this.calculateMissBreakdown(shots);
        const { primaryMiss, primaryMissFrequency } = this.findPrimaryMiss(missBreakdown);
        const avgProximity = this.calculateAvgProximity(shots);
        const greenHitRate = this.calculateGreenHitRate(shots);

        patterns.push({
          distanceRange: range,
          lie: lieType,
          totalShots: shots.length,
          missBreakdown,
          avgProximity,
          greenHitRate,
          primaryMiss,
          primaryMissFrequency,
        });
      }
    }

    return patterns;
  }

  /**
   * Calculates miss breakdown percentages
   */
  private calculateMissBreakdown(shots: RawShot[]): MissBreakdown {
    const breakdown = createEmptyMissBreakdown();
    const shotsWithMiss = shots.filter((s) => s.miss_direction);

    if (shotsWithMiss.length === 0) {
      return breakdown;
    }

    const counts = {
      left: 0,
      right: 0,
      short: 0,
      long: 0,
      shortLeft: 0,
      shortRight: 0,
      longLeft: 0,
      longRight: 0,
    };

    for (const shot of shotsWithMiss) {
      const dir = normalizeMissDirection(shot.miss_direction);
      switch (dir) {
        case 'left':
          counts.left++;
          break;
        case 'right':
          counts.right++;
          break;
        case 'short':
          counts.short++;
          break;
        case 'long':
          counts.long++;
          break;
        case 'short_left':
          counts.shortLeft++;
          counts.short++; // Also count in aggregate
          counts.left++;
          break;
        case 'short_right':
          counts.shortRight++;
          counts.short++;
          counts.right++;
          break;
        case 'long_left':
          counts.longLeft++;
          counts.long++;
          counts.left++;
          break;
        case 'long_right':
          counts.longRight++;
          counts.long++;
          counts.right++;
          break;
      }
    }

    const total = shotsWithMiss.length;
    return {
      left: (counts.left / total) * 100,
      right: (counts.right / total) * 100,
      short: (counts.short / total) * 100,
      long: (counts.long / total) * 100,
      shortLeft: (counts.shortLeft / total) * 100,
      shortRight: (counts.shortRight / total) * 100,
      longLeft: (counts.longLeft / total) * 100,
      longRight: (counts.longRight / total) * 100,
    };
  }

  /**
   * Finds the primary miss direction and its frequency
   */
  private findPrimaryMiss(breakdown: MissBreakdown): { primaryMiss: MissDirection; primaryMissFrequency: number } {
    const directions: Array<{ dir: MissDirection; freq: number }> = [
      { dir: 'left', freq: breakdown.left },
      { dir: 'right', freq: breakdown.right },
      { dir: 'short', freq: breakdown.short },
      { dir: 'long', freq: breakdown.long },
    ];

    const sorted = directions.sort((a, b) => b.freq - a.freq);
    const top = sorted[0];

    if (!top || top.freq === 0) {
      return { primaryMiss: 'none', primaryMissFrequency: 0 };
    }

    return { primaryMiss: top.dir, primaryMissFrequency: top.freq };
  }

  /**
   * Calculates average miss distance (distance to hole after shot for missed greens)
   */
  private calculateAvgMissDistance(shots: RawShot[]): number {
    const missedShots = shots.filter(
      (s) => s.miss_direction && s.distance_to_hole_after != null
    );

    if (missedShots.length === 0) return 0;

    const total = missedShots.reduce(
      (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0),
      0
    );

    return total / missedShots.length;
  }

  /**
   * Calculates average proximity (distance to hole after shot)
   */
  private calculateAvgProximity(shots: RawShot[]): number {
    const shotsWithProximity = shots.filter((s) => s.distance_to_hole_after != null);

    if (shotsWithProximity.length === 0) return 0;

    const total = shotsWithProximity.reduce(
      (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0),
      0
    );

    return total / shotsWithProximity.length;
  }

  /**
   * Calculates green hit rate
   */
  private calculateGreenHitRate(shots: RawShot[]): number {
    if (shots.length === 0) return 0;

    const greenHits = shots.filter(
      (s) => s.result === 'green' || s.result === 'hole'
    );

    return (greenHits.length / shots.length) * 100;
  }

  /**
   * Calculates penalty rate
   */
  private calculatePenaltyRate(shots: RawShot[]): number {
    if (shots.length === 0) return 0;

    const penaltyShots = shots.filter((s) => s.result === 'penalty');

    return (penaltyShots.length / shots.length) * 100;
  }

  /**
   * Generates cross-lie comparisons for root cause analysis
   */
  private generateCrossComparisons(liePatterns: LieSpecificPattern[]): LieCrossComparison[] {
    const comparisons: LieCrossComparison[] = [];

    // Key comparisons to make
    const comparePairs: Array<[LieType, LieType]> = [
      ['fairway', 'rough'],
      ['fairway', 'sand'],
      ['rough', 'sand'],
      ['tee', 'fairway'],
    ];

    for (const [lieA, lieB] of comparePairs) {
      const patternA = liePatterns.find((p) => p.lie === lieA);
      const patternB = liePatterns.find((p) => p.lie === lieB);

      if (!patternA || !patternB) continue;
      if (patternA.totalShots < MIN_SAMPLE_SIZE || patternB.totalShots < MIN_SAMPLE_SIZE) continue;

      const patternsMatch = patternA.primaryMiss === patternB.primaryMiss;
      const divergenceScore = this.calculateDivergenceScore(
        patternA.missBreakdown,
        patternB.missBreakdown
      );

      const insight = this.generateComparisonInsight(
        lieA,
        lieB,
        patternA,
        patternB,
        patternsMatch,
        divergenceScore
      );

      comparisons.push({
        lieA,
        lieB,
        primaryMissA: patternA.primaryMiss,
        primaryMissB: patternB.primaryMiss,
        frequencyA: patternA.primaryMissFrequency,
        frequencyB: patternB.primaryMissFrequency,
        patternsMatch,
        divergenceScore,
        insight,
      });
    }

    return comparisons;
  }

  /**
   * Calculates divergence score between two miss breakdowns
   * 0 = identical, 1 = completely different
   */
  private calculateDivergenceScore(a: MissBreakdown, b: MissBreakdown): number {
    const keys: Array<keyof MissBreakdown> = ['left', 'right', 'short', 'long'];
    let totalDiff = 0;

    for (const key of keys) {
      totalDiff += Math.abs(a[key] - b[key]);
    }

    // Max possible difference is 400 (100% in each direction)
    return Math.min(1, totalDiff / 200);
  }

  /**
   * Generates insight text for a cross-lie comparison
   */
  private generateComparisonInsight(
    lieA: LieType,
    lieB: LieType,
    patternA: LieSpecificPattern,
    patternB: LieSpecificPattern,
    patternsMatch: boolean,
    divergenceScore: number
  ): string {
    const freqA = Math.round(patternA.primaryMissFrequency);
    const freqB = Math.round(patternB.primaryMissFrequency);
    const missA = this.formatMissDirection(patternA.primaryMiss);
    const missB = this.formatMissDirection(patternB.primaryMiss);

    if (patternsMatch) {
      if (divergenceScore < 0.2) {
        return `Consistent ${missA} miss from both ${lieA} (${freqA}%) and ${lieB} (${freqB}%) - suggests a fundamental swing issue rather than lie-specific problem.`;
      }
      return `Primary miss is ${missA} from both ${lieA} (${freqA}%) and ${lieB} (${freqB}%), but with different intensities - may indicate a core swing tendency amplified by certain lies.`;
    }

    // Patterns don't match - interesting root cause opportunity
    if (divergenceScore > 0.5) {
      return `Miss ${missA} ${freqA}% from ${lieA} BUT miss ${missB} ${freqB}% from ${lieB} - suggests setup/stance issue in ${lieA}, not swing plane.`;
    }

    return `Different miss patterns: ${missA} (${freqA}%) from ${lieA} vs ${missB} (${freqB}%) from ${lieB}. May indicate lie-specific technical adjustments needed.`;
  }

  /**
   * Infers root causes from patterns and comparisons
   */
  private inferRootCauses(
    liePatterns: LieSpecificPattern[],
    crossComparisons: LieCrossComparison[]
  ): RootCauseInsight[] {
    const insights: RootCauseInsight[] = [];

    // Check for sand deceleration pattern
    const sandPattern = liePatterns.find((p) => p.lie === 'sand');
    if (sandPattern && sandPattern.missBreakdown.short > 50) {
      insights.push({
        id: crypto.randomUUID(),
        category: 'contact',
        headline: 'Sand Shot Deceleration',
        body: `From sand, you miss short ${Math.round(sandPattern.missBreakdown.short)}% of the time. This strongly suggests deceleration through impact - a common issue where players slow the club through the sand instead of accelerating.`,
        evidence: [
          `Short miss rate from sand: ${Math.round(sandPattern.missBreakdown.short)}%`,
          `Sample size: ${sandPattern.totalShots} shots`,
          `Green hit rate from sand: ${Math.round(sandPattern.greenHitRate)}%`,
        ],
        confidence: sandPattern.confidence,
        recommendation: 'Focus on accelerating through the sand. Practice with the mindset of "splashing" the sand onto the green. Consider taking a shorter backswing but committing to a full follow-through.',
        affectedLies: ['sand'],
        strokeImpact: this.estimateSandImpact(sandPattern),
      });
    }

    // Check for divergent fairway vs rough patterns (setup issue)
    const fwVsRoughComp = crossComparisons.find(
      (c) => c.lieA === 'fairway' && c.lieB === 'rough'
    );
    if (fwVsRoughComp && !fwVsRoughComp.patternsMatch && fwVsRoughComp.divergenceScore > 0.4) {
      const fairwayPattern = liePatterns.find((p) => p.lie === 'fairway');
      const roughPattern = liePatterns.find((p) => p.lie === 'rough');

      if (fairwayPattern && roughPattern) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'setup',
          headline: 'Lie-Dependent Miss Pattern',
          body: `Your miss patterns differ significantly between fairway and rough. From fairway, you primarily miss ${this.formatMissDirection(fwVsRoughComp.primaryMissA)} (${Math.round(fwVsRoughComp.frequencyA)}%), but from rough you miss ${this.formatMissDirection(fwVsRoughComp.primaryMissB)} (${Math.round(fwVsRoughComp.frequencyB)}%). This suggests a setup or stance issue rather than a fundamental swing plane problem.`,
          evidence: [
            `Fairway primary miss: ${this.formatMissDirection(fwVsRoughComp.primaryMissA)} at ${Math.round(fwVsRoughComp.frequencyA)}%`,
            `Rough primary miss: ${this.formatMissDirection(fwVsRoughComp.primaryMissB)} at ${Math.round(fwVsRoughComp.frequencyB)}%`,
            `Pattern divergence: ${Math.round(fwVsRoughComp.divergenceScore * 100)}%`,
          ],
          confidence: Math.min(fairwayPattern.confidence, roughPattern.confidence),
          recommendation: 'Review your setup routine for rough lies. Ball position, stance width, and weight distribution may differ too much from your fairway setup. Work with your coach on a consistent pre-shot routine that accounts for lie conditions.',
          affectedLies: ['fairway', 'rough'],
          strokeImpact: this.estimateCrossLieImpact(fairwayPattern, roughPattern),
        });
      }
    }

    // Check for penalty rate differences
    const fairwayPattern = liePatterns.find((p) => p.lie === 'fairway');
    const roughPattern = liePatterns.find((p) => p.lie === 'rough');

    if (fairwayPattern && roughPattern && fairwayPattern.penaltyRate > 0 && roughPattern.penaltyRate > 0) {
      const multiplier = roughPattern.penaltyRate / Math.max(0.1, fairwayPattern.penaltyRate);

      if (multiplier > 2) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'club_selection',
          headline: 'Rough Lies Producing Excessive Penalties',
          body: `Rough lies produce ${multiplier.toFixed(1)}x more penalty shots than fairway lies. Your penalty rate from rough is ${Math.round(roughPattern.penaltyRate)}% vs ${Math.round(fairwayPattern.penaltyRate)}% from fairway.`,
          evidence: [
            `Penalty rate from rough: ${Math.round(roughPattern.penaltyRate)}%`,
            `Penalty rate from fairway: ${Math.round(fairwayPattern.penaltyRate)}%`,
            `Multiplier: ${multiplier.toFixed(1)}x`,
          ],
          confidence: Math.min(fairwayPattern.confidence, roughPattern.confidence),
          recommendation: 'When in rough, prioritize getting back in play over going for the green. Consider taking more club or playing a safer line to avoid compounding the mistake.',
          affectedLies: ['rough'],
          strokeImpact: (roughPattern.penaltyRate - fairwayPattern.penaltyRate) / 100 * 4, // Assume 4 rough shots per round
        });
      }
    }

    // Check for consistent miss across all lies (fundamental swing issue)
    const consistentMiss = this.checkConsistentMissAcrossLies(liePatterns);
    if (consistentMiss) {
      insights.push(consistentMiss);
    }

    return insights;
  }

  /**
   * Checks if there's a consistent miss direction across all lies
   */
  private checkConsistentMissAcrossLies(liePatterns: LieSpecificPattern[]): RootCauseInsight | null {
    const significantPatterns = liePatterns.filter(
      (p) => p.totalShots >= MIN_SAMPLE_SIZE && p.primaryMissFrequency > 30
    );

    if (significantPatterns.length < 3) return null;

    // Check if primary miss is the same across at least 3 lies
    const missCounts = new Map<MissDirection, number>();
    for (const pattern of significantPatterns) {
      missCounts.set(pattern.primaryMiss, (missCounts.get(pattern.primaryMiss) ?? 0) + 1);
    }

    let dominantMiss: MissDirection | null = null;
    let dominantCount = 0;
    for (const [miss, count] of Array.from(missCounts.entries())) {
      if (count >= 3 && count > dominantCount) {
        dominantMiss = miss;
        dominantCount = count;
      }
    }

    if (!dominantMiss) return null;

    const avgFrequency = significantPatterns
      .filter((p) => p.primaryMiss === dominantMiss)
      .reduce((sum, p) => sum + p.primaryMissFrequency, 0) / dominantCount;

    return {
      id: crypto.randomUUID(),
      category: 'swing_plane',
      headline: `Consistent ${this.formatMissDirection(dominantMiss).charAt(0).toUpperCase() + this.formatMissDirection(dominantMiss).slice(1)} Miss Across All Lies`,
      body: `You miss ${this.formatMissDirection(dominantMiss)} from ${dominantCount} different lie types at an average rate of ${Math.round(avgFrequency)}%. This consistency suggests a fundamental swing path or face angle issue rather than lie-specific problems.`,
      evidence: significantPatterns
        .filter((p) => p.primaryMiss === dominantMiss)
        .map((p) => `${p.lie}: ${this.formatMissDirection(dominantMiss!)} at ${Math.round(p.primaryMissFrequency)}%`),
      confidence: Math.min(...significantPatterns.map((p) => p.confidence)),
      recommendation: this.getSwingPlaneRecommendation(dominantMiss),
      affectedLies: significantPatterns.filter((p) => p.primaryMiss === dominantMiss).map((p) => p.lie),
      strokeImpact: avgFrequency / 100 * 0.5, // Estimate 0.5 strokes per consistent miss pattern
    };
  }

  /**
   * Gets swing plane recommendation based on miss direction
   */
  private getSwingPlaneRecommendation(miss: MissDirection): string {
    switch (miss) {
      case 'right':
        return 'A consistent right miss often indicates an open club face at impact or an out-to-in swing path. Work on grip pressure and face control drills. Consider checking ball position and alignment.';
      case 'left':
        return 'A consistent left miss typically suggests a closed face or over-the-top swing path. Focus on maintaining proper face angle and swing plane. Check grip strength and ball position.';
      case 'short':
        return 'Consistent short misses indicate club selection issues or deceleration through impact. Consider taking one more club and committing to a full, confident swing.';
      case 'long':
        return 'Consistent long misses suggest club selection issues or course conditions affecting distance. Review your carry distances and consider wind and elevation factors.';
      default:
        return 'Work with your coach to identify the root cause of your consistent miss pattern.';
    }
  }

  /**
   * Estimates stroke impact from sand issues
   */
  private estimateSandImpact(sandPattern: LieSpecificPattern): number {
    // Assume 2-3 bunker shots per round
    const shotsPerRound = 2.5;
    const extraStrokesPerMiss = 0.3; // Each short miss costs ~0.3 strokes
    return (sandPattern.missBreakdown.short / 100) * shotsPerRound * extraStrokesPerMiss;
  }

  /**
   * Estimates stroke impact from cross-lie pattern issues
   */
  private estimateCrossLieImpact(fairwayPattern: LieSpecificPattern, roughPattern: LieSpecificPattern): number {
    // Assume 8 fairway shots and 4 rough shots per round
    const fairwayMissRate = (100 - fairwayPattern.greenHitRate) / 100;
    const roughMissRate = (100 - roughPattern.greenHitRate) / 100;

    return (fairwayMissRate * 8 + roughMissRate * 4) * 0.1; // ~0.1 strokes per GIR miss
  }

  /**
   * Generates summary metrics
   */
  private generateSummary(liePatterns: LieSpecificPattern[]): LieMissAnalysis['summary'] {
    const significantPatterns = liePatterns.filter((p) => p.totalShots >= MIN_SAMPLE_SIZE);

    // Find worst lie (highest avg miss distance)
    const sortedByMiss = [...significantPatterns].sort((a, b) => b.avgMissDistance - a.avgMissDistance);
    const worstLie = sortedByMiss[0]?.lie ?? 'other';

    // Find best lie (highest green hit rate)
    const sortedByGreen = [...significantPatterns].sort((a, b) => b.greenHitRate - a.greenHitRate);
    const bestLie = sortedByGreen[0]?.lie ?? 'fairway';

    // Find most consistent lie (lowest primary miss frequency = more spread out misses)
    const sortedByConsistency = [...significantPatterns].sort(
      (a, b) => a.primaryMissFrequency - b.primaryMissFrequency
    );
    const mostConsistentLie = sortedByConsistency[0]?.lie ?? 'fairway';

    // Find highest penalty lie
    const sortedByPenalty = [...significantPatterns].sort((a, b) => b.penaltyRate - a.penaltyRate);
    const highestPenaltyLie = sortedByPenalty[0]?.lie ?? 'rough';

    // Calculate penalty multiplier (rough vs fairway)
    const fairwayPattern = liePatterns.find((p) => p.lie === 'fairway');
    const roughPattern = liePatterns.find((p) => p.lie === 'rough');
    const penaltyMultiplier =
      fairwayPattern && roughPattern && fairwayPattern.penaltyRate > 0
        ? roughPattern.penaltyRate / fairwayPattern.penaltyRate
        : 1;

    return {
      worstLie,
      bestLie,
      mostConsistentLie,
      highestPenaltyLie,
      penaltyMultiplierRoughVsFairway: penaltyMultiplier,
    };
  }

  /**
   * Formats miss direction for display
   */
  private formatMissDirection(direction: MissDirection): string {
    const mapping: Record<MissDirection, string> = {
      left: 'left',
      right: 'right',
      short: 'short',
      long: 'long',
      short_left: 'short-left',
      short_right: 'short-right',
      long_left: 'long-left',
      long_right: 'long-right',
      none: 'centered',
    };
    return mapping[direction];
  }

  // ============================================================================
  // V2: SHOT CATEGORY ANALYSIS
  // ============================================================================

  /**
   * Analyzes shots by category: driving, approach (by yardage), around the green
   */
  private analyzeShotCategories(): ShotCategoryAnalysis {
    const driving = this.analyzeDriving();
    const approachByBracket = this.analyzeApproachByBracket();
    const aroundGreen = this.analyzeAroundGreen();

    // Generate cross-category insights
    const insights = this.generateShotCategoryInsights(driving, approachByBracket, aroundGreen);

    return {
      driving,
      approachByBracket,
      aroundGreen,
      insights,
    };
  }

  /**
   * Analyzes driving (tee shots on par 4s and 5s)
   */
  private analyzeDriving(): DrivingAnalysis | null {
    const drivingShots = this.shots.filter(
      (s) => s.shot_type === 'tee' && normalizeLie(s.lie_before) === 'tee'
    );

    if (drivingShots.length < MIN_SAMPLE_SIZE) {
      return null;
    }

    // Calculate basic metrics
    const fairwayHits = drivingShots.filter((s) => s.result === 'fairway').length;
    const fairwayHitRate = (fairwayHits / drivingShots.length) * 100;

    // Calculate average driving distance
    const shotsWithDistance = drivingShots.filter((s) => s.shot_distance != null);
    const avgDrivingDistance = shotsWithDistance.length > 0
      ? shotsWithDistance.reduce((sum, s) => sum + (s.shot_distance ?? 0), 0) / shotsWithDistance.length
      : 0;

    // Miss breakdown
    const missBreakdown = this.calculateMissBreakdown(drivingShots);
    const { primaryMiss, primaryMissFrequency } = this.findPrimaryMiss(missBreakdown);

    // Penalty rate
    const penaltyShots = drivingShots.filter((s) => s.result === 'penalty');
    const penaltyRate = (penaltyShots.length / drivingShots.length) * 100;

    // Danger zone rate (rough + sand + penalty)
    const dangerShots = drivingShots.filter(
      (s) => s.result === 'rough' || s.result === 'sand' || s.result === 'penalty'
    );
    const dangerZoneRate = (dangerShots.length / drivingShots.length) * 100;

    // Dispersion calculation
    const { dispersionRadius, leftMissAvg, rightMissAvg } = this.calculateDrivingDispersion(drivingShots);

    // Outcome breakdown
    const outcomeBreakdown = {
      fairway: (drivingShots.filter((s) => s.result === 'fairway').length / drivingShots.length) * 100,
      lightRough: (drivingShots.filter((s) => s.result === 'rough').length / drivingShots.length) * 100 * 0.7, // Estimate 70% playable
      heavyRough: (drivingShots.filter((s) => s.result === 'rough').length / drivingShots.length) * 100 * 0.3, // Estimate 30% heavy
      sand: (drivingShots.filter((s) => s.result === 'sand').length / drivingShots.length) * 100,
      penalty: penaltyRate,
      other: (drivingShots.filter((s) => s.result === 'other').length / drivingShots.length) * 100,
    };

    return {
      totalDrives: drivingShots.length,
      fairwayHitRate,
      avgDrivingDistance,
      missBreakdown,
      primaryMiss,
      primaryMissFrequency,
      penaltyRate,
      dangerZoneRate,
      dispersionRadius,
      leftMissAvgDistance: leftMissAvg,
      rightMissAvgDistance: rightMissAvg,
      outcomeBreakdown,
      confidence: calculateConfidence(drivingShots.length),
    };
  }

  /**
   * Calculates driving dispersion metrics
   */
  private calculateDrivingDispersion(shots: RawShot[]): {
    dispersionRadius: number;
    leftMissAvg: number;
    rightMissAvg: number;
  } {
    // For dispersion, we need to estimate "distance from center of fairway"
    // We use miss direction + result to infer severity
    // Shots with miss_direction give us directional info

    const leftMisses = shots.filter(
      (s) => normalizeMissDirection(s.miss_direction) === 'left' ||
             normalizeMissDirection(s.miss_direction) === 'short_left' ||
             normalizeMissDirection(s.miss_direction) === 'long_left'
    );
    const rightMisses = shots.filter(
      (s) => normalizeMissDirection(s.miss_direction) === 'right' ||
             normalizeMissDirection(s.miss_direction) === 'short_right' ||
             normalizeMissDirection(s.miss_direction) === 'long_right'
    );

    // Estimate miss distances based on result
    // Fairway = 0, Rough = 15 yards off, Sand = 20 yards off, Penalty = 35 yards off
    const estimateMissDistance = (shot: RawShot): number => {
      if (shot.result === 'fairway') return 0;
      if (shot.result === 'rough') return 15;
      if (shot.result === 'sand') return 20;
      if (shot.result === 'penalty') return 35;
      return 10; // other
    };

    const allDistances = shots.map(estimateMissDistance);
    const mean = allDistances.reduce((a, b) => a + b, 0) / allDistances.length;
    const variance = allDistances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / allDistances.length;
    const dispersionRadius = Math.sqrt(variance);

    const leftMissAvg = leftMisses.length > 0
      ? leftMisses.map(estimateMissDistance).reduce((a, b) => a + b, 0) / leftMisses.length
      : 0;

    const rightMissAvg = rightMisses.length > 0
      ? rightMisses.map(estimateMissDistance).reduce((a, b) => a + b, 0) / rightMisses.length
      : 0;

    return { dispersionRadius, leftMissAvg, rightMissAvg };
  }

  /**
   * Analyzes approach shots by distance bracket
   */
  private analyzeApproachByBracket(): ApproachBracketAnalysis[] {
    const results: ApproachBracketAnalysis[] = [];

    for (const bracket of APPROACH_BRACKETS) {
      const bracketShots = this.shots.filter((s) => {
        if (s.shot_type !== 'approach') return false;
        const distance = toYards(s.distance_to_hole_before, s.distance_unit_before);
        if (!distance) return false;
        return distance >= bracket.min && distance < bracket.max;
      });

      if (bracketShots.length < MIN_SAMPLE_SIZE) continue;

      // GIR rate
      const greenHits = bracketShots.filter((s) => s.result === 'green' || s.result === 'hole');
      const girRate = (greenHits.length / bracketShots.length) * 100;

      // Average proximity (distance to hole after shot)
      const shotsWithProximity = bracketShots.filter((s) => s.distance_to_hole_after != null);
      const avgProximity = shotsWithProximity.length > 0
        ? shotsWithProximity.reduce(
            (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0) * 3, // Convert to feet
            0
          ) / shotsWithProximity.length
        : 0;

      // Miss breakdown
      const missBreakdown = this.calculateMissBreakdown(bracketShots);
      const { primaryMiss, primaryMissFrequency } = this.findPrimaryMiss(missBreakdown);

      // Dispersion metrics
      const dispersion = this.calculateApproachDispersion(bracketShots);

      // Danger zone rate
      const dangerShots = bracketShots.filter((s) => s.result === 'sand' || s.result === 'penalty');
      const dangerZoneRate = (dangerShots.length / bracketShots.length) * 100;

      // GIR by starting lie
      const fromFairway = bracketShots.filter((s) => normalizeLie(s.lie_before) === 'fairway');
      const fromRough = bracketShots.filter((s) => normalizeLie(s.lie_before) === 'rough');
      const fromSand = bracketShots.filter((s) => normalizeLie(s.lie_before) === 'sand');

      const fromFairwayGIR = fromFairway.length >= 3
        ? (fromFairway.filter((s) => s.result === 'green' || s.result === 'hole').length / fromFairway.length) * 100
        : 0;
      const fromRoughGIR = fromRough.length >= 3
        ? (fromRough.filter((s) => s.result === 'green' || s.result === 'hole').length / fromRough.length) * 100
        : 0;
      const fromSandGIR = fromSand.length >= 3
        ? (fromSand.filter((s) => s.result === 'green' || s.result === 'hole').length / fromSand.length) * 100
        : 0;

      // Miss severity
      const missSeverity = this.calculateMissSeverity(bracketShots);

      results.push({
        bracket,
        totalShots: bracketShots.length,
        girRate,
        avgProximity,
        missBreakdown,
        primaryMiss,
        primaryMissFrequency,
        dispersionRadius: dispersion.radius,
        avgMissDistance: dispersion.avgMissDistance,
        dangerZoneRate,
        fromFairwayGIR,
        fromRoughGIR,
        fromSandGIR,
        missSeverity,
        confidence: calculateConfidence(bracketShots.length),
      });
    }

    return results;
  }

  /**
   * Calculates approach shot dispersion
   */
  private calculateApproachDispersion(shots: RawShot[]): {
    radius: number;
    avgMissDistance: number;
  } {
    // Use distance_to_hole_after as proxy for dispersion
    const shotsWithDistance = shots.filter((s) => s.distance_to_hole_after != null);

    if (shotsWithDistance.length === 0) {
      return { radius: 0, avgMissDistance: 0 };
    }

    const distances = shotsWithDistance.map(
      (s) => toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0
    );

    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
    const radius = Math.sqrt(variance);

    // Avg miss distance (for shots that didn't hit green)
    const missedShots = shots.filter((s) => s.result !== 'green' && s.result !== 'hole');
    const avgMissDistance = missedShots.length > 0
      ? missedShots.reduce(
          (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0),
          0
        ) / missedShots.length
      : 0;

    return { radius, avgMissDistance };
  }

  /**
   * Calculates miss severity breakdown
   */
  private calculateMissSeverity(shots: RawShot[]): {
    minor: number;
    moderate: number;
    severe: number;
  } {
    let minor = 0;
    let moderate = 0;
    let severe = 0;

    for (const shot of shots) {
      // Skip shots that hit the green
      if (shot.result === 'green' || shot.result === 'hole') continue;

      // Use distance_to_hole_after as proxy for miss severity
      const missDistance = toYards(shot.distance_to_hole_after, shot.distance_unit_after) ?? 0;

      if (shot.result === 'penalty') {
        severe++;
      } else if (missDistance <= MISS_SEVERITY_THRESHOLDS.minor) {
        minor++;
      } else if (missDistance <= MISS_SEVERITY_THRESHOLDS.moderate) {
        moderate++;
      } else {
        severe++;
      }
    }

    const totalMisses = minor + moderate + severe;
    if (totalMisses === 0) {
      return { minor: 0, moderate: 0, severe: 0 };
    }

    return {
      minor: (minor / totalMisses) * 100,
      moderate: (moderate / totalMisses) * 100,
      severe: (severe / totalMisses) * 100,
    };
  }

  /**
   * Analyzes around the green shots
   */
  private analyzeAroundGreen(): AroundGreenAnalysis | null {
    const aroundGreenShots = this.shots.filter((s) => s.shot_type === 'around_green');

    if (aroundGreenShots.length < MIN_SAMPLE_SIZE) {
      return null;
    }

    // Up and down rate (simplified: shot lands within 6 feet = likely 1 putt)
    const closeShots = aroundGreenShots.filter((s) => {
      const distAfter = toYards(s.distance_to_hole_after, s.distance_unit_after);
      // Convert to feet if in yards
      const distFeet = s.distance_unit_after === 'feet'
        ? s.distance_to_hole_after
        : (distAfter ?? 0) * 3;
      return distFeet != null && distFeet <= 6;
    });
    const upAndDownRate = (closeShots.length / aroundGreenShots.length) * 100;

    // Average proximity after shot
    const shotsWithProximity = aroundGreenShots.filter((s) => s.distance_to_hole_after != null);
    const avgProximityAfter = shotsWithProximity.length > 0
      ? shotsWithProximity.reduce((sum, s) => {
          const distYards = toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0;
          const distFeet = s.distance_unit_after === 'feet'
            ? (s.distance_to_hole_after ?? 0)
            : distYards * 3;
          return sum + distFeet;
        }, 0) / shotsWithProximity.length
      : 0;

    // By starting lie
    const fromRough = this.analyzeAroundGreenByLie(aroundGreenShots, 'rough');
    const fromSand = this.analyzeAroundGreenByLie(aroundGreenShots, 'sand');
    const fromFairway = this.analyzeAroundGreenByLie(aroundGreenShots, 'fairway');

    // Miss breakdown
    const missBreakdown = this.calculateMissBreakdown(aroundGreenShots);
    const { primaryMiss, primaryMissFrequency } = this.findPrimaryMiss(missBreakdown);

    // Distance control
    const shortMisses = aroundGreenShots.filter(
      (s) => normalizeMissDirection(s.miss_direction) === 'short' ||
             normalizeMissDirection(s.miss_direction) === 'short_left' ||
             normalizeMissDirection(s.miss_direction) === 'short_right'
    );
    const longMisses = aroundGreenShots.filter(
      (s) => normalizeMissDirection(s.miss_direction) === 'long' ||
             normalizeMissDirection(s.miss_direction) === 'long_left' ||
             normalizeMissDirection(s.miss_direction) === 'long_right'
    );

    const shortMissRate = (shortMisses.length / aroundGreenShots.length) * 100;
    const longMissRate = (longMisses.length / aroundGreenShots.length) * 100;

    // Distance control score (inverse of short+long bias, 100 = perfect)
    const distanceBias = Math.abs(shortMissRate - longMissRate);
    const distanceControlScore = Math.max(0, 100 - distanceBias - (shortMissRate + longMissRate) / 2);

    return {
      totalShots: aroundGreenShots.length,
      upAndDownRate,
      avgProximityAfter,
      fromRough,
      fromSand,
      fromFairway,
      missBreakdown,
      primaryMiss,
      primaryMissFrequency,
      shortMissRate,
      longMissRate,
      distanceControlScore,
      confidence: calculateConfidence(aroundGreenShots.length),
    };
  }

  /**
   * Analyzes around the green shots from a specific lie
   */
  private analyzeAroundGreenByLie(
    shots: RawShot[],
    lie: LieType
  ): { shots: number; upAndDownRate: number; avgProximity: number; dangerZoneRate?: number; sandSaveRate?: number } {
    const lieShots = shots.filter((s) => normalizeLie(s.lie_before) === lie);

    if (lieShots.length < 3) {
      return { shots: 0, upAndDownRate: 0, avgProximity: 0 };
    }

    // Up and down rate
    const closeShots = lieShots.filter((s) => {
      const distYards = toYards(s.distance_to_hole_after, s.distance_unit_after);
      const distFeet = s.distance_unit_after === 'feet'
        ? s.distance_to_hole_after
        : (distYards ?? 0) * 3;
      return distFeet != null && distFeet <= 6;
    });
    const upAndDownRate = (closeShots.length / lieShots.length) * 100;

    // Average proximity
    const shotsWithProximity = lieShots.filter((s) => s.distance_to_hole_after != null);
    const avgProximity = shotsWithProximity.length > 0
      ? shotsWithProximity.reduce((sum, s) => {
          const distYards = toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0;
          const distFeet = s.distance_unit_after === 'feet'
            ? (s.distance_to_hole_after ?? 0)
            : distYards * 3;
          return sum + distFeet;
        }, 0) / shotsWithProximity.length
      : 0;

    const result: { shots: number; upAndDownRate: number; avgProximity: number; dangerZoneRate?: number; sandSaveRate?: number } = {
      shots: lieShots.length,
      upAndDownRate,
      avgProximity,
    };

    // Add danger zone rate for rough
    if (lie === 'rough') {
      const dangerShots = lieShots.filter((s) => s.result === 'sand' || s.result === 'penalty');
      result.dangerZoneRate = (dangerShots.length / lieShots.length) * 100;
    }

    // Add sand save rate for sand
    if (lie === 'sand') {
      result.sandSaveRate = upAndDownRate; // Same as up-and-down from sand
    }

    return result;
  }

  /**
   * Generates insights from shot category analysis
   */
  private generateShotCategoryInsights(
    driving: DrivingAnalysis | null,
    approaches: ApproachBracketAnalysis[],
    aroundGreen: AroundGreenAnalysis | null
  ): ShotCategoryInsight[] {
    const insights: ShotCategoryInsight[] = [];

    // Driving insights
    if (driving) {
      // High penalty rate
      if (driving.penaltyRate > 10) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'driving',
          headline: 'High Penalty Rate Off the Tee',
          body: `${Math.round(driving.penaltyRate)}% of your drives result in penalty strokes. This is significantly impacting your scoring.`,
          evidence: [
            `Penalty rate: ${Math.round(driving.penaltyRate)}%`,
            `Primary miss: ${this.formatMissDirection(driving.primaryMiss)} (${Math.round(driving.primaryMissFrequency)}%)`,
          ],
          severity: 'critical',
          strokeImpact: driving.penaltyRate / 100 * 14 * 1.5, // ~14 drives per round, 1.5 stroke penalty avg
          recommendation: 'Consider a more conservative tee shot strategy. Identify the miss pattern and aim away from trouble.',
        });
      }

      // Wide dispersion
      const benchmark = DISPERSION_BENCHMARKS.driving.dispersionRadius;
      if (driving.dispersionRadius > benchmark * 1.5) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'driving',
          headline: 'Wide Driving Dispersion',
          body: `Your driving dispersion is ${Math.round(driving.dispersionRadius)} yards, which is ${Math.round((driving.dispersionRadius / benchmark - 1) * 100)}% wider than benchmark.`,
          evidence: [
            `Your dispersion: ${Math.round(driving.dispersionRadius)} yards`,
            `Benchmark: ${benchmark} yards`,
            `Fairway hit rate: ${Math.round(driving.fairwayHitRate)}%`,
          ],
          severity: 'warning',
          strokeImpact: (driving.dispersionRadius - benchmark) / 10 * 0.3, // Rough estimate
          recommendation: 'Focus on consistent contact and tempo. Consider a shorter club for better control.',
        });
      }

      // Asymmetric miss pattern
      if (Math.abs(driving.leftMissAvgDistance - driving.rightMissAvgDistance) > 10) {
        const worseDirection = driving.leftMissAvgDistance > driving.rightMissAvgDistance ? 'left' : 'right';
        const worseMiss = worseDirection === 'left' ? driving.leftMissAvgDistance : driving.rightMissAvgDistance;
        const betterMiss = worseDirection === 'left' ? driving.rightMissAvgDistance : driving.leftMissAvgDistance;

        insights.push({
          id: crypto.randomUUID(),
          category: 'driving',
          headline: `${worseDirection.charAt(0).toUpperCase() + worseDirection.slice(1)} Misses More Severe`,
          body: `When you miss ${worseDirection}, your average miss distance is ${Math.round(worseMiss)} yards off fairway vs ${Math.round(betterMiss)} yards when missing ${worseDirection === 'left' ? 'right' : 'left'}.`,
          evidence: [
            `${worseDirection} miss severity: ${Math.round(worseMiss)} yards avg`,
            `${worseDirection === 'left' ? 'Right' : 'Left'} miss severity: ${Math.round(betterMiss)} yards avg`,
          ],
          severity: 'info',
          strokeImpact: (worseMiss - betterMiss) / 30 * 0.2,
          recommendation: `Aim slightly ${worseDirection === 'left' ? 'right' : 'left'} of your target to account for the more severe ${worseDirection} miss.`,
        });
      }
    }

    // Approach insights by bracket
    for (const approach of approaches) {
      const bracketKey = approach.bracket.label.replace(/[^0-9-+]/g, '').replace('-', '-') as keyof typeof DISPERSION_BENCHMARKS.approach;
      const benchmarkData = DISPERSION_BENCHMARKS.approach[bracketKey];

      if (!benchmarkData) continue;

      // Low GIR from this distance
      if (approach.girRate < benchmarkData.girRate * 0.7) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'approach',
          bracket: approach.bracket,
          headline: `Struggling from ${approach.bracket.label}`,
          body: `Your GIR rate from ${approach.bracket.label} is ${Math.round(approach.girRate)}%, well below the ${benchmarkData.girRate}% benchmark.`,
          evidence: [
            `Your GIR: ${Math.round(approach.girRate)}%`,
            `Benchmark: ${benchmarkData.girRate}%`,
            `Primary miss: ${this.formatMissDirection(approach.primaryMiss)}`,
          ],
          severity: approach.girRate < benchmarkData.girRate * 0.5 ? 'critical' : 'warning',
          strokeImpact: (benchmarkData.girRate - approach.girRate) / 100 * 5 * 0.5, // ~5 approaches per bracket per round
          recommendation: `Focus on controlled shots from this distance. Consider club down for better contact.`,
        });
      }

      // High danger zone rate
      if (approach.dangerZoneRate > 15) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'approach',
          bracket: approach.bracket,
          headline: `High Danger Zone Rate (${approach.bracket.label})`,
          body: `${Math.round(approach.dangerZoneRate)}% of approaches from ${approach.bracket.label} end in bunkers or penalties.`,
          evidence: [
            `Danger zone rate: ${Math.round(approach.dangerZoneRate)}%`,
            `Miss breakdown: Short ${Math.round(approach.missBreakdown.short)}%, Long ${Math.round(approach.missBreakdown.long)}%`,
          ],
          severity: 'warning',
          strokeImpact: approach.dangerZoneRate / 100 * 4 * 0.7, // Estimate
          recommendation: 'Aim for the fat part of the green from this distance. Avoid pins near hazards.',
        });
      }

      // Significant lie difference
      if (approach.fromFairwayGIR > 0 && approach.fromRoughGIR > 0) {
        const girDrop = approach.fromFairwayGIR - approach.fromRoughGIR;
        if (girDrop > 25) {
          insights.push({
            id: crypto.randomUUID(),
            category: 'approach',
            bracket: approach.bracket,
            headline: `Big GIR Drop from Rough (${approach.bracket.label})`,
            body: `From ${approach.bracket.label}, your GIR drops ${Math.round(girDrop)}% when hitting from rough vs fairway.`,
            evidence: [
              `GIR from fairway: ${Math.round(approach.fromFairwayGIR)}%`,
              `GIR from rough: ${Math.round(approach.fromRoughGIR)}%`,
              `Drop: ${Math.round(girDrop)}%`,
            ],
            severity: 'info',
            strokeImpact: girDrop / 100 * 3 * 0.3, // Estimate ~3 rough approaches per round at this distance
            recommendation: 'Practice approaches from rough. Focus on clean contact and consider taking less club.',
          });
        }
      }

      // High severe miss rate
      if (approach.missSeverity.severe > 30) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'approach',
          bracket: approach.bracket,
          headline: `Too Many Severe Misses (${approach.bracket.label})`,
          body: `${Math.round(approach.missSeverity.severe)}% of your missed approaches from ${approach.bracket.label} are severe (>25 yards or penalty).`,
          evidence: [
            `Severe misses: ${Math.round(approach.missSeverity.severe)}%`,
            `Moderate misses: ${Math.round(approach.missSeverity.moderate)}%`,
            `Minor misses: ${Math.round(approach.missSeverity.minor)}%`,
          ],
          severity: 'critical',
          strokeImpact: approach.missSeverity.severe / 100 * 4 * 0.8,
          recommendation: 'Focus on making contact. A minor miss is always better than a disaster. Consider a more conservative target.',
        });
      }
    }

    // Around the green insights
    if (aroundGreen) {
      // Low up-and-down rate
      if (aroundGreen.upAndDownRate < DISPERSION_BENCHMARKS.aroundGreen.upAndDownRate * 0.7) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'around_green',
          headline: 'Struggling Around the Green',
          body: `Your up-and-down rate is ${Math.round(aroundGreen.upAndDownRate)}%, below the ${DISPERSION_BENCHMARKS.aroundGreen.upAndDownRate}% benchmark.`,
          evidence: [
            `Your up-and-down: ${Math.round(aroundGreen.upAndDownRate)}%`,
            `Benchmark: ${DISPERSION_BENCHMARKS.aroundGreen.upAndDownRate}%`,
            `Avg proximity: ${Math.round(aroundGreen.avgProximityAfter)} feet`,
          ],
          severity: 'warning',
          strokeImpact: (DISPERSION_BENCHMARKS.aroundGreen.upAndDownRate - aroundGreen.upAndDownRate) / 100 * 6 * 0.5,
          recommendation: 'Dedicate practice time to chipping and pitching. Focus on landing spot, not the hole.',
        });
      }

      // Poor distance control
      if (aroundGreen.distanceControlScore < 50) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'around_green',
          headline: 'Distance Control Issues',
          body: `Your distance control score is ${Math.round(aroundGreen.distanceControlScore)}/100. You leave ${Math.round(aroundGreen.shortMissRate)}% short and ${Math.round(aroundGreen.longMissRate)}% long.`,
          evidence: [
            `Short miss rate: ${Math.round(aroundGreen.shortMissRate)}%`,
            `Long miss rate: ${Math.round(aroundGreen.longMissRate)}%`,
            `Distance control score: ${Math.round(aroundGreen.distanceControlScore)}`,
          ],
          severity: 'warning',
          strokeImpact: (100 - aroundGreen.distanceControlScore) / 100 * 0.5,
          recommendation: aroundGreen.shortMissRate > aroundGreen.longMissRate
            ? 'You tend to leave chips short. Commit to your shot and accelerate through impact.'
            : 'You tend to hit chips too hard. Focus on feel and controlling your backswing length.',
        });
      }

      // Sand struggles
      if (aroundGreen.fromSand.shots >= 5 && aroundGreen.fromSand.upAndDownRate < 30) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'around_green',
          headline: 'Sand Save Struggles',
          body: `Your sand save rate is only ${Math.round(aroundGreen.fromSand.upAndDownRate)}% with ${Math.round(aroundGreen.fromSand.avgProximity)} feet average proximity.`,
          evidence: [
            `Sand save rate: ${Math.round(aroundGreen.fromSand.upAndDownRate)}%`,
            `Avg proximity from sand: ${Math.round(aroundGreen.fromSand.avgProximity)} feet`,
            `Sample size: ${aroundGreen.fromSand.shots} shots`,
          ],
          severity: 'critical',
          strokeImpact: (50 - aroundGreen.fromSand.upAndDownRate) / 100 * 3 * 0.7,
          recommendation: 'Prioritize bunker practice. Focus on opening the face and accelerating through the sand.',
        });
      }

      // Rough danger zone
      if (aroundGreen.fromRough.dangerZoneRate && aroundGreen.fromRough.dangerZoneRate > 15) {
        insights.push({
          id: crypto.randomUUID(),
          category: 'around_green',
          headline: 'Chips from Rough Finding Trouble',
          body: `${Math.round(aroundGreen.fromRough.dangerZoneRate)}% of your chips from rough end up in bunkers or penalties.`,
          evidence: [
            `Danger zone rate from rough: ${Math.round(aroundGreen.fromRough.dangerZoneRate)}%`,
            `Up-and-down from rough: ${Math.round(aroundGreen.fromRough.upAndDownRate)}%`,
          ],
          severity: 'warning',
          strokeImpact: (aroundGreen.fromRough.dangerZoneRate ?? 0) / 100 * 4 * 0.8,
          recommendation: 'Be more conservative with chips from rough. Get it on the green first, even if it means a longer putt.',
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // V2: DISPERSION ANALYSIS
  // ============================================================================

  /**
   * Performs complete dispersion analysis across all shot categories
   */
  private analyzeDispersion(): DispersionAnalysis {
    const drivingDispersion = this.calculateDrivingDispersionPattern();
    const approachDispersion = this.calculateApproachDispersionPatterns();
    const aroundGreenDispersion = this.calculateAroundGreenDispersionPattern();

    const overallSeverity = this.calculateOverallSeverity();
    const comparisonToBenchmark = this.generateBenchmarkComparisons(
      drivingDispersion,
      approachDispersion
    );

    const insights = this.generateDispersionInsights(
      drivingDispersion,
      approachDispersion,
      aroundGreenDispersion,
      comparisonToBenchmark
    );

    return {
      drivingDispersion,
      approachDispersion,
      aroundGreenDispersion,
      overallSeverity,
      comparisonToBenchmark,
      insights,
    };
  }

  /**
   * Calculates driving dispersion pattern
   */
  private calculateDrivingDispersionPattern(): DispersionPattern | null {
    const drivingShots = this.shots.filter(
      (s) => s.shot_type === 'tee' && normalizeLie(s.lie_before) === 'tee'
    );

    if (drivingShots.length < MIN_SAMPLE_SIZE) {
      return null;
    }

    return this.calculateDispersionPatternForShots(drivingShots, 'driving');
  }

  /**
   * Calculates approach dispersion patterns by bracket
   */
  private calculateApproachDispersionPatterns(): DispersionPattern[] {
    const patterns: DispersionPattern[] = [];

    for (const bracket of APPROACH_BRACKETS) {
      const bracketShots = this.shots.filter((s) => {
        if (s.shot_type !== 'approach') return false;
        const distance = toYards(s.distance_to_hole_before, s.distance_unit_before);
        if (!distance) return false;
        return distance >= bracket.min && distance < bracket.max;
      });

      if (bracketShots.length < MIN_SAMPLE_SIZE) continue;

      const pattern = this.calculateDispersionPatternForShots(bracketShots, 'approach', bracket);
      if (pattern) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Calculates around the green dispersion pattern
   */
  private calculateAroundGreenDispersionPattern(): DispersionPattern | null {
    const aroundGreenShots = this.shots.filter((s) => s.shot_type === 'around_green');

    if (aroundGreenShots.length < MIN_SAMPLE_SIZE) {
      return null;
    }

    return this.calculateDispersionPatternForShots(aroundGreenShots, 'around_green');
  }

  /**
   * Calculates dispersion pattern for a set of shots
   */
  private calculateDispersionPatternForShots(
    shots: RawShot[],
    category: ShotCategory,
    bracket?: ApproachBracket
  ): DispersionPattern {
    // Calculate distances from target
    const distancesFromTarget = shots
      .filter((s) => s.distance_to_hole_after != null)
      .map((s) => toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0);

    const avgDistanceFromTarget = distancesFromTarget.length > 0
      ? distancesFromTarget.reduce((a, b) => a + b, 0) / distancesFromTarget.length
      : 0;

    const variance = distancesFromTarget.length > 0
      ? distancesFromTarget.reduce((sum, d) => sum + Math.pow(d - avgDistanceFromTarget, 2), 0) / distancesFromTarget.length
      : 0;
    const stdDeviation = Math.sqrt(variance);

    const maxMissDistance = distancesFromTarget.length > 0
      ? Math.max(...distancesFromTarget)
      : 0;

    // Directional dispersion
    const leftMisses = shots.filter((s) =>
      ['left', 'short_left', 'long_left'].includes(normalizeMissDirection(s.miss_direction))
    );
    const rightMisses = shots.filter((s) =>
      ['right', 'short_right', 'long_right'].includes(normalizeMissDirection(s.miss_direction))
    );
    const shortMisses = shots.filter((s) =>
      ['short', 'short_left', 'short_right'].includes(normalizeMissDirection(s.miss_direction))
    );
    const longMisses = shots.filter((s) =>
      ['long', 'long_left', 'long_right'].includes(normalizeMissDirection(s.miss_direction))
    );

    const calcAvgDistance = (missShots: RawShot[]): number => {
      const withDist = missShots.filter((s) => s.distance_to_hole_after != null);
      return withDist.length > 0
        ? withDist.reduce((sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0), 0) / withDist.length
        : 0;
    };

    // Find dominant miss direction
    const missBreakdown = this.calculateMissBreakdown(shots);
    const { primaryMiss, primaryMissFrequency } = this.findPrimaryMiss(missBreakdown);
    const hasConsistentShape = primaryMissFrequency > 40;

    // Danger zone calculation
    const dangerShots = shots.filter(
      (s) => s.result === 'penalty' || s.result === 'sand' || s.result === 'rough'
    );
    const dangerZoneRate = (dangerShots.length / shots.length) * 100;

    const dangerZoneTypes = {
      water: shots.filter((s) => s.penalty_type === 'water').length,
      ob: shots.filter((s) => s.penalty_type === 'ob').length,
      bunker: shots.filter((s) => s.result === 'sand').length,
      deepRough: shots.filter((s) => s.result === 'rough').length,
    };

    return {
      category,
      bracket,
      avgDistanceFromTarget,
      stdDeviation,
      maxMissDistance,
      leftDispersion: calcAvgDistance(leftMisses),
      rightDispersion: calcAvgDistance(rightMisses),
      shortDispersion: calcAvgDistance(shortMisses),
      longDispersion: calcAvgDistance(longMisses),
      hasConsistentShape,
      dominantMissDirection: primaryMiss,
      dominantMissPercentage: primaryMissFrequency,
      dangerZoneHits: dangerShots.length,
      dangerZoneRate,
      dangerZoneTypes,
    };
  }

  /**
   * Calculates overall miss severity breakdown
   */
  private calculateOverallSeverity(): MissSeverityBreakdown {
    let perfect = 0;
    let minor = 0;
    let moderate = 0;
    let severe = 0;
    let disaster = 0;

    for (const shot of this.shots) {
      // Skip putts
      if (shot.shot_type === 'putting') continue;

      if (shot.result === 'green' || shot.result === 'fairway' || shot.result === 'hole') {
        perfect++;
        continue;
      }

      if (shot.result === 'penalty') {
        disaster++;
        continue;
      }

      const missDistance = toYards(shot.distance_to_hole_after, shot.distance_unit_after) ?? 0;

      if (missDistance <= MISS_SEVERITY_THRESHOLDS.minor) {
        minor++;
      } else if (missDistance <= MISS_SEVERITY_THRESHOLDS.moderate) {
        moderate++;
      } else if (missDistance <= MISS_SEVERITY_THRESHOLDS.severe) {
        severe++;
      } else {
        disaster++;
      }
    }

    const total = perfect + minor + moderate + severe + disaster;
    if (total === 0) {
      return { perfect: 0, minor: 0, moderate: 0, severe: 0, disaster: 0 };
    }

    return {
      perfect: (perfect / total) * 100,
      minor: (minor / total) * 100,
      moderate: (moderate / total) * 100,
      severe: (severe / total) * 100,
      disaster: (disaster / total) * 100,
    };
  }

  /**
   * Generates benchmark comparisons
   */
  private generateBenchmarkComparisons(
    driving: DispersionPattern | null,
    approaches: DispersionPattern[]
  ): DispersionAnalysis['comparisonToBenchmark'] {
    const comparisons: DispersionAnalysis['comparisonToBenchmark'] = [];

    // Driving comparison
    if (driving) {
      const benchmark = DISPERSION_BENCHMARKS.driving.dispersionRadius;
      const differential = driving.stdDeviation - benchmark;
      // Percentile: 100 = tightest (better than benchmark), 0 = widest
      const percentile = Math.max(0, Math.min(100, 50 - (differential / benchmark) * 50));

      comparisons.push({
        category: 'driving',
        playerDispersion: driving.stdDeviation,
        benchmarkDispersion: benchmark,
        differential,
        percentileRank: percentile,
      });
    }

    // Approach comparisons by bracket
    for (const approach of approaches) {
      const bracketKey = approach.bracket?.label.includes('50-100') ? '50-100'
        : approach.bracket?.label.includes('100-150') ? '100-150'
        : approach.bracket?.label.includes('150-200') ? '150-200'
        : '200+';

      const benchmarkData = DISPERSION_BENCHMARKS.approach[bracketKey as keyof typeof DISPERSION_BENCHMARKS.approach];
      if (!benchmarkData) continue;

      const differential = approach.stdDeviation - benchmarkData.dispersionRadius;
      const percentile = Math.max(0, Math.min(100, 50 - (differential / benchmarkData.dispersionRadius) * 50));

      comparisons.push({
        category: 'approach',
        bracket: approach.bracket,
        playerDispersion: approach.stdDeviation,
        benchmarkDispersion: benchmarkData.dispersionRadius,
        differential,
        percentileRank: percentile,
      });
    }

    return comparisons;
  }

  /**
   * Generates dispersion-specific insights
   */
  private generateDispersionInsights(
    driving: DispersionPattern | null,
    approaches: DispersionPattern[],
    _aroundGreen: DispersionPattern | null,  // Reserved for future around-green dispersion insights
    benchmarks: DispersionAnalysis['comparisonToBenchmark']
  ): DispersionInsight[] {
    const insights: DispersionInsight[] = [];

    // Find worst performing category vs benchmark
    const worstComparison = [...benchmarks].sort((a, b) => b.differential - a.differential)[0];
    if (worstComparison && worstComparison.differential > 5) {
      const categoryLabel = worstComparison.category === 'approach' && worstComparison.bracket
        ? `approaches from ${worstComparison.bracket.label}`
        : worstComparison.category;

      insights.push({
        id: crypto.randomUUID(),
        category: worstComparison.category,
        bracket: worstComparison.bracket,
        headline: `Widest Dispersion: ${categoryLabel}`,
        body: `Your ${categoryLabel} dispersion is ${Math.round(worstComparison.playerDispersion)} yards vs ${Math.round(worstComparison.benchmarkDispersion)} yard benchmark. This ${Math.round(worstComparison.differential)} yard gap is your biggest opportunity for improvement.`,
        evidence: [
          `Your dispersion: ${Math.round(worstComparison.playerDispersion)} yards`,
          `Benchmark: ${Math.round(worstComparison.benchmarkDispersion)} yards`,
          `Percentile rank: ${Math.round(worstComparison.percentileRank)}th`,
        ],
        strokeImpact: worstComparison.differential / 10 * 0.4,
        recommendation: 'Focus practice on this distance range. Consider taking less club for better control.',
      });
    }

    // Check for asymmetric dispersion (one direction much worse)
    for (const approach of approaches) {
      const leftRight = Math.abs(approach.leftDispersion - approach.rightDispersion);
      const shortLong = Math.abs(approach.shortDispersion - approach.longDispersion);

      if (leftRight > 10) {
        const worseDir = approach.leftDispersion > approach.rightDispersion ? 'left' : 'right';
        insights.push({
          id: crypto.randomUUID(),
          category: 'approach',
          bracket: approach.bracket,
          headline: `Asymmetric Miss Pattern (${approach.bracket?.label})`,
          body: `Your ${worseDir} misses are ${Math.round(leftRight)} yards more severe than ${worseDir === 'left' ? 'right' : 'left'} misses from ${approach.bracket?.label}.`,
          evidence: [
            `Left miss avg: ${Math.round(approach.leftDispersion)} yards`,
            `Right miss avg: ${Math.round(approach.rightDispersion)} yards`,
          ],
          strokeImpact: leftRight / 20 * 0.3,
          recommendation: `Your ${worseDir} miss is more costly. Consider aiming away from trouble on that side.`,
        });
      }

      if (shortLong > 15) {
        const worseDir = approach.shortDispersion > approach.longDispersion ? 'short' : 'long';
        insights.push({
          id: crypto.randomUUID(),
          category: 'approach',
          bracket: approach.bracket,
          headline: `Distance Control Issue (${approach.bracket?.label})`,
          body: `Your ${worseDir} misses are ${Math.round(shortLong)} yards more severe than ${worseDir === 'short' ? 'long' : 'short'} misses from ${approach.bracket?.label}.`,
          evidence: [
            `Short miss avg: ${Math.round(approach.shortDispersion)} yards`,
            `Long miss avg: ${Math.round(approach.longDispersion)} yards`,
          ],
          strokeImpact: shortLong / 20 * 0.3,
          recommendation: worseDir === 'short'
            ? 'You tend to leave it short. Consider taking more club and committing to the swing.'
            : 'You tend to fly greens. Consider taking less club or choking down.',
        });
      }
    }

    // High danger zone rate
    if (driving && driving.dangerZoneRate > 40) {
      insights.push({
        id: crypto.randomUUID(),
        category: 'driving',
        headline: 'High Danger Zone Rate Off Tee',
        body: `${Math.round(driving.dangerZoneRate)}% of your drives end in trouble (rough, sand, or penalty).`,
        evidence: [
          `Danger zone rate: ${Math.round(driving.dangerZoneRate)}%`,
          `Bunkers: ${driving.dangerZoneTypes.bunker}`,
          `OB/Water: ${driving.dangerZoneTypes.ob + driving.dangerZoneTypes.water}`,
        ],
        strokeImpact: driving.dangerZoneRate / 100 * 0.6,
        recommendation: 'Consider a more conservative tee shot. A shorter, straighter shot often leads to better scores.',
      });
    }

    return insights;
  }
}

// ============================================================================
// EXPORTED FUNCTION
// ============================================================================

/**
 * Main entry point for lie-specific miss pattern analysis
 * Can be called from orchestrator or stats-insight-generator
 *
 * @param playerId - The player's UUID
 * @returns Complete lie-specific analysis or null if insufficient data
 */
export async function analyzeLieSpecificMissPatterns(playerId: string): Promise<LieMissAnalysis | null> {
  const analyzer = new LieSpecificAnalyzer(playerId);
  return analyzer.analyzeLieSpecificMissPatterns();
}
