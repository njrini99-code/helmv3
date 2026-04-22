/**
 * Shot Pattern Miner
 *
 * Analyzes shot-level data to discover patterns including:
 * - Miss direction tendencies by distance range
 * - Dispersion patterns (tight, scattered, one-way)
 * - Club/lie specific patterns
 * - Distance control analysis
 *
 * Example insight: "From 140-160 yards, you miss long_right 67% of the time"
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type {
  ShotPattern,
  ShotPatternAnalysis,
  DistanceRange,
  DistanceRangeStats,
  MissTendency,
  DispersionPattern,
} from '../types';

/**
 * Pattern actionability score derived from the strongest tendency's frequency.
 *
 * Fixes operator-precedence bug (LIVE-14): the prior inline expression
 *   `pattern.tendencies[0]?.frequency ?? 0 > 0.5 ? 0.9 : 0.6`
 * parses as `freq ?? ((0 > 0.5) ? 0.9 : 0.6)`, which means when frequency is
 * defined the `?? 0.6` branch is never reached, so every defined frequency —
 * regardless of magnitude — returned itself as a number rather than 0.9.
 * When frequency was undefined it short-circuited to `0.6`. Net effect:
 * `actionability` was effectively `frequency ?? 0.6`, never `0.9` or `0.6`.
 *
 * Correct behavior: strong tendency (>0.5) gets 0.9, otherwise 0.6.
 */
export function computeActionability(
  tendencies: Array<Pick<MissTendency, 'frequency'>>,
): number {
  const freq = tendencies[0]?.frequency ?? 0;
  return freq > 0.5 ? 0.9 : 0.6;
}

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

/** Minimum shots needed to form a valid pattern */
const MIN_SAMPLE_SIZE = 5;

/** Minimum frequency for a miss direction to be considered a "tendency" */
const MIN_TENDENCY_FREQUENCY = 0.25;

function toYards(distance: number | null, unit: string | null): number | null {
  if (distance == null) return null;
  return unit === 'feet' ? distance / 3 : distance;
}

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

/**
 * Shot Pattern Miner class for analyzing shot-level data
 */
export class ShotPatternMiner {
  private playerId: string;
  private shots: RawShot[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Main entry point - analyzes all shots and returns patterns
   */
  async analyzeShotPatterns(): Promise<ShotPatternAnalysis | null> {
    await this.loadShots();

    if (this.shots.length < MIN_SAMPLE_SIZE * 3) {
      return null;
    }

    // Analyze by distance ranges
    const rangeStats = this.analyzeByDistanceRange();

    // Mine patterns from the data
    const patterns = this.minePatterns(rangeStats);

    // Identify critical patterns (highest impact)
    const criticalPatterns = this.identifyCriticalPatterns(patterns);

    // Determine overall tendencies
    const { overallDispersion, primaryWeakness, primaryStrength } =
      this.summarizeOverall(patterns, rangeStats);

    const analysis: ShotPatternAnalysis = {
      playerId: this.playerId,
      analyzedAt: new Date().toISOString(),
      patterns,
      rangeStats,
      criticalPatterns,
      overallDispersion,
      primaryWeakness,
      primaryStrength,
    };

    // Save patterns to database
    await this.savePatterns(patterns);

    return analysis;
  }

  /**
   * Loads shot data for the player
   */
  private async loadShots(): Promise<void> {
    const supabase = await createClient();

    // Get all rounds for this player
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', this.playerId)
      .eq('status', 'completed');

    if (!rounds || rounds.length === 0) {
      return;
    }

    const roundIds = rounds.map((r) => r.id);

    // Get all shots from those rounds
    const { data: shots, error } = await supabase
      .from('golf_shots')
      .select('*')
      .in('round_id', roundIds)
      .order('round_id')
      .order('hole_number')
      .order('shot_number');

    if (error || !shots) {
      return;
    }

    this.shots = shots as RawShot[];
  }

  /**
   * Analyzes shots grouped by distance range
   */
  private analyzeByDistanceRange(): DistanceRangeStats[] {
    const stats: DistanceRangeStats[] = [];

    for (const range of DISTANCE_RANGES) {
      // Filter shots in this distance range (excluding putts)
      const rangeShots = this.shots.filter((shot) => {
        const distance = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
        if (!distance || shot.shot_type === 'putt' || shot.shot_type === 'putting') return false;
        return distance >= range.min && distance < range.max;
      });

      if (rangeShots.length < MIN_SAMPLE_SIZE) continue;

      // Calculate miss direction breakdown
      const missBreakdown = this.calculateMissBreakdown(rangeShots);

      // Calculate average proximity (distance after shot)
      const validProximityShots = rangeShots.filter(
        (s) => s.distance_to_hole_after != null
      );
      const avgProximity =
        validProximityShots.length > 0
          ? validProximityShots.reduce(
              (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0),
              0
            ) / validProximityShots.length
          : 0;

      // Calculate green hit rate (for approaches - shots that end on green)
      const greenShots = rangeShots.filter(
        (s) => s.result === 'green' || s.result === 'hole'
      );
      const greenHitRate = rangeShots.length > 0
        ? greenShots.length / rangeShots.length
        : 0;

      // Calculate fairway hit rate (for drives)
      const driveShots = rangeShots.filter(
        (s) => s.shot_type === 'drive' || s.shot_type === 'tee'
      );
      const fairwayHits = driveShots.filter(
        (s) => s.result === 'fairway' || s.result === 'green'
      );
      const fairwayHitRate =
        driveShots.length > 0 ? fairwayHits.length / driveShots.length : 0;

      // Calculate average miss distance
      const missShots = rangeShots.filter(
        (s) => s.miss_direction && s.distance_to_hole_after
      );
      const avgMissDistance =
        missShots.length > 0
          ? missShots.reduce(
              (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0),
              0
            ) / missShots.length
          : 0;

      // Analyze by lie
      const byLie = this.analyzeByLie(rangeShots);

      stats.push({
        range,
        totalShots: rangeShots.length,
        avgProximity,
        greenHitRate,
        fairwayHitRate,
        missDirectionBreakdown: missBreakdown,
        avgMissDistance,
        byLie,
      });
    }

    return stats;
  }

  /**
   * Calculates miss direction breakdown
   */
  private calculateMissBreakdown(shots: RawShot[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    const shotsWithMiss = shots.filter((s) => s.miss_direction);

    for (const shot of shotsWithMiss) {
      const dir = shot.miss_direction!.toLowerCase();
      breakdown[dir] = (breakdown[dir] ?? 0) + 1;
    }

    // Convert to percentages
    const total = shotsWithMiss.length;
    if (total > 0) {
      for (const key of Object.keys(breakdown)) {
        breakdown[key] = breakdown[key]! / total;
      }
    }

    return breakdown;
  }

  /**
   * Analyzes shots by lie type
   */
  private analyzeByLie(
    shots: RawShot[]
  ): Record<
    string,
    { shots: number; avgProximity: number; missBreakdown: Record<string, number> }
  > {
    const byLie: Record<
      string,
      { shots: number; avgProximity: number; missBreakdown: Record<string, number> }
    > = {};

    const lieGroups = new Map<string, RawShot[]>();

    for (const shot of shots) {
      const lie = shot.lie_before ?? 'unknown';
      if (!lieGroups.has(lie)) {
        lieGroups.set(lie, []);
      }
      lieGroups.get(lie)!.push(shot);
    }

    for (const [lie, lieShots] of lieGroups) {
      if (lieShots.length < 3) continue;

      const validProximityShots = lieShots.filter(
        (s) => s.distance_to_hole_after != null
      );
      const avgProximity =
        validProximityShots.length > 0
          ? validProximityShots.reduce(
              (sum, s) => sum + (toYards(s.distance_to_hole_after, s.distance_unit_after) ?? 0),
              0
            ) / validProximityShots.length
          : 0;

      byLie[lie] = {
        shots: lieShots.length,
        avgProximity,
        missBreakdown: this.calculateMissBreakdown(lieShots),
      };
    }

    return byLie;
  }

  /**
   * Mines patterns from the distance range stats
   */
  private minePatterns(rangeStats: DistanceRangeStats[]): ShotPattern[] {
    const patterns: ShotPattern[] = [];

    for (const stats of rangeStats) {
      // Skip ranges with too few shots
      if (stats.totalShots < MIN_SAMPLE_SIZE) continue;

      // Analyze tendencies for this range
      const tendencies = this.analyzeTendencies(stats.missDirectionBreakdown);

      if (tendencies.length === 0) continue;

      // Determine dispersion pattern
      const dispersionPattern = this.determineDispersion(
        stats.missDirectionBreakdown
      );

      // Calculate distance control score
      const distanceControlScore = this.calculateDistanceControl(stats);

      // Generate insight and recommendation
      const { insight, recommendation } = this.generateInsight(
        stats.range,
        tendencies,
        dispersionPattern
      );

      const pattern: ShotPattern = {
        id: crypto.randomUUID(),
        playerId: this.playerId,
        situation: {
          distanceRange: stats.range,
          lie: 'all', // General pattern for all lies
        },
        tendencies,
        primaryMiss: tendencies[0]?.direction ?? 'none',
        dispersionPattern,
        avgDistanceError: stats.avgMissDistance,
        avgProximity: stats.avgProximity,
        distanceControlScore,
        sampleSize: stats.totalShots,
        confidence: this.calculateConfidence(stats.totalShots),
        insight,
        recommendation,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      patterns.push(pattern);

      // Also create patterns for specific lies if they show different tendencies
      for (const [lie, lieData] of Object.entries(stats.byLie)) {
        if (lieData.shots < MIN_SAMPLE_SIZE) continue;

        const lieTendencies = this.analyzeTendencies(lieData.missBreakdown);

        // Only create a separate pattern if tendencies differ from overall
        if (this.tendenciesDiffer(tendencies, lieTendencies)) {
          const lieDispersion = this.determineDispersion(lieData.missBreakdown);
          const { insight: lieInsight, recommendation: lieRec } =
            this.generateInsight(stats.range, lieTendencies, lieDispersion, lie);

          patterns.push({
            id: crypto.randomUUID(),
            playerId: this.playerId,
            situation: {
              distanceRange: stats.range,
              lie,
            },
            tendencies: lieTendencies,
            primaryMiss: lieTendencies[0]?.direction ?? 'none',
            dispersionPattern: lieDispersion,
            avgDistanceError: 0, // Would need more detailed tracking
            avgProximity: lieData.avgProximity,
            distanceControlScore: 0.5, // Default for lie-specific
            sampleSize: lieData.shots,
            confidence: this.calculateConfidence(lieData.shots),
            insight: lieInsight,
            recommendation: lieRec,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Analyzes miss direction tendencies
   */
  private analyzeTendencies(
    breakdown: Record<string, number>
  ): MissTendency[] {
    const tendencies: MissTendency[] = [];

    for (const [direction, frequency] of Object.entries(breakdown)) {
      if (frequency >= MIN_TENDENCY_FREQUENCY) {
        tendencies.push({
          direction,
          frequency,
          avgDistance: 0, // Would need shot-level tracking
          consistency: frequency > 0.5 ? 0.9 : frequency > 0.3 ? 0.7 : 0.5,
        });
      }
    }

    // Sort by frequency (highest first)
    return tendencies.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Determines the overall dispersion pattern
   */
  private determineDispersion(
    breakdown: Record<string, number>
  ): DispersionPattern {
    const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) return 'tight';

    const [topDir, topFreq] = entries[0] ?? ['', 0];

    // If one direction dominates (>35%), it's a one-way miss tendency
    // Lower threshold than before (was 50%) to catch actionable tendencies
    if (topFreq > 0.35) {
      if (topDir.includes('left')) return 'one_way_left';
      if (topDir.includes('right')) return 'one_way_right';
      if (topDir === 'short') return 'one_way_short';
      if (topDir === 'long') return 'one_way_long';
    }

    // If misses are spread across many directions evenly, it's scattered
    if (entries.length >= 4 && topFreq < 0.25) {
      return 'scattered';
    }

    return 'tight';
  }

  /**
   * Calculates distance control score
   */
  private calculateDistanceControl(stats: DistanceRangeStats): number {
    // Score based on how much distance is left after the shot relative to target
    const targetRange = (stats.range.max + stats.range.min) / 2;

    // Ideal proximity for different ranges
    const idealProximity = targetRange * 0.1; // 10% of distance is good

    if (stats.avgProximity <= idealProximity) return 1.0;
    if (stats.avgProximity <= idealProximity * 2) return 0.8;
    if (stats.avgProximity <= idealProximity * 3) return 0.6;
    if (stats.avgProximity <= idealProximity * 4) return 0.4;

    return 0.2;
  }

  /**
   * Calculates confidence based on sample size
   */
  private calculateConfidence(sampleSize: number): number {
    // More shots = higher confidence
    if (sampleSize >= 50) return 0.95;
    if (sampleSize >= 30) return 0.85;
    if (sampleSize >= 20) return 0.75;
    if (sampleSize >= 10) return 0.65;
    return 0.5;
  }

  /**
   * Generates human-readable insight and recommendation
   */
  private generateInsight(
    range: DistanceRange,
    tendencies: MissTendency[],
    dispersion: DispersionPattern,
    lie?: string
  ): { insight: string; recommendation: string } {
    const topTendency = tendencies[0];
    const rangeLabel = range.label;
    const lieText = lie && lie !== 'all' ? ` from the ${lie}` : '';

    let insight: string;
    let recommendation: string;

    if (!topTendency) {
      insight = `From ${rangeLabel}${lieText}, your misses are well distributed.`;
      recommendation = 'Maintain current approach and focus on distance control.';
      return { insight, recommendation };
    }

    const pct = Math.round(topTendency.frequency * 100);
    const dir = this.formatDirection(topTendency.direction);

    insight = `From ${rangeLabel}${lieText}, you miss ${dir} ${pct}% of the time.`;

    // Generate recommendation based on dispersion pattern
    switch (dispersion) {
      case 'one_way_right':
        recommendation =
          'Consider aiming slightly left to compensate for your right miss tendency.';
        break;
      case 'one_way_left':
        recommendation =
          'Consider aiming slightly right to compensate for your left miss tendency.';
        break;
      case 'one_way_short':
        recommendation =
          'You tend to leave shots short. Consider taking one more club or committing to a fuller swing.';
        break;
      case 'one_way_long':
        recommendation =
          'You tend to fly shots long. Consider taking one less club or playing for more spin.';
        break;
      case 'scattered':
        recommendation =
          'Focus on a consistent swing path and face angle at impact to tighten your dispersion.';
        break;
      default:
        recommendation =
          'Your dispersion is tight. Focus on course management to play to your strengths.';
    }

    return { insight, recommendation };
  }

  /**
   * Formats miss direction for display
   */
  private formatDirection(direction: string): string {
    const mapping: Record<string, string> = {
      short: 'short',
      long: 'long',
      left: 'left',
      right: 'right',
      short_left: 'short-left',
      short_right: 'short-right',
      long_left: 'long-left',
      long_right: 'long-right',
    };

    return mapping[direction.toLowerCase()] ?? direction;
  }

  /**
   * Checks if two tendency arrays significantly differ
   */
  private tendenciesDiffer(
    a: MissTendency[],
    b: MissTendency[]
  ): boolean {
    if (a.length === 0 && b.length === 0) return false;
    if (a.length === 0 || b.length === 0) return true;

    // Compare primary miss direction
    if (a[0]?.direction !== b[0]?.direction) return true;

    // Compare frequencies (if >15% difference, consider different)
    const freqDiff = Math.abs((a[0]?.frequency ?? 0) - (b[0]?.frequency ?? 0));
    return freqDiff > 0.15;
  }

  /**
   * Identifies the most critical patterns
   */
  private identifyCriticalPatterns(patterns: ShotPattern[]): ShotPattern[] {
    // Sort by impact (high frequency + low distance control = high impact)
    return patterns
      .filter((p) => p.tendencies.length > 0 && p.tendencies[0]!.frequency > 0.4)
      .sort((a, b) => {
        const aImpact =
          (a.tendencies[0]?.frequency ?? 0) * (1 - a.distanceControlScore);
        const bImpact =
          (b.tendencies[0]?.frequency ?? 0) * (1 - b.distanceControlScore);
        return bImpact - aImpact;
      })
      .slice(0, 3);
  }

  /**
   * Summarizes overall tendencies
   */
  private summarizeOverall(
    patterns: ShotPattern[],
     
    _rangeStats: DistanceRangeStats[]
  ): {
    overallDispersion: DispersionPattern;
    primaryWeakness: string;
    primaryStrength: string;
  } {
    // Aggregate all miss directions
    const allMisses: Record<string, number> = {};
    let totalShots = 0;

    for (const pattern of patterns) {
      for (const tendency of pattern.tendencies) {
        const weight = pattern.sampleSize * tendency.frequency;
        allMisses[tendency.direction] =
          (allMisses[tendency.direction] ?? 0) + weight;
        totalShots += pattern.sampleSize * tendency.frequency;
      }
    }

    // Normalize
    if (totalShots > 0) {
      for (const key of Object.keys(allMisses)) {
        allMisses[key] = allMisses[key]! / totalShots;
      }
    }

    const overallDispersion = this.determineDispersion(allMisses);

    // Find worst range (lowest distance control)
    const worstPattern = patterns
      .filter((p) => p.situation.lie === 'all')
      .sort((a, b) => a.distanceControlScore - b.distanceControlScore)[0];

    // Find best range (highest distance control)
    const bestPattern = patterns
      .filter((p) => p.situation.lie === 'all')
      .sort((a, b) => b.distanceControlScore - a.distanceControlScore)[0];

    return {
      overallDispersion,
      primaryWeakness: worstPattern
        ? `${worstPattern.situation.distanceRange.label} approaches`
        : 'No significant weaknesses detected',
      primaryStrength: bestPattern
        ? `${bestPattern.situation.distanceRange.label} approaches`
        : 'No significant strengths detected',
    };
  }

  /**
   * Saves patterns to database
   */
  private async savePatterns(patterns: ShotPattern[]): Promise<void> {
    if (patterns.length === 0) return;

    const supabase = createAdminClient();

    // Store in golf_patterns_v2 with shot-level flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_patterns_v2' as any) as any;

    for (const pattern of patterns) {
      const { error } = await table.upsert(
        {
          id: pattern.id,
          player_id: pattern.playerId,
          pattern_type: 'contextual',
          conditions: [
            {
              field: 'distance_range',
              operator: 'between',
              value: [
                pattern.situation.distanceRange.min,
                pattern.situation.distanceRange.max,
              ],
              label: pattern.situation.distanceRange.label,
            },
            {
              field: 'lie',
              operator: 'eq',
              value: pattern.situation.lie,
            },
          ],
          outcome: {
            metric: 'miss_direction',
            direction: 'specific',
            magnitude: pattern.tendencies[0]?.frequency ?? 0,
          },
          support: pattern.tendencies[0]?.frequency ?? 0,
          confidence: pattern.confidence,
          lift: 1, // Not applicable for shot patterns
          conviction: 1,
          stroke_impact: 0, // Calculated differently for shots
          actionability: computeActionability(pattern.tendencies),
          sample_size: pattern.sampleSize,
          first_detected: pattern.createdAt,
          last_occurrence: pattern.updatedAt,
          occurrence_count: pattern.sampleSize,
          trend: 'new',
          is_active: true,
          metadata: {
            pattern_subtype: 'shot_dispersion',
            situation: pattern.situation,
            tendencies: pattern.tendencies,
            dispersionPattern: pattern.dispersionPattern,
            avgProximity: pattern.avgProximity,
            distanceControlScore: pattern.distanceControlScore,
            insight: pattern.insight,
            recommendation: pattern.recommendation,
          },
        },
        { onConflict: 'id' }
      );

      if (error) {
        throw new Error(`Failed to save CoachHelm shot pattern: ${error.message}`);
      }
    }
  }
}
