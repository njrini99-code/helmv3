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

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type {
  ShotPattern,
  ShotPatternAnalysis,
  DistanceRange,
  DistanceRangeStats,
  MissTendency,
  DispersionPattern,
} from '../types';

/**
 * Deterministic shot-pattern id from (player_id, situation signature).
 *
 * SUSTAINABILITY (2026-06-07): shot patterns previously used
 * `crypto.randomUUID()` ids, so `upsert(onConflict:'id')` was effectively an
 * INSERT — every analyzeShotPatterns run (nightly roster-sweep + per-round
 * submit) APPENDED a fresh row per situation, silting golf_patterns_v2 into the
 * tens of thousands (29,591 observed before the 2026-06-07 purge). A
 * situation is uniquely `(player, distanceRange.label, lie)`, so a stable id
 * derived from it collapses re-runs to ONE row per situation (a true in-place
 * upsert) — no clean-slate delete needed, no silt, coach lifecycle preserved.
 * Mirrors `deterministicPatternId` in pattern-miner.ts (round-level miner).
 *
 * Format: a SHA-256 of `${playerId}::${signature}` rendered as an RFC-4122
 * UUID so the existing `id uuid` column + `onConflict:'id'` accept it.
 */
export function deterministicShotPatternId(playerId: string, signature: string): string {
  const hash = createHash('sha256').update(`${playerId}::${signature}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5-ish (name-based)
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Stable signature for a shot pattern: the situation that defines it. */
export function shotPatternSignature(distanceLabel: string, lie: string): string {
  return `shot_dispersion::${distanceLabel}::${lie}`;
}

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

/** Bands whose shots are tee shots (remaining-to-hole ≠ target error). */
export function isTeeBand(label: string): boolean {
  return label.startsWith('Driver');
}

/**
 * Retries a Postgres write once or twice on a detected deadlock (40P01),
 * with jittered backoff, so a transient lock collision doesn't bubble up
 * as a hard failure. Mirrors the supersede retry in
 * `pattern-miner.ts`'s `savePatterns` (same table, same failure mode):
 * `golf_patterns_v2` is written concurrently by the coachhelm-safety-net,
 * coachhelm-validation, coachhelm-calibration, and coachhelm-roster-sweep
 * crons AND by this miner's own upsert, so two writers landing in the same
 * instant can deadlock each other. The upsert is idempotent (deterministic
 * row ids via `deterministicShotPatternId`), so re-running it after a
 * deadlock is always safe.
 *
 * Any error other than 40P01 (or the final attempt) is returned as-is —
 * this only absorbs the specific retryable failure mode, never masks a
 * real data/permission error.
 */
export async function upsertWithDeadlockRetry<T>(
  attempt: () => Promise<{ data: T | null; error: { code?: string; message?: string } | null }>,
  retries = 2,
): Promise<{ data: T | null; error: { code?: string; message?: string } | null }> {
  let result: { data: T | null; error: { code?: string; message?: string } | null } = {
    data: null,
    error: null,
  };
  for (let i = 0; i <= retries; i++) {
    if (i > 0) {
      // Jitter decorrelates retries from the concurrent writer we deadlocked
      // with — fixed delays would just re-collide in lock-step.
      const backoff = 200 * i + Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
    result = await attempt();
    if (!result.error || result.error.code !== '40P01') return result;
  }
  return result;
}

export interface DistanceControlInput {
  /** avg distance_to_hole_after in yards. */
  avgProximityYds: number;
  /** band midpoint in yards (approx start distance for approaches). */
  bandMidYds: number;
  isTeeBand: boolean;
}

/**
 * Distance-control score (0-1).
 *
 * TEE shots: `distance_to_hole_after` is remaining-to-hole (e.g. ~150 yds left
 * after a drive), NOT target error — it cannot measure drive distance control,
 * so return a neutral 0.5 and let fairwayHitRate + dispersion carry the signal.
 * The old code referenced proximity to the band MIDPOINT (~360 yds for the
 * 220+ band), which scored every drive 0.2.
 *
 * APPROACH shots: proximity IS the relevant control signal; reference the
 * "good" proximity to ~10% of the band's start distance (unchanged curve).
 */
export function distanceControlScore(input: DistanceControlInput): number {
  if (input.isTeeBand) return 0.5;
  const idealProximity = input.bandMidYds * 0.1;
  if (idealProximity <= 0) return 0.5;
  const ratio = input.avgProximityYds / idealProximity;
  if (ratio <= 1) return 1.0;
  if (ratio <= 2) return 0.8;
  if (ratio <= 3) return 0.6;
  if (ratio <= 4) return 0.4;
  return 0.2;
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
   *
   * @param options.persistPatterns - Whether to upsert the mined patterns
   *   into `golf_patterns_v2` as a side effect (default `true`, matching
   *   the pre-existing behavior for crons and post-round triggers). Pass
   *   `false` for read-only callers (e.g. a dashboard page load) so
   *   analysis never has a write on its critical path — see the
   *   `persistPatterns` doc on `AnalysisOptions` in `../types.ts`.
   */
  async analyzeShotPatterns(
    options: { persistPatterns?: boolean } = {},
  ): Promise<ShotPatternAnalysis | null> {
    const { persistPatterns = true } = options;
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

    // Save patterns to database — skipped entirely for read-only callers
    // (persistPatterns: false) so a dashboard page load never has a write
    // on its critical path.
    if (persistPatterns) {
      await this.savePatterns(patterns);
    }

    return analysis;
  }

  /**
   * Loads shot data for the player.
   *
   * LIVE-29: previously used the user-scoped `createClient()`. The miner runs
   * from non-interactive contexts (post-round `keepalive` fetch, safety-net
   * cron, nightly roster sweep) where there is no auth cookie, so RLS on
   * `golf_rounds` / `golf_shots` returned an empty set and `golf_patterns_v2`
   * stopped receiving rows after 2026-04-14. Switched to the admin client to
   * mirror `getDetailedStatsAsAdmin` — the orchestrator's caller already
   * authorized this player by other means before invoking analyzePlayer.
   */
  private async loadShots(): Promise<void> {
    const supabase = createAdminClient();

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

    // Get all shots from those rounds. Project only the columns the miner
    // actually consumes (was `select('*')`). Keep this list in sync with the
    // `RawShot` interface above — under-projecting will silently drop fields.
    const { data: shots, error } = await fetchAllRowsResult((from, to) => supabase
      .from('golf_shots')
      .select('id,round_id,hole_number,shot_number,shot_type,club_type,lie_before,distance_to_hole_before,distance_unit_before,distance_to_hole_after,distance_unit_after,miss_direction,shot_distance,result')
      .in('round_id', roundIds)
      .order('round_id')
      .order('hole_number')
      .order('shot_number')
      .order('id', { ascending: true })
      .range(from, to)); // paginate past PostgREST 1000-row cap

    if (error || !shots) {
      return;
    }

    this.shots = shots as unknown as RawShot[];
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
      const distControlScore = this.calculateDistanceControl(stats);

      // Generate insight and recommendation
      const { insight, recommendation } = this.generateInsight(
        stats.range,
        tendencies,
        dispersionPattern
      );

      const pattern: ShotPattern = {
        id: deterministicShotPatternId(
          this.playerId,
          shotPatternSignature(stats.range.label, 'all'),
        ),
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
        distanceControlScore: distControlScore,
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
            id: deterministicShotPatternId(
              this.playerId,
              shotPatternSignature(stats.range.label, lie),
            ),
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
    return distanceControlScore({
      avgProximityYds: stats.avgProximity,
      bandMidYds: (stats.range.max + stats.range.min) / 2,
      isTeeBand: isTeeBand(stats.range.label),
    });
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
   * Derives a shot-level stroke-impact estimate from existing pattern
   * fields. There is no per-shot strokes-gained ground truth here, so we
   * synthesize a proxy from three signals already on `ShotPattern`:
   *
   *   - `distanceControlGap` (1 - distanceControlScore): how far the
   *     player's average proximity is from the "ideal" proximity for this
   *     distance range. 0 means perfect, 1 means very poor.
   *   - `topMissFreq` (tendencies[0].frequency): how concentrated the
   *     primary miss direction is. A 70% one-way miss is more actionable
   *     than a 25% scatter.
   *   - `confidence` (already scales 0.5 low-sample → 0.95 high-sample):
   *     used as a multiplier so noisy small-sample patterns don't get
   *     promoted purely because they look extreme.
   *
   * The 1.5 multiplier is calibrated against the round-level miner's
   * |stroke_impact| range (its surviving patterns sit at 0.50–0.93). With
   * this formula a pattern at distanceControlScore=0.2, topMissFreq=0.6,
   * confidence=0.85 lands at -0.61 strokes — comparable magnitude. The
   * sign is negative because miss-tendency patterns hurt the player; if
   * a future positive-pattern type is added, flip the sign there.
   *
   * Patterns with magnitude below 0.1 are dropped at insert (matches
   * `pattern-miner.ts`'s minStrokeImpact convention; lower than its 0.3
   * because shot-level signals are noisier).
   */
  private computeShotStrokeImpact(pattern: ShotPattern): number {
    const distanceControlGap = Math.max(0, Math.min(1, 1 - pattern.distanceControlScore));
    const topMissFreq = Math.max(0, Math.min(1, pattern.tendencies[0]?.frequency ?? 0));
    const confidence = Math.max(0, Math.min(1, pattern.confidence));
    const magnitude = distanceControlGap * topMissFreq * 1.5 * confidence;
    return -Math.round(magnitude * 100) / 100;
  }

  /**
   * Saves patterns to database. Skips patterns whose derived stroke
   * impact magnitude is below `MIN_STROKE_IMPACT` (0.1) — that is the
   * mechanism that keeps `golf_patterns_v2` from silting up with the
   * tens of thousands of weak-signal rows it accumulated before this
   * gate (22,113 / 22,117 = 99.95% of rows were zero-impact prior to
   * the 2026-04-27 cleanup).
   */
  private async savePatterns(patterns: ShotPattern[]): Promise<void> {
    if (patterns.length === 0) return;

    const supabase = createAdminClient();

    // Store in golf_patterns_v2 with shot-level flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_patterns_v2' as any) as any;

    /**
     * Minimum |stroke_impact| required to persist a pattern. Lower than
     * the round-level miner's 0.3 because shot-level signals are noisier
     * and we want a permissive floor — but a hard 0 is never useful.
     */
    const MIN_STROKE_IMPACT = 0.1;

    // Build all rows up front, then batch-upsert in one round-trip instead of
    // O(N) sequential calls. `golf_patterns_v2` has only `id` unique. As of
    // 2026-06-07 `pattern.id` is DETERMINISTIC per (player, distanceRange, lie)
    // via deterministicShotPatternId(), so `onConflict: 'id'` is a true in-place
    // upsert — re-runs (nightly sweep, per-round submit) collapse to ONE row per
    // situation instead of appending fresh random-uuid rows every run (the cause
    // of the prior 29k-row silt). No clean-slate delete needed.
    const rows = patterns
      .map((pattern) => {
        const strokeImpact = this.computeShotStrokeImpact(pattern);
        if (Math.abs(strokeImpact) < MIN_STROKE_IMPACT) return null;

        return {
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
          stroke_impact: strokeImpact,
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
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) return;

    // SORTED BY THE CONFLICT KEY, AND THAT IS THE POINT — not tidiness.
    //
    // `INSERT … ON CONFLICT DO UPDATE` takes its row locks in the order the
    // values appear in the statement. Until this sort, that order was pattern-
    // DETECTION order, which differs per caller: the player dashboard, the
    // safety-net cron, the validation cron and the calibration cron each mine a
    // different window of the same player's shots, so they emit an overlapping
    // set of deterministic ids in different sequences. Two of them landing
    // together locked the shared rows in opposite orders — a lock cycle, which
    // Postgres resolves by killing one with 40P01. That surfaced as
    // `getPlayerCoachHelmDashboard failed: Failed to save CoachHelm shot
    // patterns: deadlock detected` (n=3, 2026-06-29 → 07-22): a coach opened
    // the dashboard and CoachHelm returned an error because a cron happened to
    // be writing at that moment.
    //
    // Measured on a local Postgres with two writers over the same 40 ids
    // (tmp-deadlock-repro): opposing orders deadlocked 7 of 16 statements;
    // sorted, 0 of 16. A shared, total lock order means concurrent writers
    // QUEUE instead of cycling, so there is nothing left to retry.
    //
    // `upsertWithDeadlockRetry` stays as the belt to this braces: it also
    // covers collisions with the supersede UPDATE in pattern-miner.ts, whose
    // lock order comes from its index scan rather than from a row list.
    const orderedRows = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const { error } = await upsertWithDeadlockRetry(() =>
      table.upsert(orderedRows, { onConflict: 'id' }),
    );

    if (error) {
      throw new Error(`Failed to save CoachHelm shot patterns: ${error.message}`);
    }
  }
}
