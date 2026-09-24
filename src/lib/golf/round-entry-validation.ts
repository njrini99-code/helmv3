/**
 * Round-entry plausibility rules — ONE pure module shared by the live shot
 * entry panel (client, FairwayShotEntry) and the round submit server action
 * (golf.ts `submitGolfRoundComprehensive`).
 *
 * Why this exists: a real round (2026-09-17) was saved with 18 holes, 37
 * strokes and SG +34.51 — tee shots from full yardage "landing on the green"
 * and one-putts on every hole. Every individual field passed Zod's range
 * checks; nothing asked whether the round as a whole was physically possible.
 *
 * Two severities:
 *   - `block`   — impossible. The client disables the primary action with the
 *                 message at the field; the server rejects the payload.
 *   - `confirm` — merely unusual. The client asks the player to confirm once;
 *                 the server accepts it (it cannot know the player confirmed,
 *                 and refusing a real 390-yard drive would lose a real round).
 *
 * No React, no Supabase, no Next imports — safe on both sides of the bundle.
 */

import { minPlausibleStrokes } from './round-countable';

/** Minimal shot shape the rules read. `ShotRecord` satisfies it. */
export interface ValidatableShot {
  shotNumber: number;
  shotType: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
  distanceToHoleBefore: number;
  distanceUnitBefore: 'yards' | 'feet';
  result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';
  distanceToHoleAfter: number;
  distanceUnitAfter: 'yards' | 'feet';
  isPenalty: boolean;
  lieBefore?: string;
  missDirection?: string | null;
  approachMissDirection?: string | null;
  puttMissTags?: readonly string[] | null;
}

export interface ValidatableHole {
  holeNumber: number;
  par: number;
  yardage?: number | null;
  score: number;
  putts: number;
  /** Penalty strokes as stored on the hole row (may be kept apart from shot records). */
  penaltyStrokes?: number | null;
  shots?: readonly ValidatableShot[] | null;
}

export type RoundEntrySeverity = 'block' | 'confirm';

export type RoundEntryRule =
  | 'score_out_of_range'
  | 'putts_exceed_score'
  | 'score_mismatch_shots'
  | 'putts_mismatch_shots'
  | 'distance_not_decreasing'
  | 'tee_shot_unreachable'
  | 'duplicate_hole'
  | 'round_total_implausible'
  | 'shot_start_mismatch'
  | 'tee_shot_unjudgeable'
  | 'hole_count_invalid'
  | 'holes_not_sequential'
  | 'holes_played_mismatch';

export interface RoundEntryIssue {
  rule: RoundEntryRule;
  severity: RoundEntrySeverity;
  /** Human copy, shown to the player verbatim. */
  message: string;
  holeNumber?: number;
  shotNumber?: number;
}

// ── Thresholds ──────────────────────────────────────────────────────────────

/** A putt is always in feet; nothing on a green is further than this. */
export const PUTT_DISTANCE_MAX_FEET = 150;

/**
 * Hole score cap: par + 10, but never below the live tracker's existing
 * 15-stroke cap (FairwayShotEntry "Maximum recordable score (15)") so a hole
 * the tracker accepts is never refused at submit.
 */
export const LIVE_TRACKER_MAX_STROKES = 15;
export function maxHoleScore(par: number): number {
  return Math.max(par + 10, LIVE_TRACKER_MAX_STROKES);
}

/** A tee shot finishing on (or in) a par-4/5 green beyond this asks to confirm. */
export const TEE_TO_GREEN_CONFIRM_YARDS = 400;
/**
 * …and beyond this it is refused outright. The longest drives ever measured in
 * competition are ~500 yards with extreme roll; a green further away than that
 * was not reached from the tee.
 */
export const TEE_TO_GREEN_BLOCK_YARDS = 500;

/**
 * A shot should start where the previous one finished. Beyond this gap the
 * player is asked to confirm (a mistyped distance, or a shot that was never
 * entered). Not a block: GPS-free entry is approximate by nature.
 */
export const SHOT_CONTINUITY_TOLERANCE_YARDS = 5;

/*
 * Round-total floor: `minPlausibleStrokes` from ./round-countable — the SAME
 * rule that decides whether a stored round feeds player-facing stats (50
 * strokes per 18 holes, scaled per hole, and never fewer than holes + putts).
 * Refusing at submit exactly what the stats layer would exclude keeps the two
 * from drifting.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a putt distance to the realistic 0–150 ft window; non-finite → null. */
export function clampPuttDistanceFeet(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), PUTT_DISTANCE_MAX_FEET);
}

function toYards(value: number, unit: 'yards' | 'feet'): number {
  return unit === 'feet' ? value / 3 : value;
}

function isRecoveryOrLongMiss(shot: ValidatableShot): boolean {
  if (shot.result === 'other' || shot.lieBefore === 'other') return true;
  const tags = [shot.missDirection, shot.approachMissDirection, ...(shot.puttMissTags ?? [])];
  return tags.some((t) => typeof t === 'string' && t.includes('long'));
}

type CountableShot = Pick<ValidatableShot, 'shotType' | 'result' | 'isPenalty'>;

/**
 * Score, putts and penalty strokes from a hole's shot records — the ONE
 * definition (RE-V4). `calculateHoleStats` (shot-helpers) and the validator
 * both read it, so the tracker and the submit gate can never count a hole
 * differently. A `result: 'penalty'` shot without its own penalty record still
 * costs a stroke: that stroke is added back.
 */
export function deriveHoleCounts(shots: readonly CountableShot[]): { score: number; putts: number; penalties: number } {
  const penaltyRecords = shots.filter((s) => s.isPenalty).length;
  const penaltyResults = shots.filter((s) => s.result === 'penalty' && !s.isPenalty).length;
  const missingPenalties = Math.max(0, penaltyResults - penaltyRecords);
  return {
    score: shots.length + missingPenalties,
    putts: shots.filter((s) => s.shotType === 'putting').length,
    penalties: penaltyRecords + missingPenalties,
  };
}

/** Score and putts as the tracker derives them (see deriveHoleCounts). */
export function deriveScoreAndPutts(shots: readonly CountableShot[]): { score: number; putts: number } {
  const { score, putts } = deriveHoleCounts(shots);
  return { score, putts };
}

function isPenaltyShot(shot: ValidatableShot): boolean {
  return shot.isPenalty || shot.shotType === 'penalty' || shot.result === 'penalty';
}

// ── Shot-level rules ────────────────────────────────────────────────────────

/**
 * Rules for ONE shot in the context of its hole. The live entry panel runs
 * this on the shot being entered; the server runs it on every shot.
 */
export function validateShot(
  shot: ValidatableShot,
  hole: { holeNumber: number; par: number; yardage?: number | null },
): RoundEntryIssue[] {
  const issues: RoundEntryIssue[] = [];
  if (shot.isPenalty || shot.shotType === 'penalty' || shot.result === 'penalty') return issues;

  const beforeYards = toYards(shot.distanceToHoleBefore, shot.distanceUnitBefore);

  // Tee shot onto / into a par-4/5 green.
  if (
    shot.shotType === 'tee'
    && hole.par >= 4
    && (shot.result === 'green' || shot.result === 'hole')
  ) {
    const teeYards = beforeYards > 0 ? beforeYards : Number(hole.yardage ?? 0);
    const yds = Math.round(teeYards);
    const what = shot.result === 'hole' ? 'hole-in-one' : 'drive onto the green';
    if (!(teeYards > 0)) {
      // RE-V2: no tee distance AND no hole yardage — the reachability rule
      // has nothing to judge. Flag it for a confirm instead of passing silently.
      issues.push({
        rule: 'tee_shot_unjudgeable',
        severity: 'confirm',
        message: `Hole ${hole.holeNumber} has no yardage, so we can't check this ${what}. Tap to confirm.`,
        holeNumber: hole.holeNumber,
        shotNumber: shot.shotNumber,
      });
    } else if (teeYards > TEE_TO_GREEN_BLOCK_YARDS) {
      issues.push({
        rule: 'tee_shot_unreachable',
        severity: 'block',
        message: `A ${yds}-yard ${what} isn't possible. Check the result — did it finish in the fairway or rough?`,
        holeNumber: hole.holeNumber,
        shotNumber: shot.shotNumber,
      });
    } else if (teeYards > TEE_TO_GREEN_CONFIRM_YARDS) {
      issues.push({
        rule: 'tee_shot_unreachable',
        severity: 'confirm',
        message: `A ${yds}-yard ${what}? Tap to confirm.`,
        holeNumber: hole.holeNumber,
        shotNumber: shot.shotNumber,
      });
    }
  }

  // Remaining distance must go down, unless the shot was a recovery or went long.
  if (shot.result !== 'hole' && beforeYards > 0) {
    const afterYards = toYards(shot.distanceToHoleAfter, shot.distanceUnitAfter);
    if (afterYards >= beforeYards && !isRecoveryOrLongMiss(shot)) {
      const unit = shot.distanceUnitAfter === 'feet' ? 'ft' : 'yds';
      issues.push({
        rule: 'distance_not_decreasing',
        severity: 'confirm',
        message: `That leaves you further away (${Math.round(shot.distanceToHoleAfter)} ${unit}) than before the shot. Tap to confirm.`,
        holeNumber: hole.holeNumber,
        shotNumber: shot.shotNumber,
      });
    }
  }

  return issues;
}

// ── Hole-level rules ────────────────────────────────────────────────────────

export function validateHoleTotals(hole: Pick<ValidatableHole, 'holeNumber' | 'par' | 'score' | 'putts'>): RoundEntryIssue[] {
  const issues: RoundEntryIssue[] = [];
  const max = maxHoleScore(hole.par);
  if (!Number.isInteger(hole.score) || hole.score < 1 || hole.score > max) {
    issues.push({
      rule: 'score_out_of_range',
      severity: 'block',
      message: `Hole ${hole.holeNumber}: a score must be between 1 and ${max}.`,
      holeNumber: hole.holeNumber,
    });
    return issues;
  }
  // At least one stroke (the tee shot) is never a putt, so putts ≤ score − 1.
  // A hole-out from off the green is putts = 0, which this allows.
  if (hole.putts < 0 || hole.putts > hole.score - 1) {
    issues.push({
      rule: 'putts_exceed_score',
      severity: 'block',
      message: `Hole ${hole.holeNumber}: ${hole.putts} putt${hole.putts === 1 ? '' : 's'} can't fit in a score of ${hole.score} — the tee shot isn't a putt.`,
      holeNumber: hole.holeNumber,
    });
  }
  return issues;
}

/**
 * When a hole carries a complete shot chain, its score and putts must be the
 * ones those shots describe — a payload cannot claim a score its own shots contradict.
 *
 * Two representations of penalties are both legitimate and both accepted:
 * the live tracker's (penalty records are shots, so score = shots.length plus
 * any `result: 'penalty'` stroke without its record — calculateHoleStats), and
 * the hole row's (non-penalty shots + `penaltyStrokes` stored separately).
 */
export function validateHoleShotConsistency(hole: ValidatableHole): RoundEntryIssue[] {
  const shots = hole.shots ?? [];
  // Only a COMPLETE chain (it ends in a holed shot) describes the whole hole.
  // A partial chain — legacy rows, a continued round whose shot rows were
  // lost, a hole the player scored without tracking every shot — cannot
  // contradict the score, so it is not cross-checked here.
  if (!shots.some((s) => s.result === 'hole')) return [];
  const issues: RoundEntryIssue[] = [];
  const derived = deriveScoreAndPutts(shots);
  const fromRow = shots.filter((s) => !s.isPenalty).length + Math.max(0, hole.penaltyStrokes ?? 0);
  if (hole.score !== derived.score && hole.score !== fromRow) {
    issues.push({
      rule: 'score_mismatch_shots',
      severity: 'block',
      message: `Hole ${hole.holeNumber}: the score (${hole.score}) doesn't match the ${derived.score} shot${derived.score === 1 ? '' : 's'} recorded. Open the hole and check its shots.`,
      holeNumber: hole.holeNumber,
    });
  }
  if (hole.putts !== derived.putts) {
    issues.push({
      rule: 'putts_mismatch_shots',
      severity: 'block',
      message: `Hole ${hole.holeNumber}: ${hole.putts} putt${hole.putts === 1 ? '' : 's'} entered, but ${derived.putts} putting shot${derived.putts === 1 ? '' : 's'} recorded. Open the hole and check its shots.`,
      holeNumber: hole.holeNumber,
    });
  }
  return issues;
}

/**
 * Each shot should start where the previous one finished (±5 yd, feet
 * converted). Skipped across a penalty — a drop or a re-tee legitimately moves
 * the ball — and wherever either distance is unknown (0). `confirm` only.
 */
export function validateShotContinuity(
  shots: readonly ValidatableShot[],
  hole: { holeNumber: number },
): RoundEntryIssue[] {
  const issues: RoundEntryIssue[] = [];
  const ordered = [...shots].sort((a, b) => a.shotNumber - b.shotNumber);
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    if (isPenaltyShot(prev) || isPenaltyShot(cur) || prev.result === 'hole') continue;
    if (!(prev.distanceToHoleAfter > 0) || !(cur.distanceToHoleBefore > 0)) continue;
    const ended = toYards(prev.distanceToHoleAfter, prev.distanceUnitAfter);
    const starts = toYards(cur.distanceToHoleBefore, cur.distanceUnitBefore);
    if (Math.abs(ended - starts) > SHOT_CONTINUITY_TOLERANCE_YARDS) {
      const unit = cur.distanceUnitBefore === 'feet' ? 'ft' : 'yds';
      const prevUnit = prev.distanceUnitAfter === 'feet' ? 'ft' : 'yds';
      issues.push({
        rule: 'shot_start_mismatch',
        severity: 'confirm',
        message: `Shot ${cur.shotNumber} starts at ${Math.round(cur.distanceToHoleBefore)} ${unit}, but shot ${prev.shotNumber} finished at ${Math.round(prev.distanceToHoleAfter)} ${prevUnit}. Tap to confirm.`,
        holeNumber: hole.holeNumber,
        shotNumber: cur.shotNumber,
      });
    }
  }
  return issues;
}

export function validateHole(hole: ValidatableHole): RoundEntryIssue[] {
  const issues = validateHoleTotals(hole);
  issues.push(...validateHoleShotConsistency(hole));
  for (const shot of hole.shots ?? []) issues.push(...validateShot(shot, hole));
  issues.push(...validateShotContinuity(hole.shots ?? [], hole));
  return issues;
}

/**
 * A finished round is exactly 9 or 18 holes, numbered as one contiguous run:
 * 1–18, or a nine (1–9 or 10–18 — the setup's back-nine option keeps the
 * course's real hole numbers). Only for a COMPLETED round; a partial save is
 * a round in progress and is never held to this.
 */
export function validateHoleSequence(holeNumbers: readonly number[]): RoundEntryIssue[] {
  const distinct = [...new Set(holeNumbers)].sort((a, b) => a - b);
  const count = distinct.length;
  if (count !== 9 && count !== 18) {
    return [{
      rule: 'hole_count_invalid',
      severity: 'block',
      message: `A finished round is 9 or 18 holes — this one has ${count}. Finish the remaining holes, or save the round for later.`,
    }];
  }
  const first = distinct[0]!;
  const contiguous = distinct.every((n, i) => n === first + i);
  const validStart = count === 18 ? first === 1 : first === 1 || first === 10;
  if (!contiguous || !validStart) {
    return [{
      rule: 'holes_not_sequential',
      severity: 'block',
      message: count === 18
        ? 'An 18-hole round must include holes 1 through 18, each once.'
        : 'A 9-hole round must be holes 1–9 or 10–18, each once.',
    }];
  }
  return [];
}

/**
 * The finished round must have the hole count it was started with. A round
 * configured for 18 that arrives with 9 scored holes is not "a 9-hole round".
 */
export function validateHolesPlayed(holesPlayed: number, configuredHoles: number | null | undefined): RoundEntryIssue[] {
  if (configuredHoles !== 9 && configuredHoles !== 18) return [];
  if (holesPlayed === configuredHoles) return [];
  return [{
    rule: 'holes_played_mismatch',
    severity: 'block',
    message: `This round was started as ${configuredHoles} holes, but ${holesPlayed} ${holesPlayed === 1 ? 'hole was' : 'holes were'} submitted. Finish every hole before submitting.`,
  }];
}

/**
 * The per-hole rules for a round still in progress (savePartialRound): only
 * holes with a score AND putts are judged, only `block` issues matter, and the
 * 9/18 shape is never applied. The first blocking issue, or null.
 */
export function firstBlockingPartialHoleIssue(
  holes: readonly (Omit<ValidatableHole, 'score' | 'putts'> & { score?: number | null; putts?: number | null } | null | undefined)[],
): RoundEntryIssue | null {
  for (const hole of holes) {
    if (!hole || hole.score == null || hole.putts == null) continue;
    const blocking = validateHole({ ...hole, score: hole.score, putts: hole.putts })
      .find((i) => i.severity === 'block');
    if (blocking) return blocking;
  }
  return null;
}

// ── Round-level rules ───────────────────────────────────────────────────────

export interface RoundEntryValidation {
  issues: RoundEntryIssue[];
  blocking: RoundEntryIssue[];
  /** Distinct hole numbers among the submitted rows — the only honest holes_played. */
  holesPlayed: number;
}

export interface RoundEntryOptions {
  /**
   * Hold the round to a finished round's shape: 9 or 18 holes, one contiguous
   * run (validateHoleSequence). The submit action sets this; nothing else does.
   */
  requireCompleteRound?: boolean;
  /** The hole count the round was started with (the in-progress row's holes_played). */
  configuredHoles?: number | null;
}

export function validateRoundEntry(
  holes: readonly ValidatableHole[],
  options: RoundEntryOptions = {},
): RoundEntryValidation {
  const issues: RoundEntryIssue[] = [];

  const seen = new Set<number>();
  for (const hole of holes) {
    if (seen.has(hole.holeNumber)) {
      issues.push({
        rule: 'duplicate_hole',
        severity: 'block',
        message: `Hole ${hole.holeNumber} appears more than once in this round.`,
        holeNumber: hole.holeNumber,
      });
    }
    seen.add(hole.holeNumber);
  }
  const holesPlayed = seen.size;

  if (options.requireCompleteRound) {
    issues.push(...validateHoleSequence(holes.map((h) => h.holeNumber)));
  }
  issues.push(...validateHolesPlayed(holesPlayed, options.configuredHoles));

  for (const hole of holes) issues.push(...validateHole(hole));

  const totalScore = holes.reduce((sum, h) => sum + h.score, 0);
  const totalPutts = holes.reduce((sum, h) => sum + h.putts, 0);
  const floor = minPlausibleStrokes(holesPlayed, totalPutts);
  if (holesPlayed > 0 && totalScore < floor) {
    issues.push({
      rule: 'round_total_implausible',
      severity: 'block',
      message: `A total of ${totalScore} over ${holesPlayed} holes isn't a possible round (the lowest we accept is ${floor}). Check each hole's shots before submitting.`,
    });
  }

  return { issues, blocking: issues.filter((i) => i.severity === 'block'), holesPlayed };
}
