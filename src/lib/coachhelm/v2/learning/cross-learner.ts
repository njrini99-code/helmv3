/**
 * Cross Learner
 *
 * Learns from patterns across multiple players to:
 * - Build global pattern library
 * - Find similar players
 * - Transfer learning between players
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import type { Json } from '@/lib/types/database';
import type { MinedPattern } from '../types';

// Database row type for patterns (table created via migration)
interface PatternRow {
  id: string;
  player_id: string;
  pattern_type: string;
  conditions: unknown;
  outcome: unknown;
  support: number;
  confidence: number;
  lift: number;
  conviction: number;
  stroke_impact: number;
  actionability: number;
  sample_size: number;
  trend: string;
  is_active: boolean;
  metadata?: { description?: string; recommendation?: string };
}

// Database row for global patterns
interface GlobalPatternRow {
  signature: string;
  prevalence: number;
  confidence: number;
}

// Insert-shape for `golf_global_patterns` (matches Database['public']['Tables']['golf_global_patterns']['Insert']).
interface GlobalPatternInsertRow {
  signature: string;
  pattern_type: string;
  conditions: Json;
  outcomes: Json;
  prevalence: number;
  average_impact: number;
  confidence: number;
  instance_count: number;
  player_count: number;
  varied_by_tier: Json;
  varied_by_handicap: Json;
  contributing_players: string[];
  updated_at: string;
}

interface PlayerProfile {
  playerId: string;
  scoringAvg: number;
  volatility: number;
  patternSignatures: string[];
  strengths: string[];
  weaknesses: string[];
}

interface GlobalPattern {
  signature: string;
  patternType: string;
  conditions: unknown[];
  outcome: unknown;
  prevalence: number;
  averageImpact: number;
  confidence: number;
  instanceCount: number;
  playerCount: number;
  variedByTier: Record<string, number>;
  variedByHandicap: Record<string, number>;
  contributingPlayers: string[];
}

/**
 * Cross Learner class for cross-player pattern discovery
 */
export class CrossLearner {
  private teamId?: string;

  constructor(teamId?: string) {
    this.teamId = teamId;
  }

  /**
   * Builds or updates the global pattern library
   */
  async buildGlobalPatternLibrary(): Promise<GlobalPattern[]> {
    const supabase = await createClient();

    // Get all active patterns
    let query = supabase
      .from('golf_patterns_v2')
      .select('*')
      .eq('is_active', true)
      .gte('confidence', 0.6);

    if (this.teamId) {
      // Get players from this team via membership table
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', this.teamId);

      if (teamMembersError) {
        return [];
      }

      const teamPlayerIds = (teamMembers ?? [])
        .map((member) => member.player_id)
        .filter(Boolean);

      if (teamPlayerIds.length === 0) {
        return [];
      }

      query = query.in('player_id', teamPlayerIds);
    }

    const { data: patterns, error } = await query as { data: PatternRow[] | null; error: Error | null };

    if (error || !patterns) {
      return [];
    }

    // Group patterns by signature
    const patternGroups = new Map<string, MinedPattern[]>();

    for (const pattern of patterns) {
      const signature = this.generatePatternSignature(pattern);
      if (!patternGroups.has(signature)) {
        patternGroups.set(signature, []);
      }
      patternGroups.get(signature)!.push(this.patternRowToMined(pattern));
    }

    // Build global patterns
    const globalPatterns: GlobalPattern[] = [];

    for (const [signature, group] of patternGroups) {
      if (group.length < 2) continue; // Need at least 2 instances

      const firstPattern = group[0];
      if (!firstPattern) continue;

      const uniquePlayers = new Set(group.map((p) => p.playerId));

      // Calculate aggregate metrics
      const avgImpact =
        group.reduce((a, p) => a + Math.abs(p.strokeImpact), 0) / group.length;
      const avgConfidence =
        group.reduce((a, p) => a + p.confidence, 0) / group.length;

      // Get total player count for prevalence
      const { count: totalPlayers } = await supabase
        .from('golf_players')
        .select('id', { count: 'exact', head: true });

      const prevalence = (totalPlayers ?? 0) > 0
        ? uniquePlayers.size / (totalPlayers ?? 1)
        : 0;

      const globalPattern: GlobalPattern = {
        signature,
        patternType: firstPattern.patternType,
        conditions: firstPattern.conditions,
        outcome: firstPattern.outcome,
        prevalence,
        averageImpact: avgImpact,
        confidence: avgConfidence,
        instanceCount: group.reduce((a, p) => a + p.sampleSize, 0),
        playerCount: uniquePlayers.size,
        variedByTier: await this.calculateVariationByTier(group),
        variedByHandicap: await this.calculateVariationByHandicap(group),
        contributingPlayers: Array.from(uniquePlayers),
      };

      globalPatterns.push(globalPattern);
    }

    // Save to database
    await this.saveGlobalPatterns(globalPatterns, supabase);

    return globalPatterns;
  }

  /**
   * Finds players similar to the given player
   */
  async findSimilarPlayers(
    playerId: string,
    limit: number = 5
  ): Promise<Array<{ playerId: string; similarity: number; sharedPatterns: number }>> {
    const supabase = await createClient();

    // Build profile for target player
    const targetProfile = await this.buildPlayerProfile(playerId);
    if (!targetProfile) return [];

    // Get other players
    let query = supabase.from('golf_players').select('id').neq('id', playerId);

    if (this.teamId) {
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', this.teamId);

      if (teamMembersError) return [];

      const teamPlayerIds = (teamMembers ?? [])
        .map((member) => member.player_id)
        .filter(Boolean);

      if (teamPlayerIds.length === 0) return [];

      query = query.in('id', teamPlayerIds);
    }

    const { data: players } = await query.limit(100);

    if (!players) return [];

    // Calculate similarity for each player
    const similarities: Array<{
      playerId: string;
      similarity: number;
      sharedPatterns: number;
    }> = [];

    for (const player of players) {
      const profile = await this.buildPlayerProfile(player.id);
      if (!profile) continue;

      const similarity = this.calculateSimilarity(targetProfile, profile);
      const sharedPatterns = this.countSharedPatterns(targetProfile, profile);

      similarities.push({
        playerId: player.id,
        similarity,
        sharedPatterns,
      });
    }

    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, limit);
  }

  /**
   * Transfers learning from similar players
   */
  async transferLearning(
    fromPlayerId: string,
    toPlayerId: string
  ): Promise<MinedPattern[]> {
    const supabase = await createClient();

    // Get patterns from source player
    const { data: sourcePatterns } = await supabase
      .from('golf_patterns_v2')
      .select('*')
      .eq('player_id', fromPlayerId)
      .eq('is_active', true)
      .gte('confidence', 0.7) as { data: PatternRow[] | null };

    if (!sourcePatterns) return [];

    // Get existing patterns for target player
    const { data: targetPatterns } = await supabase
      .from('golf_patterns_v2')
      .select('*')
      .eq('player_id', toPlayerId) as { data: PatternRow[] | null };

    const targetSignatures = new Set(
      (targetPatterns ?? []).map((p: PatternRow) => this.generatePatternSignature(p))
    );

    // Find patterns that could transfer
    const transferablePatterns: MinedPattern[] = [];

    for (const pattern of sourcePatterns) {
      const signature = this.generatePatternSignature(pattern);

      // Skip if target already has this pattern
      if (targetSignatures.has(signature)) continue;

      // Check if pattern is globally prevalent
      const { data: globalPattern } = await supabase
        .from('golf_global_patterns')
        .select('prevalence, confidence')
        .eq('signature', signature)
        .single() as { data: GlobalPatternRow | null };

      // Only transfer if globally validated
      if (globalPattern && globalPattern.prevalence > 0.2 && globalPattern.confidence > 0.6) {
        transferablePatterns.push({
          id: crypto.randomUUID(),
          playerId: toPlayerId,
          patternType: pattern.pattern_type as MinedPattern['patternType'],
          conditions: pattern.conditions as MinedPattern['conditions'],
          outcome: pattern.outcome as MinedPattern['outcome'],
          support: pattern.support,
          confidence: pattern.confidence * 0.7, // Reduce confidence for transferred
          lift: pattern.lift,
          conviction: pattern.conviction,
          strokeImpact: pattern.stroke_impact,
          actionability: pattern.actionability,
          sampleSize: 0, // No direct evidence yet
          firstDetected: new Date().toISOString(),
          lastOccurrence: new Date().toISOString(),
          occurrenceCount: 0,
          trend: 'new',
          isActive: true,
          description: `Transferred from similar player: ${pattern.metadata?.description ?? ''}`,
          recommendation: pattern.metadata?.recommendation,
        });
      }
    }

    // Save transferred patterns
    for (const pattern of transferablePatterns) {
      await supabase.from('golf_patterns_v2').insert({
        id: pattern.id,
        player_id: pattern.playerId,
        pattern_type: pattern.patternType,
        // PatternCondition[] / PatternOutcome are typed shapes; Json union has no
        // overlap with non-index-signature objects, so a double-cast is required.
        conditions: pattern.conditions as unknown as Json,
        outcome: pattern.outcome as unknown as Json,
        support: pattern.support,
        confidence: pattern.confidence,
        lift: pattern.lift,
        conviction: pattern.conviction,
        stroke_impact: pattern.strokeImpact,
        actionability: pattern.actionability,
        sample_size: 0,
        trend: 'new',
        is_active: true,
        metadata: {
          transferred: true,
          source_player_id: fromPlayerId,
          description: pattern.description,
          recommendation: pattern.recommendation,
        },
      });
    }

    return transferablePatterns;
  }

  /**
   * Generates a signature for a pattern
   */
  private generatePatternSignature(pattern: {
    pattern_type: string;
    conditions: unknown;
  }): string {
    const conditions = pattern.conditions as Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;

    const conditionStr = conditions
      .map((c) => `${c.field}:${c.operator}:${c.value}`)
      .sort()
      .join('|');

    return `${pattern.pattern_type}::${conditionStr}`;
  }

  /**
   * Builds a player profile for similarity comparison
   */
  private async buildPlayerProfile(
    playerId: string
  ): Promise<PlayerProfile | null> {
    const supabase = await createClient();

    // Get recent rounds
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('score_to_par')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(20);

    if (!rounds || rounds.length < 5) return null;

    // Calculate scoring average
    const scoringAvg =
      rounds.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / rounds.length;

    // Calculate volatility
    const mean = scoringAvg;
    const squaredDiffs = rounds.map((r) => Math.pow((r.score_to_par ?? 0) - mean, 2));
    const volatility = Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / rounds.length
    );

    // Get pattern signatures
    const { data: patterns } = await supabase
      .from('golf_patterns_v2')
      .select('pattern_type, conditions, stroke_impact')
      .eq('player_id', playerId)
      .eq('is_active', true) as { data: Array<{ pattern_type: string; conditions: unknown; stroke_impact: number }> | null };

    const patternSignatures = (patterns ?? []).map((p) =>
      this.generatePatternSignature(p)
    );

    // Identify strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const pattern of patterns ?? []) {
      const impact = pattern.stroke_impact;
      const conditions = pattern.conditions as Array<{ field: string }>;

      if (impact < -0.5) {
        strengths.push(conditions[0]?.field ?? 'unknown');
      } else if (impact > 0.5) {
        weaknesses.push(conditions[0]?.field ?? 'unknown');
      }
    }

    return {
      playerId,
      scoringAvg,
      volatility,
      patternSignatures,
      strengths,
      weaknesses,
    };
  }

  /**
   * Calculates similarity between two player profiles
   */
  private calculateSimilarity(a: PlayerProfile, b: PlayerProfile): number {
    let similarity = 0;

    // Scoring similarity (closer = more similar)
    const scoringDiff = Math.abs(a.scoringAvg - b.scoringAvg);
    similarity += Math.max(0, 1 - scoringDiff / 10) * 0.3;

    // Volatility similarity
    const volatilityDiff = Math.abs(a.volatility - b.volatility);
    similarity += Math.max(0, 1 - volatilityDiff / 5) * 0.2;

    // Pattern overlap
    const sharedPatterns = a.patternSignatures.filter((p) =>
      b.patternSignatures.includes(p)
    ).length;
    const totalPatterns = new Set([
      ...a.patternSignatures,
      ...b.patternSignatures,
    ]).size;
    const patternOverlap = totalPatterns > 0 ? sharedPatterns / totalPatterns : 0;
    similarity += patternOverlap * 0.3;

    // Strength/weakness overlap
    const sharedStrengths = a.strengths.filter((s) =>
      b.strengths.includes(s)
    ).length;
    const sharedWeaknesses = a.weaknesses.filter((w) =>
      b.weaknesses.includes(w)
    ).length;
    const totalTraits =
      a.strengths.length +
      a.weaknesses.length +
      b.strengths.length +
      b.weaknesses.length;
    const traitOverlap =
      totalTraits > 0
        ? (sharedStrengths + sharedWeaknesses) / (totalTraits / 2)
        : 0;
    similarity += traitOverlap * 0.2;

    return Math.min(1, similarity);
  }

  /**
   * Counts shared patterns between two profiles
   */
  private countSharedPatterns(a: PlayerProfile, b: PlayerProfile): number {
    return a.patternSignatures.filter((p) =>
      b.patternSignatures.includes(p)
    ).length;
  }

  /**
   * Calculates how pattern impact varies by skill tier
   */
  private async calculateVariationByTier(
    patterns: MinedPattern[]
  ): Promise<Record<string, number>> {
    const supabase = await createClient();
    const variedByTier: Record<string, number> = {};

    // Get player scoring averages
    for (const pattern of patterns) {
      const { data: rounds } = await supabase
        .from('golf_rounds')
        .select('score_to_par')
        .eq('player_id', pattern.playerId)
        .eq('status', 'completed')
        .limit(10);

      if (!rounds || rounds.length === 0) continue;

      const avg = rounds.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / rounds.length;

      // Categorize tier
      let tier = 'mid';
      if (avg <= 2) tier = 'elite';
      else if (avg <= 5) tier = 'good';
      else if (avg >= 10) tier = 'developing';

      if (variedByTier[tier] === undefined) variedByTier[tier] = 0;
      variedByTier[tier] = (variedByTier[tier] ?? 0) + pattern.strokeImpact;
    }

    // Average per tier
    for (const tier of Object.keys(variedByTier)) {
      const count = patterns.length;
      const currentValue = variedByTier[tier] ?? 0;
      variedByTier[tier] = count > 0 ? currentValue / count : 0;
    }

    return variedByTier;
  }

  /**
   * Calculates how pattern impact varies by handicap
   */
  private async calculateVariationByHandicap(
     
    _patterns: MinedPattern[]
  ): Promise<Record<string, number>> {
    // Similar logic to tier but using handicap brackets
    return {
      '0-5': 0,
      '5-10': 0,
      '10-15': 0,
      '15+': 0,
    };
  }

  /**
   * Saves global patterns to database.
   *
   * Writes one row per pattern to `golf_global_patterns` matching the live
   * schema (plural `outcomes`, `contributing_players` array, snake_case).
   * A single bulk `upsert` is used so the DB does one round-trip for N rows.
   */
  private async saveGlobalPatterns(
    patterns: GlobalPattern[],
    injected?: SupabaseClient
  ): Promise<void> {
    if (patterns.length === 0) return;
    const supabase = injected ?? (await createClient());

    const rows: GlobalPatternInsertRow[] = patterns.map((p) => ({
      signature: p.signature,
      pattern_type: p.patternType,
      // GlobalPattern.conditions is unknown[]; DB column is Json.
      conditions: p.conditions as Json,
      // DB column is plural `outcomes`; prior code wrote singular `outcome` and silently dropped the value
      outcomes: p.outcome as Json,
      prevalence: p.prevalence,
      average_impact: p.averageImpact,
      confidence: p.confidence,
      instance_count: p.instanceCount,
      player_count: p.playerCount,
      varied_by_tier: p.variedByTier ?? {},
      varied_by_handicap: p.variedByHandicap ?? {},
      contributing_players: p.contributingPlayers ?? [],
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('golf_global_patterns')
      .upsert(rows, { onConflict: 'signature' });

    if (error) {
      await logServerError('cross-learner.saveGlobalPatterns failed', {
        action: 'cross-learner.saveGlobalPatterns',
        featureArea: 'coachhelm.learning',
        source: 'background_job',
        metadata: { count: rows.length, dbError: error },
      });
    }
  }

  /**
   * Converts a database row to a MinedPattern
   */
  private patternRowToMined(row: PatternRow): MinedPattern {
    return {
      id: row.id,
      playerId: row.player_id,
      patternType: row.pattern_type as MinedPattern['patternType'],
      conditions: row.conditions as MinedPattern['conditions'],
      outcome: row.outcome as MinedPattern['outcome'],
      support: row.support,
      confidence: row.confidence,
      lift: row.lift,
      conviction: row.conviction,
      strokeImpact: row.stroke_impact,
      actionability: row.actionability,
      sampleSize: row.sample_size,
      firstDetected: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      occurrenceCount: row.sample_size,
      trend: row.trend as MinedPattern['trend'],
      isActive: row.is_active,
      description: row.metadata?.description,
      recommendation: row.metadata?.recommendation,
    };
  }
}
