/**
 * Shot State Intelligence
 *
 * Builds a par-aware, lie-aware, and yardage-aware model from shot tracking
 * using both distance-to-hole before and after the shot.
 *
 * This layer focuses on hidden scoring edges coaches often miss:
 * - exact shot states that underperform baseline
 * - danger-side miss sectors within the same yardage window
 * - lie penalties by identical yardage windows
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';

type CanonicalShotType = 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
type ShotRole =
  | 'par3_tee'
  | 'drive'
  | 'long_approach'
  | 'approach'
  | 'wedge_approach'
  | 'greenside'
  | 'putting'
  | 'penalty';

type CanonicalLie = 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'penalty' | 'other';
type MissSector =
  | 'hole'
  | 'green'
  | 'fairway'
  | 'rough'
  | 'sand'
  | 'penalty'
  | 'left'
  | 'right'
  | 'short'
  | 'long'
  | 'short_left'
  | 'short_right'
  | 'long_left'
  | 'long_right'
  | 'other';

interface CompletedRound {
  id: string;
  player_id: string;
}

interface RawShotRow {
  round_id: string;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  is_penalty: boolean | null;
  miss_direction: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  putt_made: boolean | null;
}

interface HoleRow {
  round_id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
}

interface DistanceBucket {
  min: number;
  max: number;
  label: string;
}

interface EnrichedShotState {
  playerId: string;
  roundId: string;
  par: number;
  shotType: CanonicalShotType;
  shotRole: ShotRole;
  lieBefore: CanonicalLie;
  lieAfter: CanonicalLie;
  result: string;
  beforeYards: number;
  afterYards: number;
  progressYards: number;
  beforeBucket: string;
  afterBucket: string;
  missSector: MissSector;
  remainingAfter: number;
  isPenalty: boolean;
}

interface AggregateAccumulator {
  sampleSize: number;
  rounds: Set<string>;
  totalAfterYards: number;
  totalProgressYards: number;
  totalRemainingAfter: number;
  penaltyCount: number;
  greenCount: number;
  playableCount: number;
}

export interface ShotStateAggregate {
  sampleSize: number;
  roundsCovered: number;
  avgAfterYards: number;
  avgProgressYards: number;
  avgRemainingAfter: number;
  penaltyRate: number;
  greenRate: number;
  playableRate: number;
}

export interface ShotStateInsight {
  id: string;
  type: 'state_leak' | 'danger_side' | 'lie_penalty';
  headline: string;
  body: string;
  recommendation: string;
  evidence: string[];
  confidence: number;
  strokeImpact: number;
}

export interface ShotStateAnalysis {
  playerId: string;
  analyzedAt: string;
  playerRounds: number;
  playerContexts: Array<{
    label: string;
    sampleSize: number;
    avgAfterYards: number;
    avgProgressYards: number;
    avgRemainingAfter: number;
    penaltyRate: number;
  }>;
  insights: ShotStateInsight[];
}

const BEFORE_BUCKETS: DistanceBucket[] = [
  { min: 0, max: 20, label: '0-20y' },
  { min: 20, max: 50, label: '20-50y' },
  { min: 50, max: 75, label: '50-75y' },
  { min: 75, max: 100, label: '75-100y' },
  { min: 100, max: 130, label: '100-130y' },
  { min: 130, max: 160, label: '130-160y' },
  { min: 160, max: 190, label: '160-190y' },
  { min: 190, max: 220, label: '190-220y' },
  { min: 220, max: 600, label: '220y+' },
];

const AFTER_BUCKETS: DistanceBucket[] = [
  { min: 0, max: 3, label: '0-3y' },
  { min: 3, max: 8, label: '3-8y' },
  { min: 8, max: 15, label: '8-15y' },
  { min: 15, max: 30, label: '15-30y' },
  { min: 30, max: 60, label: '30-60y' },
  { min: 60, max: 120, label: '60-120y' },
  { min: 120, max: 600, label: '120y+' },
];

const MIN_PLAYER_CONTEXT_SAMPLE = 5;
const MIN_GLOBAL_CONTEXT_SAMPLE = 12;
const MIN_MISS_SECTOR_SAMPLE = 3;
const MIN_LIE_COMPARISON_SAMPLE = 4;

function toYards(distance: number | null, unit: string | null): number | null {
  if (distance == null) return null;
  return unit === 'feet' ? distance / 3 : distance;
}

function canonicalizeShotType(shotType: string | null): CanonicalShotType | null {
  switch ((shotType ?? '').toLowerCase()) {
    case 'tee':
      return 'tee';
    case 'approach':
      return 'approach';
    case 'around_green':
      return 'around_green';
    case 'putting':
    case 'putt':
      return 'putting';
    case 'penalty':
      return 'penalty';
    default:
      return null;
  }
}

function canonicalizeLie(lie: string | null): CanonicalLie {
  switch ((lie ?? '').toLowerCase()) {
    case 'tee':
      return 'tee';
    case 'fairway':
      return 'fairway';
    case 'rough':
      return 'rough';
    case 'sand':
      return 'sand';
    case 'green':
      return 'green';
    case 'penalty':
      return 'penalty';
    default:
      return 'other';
  }
}

function findBucketLabel(value: number, buckets: DistanceBucket[]): string {
  const bucket = buckets.find((item) => value >= item.min && value < item.max) ?? buckets[buckets.length - 1];
  return bucket?.label ?? 'unknown';
}

function deriveShotRole(shotType: CanonicalShotType, par: number, beforeYards: number): ShotRole {
  if (shotType === 'tee') {
    return par === 3 ? 'par3_tee' : 'drive';
  }
  if (shotType === 'approach') {
    if (beforeYards >= 190) return 'long_approach';
    if (beforeYards >= 100) return 'approach';
    return 'wedge_approach';
  }
  if (shotType === 'around_green') return 'greenside';
  if (shotType === 'putting') return 'putting';
  return 'penalty';
}

function canonicalizeMissSector(
  missDirection: string | null,
  result: string | null,
  lieAfter: CanonicalLie,
  isPenalty: boolean
): MissSector {
  if (result === 'hole') return 'hole';
  if (isPenalty || result === 'penalty' || lieAfter === 'penalty') return 'penalty';

  const raw = (missDirection ?? '').toLowerCase().trim();
  if (raw) {
    const tokens = raw
      .replace(/high/g, 'long')
      .replace(/low/g, 'short')
      .split(/[_\s-]+/)
      .filter(Boolean);

    const hasLeft = tokens.includes('left');
    const hasRight = tokens.includes('right');
    const hasShort = tokens.includes('short');
    const hasLong = tokens.includes('long');

    if (hasShort && hasLeft) return 'short_left';
    if (hasShort && hasRight) return 'short_right';
    if (hasLong && hasLeft) return 'long_left';
    if (hasLong && hasRight) return 'long_right';
    if (hasLeft) return 'left';
    if (hasRight) return 'right';
    if (hasShort) return 'short';
    if (hasLong) return 'long';
  }

  if (result === 'green' || lieAfter === 'green') return 'green';
  if (result === 'fairway' || lieAfter === 'fairway') return 'fairway';
  if (result === 'sand' || lieAfter === 'sand') return 'sand';
  if (result === 'rough' || lieAfter === 'rough') return 'rough';
  return 'other';
}

function isPlayableLie(lie: CanonicalLie): boolean {
  return lie === 'green' || lie === 'fairway' || lie === 'rough';
}

function createAccumulator(): AggregateAccumulator {
  return {
    sampleSize: 0,
    rounds: new Set<string>(),
    totalAfterYards: 0,
    totalProgressYards: 0,
    totalRemainingAfter: 0,
    penaltyCount: 0,
    greenCount: 0,
    playableCount: 0,
  };
}

function toAggregate(acc: AggregateAccumulator): ShotStateAggregate {
  return {
    sampleSize: acc.sampleSize,
    roundsCovered: acc.rounds.size,
    avgAfterYards: acc.sampleSize > 0 ? acc.totalAfterYards / acc.sampleSize : 0,
    avgProgressYards: acc.sampleSize > 0 ? acc.totalProgressYards / acc.sampleSize : 0,
    avgRemainingAfter: acc.sampleSize > 0 ? acc.totalRemainingAfter / acc.sampleSize : 0,
    penaltyRate: acc.sampleSize > 0 ? acc.penaltyCount / acc.sampleSize : 0,
    greenRate: acc.sampleSize > 0 ? acc.greenCount / acc.sampleSize : 0,
    playableRate: acc.sampleSize > 0 ? acc.playableCount / acc.sampleSize : 0,
  };
}

function updateAccumulator(acc: AggregateAccumulator, state: EnrichedShotState): void {
  acc.sampleSize += 1;
  acc.rounds.add(state.roundId);
  acc.totalAfterYards += state.afterYards;
  acc.totalProgressYards += state.progressYards;
  acc.totalRemainingAfter += state.remainingAfter;
  acc.penaltyCount += state.isPenalty ? 1 : 0;
  acc.greenCount += state.lieAfter === 'green' || state.result === 'green' || state.result === 'hole' ? 1 : 0;
  acc.playableCount += isPlayableLie(state.lieAfter) ? 1 : 0;
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatYards(value: number): string {
  return `${value.toFixed(1)}y`;
}

function formatShots(value: number): string {
  return `${value.toFixed(2)} shots`;
}

function sampleConfidence(sampleSize: number, roundsCovered: number): number {
  const sampleComponent = Math.min(1, sampleSize / 18) * 0.7;
  const roundComponent = Math.min(1, roundsCovered / 6) * 0.3;
  return Math.max(0.45, Math.min(0.95, sampleComponent + roundComponent));
}

function parseContextKey(key: string): {
  shotRole: ShotRole;
  par: number;
  lie: CanonicalLie;
  beforeBucket: string;
} {
  const [shotRole, par, lie, beforeBucket] = key.split('|');
  return {
    shotRole: (shotRole as ShotRole) ?? 'approach',
    par: Number(par?.replace('par', '')) || 4,
    lie: (lie as CanonicalLie) ?? 'fairway',
    beforeBucket: beforeBucket ?? 'unknown',
  };
}

function contextLabelFromKey(key: string): string {
  const parsed = parseContextKey(key);
  const parLabel = parsed.par === 3 ? 'Par 3' : parsed.par === 5 ? 'Par 5' : 'Par 4';
  const roleLabelMap: Record<ShotRole, string> = {
    par3_tee: 'tee shots',
    drive: 'drives',
    long_approach: 'long approaches',
    approach: 'approaches',
    wedge_approach: 'wedge approaches',
    greenside: 'greenside shots',
    putting: 'putts',
    penalty: 'penalty recoveries',
  };

  return `${parLabel} ${roleLabelMap[parsed.shotRole]} from ${parsed.lie} at ${parsed.beforeBucket}`;
}

export class ShotStateIntelligence {
  private playerId: string;
  private supabase: SupabaseClient | null = null;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  private getClient(): SupabaseClient {
    if (!this.supabase) {
      this.supabase = createAdminClient() as unknown as SupabaseClient;
    }
    return this.supabase;
  }

  async analyze(): Promise<ShotStateAnalysis | null> {
    const states = await this.loadShotStates();
    // Post-filter on shot type only — the query is already scoped to this player.
    const playerStates = states.filter((state) => state.shotType !== 'putting');

    const playerRounds = new Set(playerStates.map((state) => state.roundId)).size;
    if (playerStates.length < 20 || playerRounds < 3) {
      return null;
    }

    const globalContexts = this.aggregateByContext(states.filter((state) => state.shotType !== 'putting'));
    const playerContexts = this.aggregateByContext(playerStates);
    const globalMissSectors = this.aggregateByMissSector(
      states.filter((state) => state.shotType !== 'putting'),
    );

    const insights = [
      ...this.generateStateLeakInsights(playerContexts, globalContexts, playerRounds),
      ...this.generateDangerSideInsights(globalMissSectors, playerRounds),
      ...this.generateLiePenaltyInsights(playerContexts, playerRounds),
    ]
      .sort((a, b) => b.strokeImpact - a.strokeImpact || b.confidence - a.confidence)
      .slice(0, 6);

    const summarizedContexts = [...playerContexts.entries()]
      .map(([key, acc]) => ({ key, aggregate: toAggregate(acc) }))
      .sort((a, b) => b.aggregate.sampleSize - a.aggregate.sampleSize)
      .slice(0, 8)
      .map(({ key, aggregate }) => ({
        label: contextLabelFromKey(key),
        sampleSize: aggregate.sampleSize,
        avgAfterYards: aggregate.avgAfterYards,
        avgProgressYards: aggregate.avgProgressYards,
        avgRemainingAfter: aggregate.avgRemainingAfter,
        penaltyRate: aggregate.penaltyRate,
      }));

    return {
      playerId: this.playerId,
      analyzedAt: new Date().toISOString(),
      playerRounds,
      playerContexts: summarizedContexts,
      insights,
    };
  }

  private async loadShotStates(): Promise<EnrichedShotState[]> {
    const supabase = this.getClient();

    // LIVE-18: scope to this player only. Prior code queried every round
    // platform-wide and post-filtered in memory, which both leaked other
    // tenants' round ids into the reduce pipeline and scaled poorly.
    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(50);

    if (roundsError) {
      await logServerError('shot-state-intelligence.loadShotStates failed', {
        action: 'shot-state-intelligence.loadShotStates',
        featureArea: 'coachhelm.mining',
        metadata: { playerId: this.playerId, dbError: roundsError as unknown },
      });
      return [];
    }
    if (!rounds || rounds.length === 0) {
      return [];
    }

    const roundRows = rounds as CompletedRound[];
    const roundIds = roundRows.map((round) => round.id);
    const playerByRound = new Map(roundRows.map((round) => [round.id, round.player_id]));

    const shots = await this.fetchShots(roundIds);
    const holes = await this.fetchHoles(roundIds);
    const holeMap = new Map(holes.map((hole) => [`${hole.round_id}:${hole.hole_number}`, hole]));

    const shotsByHole = new Map<string, RawShotRow[]>();
    for (const shot of shots) {
      const key = `${shot.round_id}:${shot.hole_number}`;
      const existing = shotsByHole.get(key) ?? [];
      existing.push(shot);
      shotsByHole.set(key, existing);
    }

    const states: EnrichedShotState[] = [];

    for (const [holeKey, holeShots] of shotsByHole) {
      holeShots.sort((a, b) => a.shot_number - b.shot_number);
      const hole = holeMap.get(holeKey);
      const inferredScore = this.inferHoleScore(holeShots, hole?.score ?? null);
      const par = hole?.par ?? this.inferParFromHoleShots(holeShots);
      const playerId = playerByRound.get(holeShots[0]?.round_id ?? '');

      if (!inferredScore || !par || !playerId) continue;

      for (const shot of holeShots) {
        const shotType = canonicalizeShotType(shot.shot_type);
        if (!shotType) continue;

        const beforeYards = toYards(shot.distance_to_hole_before, shot.distance_unit_before);
        const afterYards = toYards(shot.distance_to_hole_after, shot.distance_unit_after);
        if (beforeYards == null || afterYards == null) continue;

        const remainingAfter = inferredScore - shot.shot_number;
        if (remainingAfter < 0) continue;

        const lieAfter = canonicalizeLie(shot.lie_after);
        const state: EnrichedShotState = {
          playerId,
          roundId: shot.round_id,
          par,
          shotType,
          shotRole: deriveShotRole(shotType, par, beforeYards),
          lieBefore: canonicalizeLie(shot.lie_before),
          lieAfter,
          result: (shot.result ?? 'other').toLowerCase(),
          beforeYards,
          afterYards,
          progressYards: Math.max(0, beforeYards - afterYards),
          beforeBucket: findBucketLabel(beforeYards, BEFORE_BUCKETS),
          afterBucket: findBucketLabel(afterYards, AFTER_BUCKETS),
          missSector: canonicalizeMissSector(
            shot.miss_direction,
            shot.result,
            lieAfter,
            Boolean(shot.is_penalty)
          ),
          remainingAfter,
          isPenalty: Boolean(shot.is_penalty) || shot.result === 'penalty' || lieAfter === 'penalty',
        };

        states.push(state);
      }
    }

    return states;
  }

  private async fetchShots(roundIds: string[]): Promise<RawShotRow[]> {
    const supabase = this.getClient();
    const shots: RawShotRow[] = [];

    for (let i = 0; i < roundIds.length; i += 100) {
      const batch = roundIds.slice(i, i + 100);
      const { data } = await fetchAllRowsResult((from, to) => supabase
        .from('golf_shots')
        .select('round_id, hole_number, shot_number, shot_type, lie_before, lie_after, result, is_penalty, miss_direction, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, putt_made')
        .in('round_id', batch)
        .order('round_id', { ascending: true })
        .order('hole_number', { ascending: true })
        .order('shot_number', { ascending: true })
        // Batching round IDs avoids .in() URL limits.
        .order('id', { ascending: true })
        .range(from, to)); // paginate past PostgREST 1000-row cap

      shots.push(...((data ?? []) as RawShotRow[]));
    }

    return shots;
  }

  private async fetchHoles(roundIds: string[]): Promise<HoleRow[]> {
    const supabase = this.getClient();
    const holes: HoleRow[] = [];

    for (let i = 0; i < roundIds.length; i += 100) {
      const batch = roundIds.slice(i, i + 100);
      const { data } = await fetchAllRowsResult((from, to) => supabase
        .from('golf_holes')
        .select('round_id, hole_number, par, score')
        .in('round_id', batch)
        .order('id', { ascending: true })
        .range(from, to)); // paginate past PostgREST 1000-row cap (per-batch)

      holes.push(...((data ?? []) as HoleRow[]));
    }

    return holes;
  }

  private inferHoleScore(shots: RawShotRow[], storedScore: number | null): number | null {
    if (storedScore && storedScore > 0) return storedScore;

    const lastShot = shots[shots.length - 1];
    if (!lastShot) return null;

    if (lastShot.result === 'hole' || lastShot.putt_made === true) {
      return lastShot.shot_number;
    }

    return null;
  }

  private inferParFromHoleShots(shots: RawShotRow[]): number | null {
    const teeShot = shots.find((shot) => canonicalizeShotType(shot.shot_type) === 'tee');
    const teeDistance = toYards(teeShot?.distance_to_hole_before ?? null, teeShot?.distance_unit_before ?? null);

    if (teeDistance == null) return null;
    if (teeDistance <= 250) return 3;
    if (teeDistance >= 470) return 5;
    return 4;
  }

  private buildContextKey(state: EnrichedShotState): string {
    return `${state.shotRole}|par${state.par}|${state.lieBefore}|${state.beforeBucket}`;
  }

  private aggregateByContext(states: EnrichedShotState[]): Map<string, AggregateAccumulator> {
    const map = new Map<string, AggregateAccumulator>();

    for (const state of states) {
      const key = this.buildContextKey(state);
      if (!map.has(key)) {
        map.set(key, createAccumulator());
      }
      updateAccumulator(map.get(key)!, state);
    }

    return map;
  }

  private aggregateByMissSector(states: EnrichedShotState[]): Map<string, Map<MissSector, AggregateAccumulator>> {
    const map = new Map<string, Map<MissSector, AggregateAccumulator>>();

    for (const state of states) {
      const key = this.buildContextKey(state);
      if (!map.has(key)) {
        map.set(key, new Map<MissSector, AggregateAccumulator>());
      }
      const sectorMap = map.get(key)!;
      if (!sectorMap.has(state.missSector)) {
        sectorMap.set(state.missSector, createAccumulator());
      }
      updateAccumulator(sectorMap.get(state.missSector)!, state);
    }

    return map;
  }

  private generateStateLeakInsights(
    playerContexts: Map<string, AggregateAccumulator>,
    globalContexts: Map<string, AggregateAccumulator>,
    playerRounds: number
  ): ShotStateInsight[] {
    const insights: ShotStateInsight[] = [];

    for (const [key, playerAcc] of playerContexts) {
      const globalAcc = globalContexts.get(key);
      if (!globalAcc) continue;

      const playerAgg = toAggregate(playerAcc);
      const globalAgg = toAggregate(globalAcc);
      if (playerAgg.sampleSize < MIN_PLAYER_CONTEXT_SAMPLE || globalAgg.sampleSize < MIN_GLOBAL_CONTEXT_SAMPLE) {
        continue;
      }

      const deltaRemaining = playerAgg.avgRemainingAfter - globalAgg.avgRemainingAfter;
      const deltaAfterYards = playerAgg.avgAfterYards - globalAgg.avgAfterYards;
      if (deltaRemaining < 0.22 && deltaAfterYards < 8) continue;

      const roundsFrequency = playerAgg.sampleSize / Math.max(1, playerRounds);
      const strokeImpact = Math.max(0, deltaRemaining * roundsFrequency);

      insights.push({
        id: `state-leak-${key}`,
        type: 'state_leak',
        headline: `${contextLabelFromKey(key)} are leaking scoring`,
        body: `${contextLabelFromKey(key)} finish ${formatYards(deltaAfterYards)} farther away than baseline and leave ${formatShots(deltaRemaining)} more to finish after each shot.`,
        recommendation: `Treat ${contextLabelFromKey(key)} as a dedicated development window. The priority is reducing finish distance and avoiding the finish states that push this shot into extra cleanup work.`,
        evidence: [
          `Player avg after: ${formatYards(playerAgg.avgAfterYards)} vs baseline ${formatYards(globalAgg.avgAfterYards)}`,
          `Player avg remaining: ${formatShots(playerAgg.avgRemainingAfter)} vs baseline ${formatShots(globalAgg.avgRemainingAfter)}`,
          `Sample: ${playerAgg.sampleSize} shots across ${playerAgg.roundsCovered} rounds`,
        ],
        confidence: sampleConfidence(playerAgg.sampleSize, playerAgg.roundsCovered),
        strokeImpact,
      });
    }

    return insights;
  }

  private generateDangerSideInsights(
    sectorContexts: Map<string, Map<MissSector, AggregateAccumulator>>,
    playerRounds: number
  ): ShotStateInsight[] {
    const insights: ShotStateInsight[] = [];
    const directionalPairs: Array<[MissSector, MissSector]> = [
      ['left', 'right'],
      ['short', 'long'],
      ['short_left', 'short_right'],
      ['long_left', 'long_right'],
    ];

    for (const [key, sectorMap] of sectorContexts) {
      for (const [leftSector, rightSector] of directionalPairs) {
        const leftAcc = sectorMap.get(leftSector);
        const rightAcc = sectorMap.get(rightSector);
        if (!leftAcc || !rightAcc) continue;

        const leftAgg = toAggregate(leftAcc);
        const rightAgg = toAggregate(rightAcc);
        if (leftAgg.sampleSize < MIN_MISS_SECTOR_SAMPLE || rightAgg.sampleSize < MIN_MISS_SECTOR_SAMPLE) {
          continue;
        }

        const rightWorse = rightAgg.avgRemainingAfter - leftAgg.avgRemainingAfter;
        const leftWorse = leftAgg.avgRemainingAfter - rightAgg.avgRemainingAfter;
        const dangerousSide = rightWorse > leftWorse ? rightSector : leftSector;
        const saferSide = dangerousSide === rightSector ? leftSector : rightSector;
        const dangerousAgg = dangerousSide === rightSector ? rightAgg : leftAgg;
        const saferAgg = dangerousSide === rightSector ? leftAgg : rightAgg;
        const deltaRemaining = dangerousAgg.avgRemainingAfter - saferAgg.avgRemainingAfter;
        const deltaPenalty = dangerousAgg.penaltyRate - saferAgg.penaltyRate;

        if (deltaRemaining < 0.2 && deltaPenalty < 0.1) continue;

        const strokeImpact = (dangerousAgg.sampleSize / Math.max(1, playerRounds)) * deltaRemaining;

        insights.push({
          id: `danger-side-${key}-${dangerousSide}`,
          type: 'danger_side',
          headline: `${contextLabelFromKey(key)} have a danger-side miss`,
          body: `${this.formatMissSector(dangerousSide)} misses are materially more expensive than ${this.formatMissSector(saferSide)} misses in this window, leaving ${formatShots(deltaRemaining)} more to finish and ${formatPct(Math.max(0, deltaPenalty))} more penalty risk.`,
          recommendation: `Bias the miss toward ${this.formatMissSector(saferSide)} in this context. The goal is not perfection; it is eliminating the expensive side of the pattern.`,
          evidence: [
            `${this.formatMissSector(dangerousSide)}: ${formatShots(dangerousAgg.avgRemainingAfter)} remaining, ${formatPct(dangerousAgg.penaltyRate)} penalty rate`,
            `${this.formatMissSector(saferSide)}: ${formatShots(saferAgg.avgRemainingAfter)} remaining, ${formatPct(saferAgg.penaltyRate)} penalty rate`,
            `Samples: ${dangerousAgg.sampleSize} vs ${saferAgg.sampleSize}`,
          ],
          confidence: sampleConfidence(dangerousAgg.sampleSize + saferAgg.sampleSize, Math.max(dangerousAgg.roundsCovered, saferAgg.roundsCovered)),
          strokeImpact,
        });
      }
    }

    return insights;
  }

  private generateLiePenaltyInsights(
    playerContexts: Map<string, AggregateAccumulator>,
    playerRounds: number
  ): ShotStateInsight[] {
    const grouped = new Map<string, Array<{ lie: CanonicalLie; key: string; aggregate: ShotStateAggregate }>>();

    for (const [key, acc] of playerContexts) {
      const agg = toAggregate(acc);
      if (agg.sampleSize < MIN_LIE_COMPARISON_SAMPLE) continue;

      const parsed = parseContextKey(key);
      const groupKey = `${parsed.shotRole}|par${parsed.par}|${parsed.beforeBucket}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push({ lie: parsed.lie, key, aggregate: agg });
    }

    const insights: ShotStateInsight[] = [];

    for (const [groupKey, contexts] of grouped) {
      const fairway = contexts.find((context) => context.lie === 'fairway');
      const rough = contexts.find((context) => context.lie === 'rough');
      const sand = contexts.find((context) => context.lie === 'sand');
      const comparison = rough ?? sand;

      if (!fairway || !comparison) continue;

      const deltaRemaining = comparison.aggregate.avgRemainingAfter - fairway.aggregate.avgRemainingAfter;
      const deltaAfterYards = comparison.aggregate.avgAfterYards - fairway.aggregate.avgAfterYards;
      if (deltaRemaining < 0.18 && deltaAfterYards < 6) continue;

      const roundsFrequency = comparison.aggregate.sampleSize / Math.max(1, playerRounds);
      const strokeImpact = deltaRemaining * roundsFrequency;
      const contextLabel = contextLabelFromKey(comparison.key).replace(` from ${comparison.lie}`, '');

      insights.push({
        id: `lie-penalty-${groupKey}-${comparison.lie}`,
        type: 'lie_penalty',
        headline: `${comparison.lie} creates a real yardage tax in ${contextLabel}`,
        body: `From the same ${parseContextKey(comparison.key).beforeBucket} window, ${comparison.lie} leaves ${formatYards(deltaAfterYards)} more after the shot and ${formatShots(deltaRemaining)} more to finish than fairway.`,
        recommendation: `Coach this as a lie-management problem, not a generic approach problem. In this window, the target and acceptable miss need to change when the ball starts in ${comparison.lie}.`,
        evidence: [
          `${comparison.lie}: ${formatYards(comparison.aggregate.avgAfterYards)} after, ${formatShots(comparison.aggregate.avgRemainingAfter)} remaining`,
          `fairway: ${formatYards(fairway.aggregate.avgAfterYards)} after, ${formatShots(fairway.aggregate.avgRemainingAfter)} remaining`,
          `Samples: ${comparison.aggregate.sampleSize} vs ${fairway.aggregate.sampleSize}`,
        ],
        confidence: sampleConfidence(comparison.aggregate.sampleSize + fairway.aggregate.sampleSize, Math.max(comparison.aggregate.roundsCovered, fairway.aggregate.roundsCovered)),
        strokeImpact,
      });
    }

    return insights;
  }

  private formatMissSector(sector: MissSector): string {
    return sector.replace(/_/g, '-');
  }
}
