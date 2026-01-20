/**
 * Lie-Specific Miss Pattern Analysis
 *
 * Analyzes miss patterns broken down by lie type to identify root causes.
 * This provides granular insights into how different lies affect shot outcomes,
 * enabling targeted coaching recommendations.
 *
 * Key analyses:
 * - Groups shots by lie_before (fairway, rough, sand, tee, green, other)
 * - Calculates miss direction breakdown per lie
 * - Compares patterns across lies to identify root causes
 * - Breaks down by distance range for more specific insights
 *
 * Example insights:
 * - "Miss right 67% from fairway BUT miss left 45% from rough - suggests setup/stance issue"
 * - "From sand, miss short 80% - likely deceleration through impact"
 * - "Rough lies produce 2.3x more penalty shots than fairway"
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

/** Canonical lie types */
export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';

/** Miss direction categories */
export type MissDirection = 'left' | 'right' | 'short' | 'long' | 'short_left' | 'short_right' | 'long_left' | 'long_right' | 'none';

/** Distance range for grouping */
export interface DistanceRange {
  min: number;
  max: number;
  label: string;
}

/** Miss breakdown percentages */
export interface MissBreakdown {
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
  if (lower === 'rough' || lower === 'primary_rough' || lower === 'secondary_rough' || lower === 'deep_rough') return 'rough';
  if (lower === 'sand' || lower === 'bunker' || lower === 'greenside_bunker' || lower === 'fairway_bunker') return 'sand';
  if (lower === 'green' || lower === 'fringe') return 'green';
  return 'other';
}

/**
 * Normalizes miss direction to canonical form
 */
function normalizeMissDirection(dir: string | null): MissDirection {
  if (!dir) return 'none';
  const lower = dir.toLowerCase().replace(/[^a-z]/g, '');

  // Handle compound directions
  if (lower.includes('short') && lower.includes('left')) return 'short_left';
  if (lower.includes('short') && lower.includes('right')) return 'short_right';
  if (lower.includes('long') && lower.includes('left')) return 'long_left';
  if (lower.includes('long') && lower.includes('right')) return 'long_right';

  // Handle simple directions
  if (lower === 'left' || lower === 'l') return 'left';
  if (lower === 'right' || lower === 'r') return 'right';
  if (lower === 'short' || lower === 's') return 'short';
  if (lower === 'long' || lower === 'l') return 'long';

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
export class LieSpecificAnalyzer {
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
      summary,
    };
  }

  /**
   * Loads shot data for the player
   */
  private async loadShots(): Promise<void> {
    const supabase = await createClient();

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
    for (const [miss, count] of missCounts) {
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
