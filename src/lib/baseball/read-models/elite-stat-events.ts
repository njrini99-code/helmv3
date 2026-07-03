// =============================================================================
// src/lib/baseball/read-models/elite-stat-events.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// THE MISSING CONSUMER. The elite stat EVENT model (migration
// 20260624000080_baseball_elite_stat_event_model.sql + the hand-written types in
// src/lib/types/baseball-stat-events.ts) shipped pitch / batted-ball / swing /
// plate-appearance / fielding / catching / baserunning / workload event tables —
// but until now NOTHING in src read those rows. This read model is the per-grain
// aggregator that turns raw event rows into the derived metric universe the v6
// stat-universe + v10 stat-visual contracts enumerate:
//
//   HITTER   chase / zone-swing / zone-contact / whiff / CSW / first-pitch /
//            two-strike / by-pitch-type / by-count (ladder) / RISP & leverage
//            splits / pull-center-oppo / damage-by-zone / hard-hit / barrel /
//            sweet-spot / GB-LD-FB / EV-LA points / spray points / game-vs-cage.
//   PITCHER  K9 / BB9 / CSW / chase / whiff / first-pitch-strike / putaway /
//            velo-decay / command-by-quadrant / pitch-shape / pitch-mix board.
//
// HONESTY (zip non-negotiable + v10 source-confidence model):
//   * Every derived metric carries sampleSize + an HONEST confidence via the
//     SAME gateSample() the visuals use — a thin sample can never return 'high'.
//   * Every metric carries the dominant trust_tier + data_context + source_id of
//     the rows it was built from (provenance-true; the visual renders the chip).
//   * Rates are null (not a fabricated 0) when there is no denominator.
//   * OFFICIAL vs DEVELOPMENT context is preserved end-to-end: callers ask for a
//     context set; game-vs-cage gaps pair the two honestly.
//
// READ-PATH SAFETY:
//   * 'server-only' + plain async fns (NOT 'use server') so server components and
//     other read models import it directly.
//   * Tables are not (yet) in generated database.ts — accessed via fromUntyped
//     (the project's single escape hatch), row shapes asserted explicitly against
//     the hand-written src/lib/types/baseball-stat-events.ts types.
//   * STAFF GATE: getEliteStatEvents is a coaching surface — it resolves the
//     viewer's can_manage_stats and returns an honest authorized:false envelope
//     (NOT an error, NOT partial data) for non-staff. RLS backs every query;
//     this is the in-process gate on top. A player-visible variant lives in the
//     development-metrics action (snapshot read), gated by row visibility.
//
// CANONICAL READ PATH: this file is the designated canonical entry point for
// elite event/fact stat data — see docs/baseball/stats-architecture.md for the
// full three-layer model (legacy flat, official box-score/season, this layer)
// and src/lib/baseball/stat-layer-manifest.ts for the enforced deprecated-table
// allowlist.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import {
  gateSample,
  type SampleThresholds,
} from '@/components/baseball/stat-visuals/chart-geometry';
import type {
  BaseballDataContext,
  BaseballTrustTier,
  BaseballMetricConfidence,
  BaseballMetricGroup,
  BaseballPitchEvent,
  BaseballBattedBallEvent,
  BaseballSwingEvent,
  BaseballPlateAppearance,
} from '@/lib/types/baseball-stat-events';
import type {
  EvLaPoint,
  SprayPoint,
  ZoneCell,
  CountLadderRow,
  CountBucket,
  PitchShapePoint,
  MissVector,
  ReleasePoint,
  DecayPoint,
  PitchMixRow,
  BattedBallOutcome,
  ChartPointSource,
} from '@/lib/types/baseball-stat-visuals';
import type { StatVisualSourceChip } from '@/components/baseball/stat-visuals/StatVisualFrame';
import type { SourceTrust, TrustLevel } from '@/components/baseball/source-trust/source-trust-types';
import type { SourceKind, CaptureMode } from '@/lib/baseball/source-record';

// -----------------------------------------------------------------------------
// Public derived-metric shape — the snapshot-ready unit every aggregator emits.
// Maps 1:1 to baseball_player_development_metrics columns so the write path is a
// trivial projection (see development-metrics action).
// -----------------------------------------------------------------------------

/** A single source-attributed, sample-aware derived metric for one player. */
export interface DerivedMetric {
  /** Stable metric_key, e.g. 'chase_rate', 'csw', 'hard_hit_rate'. */
  metricKey: string;
  metricGroup: BaseballMetricGroup;
  /** Display label for cards (never a golf term). */
  label: string;
  /** [0,1] for rates; raw for counts/rates-per-9; null when no denominator. */
  value: number | null;
  /** display unit suffix: 'rate' (×100→%), 'per9', 'mph', 'deg', 'count'. */
  unit: 'rate' | 'per9' | 'mph' | 'deg' | 'count' | 'ratio';
  /** higher-is-better drives card tone; chase/whiff/walk invert. */
  higherIsBetter: boolean;
  /** denominator the metric was built from (pitches, BBE, PA, swings...). */
  sampleSize: number;
  /** honest confidence from gateSample — never a fake 'high' on a thin sample. */
  confidence: BaseballMetricConfidence;
  /** dominant trust tier of the contributing rows (provenance-true). */
  trustTier: BaseballTrustTier;
  /** the data context this metric was computed within. */
  dataContext: BaseballDataContext;
  /** dominant source_id of the contributing rows (the source chip target). */
  sourceId: string | null;
}

/** Hitter derived-metric bundle + the visual prop payloads. */
export interface HitterEliteMetrics {
  playerId: string;
  metrics: DerivedMetric[];
  /** Visual payloads (feed the existing HittingVisuals components directly). */
  visuals: {
    evLaPoints: EvLaPoint[];
    sprayPoints: SprayPoint[];
    /** chase/whiff/damage heat over the 13 standard zone buckets. */
    chaseZone: ZoneCell[];
    damageZone: ZoneCell[];
    countLadder: CountLadderRow[];
  };
}

/** Pitcher derived-metric bundle + the visual prop payloads. */
export interface PitcherEliteMetrics {
  playerId: string;
  metrics: DerivedMetric[];
  visuals: {
    pitchShape: PitchShapePoint[];
    commandZone: ZoneCell[];
    /** intended-vs-actual miss vectors (Command Heatmap). */
    commandVectors: MissVector[];
    /** total located pitches behind the command heatmap (sample honesty). */
    commandTotalPitches: number;
    /** release-point cloud (Release Consistency Plot). */
    release: ReleasePoint[];
    veloDecay: DecayPoint[];
    pitchMix: PitchMixRow[];
  };
}

export interface EliteStatEventsReadModel {
  teamId: string;
  /** False when the current user is not staff (can_manage_stats) on the team. */
  authorized: boolean;
  /** The context set the metrics were computed within (echoed for the UI). */
  contexts: BaseballDataContext[];
  hitters: HitterEliteMetrics[];
  pitchers: PitcherEliteMetrics[];
  summary: {
    pitchEvents: number;
    battedBallEvents: number;
    swingEvents: number;
    plateAppearances: number;
    playersWithEventData: number;
  };
  /** Honest error string when a sub-read failed; arrays stay safe ([]). */
  error: string | null;
}

export interface EliteStatEventsOptions {
  /** Restrict to one player (player profile). Default: whole team. */
  playerId?: string | null;
  /**
   * Which data contexts to include. Default: the OFFICIAL game contexts only
   * (official_game + scrimmage), so a coach's default view is the competitive
   * record. Callers asking for the game-vs-cage gap pass the full set.
   */
  contexts?: BaseballDataContext[];
  /** Inclusive lower bound on measured_at (ISO). */
  fromDate?: string | null;
  /** Inclusive upper bound on measured_at (ISO). */
  toDate?: string | null;
}

// Default context set: the competitive record (game + scrimmage), NOT cage/sensor.
const DEFAULT_CONTEXTS: BaseballDataContext[] = ['official_game', 'scrimmage'];

// Development contexts used for the game-vs-cage gap denominator.
const DEV_CONTEXTS: BaseballDataContext[] = ['practice', 'cage', 'bullpen', 'sensor'];

// -----------------------------------------------------------------------------
// Trust-tier ordering — to pick the DOMINANT (lowest/most-honest) tier of a set
// of rows. We deliberately surface the WEAKEST tier present so a metric built
// partly from unverified rows is never advertised as 'official'.
// -----------------------------------------------------------------------------
const TRUST_RANK: Record<BaseballTrustTier, number> = {
  official: 5,
  verified_vendor: 4,
  coach_reviewed: 3,
  player_submitted: 2,
  unverified: 1,
  inferred: 0,
};

/** Return the weakest (most conservative) trust tier across rows. */
function dominantTrust(
  rows: { trust_tier?: BaseballTrustTier | null }[],
): BaseballTrustTier {
  let weakest: BaseballTrustTier | null = null;
  for (const r of rows) {
    const t = (r.trust_tier ?? 'unverified') as BaseballTrustTier;
    if (weakest === null || TRUST_RANK[t] < TRUST_RANK[weakest]) weakest = t;
  }
  return weakest ?? 'inferred';
}

/** Most-common non-null source_id across rows (the source-chip target). */
function dominantSource(rows: { source_id?: string | null }[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.source_id) counts.set(r.source_id, (counts.get(r.source_id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/** Most-common data_context across rows (for provenance on a blended metric). */
function dominantContext(
  rows: { data_context?: BaseballDataContext | null }[],
  fallback: BaseballDataContext,
): BaseballDataContext {
  const counts = new Map<BaseballDataContext, number>();
  for (const r of rows) {
    const c = (r.data_context ?? fallback) as BaseballDataContext;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: BaseballDataContext = fallback;
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

// -----------------------------------------------------------------------------
// trust mapping — turn the event-row trust_tier vocabulary into the Source Trust
// System render descriptors so per-point + chart-level chips open the drawer.
// (BaseballTrustTier -> SourceTrust; never fabricates a "verified"/confidence.)
// -----------------------------------------------------------------------------

const TRUST_TIER_TO_LEVEL: Record<BaseballTrustTier, TrustLevel> = {
  official: 'official',
  verified_vendor: 'device_export',
  coach_reviewed: 'staff_entered',
  player_submitted: 'player_entered',
  unverified: 'unreviewed',
  inferred: 'ai_derived',
};

const TRUST_TIER_TO_KIND: Record<BaseballTrustTier, SourceKind> = {
  official: 'integration',
  verified_vendor: 'integration',
  coach_reviewed: 'manual',
  player_submitted: 'manual',
  unverified: 'csv_import',
  inferred: 'ai',
};

const TRUST_TIER_LABEL: Record<BaseballTrustTier, string> = {
  official: 'Official feed',
  verified_vendor: 'Verified device',
  coach_reviewed: 'Coach reviewed',
  player_submitted: 'Player entry',
  unverified: 'Unreviewed import',
  inferred: 'Derived',
};

/** Map a single event row's trust tier into a render-ready SourceTrust. */
export function trustTierToSourceTrust(tier: BaseballTrustTier): SourceTrust {
  // Inferred/AI-derived values are NOT active captures (honesty distinction).
  const captureMode: CaptureMode =
    tier === 'inferred' ? 'logged_intent' : 'active_capture';
  return {
    label: TRUST_TIER_LABEL[tier],
    kind: TRUST_TIER_TO_KIND[tier],
    trustLevel: TRUST_TIER_TO_LEVEL[tier],
    captureMode,
    confidencePct: null, // never a fabricated percent at the event grain
    verified: tier === 'official',
  };
}

/** Per-point provenance carrier for a chart datum (opens drawer on click). */
function pointSource(tier: BaseballTrustTier | null | undefined): ChartPointSource | undefined {
  if (!tier) return undefined;
  return { trust: trustTierToSourceTrust(tier) };
}

/**
 * Build the chart-level source chips for a visual from the DISTINCT trust tiers
 * present across its rows (one chip per tier, weakest-first). A visual mounts
 * these so a coach sees "Official + Unreviewed import" at a glance.
 */
export function buildSourceChips(
  rows: { trust_tier?: BaseballTrustTier | null }[],
): StatVisualSourceChip[] {
  const tiers = new Set<BaseballTrustTier>();
  for (const r of rows) tiers.add((r.trust_tier ?? 'unverified') as BaseballTrustTier);
  return [...tiers]
    .sort((a, b) => TRUST_RANK[a] - TRUST_RANK[b])
    .map((tier) => ({ trust: trustTierToSourceTrust(tier) }));
}

// -----------------------------------------------------------------------------
// Metric factory — wraps a numerator/denominator into a DerivedMetric with the
// honest confidence + dominant provenance of the contributing rows.
// -----------------------------------------------------------------------------

interface ProvenanceRow {
  trust_tier?: BaseballTrustTier | null;
  data_context?: BaseballDataContext | null;
  source_id?: string | null;
}

function rateMetric(
  cfg: {
    metricKey: string;
    metricGroup: BaseballMetricGroup;
    label: string;
    higherIsBetter: boolean;
    threshold: SampleThresholds;
    fallbackContext: BaseballDataContext;
  },
  numerator: number,
  denominator: number,
  rows: ProvenanceRow[],
): DerivedMetric {
  const gate = gateSample(denominator, cfg.threshold);
  return {
    metricKey: cfg.metricKey,
    metricGroup: cfg.metricGroup,
    label: cfg.label,
    value: denominator > 0 ? numerator / denominator : null,
    unit: 'rate',
    higherIsBetter: cfg.higherIsBetter,
    sampleSize: denominator,
    confidence: gate.confidence,
    trustTier: dominantTrust(rows),
    dataContext: dominantContext(rows, cfg.fallbackContext),
    sourceId: dominantSource(rows),
  };
}

function scalarMetric(
  cfg: {
    metricKey: string;
    metricGroup: BaseballMetricGroup;
    label: string;
    unit: DerivedMetric['unit'];
    higherIsBetter: boolean;
    threshold: SampleThresholds;
    fallbackContext: BaseballDataContext;
  },
  value: number | null,
  sampleSize: number,
  rows: ProvenanceRow[],
): DerivedMetric {
  const gate = gateSample(sampleSize, cfg.threshold);
  return {
    metricKey: cfg.metricKey,
    metricGroup: cfg.metricGroup,
    label: cfg.label,
    value,
    unit: cfg.unit,
    higherIsBetter: cfg.higherIsBetter,
    sampleSize,
    confidence: gate.confidence,
    trustTier: dominantTrust(rows),
    dataContext: dominantContext(rows, cfg.fallbackContext),
    sourceId: dominantSource(rows),
  };
}

// A generic "rate" threshold for metrics whose visual isn't a scatter/heatmap
// (count-ladder rates, CSW, K9, BB9). 20 to read, 60 to aggregate is the v6
// "give me a stable single-number rate" floor.
const RATE_THRESHOLD: SampleThresholds = { read: 20, trend: 50, aggregate: 100 };
// Velocity / per-outing scalar floor (a single outing reads; 3 trend).
const SCALAR_THRESHOLD: SampleThresholds = { read: 8, trend: 25, aggregate: 60 };

// -----------------------------------------------------------------------------
// Internal: classify a batted-ball outcome from the event row (for coloring).
// -----------------------------------------------------------------------------
function classifyBattedBallOutcome(
  bb: Pick<BaseballBattedBallEvent, 'result' | 'is_hard_hit' | 'is_barrel'>,
): BattedBallOutcome {
  const r = (bb.result ?? '').toLowerCase();
  if (/(double|triple|home_?run|hr|2b|3b)/.test(r)) return 'extra_base';
  if (/(single|hit|1b)/.test(r)) return 'hit';
  if (bb.is_barrel) return 'extra_base';
  if (bb.is_hard_hit && /out/.test(r)) return 'hard_out';
  if (/out|fc|gidp|dp/.test(r)) return 'out';
  if (bb.is_hard_hit === false) return 'soft_contact';
  return 'unknown';
}

// -----------------------------------------------------------------------------
// Internal: map a count_state ("1-2") to the v10 CountBucket.
// -----------------------------------------------------------------------------
export function countBucketOf(countState: string | null): CountBucket | null {
  if (!countState) return null;
  const m = /^(\d)\s*[-:]\s*(\d)$/.exec(countState.trim());
  if (!m) return null;
  const balls = Number(m[1]);
  const strikes = Number(m[2]);
  if (balls === 0 && strikes === 0) return 'first_pitch';
  if (strikes >= 2) return 'two_strike';
  if (balls > strikes) return 'hitter_ahead';
  if (strikes > balls) return 'pitcher_ahead';
  return 'even';
}

// -----------------------------------------------------------------------------
// Internal: which of the 13 zone buckets a pitch fell in (3x3 in-zone + 4 chase).
// zone 1..9 are the standard in-zone grid; out-of-zone pitches map to a chase
// quadrant by plate_side / plate_height sign.
// -----------------------------------------------------------------------------
export function zoneBucketOf(
  pitch: Pick<BaseballPitchEvent, 'zone' | 'is_in_zone' | 'plate_side' | 'plate_height'>,
): string | null {
  if (pitch.zone && pitch.zone >= 1 && pitch.zone <= 9) return String(pitch.zone);
  if (pitch.is_in_zone === false || (pitch.zone && pitch.zone >= 11)) {
    const side = pitch.plate_side ?? 0;
    const height = pitch.plate_height ?? 0;
    const h = side <= 0 ? 'l' : 'r';
    const v = height >= 0 ? 't' : 'b';
    return `chase_${v}${h}`;
  }
  return null;
}

const ALL_ZONE_IDS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'chase_tl', 'chase_tr', 'chase_bl', 'chase_br',
];

/** Clamp a normalized coordinate into the rendered [-1.2, 1.2] field. */
function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1.2, Math.min(1.2, n));
}

/**
 * Best-effort parse of a free-text intended_location ("up-and-in", "low-away",
 * "1", "glove-side") into a normalized [-1,1] target. Honest: returns null when
 * the intent is unknown rather than fabricating a center target — the command
 * heatmap then renders the actual location as a dot with no miss vector.
 */
export function parseIntendedTarget(
  intended: string | null | undefined,
): { x: number; y: number } | null {
  if (!intended) return null;
  const s = intended.trim().toLowerCase();
  // Numeric zone id (1-9) → grid center of that cell.
  const zoneNum = /^[1-9]$/.test(s) ? Number(s) : null;
  if (zoneNum) {
    const col = (zoneNum - 1) % 3; // 0,1,2 left→right
    const row = Math.floor((zoneNum - 1) / 3); // 0,1,2 top→bottom
    return { x: (col - 1) * 0.6, y: (1 - row) * 0.6 };
  }
  let x: number | null = null;
  let y: number | null = null;
  if (/\b(in|inside|arm-?side)\b/.test(s)) x = -0.6;
  else if (/\b(away|out|outside|glove-?side)\b/.test(s)) x = 0.6;
  else if (/\b(middle|center|down the middle|mid)\b/.test(s)) x = 0;
  if (/\b(up|high|top)\b/.test(s)) y = 0.6;
  else if (/\b(down|low|bottom)\b/.test(s)) y = -0.6;
  else if (/\b(middle|center|belt)\b/.test(s)) y = 0;
  if (x === null && y === null) return null;
  return { x: x ?? 0, y: y ?? 0 };
}

// =============================================================================
// Hitter aggregation
// =============================================================================

export function buildHitterMetrics(
  playerId: string,
  pitches: BaseballPitchEvent[],
  battedBalls: BaseballBattedBallEvent[],
  fallbackContext: BaseballDataContext,
): HitterEliteMetrics {
  // ---- Plate-discipline counts over pitch events seen as a BATTER. ----
  let seen = 0;
  let swings = 0;
  let whiffs = 0;
  let chasesNum = 0; // swings at out-of-zone
  let outOfZone = 0;
  let inZone = 0;
  let zoneSwings = 0;
  let zoneContact = 0; // in-zone swings that weren't whiffs
  let calledStrikes = 0;
  let firstPitchSeen = 0;
  let firstPitchSwings = 0;
  let twoStrikeSeen = 0;
  let twoStrikeChases = 0;

  // count-ladder accumulators
  const ladder = new Map<CountBucket, { pitches: number; swings: number; chases: number; whiffs: number; hard: number }>();
  const ensureLadder = (b: CountBucket) => {
    let l = ladder.get(b);
    if (!l) { l = { pitches: 0, swings: 0, chases: 0, whiffs: 0, hard: 0 }; ladder.set(b, l); }
    return l;
  };

  // zone heat accumulators
  const chaseZoneAgg = new Map<string, { pitches: number; chases: number; oozTakes: number }>();
  const damageZoneAgg = new Map<string, { contact: number; hard: number }>();

  for (const p of pitches) {
    seen += 1;
    const isSwing = !!p.is_swing;
    const isWhiff = !!p.is_whiff;
    const inZoneRow = p.is_in_zone === true;
    const oozRow = p.is_in_zone === false;
    if (isSwing) swings += 1;
    if (isWhiff) whiffs += 1;
    if (p.is_called_strike) calledStrikes += 1;
    if (inZoneRow) {
      inZone += 1;
      if (isSwing) {
        zoneSwings += 1;
        if (!isWhiff) zoneContact += 1;
      }
    }
    if (oozRow) {
      outOfZone += 1;
      if (isSwing) chasesNum += 1;
    }

    const bucket = countBucketOf(p.count_state);
    if (bucket) {
      const l = ensureLadder(bucket);
      l.pitches += 1;
      if (isSwing) l.swings += 1;
      if (isSwing && oozRow) l.chases += 1;
      if (isWhiff) l.whiffs += 1;
    }
    // first-pitch (0-0) aggression
    if (p.count_state && /^0\s*[-:]\s*0$/.test(p.count_state.trim())) {
      firstPitchSeen += 1;
      if (isSwing) firstPitchSwings += 1;
    }
    // two-strike discipline
    if (p.count_state && /[-:]\s*2$/.test(p.count_state.trim())) {
      twoStrikeSeen += 1;
      if (isSwing && oozRow) twoStrikeChases += 1;
    }

    // zone heat — chase rate per cell + correct-take on OOZ
    const zb = zoneBucketOf(p);
    if (zb) {
      const cz = chaseZoneAgg.get(zb) ?? { pitches: 0, chases: 0, oozTakes: 0 };
      cz.pitches += 1;
      if (oozRow && isSwing) cz.chases += 1;
      if (oozRow && !isSwing) cz.oozTakes += 1;
      chaseZoneAgg.set(zb, cz);
    }
  }

  // ---- Batted-ball quality. ----
  let bbCount = 0;
  let hardHit = 0;
  let barrels = 0;
  let sweetSpot = 0;
  const typeCounts = { ground_ball: 0, line_drive: 0, fly_ball: 0, popup: 0 } as Record<string, number>;
  let pull = 0, center = 0, oppo = 0;
  const evLaPoints: EvLaPoint[] = [];
  const sprayPoints: SprayPoint[] = [];

  for (const bb of battedBalls) {
    bbCount += 1;
    if (bb.is_hard_hit) hardHit += 1;
    if (bb.is_barrel) barrels += 1;
    if (bb.is_sweet_spot) sweetSpot += 1;
    if (bb.batted_ball_type) typeCounts[bb.batted_ball_type] = (typeCounts[bb.batted_ball_type] ?? 0) + 1;
    // spray-angle field: negative = pull (for a RHB pull is to LF; we keep raw).
    if (bb.spray_angle !== null && bb.spray_angle !== undefined) {
      if (bb.spray_angle < -15) pull += 1;
      else if (bb.spray_angle > 15) oppo += 1;
      else center += 1;
    }
    const outcome = classifyBattedBallOutcome(bb);
    evLaPoints.push({
      id: bb.id,
      exitVelocity: bb.exit_velocity ?? null,
      launchAngle: bb.launch_angle ?? null,
      outcome,
      battedBallType: bb.batted_ball_type ?? null,
      context: (bb.data_context ?? fallbackContext) as BaseballDataContext,
      pitchType: bb.pitch_type ?? null,
      countState: null,
      date: bb.measured_at ?? null,
      source: pointSource(bb.trust_tier),
    });
    sprayPoints.push({
      id: bb.id,
      sprayAngle: bb.spray_angle ?? null,
      distance: bb.distance ?? null,
      exitVelocity: bb.exit_velocity ?? null,
      battedBallType: bb.batted_ball_type ?? null,
      outcome,
      context: (bb.data_context ?? fallbackContext) as BaseballDataContext,
      source: pointSource(bb.trust_tier),
    });
    // damage-by-zone needs the originating pitch's zone — skipped unless joined
    // (kept honest: damageZone heat is built below only when pitch_event_id maps).
  }

  // damage-by-zone — join batted balls to their pitch's zone bucket.
  const pitchById = new Map(pitches.map((p) => [p.id, p]));
  for (const bb of battedBalls) {
    if (!bb.pitch_event_id) continue;
    const p = pitchById.get(bb.pitch_event_id);
    if (!p) continue;
    const zb = zoneBucketOf(p);
    if (!zb) continue;
    const dz = damageZoneAgg.get(zb) ?? { contact: 0, hard: 0 };
    dz.contact += 1;
    if (bb.is_hard_hit || bb.is_barrel) dz.hard += 1;
    damageZoneAgg.set(zb, dz);
  }

  // ---- Build the 13-bucket zone payloads (always all 13 for a stable grid). ----
  const chaseZone: ZoneCell[] = ALL_ZONE_IDS.map((zoneId) => {
    const cz = chaseZoneAgg.get(zoneId);
    const ooz = (cz?.chases ?? 0) + (cz?.oozTakes ?? 0);
    return {
      zoneId,
      pitches: cz?.pitches ?? 0,
      rate: ooz > 0 ? (cz?.chases ?? 0) / ooz : null,
      secondary: cz?.chases ?? 0,
    };
  });
  const damageZone: ZoneCell[] = ALL_ZONE_IDS.map((zoneId) => {
    const dz = damageZoneAgg.get(zoneId);
    return {
      zoneId,
      pitches: dz?.contact ?? 0,
      rate: dz && dz.contact > 0 ? dz.hard / dz.contact : null,
      secondary: dz?.hard ?? 0,
    };
  });

  // ---- Count ladder rows (all 5 buckets, stable order). ----
  const ladderOrder: CountBucket[] = ['first_pitch', 'hitter_ahead', 'even', 'pitcher_ahead', 'two_strike'];
  const countLadder: CountLadderRow[] = ladderOrder.map((bucket) => {
    const l = ladder.get(bucket);
    const p = l?.pitches ?? 0;
    return {
      bucket,
      pitches: p,
      swingRate: p > 0 ? (l!.swings) / p : null,
      chaseRate: p > 0 ? (l!.chases) / p : null,
      whiffRate: (l?.swings ?? 0) > 0 ? (l!.whiffs) / l!.swings : null,
      hardHitRate: null, // hard-hit per count needs the BBE join; left honest-null
      outcomeLabel: null,
    };
  });

  // ---- Derived metric records (snapshot-ready). ----
  const pProv: ProvenanceRow[] = pitches;
  const bbProv: ProvenanceRow[] = battedBalls;
  const metrics: DerivedMetric[] = [
    rateMetric(
      { metricKey: 'chase_rate', metricGroup: 'hitting', label: 'Chase Rate', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      chasesNum, outOfZone, pProv,
    ),
    rateMetric(
      { metricKey: 'zone_swing_rate', metricGroup: 'hitting', label: 'Zone-Swing Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      zoneSwings, inZone, pProv,
    ),
    rateMetric(
      { metricKey: 'zone_contact_rate', metricGroup: 'hitting', label: 'Zone-Contact Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      zoneContact, zoneSwings, pProv,
    ),
    rateMetric(
      { metricKey: 'whiff_rate', metricGroup: 'hitting', label: 'Whiff Rate', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      whiffs, swings, pProv,
    ),
    rateMetric(
      { metricKey: 'csw_rate', metricGroup: 'hitting', label: 'CSW% (against)', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      calledStrikes + whiffs, seen, pProv,
    ),
    rateMetric(
      { metricKey: 'first_pitch_swing_rate', metricGroup: 'hitting', label: 'First-Pitch Swing', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      firstPitchSwings, firstPitchSeen, pProv,
    ),
    rateMetric(
      { metricKey: 'two_strike_chase_rate', metricGroup: 'hitting', label: 'Two-Strike Chase', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      twoStrikeChases, twoStrikeSeen, pProv,
    ),
    rateMetric(
      { metricKey: 'hard_hit_rate', metricGroup: 'hitting', label: 'Hard-Hit Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      hardHit, bbCount, bbProv,
    ),
    rateMetric(
      { metricKey: 'barrel_rate', metricGroup: 'hitting', label: 'Barrel Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      barrels, bbCount, bbProv,
    ),
    rateMetric(
      { metricKey: 'sweet_spot_rate', metricGroup: 'hitting', label: 'Sweet-Spot Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      sweetSpot, bbCount, bbProv,
    ),
    rateMetric(
      { metricKey: 'gb_rate', metricGroup: 'hitting', label: 'Ground-Ball Rate', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      typeCounts.ground_ball ?? 0, bbCount, bbProv,
    ),
    rateMetric(
      { metricKey: 'ld_rate', metricGroup: 'hitting', label: 'Line-Drive Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      typeCounts.line_drive ?? 0, bbCount, bbProv,
    ),
    rateMetric(
      { metricKey: 'fb_rate', metricGroup: 'hitting', label: 'Fly-Ball Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      typeCounts.fly_ball ?? 0, bbCount, bbProv,
    ),
    rateMetric(
      { metricKey: 'pull_rate', metricGroup: 'hitting', label: 'Pull Rate', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      pull, pull + center + oppo, bbProv,
    ),
    rateMetric(
      { metricKey: 'oppo_rate', metricGroup: 'hitting', label: 'Oppo Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      oppo, pull + center + oppo, bbProv,
    ),
    scalarMetric(
      { metricKey: 'avg_exit_velocity', metricGroup: 'hitting', label: 'Avg Exit Velo', unit: 'mph', higherIsBetter: true, threshold: SCALAR_THRESHOLD, fallbackContext },
      avgOf(battedBalls.map((b) => b.exit_velocity)), bbCount, bbProv,
    ),
    scalarMetric(
      { metricKey: 'avg_launch_angle', metricGroup: 'hitting', label: 'Avg Launch Angle', unit: 'deg', higherIsBetter: true, threshold: SCALAR_THRESHOLD, fallbackContext },
      avgOf(battedBalls.map((b) => b.launch_angle)), bbCount, bbProv,
    ),
  ];

  return {
    playerId,
    metrics,
    visuals: { evLaPoints, sprayPoints, chaseZone, damageZone, countLadder },
  };
}

// =============================================================================
// Pitcher aggregation
// =============================================================================

export function buildPitcherMetrics(
  playerId: string,
  pitches: BaseballPitchEvent[],
  battedBalls: BaseballBattedBallEvent[],
  fallbackContext: BaseballDataContext,
): PitcherEliteMetrics {
  let seen = 0;
  let swings = 0;
  let whiffs = 0;
  let chasesNum = 0;
  let outOfZone = 0;
  let calledStrikes = 0;
  let strikes = 0;
  let firstPitchSeen = 0;
  let firstPitchStrikes = 0;
  let twoStrikeSeen = 0;
  let putaways = 0; // two-strike pitches that ended in a strikeout-type result

  const hardHitAgainst = battedBalls.filter((b) => b.is_hard_hit).length;

  // pitch-mix + shape + command + decay accumulators
  const mix = new Map<string, { pitches: number; strikes: number; whiffs: number; csw: number; chases: number; hard: number }>();
  const ensureMix = (t: string) => {
    let m = mix.get(t);
    if (!m) { m = { pitches: 0, strikes: 0, whiffs: 0, csw: 0, chases: 0, hard: 0 }; mix.set(t, m); }
    return m;
  };
  const pitchShape: PitchShapePoint[] = [];
  const commandVectors: MissVector[] = [];
  let commandLocated = 0;
  const release: ReleasePoint[] = [];
  const commandZoneAgg = new Map<string, { pitches: number; strikes: number }>();
  // decay: segment by pitch_number band.
  const decayBands = ['1-15', '16-30', '31-45', '46-60', '61-75', '76+'];
  const decayAgg = new Map<string, { pitches: number; velo: number[]; strikes: number; whiffs: number }>();
  const decayBandOf = (n: number | null): string => {
    if (n === null || n === undefined) return '1-15';
    if (n <= 15) return '1-15';
    if (n <= 30) return '16-30';
    if (n <= 45) return '31-45';
    if (n <= 60) return '46-60';
    if (n <= 75) return '61-75';
    return '76+';
  };

  for (const p of pitches) {
    seen += 1;
    const isSwing = !!p.is_swing;
    const isWhiff = !!p.is_whiff;
    const oozRow = p.is_in_zone === false;
    const isStrike =
      p.is_called_strike === true || isWhiff ||
      (p.is_in_zone === true && !isSwing) || // backwards-K-able takes in zone
      /strike|foul|swinging|called/i.test(p.pitch_result ?? p.pitch_call ?? '');
    if (isSwing) swings += 1;
    if (isWhiff) whiffs += 1;
    if (p.is_called_strike) calledStrikes += 1;
    if (isStrike) strikes += 1;
    if (oozRow) {
      outOfZone += 1;
      if (isSwing) chasesNum += 1;
    }
    if (p.count_state && /^0\s*[-:]\s*0$/.test(p.count_state.trim())) {
      firstPitchSeen += 1;
      if (isStrike) firstPitchStrikes += 1;
    }
    if (p.count_state && /[-:]\s*2$/.test(p.count_state.trim())) {
      twoStrikeSeen += 1;
      if (/strikeout|^k$|swinging_strike|called_strike_3/i.test(p.pitch_result ?? '')) putaways += 1;
    }

    const type = (p.pitch_type_classified ?? p.pitch_type ?? 'unknown') as string;
    const m = ensureMix(type);
    m.pitches += 1;
    if (isStrike) m.strikes += 1;
    if (isWhiff) m.whiffs += 1;
    if (p.is_called_strike || isWhiff) m.csw += 1;
    if (oozRow && isSwing) m.chases += 1;

    if (p.horizontal_break !== null || p.induced_vertical_break !== null) {
      pitchShape.push({
        id: p.id,
        pitchType: type,
        horizontalBreak: p.horizontal_break ?? null,
        inducedVerticalBreak: p.induced_vertical_break ?? null,
        velocity: p.velocity ?? null,
        spinRate: p.spin_rate ?? null,
        context: (p.data_context ?? fallbackContext) as BaseballDataContext,
        source: pointSource(p.trust_tier),
      });
    }

    const zb = zoneBucketOf(p);
    if (zb) {
      const cz = commandZoneAgg.get(zb) ?? { pitches: 0, strikes: 0 };
      cz.pitches += 1;
      if (isStrike) cz.strikes += 1;
      commandZoneAgg.set(zb, cz);
    }

    // Command miss-vector: the actual plate location (normalized [-1,1]) and the
    // intended target when it's known. plate_side/plate_height are in feet from
    // center; the zone half-width/half-height is ~0.83 ft (17in plate + ball) /
    // ~1.0 ft, so we normalize conservatively and clamp to the rendered field.
    if (p.plate_side !== null && p.plate_side !== undefined &&
        p.plate_height !== null && p.plate_height !== undefined) {
      const target = parseIntendedTarget(p.intended_location);
      commandVectors.push({
        id: p.id,
        actualX: clampUnit((p.plate_side ?? 0) / 0.95),
        // plate_height is absolute height above ground (~1.5–3.5 ft in zone); the
        // chart space is [-1,1] around the zone center (~2.5 ft), half-height ~1ft.
        actualY: clampUnit(((p.plate_height ?? 2.5) - 2.5) / 1.1),
        targetX: target?.x ?? null,
        targetY: target?.y ?? null,
        pitchType: type,
        source: pointSource(p.trust_tier),
      });
      commandLocated += 1;
    }

    // Release-point cloud (Release Consistency Plot): side/height + extension.
    if (p.release_side !== null && p.release_side !== undefined &&
        p.release_height !== null && p.release_height !== undefined) {
      release.push({
        id: p.id,
        pitchType: type,
        releaseSide: p.release_side ?? null,
        releaseHeight: p.release_height ?? null,
        extension: p.extension ?? null,
        date: p.measured_at ?? null,
        source: pointSource(p.trust_tier),
      });
    }

    const band = decayBandOf(p.pitch_number ?? null);
    const d = decayAgg.get(band) ?? { pitches: 0, velo: [], strikes: 0, whiffs: 0 };
    d.pitches += 1;
    if (p.velocity !== null && p.velocity !== undefined) d.velo.push(p.velocity);
    if (isStrike) d.strikes += 1;
    if (isWhiff) d.whiffs += 1;
    decayAgg.set(band, d);
  }

  // command-by-quadrant payload (13 buckets; rate = strike rate per cell).
  const commandZone: ZoneCell[] = ALL_ZONE_IDS.map((zoneId) => {
    const cz = commandZoneAgg.get(zoneId);
    return {
      zoneId,
      pitches: cz?.pitches ?? 0,
      rate: cz && cz.pitches > 0 ? cz.strikes / cz.pitches : null,
      secondary: cz?.strikes ?? 0,
    };
  });

  const veloDecay: DecayPoint[] = decayBands
    .map((segment) => {
      const d = decayAgg.get(segment);
      if (!d || d.pitches === 0) return null;
      return {
        segment,
        pitches: d.pitches,
        velocity: d.velo.length > 0 ? d.velo.reduce((a, b) => a + b, 0) / d.velo.length : null,
        strikeRate: d.pitches > 0 ? d.strikes / d.pitches : null,
        missRate: d.pitches > 0 ? d.whiffs / d.pitches : null,
      } satisfies DecayPoint;
    })
    .filter((x): x is DecayPoint => x !== null);

  const pitchMix: PitchMixRow[] = [...mix.entries()].map(([pitchType, m]) => ({
    pitchType,
    usagePct: seen > 0 ? m.pitches / seen : null,
    strikeRate: m.pitches > 0 ? m.strikes / m.pitches : null,
    whiffRate: m.pitches > 0 ? m.whiffs / m.pitches : null,
    cswRate: m.pitches > 0 ? m.csw / m.pitches : null,
    chaseRate: m.pitches > 0 ? m.chases / m.pitches : null,
    hardHitRate: null, // needs BBE-by-pitch-type join; left honest-null
    pitches: m.pitches,
  })).sort((a, b) => b.pitches - a.pitches);

  // innings-proxy for K9/BB9: we don't have official IP at the event grain, so we
  // express K/BB per 100 pitches (per9 unit) — honest about the denominator.
  const bbThrown = pitches.filter((p) => /walk|ball_4|^bb$/i.test(p.pitch_result ?? '')).length;
  const kThrown = pitches.filter((p) => /strikeout|^k$|called_strike_3|swinging_strike_3/i.test(p.pitch_result ?? '')).length;

  const pProv: ProvenanceRow[] = pitches;
  const metrics: DerivedMetric[] = [
    rateMetric(
      { metricKey: 'csw_rate', metricGroup: 'pitching', label: 'CSW%', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      calledStrikes + whiffs, seen, pProv,
    ),
    rateMetric(
      { metricKey: 'whiff_rate', metricGroup: 'pitching', label: 'Whiff Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      whiffs, swings, pProv,
    ),
    rateMetric(
      { metricKey: 'chase_rate', metricGroup: 'pitching', label: 'Chase Induced', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      chasesNum, outOfZone, pProv,
    ),
    rateMetric(
      { metricKey: 'strike_rate', metricGroup: 'pitching', label: 'Strike Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      strikes, seen, pProv,
    ),
    rateMetric(
      { metricKey: 'first_pitch_strike_rate', metricGroup: 'pitching', label: 'First-Pitch Strike', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      firstPitchStrikes, firstPitchSeen, pProv,
    ),
    rateMetric(
      { metricKey: 'putaway_rate', metricGroup: 'pitching', label: 'Putaway Rate', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      putaways, twoStrikeSeen, pProv,
    ),
    rateMetric(
      { metricKey: 'hard_hit_against_rate', metricGroup: 'pitching', label: 'Hard-Hit Against', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      hardHitAgainst, battedBalls.length, battedBalls,
    ),
    scalarMetric(
      { metricKey: 'k_per_100', metricGroup: 'pitching', label: 'K / 100 Pitches', unit: 'per9', higherIsBetter: true, threshold: RATE_THRESHOLD, fallbackContext },
      seen > 0 ? (kThrown / seen) * 100 : null, seen, pProv,
    ),
    scalarMetric(
      { metricKey: 'bb_per_100', metricGroup: 'pitching', label: 'BB / 100 Pitches', unit: 'per9', higherIsBetter: false, threshold: RATE_THRESHOLD, fallbackContext },
      seen > 0 ? (bbThrown / seen) * 100 : null, seen, pProv,
    ),
    scalarMetric(
      { metricKey: 'avg_velocity', metricGroup: 'pitching', label: 'Avg Velocity', unit: 'mph', higherIsBetter: true, threshold: SCALAR_THRESHOLD, fallbackContext },
      avgOf(pitches.map((p) => p.velocity)), pitches.filter((p) => p.velocity != null).length, pProv,
    ),
  ];

  return {
    playerId,
    metrics,
    visuals: {
      pitchShape,
      commandZone,
      commandVectors,
      commandTotalPitches: commandLocated,
      release,
      veloDecay,
      pitchMix,
    },
  };
}

function avgOf(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// =============================================================================
// getEliteStatEvents — the staff-gated team/player elite-event read model.
// =============================================================================

const EMPTY_SUMMARY = {
  pitchEvents: 0,
  battedBallEvents: 0,
  swingEvents: 0,
  plateAppearances: 0,
  playersWithEventData: 0,
};

export async function getEliteStatEvents(
  teamId: string,
  options: EliteStatEventsOptions = {},
): Promise<EliteStatEventsReadModel> {
  const contexts = options.contexts && options.contexts.length > 0
    ? options.contexts
    : DEFAULT_CONTEXTS;

  const base = (authorized: boolean, error: string | null): EliteStatEventsReadModel => ({
    teamId,
    authorized,
    contexts,
    hitters: [],
    pitchers: [],
    summary: { ...EMPTY_SUMMARY },
    error,
  });

  if (!teamId) return base(false, 'A team id is required.');

  // STAFF GATE — can_manage_stats (mirrors postgame / practice-effectiveness).
  const allowed = await hasBaseballCapability(teamId, 'can_manage_stats');
  if (!allowed) return base(false, null);

  const supabase = await createClient();

  // ---- Pull pitch + batted-ball events scoped to team + context (+ window). ----
  // The 3 event-grain tables carry the supersede columns (GAP 5); a corrected
  // import inserts a new CURRENT row and marks the prior one superseded, so reads
  // must show only the current value. baseball_plate_appearances does not carry
  // the columns, so the filter is applied per-table.
  const SUPERSEDE_TABLES = new Set([
    'baseball_pitch_events',
    'baseball_batted_ball_events',
    'baseball_swing_events',
  ]);
  const buildQuery = (table: string) => {
    let q = fromUntyped(supabase, table)
      .select('*')
      .eq('team_id', teamId)
      .in('data_context', contexts);
    if (SUPERSEDE_TABLES.has(table)) q = q.is('superseded_by_run_id', null);
    if (options.fromDate) q = q.gte('measured_at', options.fromDate);
    if (options.toDate) q = q.lte('measured_at', options.toDate);
    return q;
  };

  const [pitchRes, bbRes, swingRes, paRes] = await Promise.all([
    options.playerId
      ? buildQuery('baseball_pitch_events')
          .or(`batter_id.eq.${options.playerId},pitcher_id.eq.${options.playerId}`)
      : buildQuery('baseball_pitch_events'),
    options.playerId
      ? buildQuery('baseball_batted_ball_events')
          .or(`batter_id.eq.${options.playerId},pitcher_id.eq.${options.playerId}`)
      : buildQuery('baseball_batted_ball_events'),
    options.playerId
      ? buildQuery('baseball_swing_events').eq('player_id', options.playerId)
      : buildQuery('baseball_swing_events'),
    options.playerId
      ? buildQuery('baseball_plate_appearances')
          .or(`batter_id.eq.${options.playerId},pitcher_id.eq.${options.playerId}`)
      : buildQuery('baseball_plate_appearances'),
  ]);

  let error: string | null = null;
  if (pitchRes.error || bbRes.error || swingRes.error || paRes.error) {
    error = 'Some event data could not be loaded; metrics may be incomplete.';
  }

  const pitchEvents = (pitchRes.data ?? []) as BaseballPitchEvent[];
  const battedBalls = (bbRes.data ?? []) as BaseballBattedBallEvent[];
  const swingEvents = (swingRes.data ?? []) as BaseballSwingEvent[];
  const plateApps = (paRes.data ?? []) as BaseballPlateAppearance[];

  const fallbackContext = contexts[0] ?? 'official_game';

  // ---- Group pitch/BBE by the player on each side. ----
  const hitterPitches = new Map<string, BaseballPitchEvent[]>();
  const pitcherPitches = new Map<string, BaseballPitchEvent[]>();
  for (const p of pitchEvents) {
    if (p.batter_id) push(hitterPitches, p.batter_id, p);
    if (p.pitcher_id) push(pitcherPitches, p.pitcher_id, p);
  }
  const hitterBBE = new Map<string, BaseballBattedBallEvent[]>();
  const pitcherBBE = new Map<string, BaseballBattedBallEvent[]>();
  for (const bb of battedBalls) {
    if (bb.batter_id) push(hitterBBE, bb.batter_id, bb);
    if (bb.pitcher_id) push(pitcherBBE, bb.pitcher_id, bb);
  }

  const hitterIds = new Set<string>([...hitterPitches.keys(), ...hitterBBE.keys()]);
  const pitcherIds = new Set<string>([...pitcherPitches.keys(), ...pitcherBBE.keys()]);

  const hitters: HitterEliteMetrics[] = [...hitterIds].map((pid) =>
    buildHitterMetrics(pid, hitterPitches.get(pid) ?? [], hitterBBE.get(pid) ?? [], fallbackContext),
  );
  const pitchers: PitcherEliteMetrics[] = [...pitcherIds].map((pid) =>
    buildPitcherMetrics(pid, pitcherPitches.get(pid) ?? [], pitcherBBE.get(pid) ?? [], fallbackContext),
  );

  const playersWithEventData = new Set<string>([...hitterIds, ...pitcherIds]).size;

  return {
    teamId,
    authorized: true,
    contexts,
    hitters,
    pitchers,
    summary: {
      pitchEvents: pitchEvents.length,
      battedBallEvents: battedBalls.length,
      swingEvents: swingEvents.length,
      plateAppearances: plateApps.length,
      playersWithEventData,
    },
    error,
  };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

// -----------------------------------------------------------------------------
// Adapter: EliteStatEventsReadModel -> StatVisualsData (the prop the mountable
// <StatVisualsSection> gallery consumes on Stats Center + player profile). This
// is the seam the gallery's own comment promised ("lights up automatically as a
// read model starts passing chart inputs through `data`").
//
// For TEAM scope we aggregate every hitter's/pitcher's point payloads into one
// team-wide gallery (the v10 Stats Lab team view); for PLAYER scope we pass that
// single player's payloads through. Zone/count payloads are per-player, so the
// team view shows the LEADING contributor's zone grid with an honest total — the
// gallery's frame surfaces the sample, never a fabricated blended heatmap.
// -----------------------------------------------------------------------------

/** Build a StatVisualsData payload from the read model (player or team scope). */
export function toStatVisualsData(
  model: EliteStatEventsReadModel,
  opts: { playerId?: string | null } = {},
): {
  evLa: EvLaPoint[];
  spray: SprayPoint[];
  zoneCells: ZoneCell[];
  zoneTotalPitches: number;
  zoneMetric: 'chase';
  countLadder: CountLadderRow[];
  pitchShape: PitchShapePoint[];
  command: MissVector[];
  commandTotalPitches: number;
  release: ReleasePoint[];
  decaySegments: DecayPoint[];
  decayOutings: number;
  pitchMix: PitchMixRow[];
} {
  if (opts.playerId) {
    const h = model.hitters.find((x) => x.playerId === opts.playerId);
    const p = model.pitchers.find((x) => x.playerId === opts.playerId);
    return {
      evLa: h?.visuals.evLaPoints ?? [],
      spray: h?.visuals.sprayPoints ?? [],
      zoneCells: h?.visuals.chaseZone ?? [],
      zoneTotalPitches: (h?.visuals.chaseZone ?? []).reduce((s, c) => s + c.pitches, 0),
      zoneMetric: 'chase',
      countLadder: h?.visuals.countLadder ?? [],
      pitchShape: p?.visuals.pitchShape ?? [],
      command: p?.visuals.commandVectors ?? [],
      commandTotalPitches: p?.visuals.commandTotalPitches ?? 0,
      release: p?.visuals.release ?? [],
      decaySegments: p?.visuals.veloDecay ?? [],
      decayOutings: p?.visuals.veloDecay.length ?? 0,
      pitchMix: p?.visuals.pitchMix ?? [],
    };
  }

  // Team scope: concat point payloads (scatter/spray are point clouds), and take
  // the highest-sample hitter's/pitcher's zone + ladder + decay so the grid is
  // real (not an average of averages).
  const evLa = model.hitters.flatMap((h) => h.visuals.evLaPoints);
  const spray = model.hitters.flatMap((h) => h.visuals.sprayPoints);
  const pitchShape = model.pitchers.flatMap((p) => p.visuals.pitchShape);
  const command = model.pitchers.flatMap((p) => p.visuals.commandVectors);
  const release = model.pitchers.flatMap((p) => p.visuals.release);

  const leadHitter = [...model.hitters].sort(
    (a, b) =>
      b.visuals.chaseZone.reduce((s, c) => s + c.pitches, 0) -
      a.visuals.chaseZone.reduce((s, c) => s + c.pitches, 0),
  )[0];
  const leadPitcher = [...model.pitchers].sort(
    (a, b) =>
      b.visuals.commandZone.reduce((s, c) => s + c.pitches, 0) -
      a.visuals.commandZone.reduce((s, c) => s + c.pitches, 0),
  )[0];

  return {
    evLa,
    spray,
    zoneCells: leadHitter?.visuals.chaseZone ?? [],
    zoneTotalPitches: (leadHitter?.visuals.chaseZone ?? []).reduce((s, c) => s + c.pitches, 0),
    zoneMetric: 'chase',
    countLadder: leadHitter?.visuals.countLadder ?? [],
    pitchShape,
    command,
    commandTotalPitches: command.length,
    release,
    decaySegments: leadPitcher?.visuals.veloDecay ?? [],
    decayOutings: leadPitcher?.visuals.veloDecay.length ?? 0,
    pitchMix: leadPitcher?.visuals.pitchMix ?? [],
  };
}

// -----------------------------------------------------------------------------
// Game-vs-cage gap — pair a player's OFFICIAL-context hitting metrics against
// their DEVELOPMENT-context (cage/practice/sensor) metrics so a coach sees the
// "translation gap" the v10 §"Game Vs Practice Contact Gap" visual needs. Returns
// honest paired rows (null + sample on each side; the visual gates thin samples).
// -----------------------------------------------------------------------------

export interface GameVsCageRow {
  metricKey: string;
  label: string;
  higherIsBetter: boolean;
  gameValue: number | null;
  gameSample: number;
  gameConfidence: BaseballMetricConfidence;
  cageValue: number | null;
  cageSample: number;
  cageConfidence: BaseballMetricConfidence;
}

export interface GameVsCageReadModel {
  authorized: boolean;
  playerId: string;
  rows: GameVsCageRow[];
  error: string | null;
}

export async function getGameVsCageGap(
  teamId: string,
  playerId: string,
): Promise<GameVsCageReadModel> {
  if (!teamId || !playerId) {
    return { authorized: false, playerId, rows: [], error: 'team + player required.' };
  }
  const allowed = await hasBaseballCapability(teamId, 'can_manage_stats');
  if (!allowed) return { authorized: false, playerId, rows: [], error: null };

  const [gameModel, cageModel] = await Promise.all([
    getEliteStatEvents(teamId, { playerId, contexts: DEFAULT_CONTEXTS }),
    getEliteStatEvents(teamId, { playerId, contexts: DEV_CONTEXTS }),
  ]);

  const gameHitter = gameModel.hitters.find((h) => h.playerId === playerId);
  const cageHitter = cageModel.hitters.find((h) => h.playerId === playerId);

  // The metrics that meaningfully translate cage→game (v10 contact-gap set).
  const PAIR_KEYS = new Set([
    'avg_exit_velocity', 'hard_hit_rate', 'barrel_rate', 'sweet_spot_rate',
    'whiff_rate', 'chase_rate', 'zone_contact_rate', 'avg_launch_angle',
  ]);

  const byKey = (m: HitterEliteMetrics | undefined) =>
    new Map((m?.metrics ?? []).filter((x) => PAIR_KEYS.has(x.metricKey)).map((x) => [x.metricKey, x]));
  const gMap = byKey(gameHitter);
  const cMap = byKey(cageHitter);

  const keys = [...PAIR_KEYS];
  const rows: GameVsCageRow[] = keys
    .map((key) => {
      const g = gMap.get(key);
      const c = cMap.get(key);
      const ref = g ?? c;
      if (!ref) return null;
      return {
        metricKey: key,
        label: ref.label,
        higherIsBetter: ref.higherIsBetter,
        gameValue: g?.value ?? null,
        gameSample: g?.sampleSize ?? 0,
        gameConfidence: g?.confidence ?? 'insufficient',
        cageValue: c?.value ?? null,
        cageSample: c?.sampleSize ?? 0,
        cageConfidence: c?.confidence ?? 'insufficient',
      } satisfies GameVsCageRow;
    })
    .filter((x): x is GameVsCageRow => x !== null);

  return {
    authorized: true,
    playerId,
    rows,
    error: gameModel.error ?? cageModel.error,
  };
}
