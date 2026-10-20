/**
 * Checkpoint counter (CoachHelm Slice 3; 02-accuracy-standard.md §5
 * "Checkpoints", 04 §2 "Checkpoint", 07 §2 D).
 *
 * Rung changes (Cleared, Contradicted, archive) are evaluated only at a
 * checkpoint, so a read cannot flicker after every round:
 *
 *   player checkpoint  >= 3 new countable rounds since the last one. Every
 *                      read of the player is evaluated; the counter resets.
 *   family checkpoint  >= 20 new attempts in one shot family (a putt band,
 *                      an approach band, tee shots, bunker shots) before the
 *                      3-round mark. Only reads of that family are evaluated.
 *                      Each further 20 fires it again.
 *
 * Countable = `src/lib/golf/round-countable.ts` (`isCountableRound`) on
 * completed, non-test rounds: the same rule the CoachHelm loaders use
 * (`recent-players.ts`, `v3/goals/window-metric.ts`). The counter is
 * recomputed from the rounds after the last checkpoint round each night, so
 * the stored `attempts_since` is only needed to tell whether a family crossed
 * another multiple of 20 since the previous night.
 *
 * Pure: data in, decision out.
 */
import { PUTT_BAND_BY_METRIC, puttInBand, type PuttBand } from '@/lib/coachhelm/v3/engine/recent-recheck';

/**
 * The approach band rule of `bucketApproachDistance`
 * (`v3/engine/shot-source.ts`, the `approach_miss` generator's buckets),
 * repeated here because that module is server-only (it holds the loaders).
 * Keep the two in step.
 */
function approachBucket(distance: number, unit: string | null): '50_125ft' | '125_175ft' | '175_plus_ft' | null {
  const yards = unit === 'feet' ? distance / 3 : distance;
  if (yards >= 50 && yards < 125) return '50_125ft';
  if (yards >= 125 && yards < 175) return '125_175ft';
  if (yards >= 175) return '175_plus_ft';
  return null;
}

export const CHECKPOINT_MIN_ROUNDS = 3;
export const CHECKPOINT_MIN_ATTEMPTS = 20;

/** Shot families with an attempt counter. */
export type ShotFamily =
  | 'putt_3_5ft'
  | 'putt_5_10ft'
  | 'putt_10_15ft'
  | 'putt_15_25ft'
  | 'putt_25_plus_ft'
  | 'approach_50_125'
  | 'approach_125_175'
  | 'approach_175_plus'
  | 'tee_shot'
  | 'sand';

export const SHOT_FAMILIES: readonly ShotFamily[] = [
  'putt_3_5ft',
  'putt_5_10ft',
  'putt_10_15ft',
  'putt_15_25ft',
  'putt_25_plus_ft',
  'approach_50_125',
  'approach_125_175',
  'approach_175_plus',
  'tee_shot',
  'sand',
];

const PUTT_FAMILY_BY_METRIC: Readonly<Record<string, ShotFamily>> = {
  putts_made_3_5ft_pct: 'putt_3_5ft',
  putts_made_5_10ft_pct: 'putt_5_10ft',
  putts_made_10_15ft_pct: 'putt_10_15ft',
  putts_made_15_25ft_pct: 'putt_15_25ft',
  putts_made_25_plus_ft_pct: 'putt_25_plus_ft',
};

const PUTT_BANDS: ReadonlyArray<[ShotFamily, PuttBand]> = Object.entries(PUTT_FAMILY_BY_METRIC).map(
  ([metric, family]) => [family, PUTT_BAND_BY_METRIC[metric]!],
);

const APPROACH_FAMILY: Readonly<Record<string, ShotFamily>> = {
  '50_125ft': 'approach_50_125',
  '125_175ft': 'approach_125_175',
  '175_plus_ft': 'approach_175_plus',
};

/** The shot family a read belongs to, or null for round-only families. */
export function familyForMetric(metric: string | null | undefined): ShotFamily | null {
  if (!metric) return null;
  const putt = PUTT_FAMILY_BY_METRIC[metric];
  if (putt) return putt;
  const approach = /^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/.exec(metric);
  if (approach) return APPROACH_FAMILY[approach[1]!] ?? null;
  if (metric === 'sg_ott') return 'tee_shot';
  if (metric === 'scrambling_pct_sand') return 'sand';
  return null;
}

export interface CheckpointShot {
  round_id: string;
  shot_type: string | null;
  lie_before: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  result: string | null;
  putt_made: boolean | null;
}

/** The family (at most one) a shot counts toward. */
export function familyForShot(shot: CheckpointShot): ShotFamily | null {
  const type = (shot.shot_type ?? '').toLowerCase();
  if (type === 'putting') {
    for (const [family, band] of PUTT_BANDS) {
      if (puttInBand({ round_id: shot.round_id, distance_to_hole_before: shot.distance_to_hole_before, result: shot.result, putt_made: shot.putt_made }, band)) {
        return family;
      }
    }
    return null;
  }
  if (type === 'tee') return 'tee_shot';
  if (type === 'around_green' && shot.lie_before === 'sand') return 'sand';
  if (type === 'approach' && shot.distance_to_hole_before !== null && Number.isFinite(shot.distance_to_hole_before)) {
    const bucket = approachBucket(Number(shot.distance_to_hole_before), shot.distance_unit_before);
    return bucket ? (APPROACH_FAMILY[bucket] ?? null) : null;
  }
  return null;
}

export type AttemptCounts = Partial<Record<ShotFamily, number>>;

export function countAttempts(shots: readonly CheckpointShot[], roundIds: ReadonlySet<string>): AttemptCounts {
  const out: AttemptCounts = {};
  for (const s of shots) {
    if (!roundIds.has(s.round_id)) continue;
    const f = familyForShot(s);
    if (f) out[f] = (out[f] ?? 0) + 1;
  }
  return out;
}

/** `golf_coachhelm_player_state` as the job reads and writes it. */
export interface PlayerCheckpointState {
  last_checkpoint_round_id: string | null;
  last_checkpoint_at: string | null;
  checkpoint_count: number;
  rounds_since: number;
  attempts_since: AttemptCounts;
}

/** A countable round, newest first, in the order the counter uses. */
export interface CheckpointRound {
  id: string;
  round_date: string;
  created_at: string | null;
}

export type CheckpointDecision =
  | {
      kind: 'baseline';
      /** No anchor yet (or it was deleted): set it, evaluate nothing. */
      next: PlayerCheckpointState;
    }
  | {
      kind: 'player';
      /** >= 3 rounds: every family. */
      next: PlayerCheckpointState;
      roundsSince: number;
    }
  | {
      kind: 'families';
      /** Families that crossed another multiple of 20; may be empty. */
      families: ShotFamily[];
      next: PlayerCheckpointState;
      roundsSince: number;
    };

/** True for a checkpoint that evaluates reads of `family` (null = round-only). */
export function checkpointCovers(decision: CheckpointDecision, family: ShotFamily | null): boolean {
  if (decision.kind === 'player') return true;
  if (decision.kind === 'baseline') return false;
  return family !== null && decision.families.includes(family);
}

export function anyCheckpoint(decision: CheckpointDecision): boolean {
  return decision.kind === 'player' || (decision.kind === 'families' && decision.families.length > 0);
}

/**
 * Decide tonight's checkpoint. `rounds` are the player's countable rounds,
 * newest first (round_date desc, created_at desc); `shots` cover at least the
 * rounds after the anchor.
 */
export function evaluateCheckpoint(
  prior: PlayerCheckpointState | null,
  rounds: readonly CheckpointRound[],
  shots: readonly CheckpointShot[],
  nowIso: string,
): CheckpointDecision {
  const newest = rounds[0] ?? null;
  const anchorIndex = prior?.last_checkpoint_round_id
    ? rounds.findIndex((r) => r.id === prior.last_checkpoint_round_id)
    : -1;

  if (!prior || anchorIndex < 0) {
    // First pass, or the anchor round is gone (deleted, or older than the
    // loaded rounds): anchor on the newest countable round, fire nothing.
    // With no countable round at all the anchor stays null and the next
    // night tries again.
    return {
      kind: 'baseline',
      next: {
        last_checkpoint_round_id: newest?.id ?? null,
        last_checkpoint_at: prior?.last_checkpoint_at ?? null,
        checkpoint_count: prior?.checkpoint_count ?? 0,
        rounds_since: 0,
        attempts_since: {},
      },
    };
  }

  const since = rounds.slice(0, anchorIndex);
  const roundsSince = since.length;
  if (roundsSince >= CHECKPOINT_MIN_ROUNDS) {
    return {
      kind: 'player',
      roundsSince,
      next: {
        last_checkpoint_round_id: newest!.id,
        last_checkpoint_at: nowIso,
        checkpoint_count: prior.checkpoint_count + 1,
        rounds_since: 0,
        attempts_since: {},
      },
    };
  }

  const attempts = countAttempts(shots, new Set(since.map((r) => r.id)));
  const families: ShotFamily[] = [];
  for (const f of SHOT_FAMILIES) {
    const now = attempts[f] ?? 0;
    const before = prior.attempts_since[f] ?? 0;
    if (Math.floor(now / CHECKPOINT_MIN_ATTEMPTS) > Math.floor(before / CHECKPOINT_MIN_ATTEMPTS)) {
      families.push(f);
    }
  }
  return {
    kind: 'families',
    families,
    roundsSince,
    next: {
      last_checkpoint_round_id: prior.last_checkpoint_round_id,
      last_checkpoint_at: families.length > 0 ? nowIso : prior.last_checkpoint_at,
      checkpoint_count: prior.checkpoint_count,
      rounds_since: roundsSince,
      attempts_since: attempts,
    },
  };
}

/** Parse a stored `attempts_since` defensively (unknown keys dropped). */
export function parseAttempts(raw: unknown): AttemptCounts {
  const out: AttemptCounts = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const f of SHOT_FAMILIES) {
    const v = (raw as Record<string, unknown>)[f];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[f] = v;
  }
  return out;
}
