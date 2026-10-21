/**
 * CoachHelm supercharge Slice 8b: new data at entry time, behind
 * `coachhelm_data_prompts_v2` (OFF). Pure rules, no React, no Supabase.
 *
 * Recovery tap (`01-input-integrity.md` row 7, `03` §3.3): today a tee miss
 * carries its lie (rough, or 'other' for trees, hazard edges and waste) but
 * not whether the next shot was a recovery. The tee-miss-cost read prices a
 * blocked punch-out from the trees like an open shot from the rough. One tap
 * on the tee shot ("Clear shot" / "Blocked or punch out") records it as
 * `ShotRecord.lieAfterRecovery`, stored as `golf_shots.lie_after_recovery`.
 * It sits beside the lie, not in place of it: a new lie value would change
 * every strokes-gained lookup and lie-keyed stat that reads `lie_after`
 * today, and costing a recovery is an engine change of its own.
 *
 * Course nudge (`01` row 10): a round with no linked course cannot feed a
 * course plan, hole history or a same-day field adjustment. At the start of
 * the round (first hole, before the first shot) and on the finish summary,
 * one row offers the existing course picker.
 */

import type { ShotRecord } from '@/lib/types/golf';
import { normalizeStartHole } from '@/lib/golf/round-session/play-order';

export const DATA_PROMPTS_FLAG = 'coachhelm_data_prompts_v2';

/** Tee results after which the next shot may be a recovery. Sand is left
 *  out: a fairway bunker is its own lie and the sand reads already cost it. */
export const RECOVERY_ASK_RESULTS: ReadonlySet<ShotRecord['result']> = new Set(['rough', 'other']);

/** A tee shot that finished in the rough or an 'other' lie. */
export function isRecoveryCandidate(shot: Pick<ShotRecord, 'shotType' | 'isPenalty' | 'result'>): boolean {
  return shot.shotType === 'tee' && !shot.isPenalty && RECOVERY_ASK_RESULTS.has(shot.result);
}

/**
 * The tee shot to ask about on this hole, or null. Only while it is the last
 * shot recorded (the player is about to enter the next one, so the answer is
 * in front of them) and it has no answer yet.
 */
export function recoveryAskShot(history: readonly ShotRecord[]): ShotRecord | null {
  const last = history[history.length - 1];
  if (!last || !isRecoveryCandidate(last) || typeof last.lieAfterRecovery === 'boolean') return null;
  return last;
}

/**
 * The value stored for a shot: the answer on a candidate tee shot, null
 * otherwise. A tee shot edited to the fairway after it was tagged keeps the
 * stale answer in memory, but it is never written.
 */
export function lieAfterRecoveryFor(shot: Pick<ShotRecord, 'shotType' | 'isPenalty' | 'result' | 'lieAfterRecovery'>): boolean | null {
  return isRecoveryCandidate(shot) && typeof shot.lieAfterRecovery === 'boolean' ? shot.lieAfterRecovery : null;
}

/**
 * The round payload's extra key for one shot: `{ lie_after_recovery }` when
 * there is an answer, `{}` otherwise, so a round nobody was asked about sends
 * exactly the payload it sent before. The round RPCs read the key once the
 * held migration is applied; until then they ignore it.
 */
export function lieAfterRecoveryPayload(shot: Pick<ShotRecord, 'shotType' | 'isPenalty' | 'result' | 'lieAfterRecovery'>): { lie_after_recovery?: boolean } {
  const value = lieAfterRecoveryFor(shot);
  return value === null ? {} : { lie_after_recovery: value };
}

/**
 * The history with one candidate tee shot's answer set. Returns the same
 * array when there is no such shot (a stale tap after an undo changes
 * nothing).
 */
export function setLieAfterRecovery(history: ShotRecord[], shotNumber: number, recovery: boolean): ShotRecord[] {
  const idx = history.findIndex((s) => s.shotNumber === shotNumber && isRecoveryCandidate(s));
  if (idx === -1 || history[idx]!.lieAfterRecovery === recovery) return history;
  const next = [...history];
  next[idx] = { ...history[idx]!, lieAfterRecovery: recovery };
  return next;
}

/**
 * Reads the stored answer from a `golf_shots` row (Continue Round). The
 * generated row type does not carry the column until the held migration is
 * applied and types are regenerated, and before that the column is simply
 * absent from `select('*')`, which reads as "not asked".
 */
export function lieAfterRecoveryFromRow(row: object): boolean | undefined {
  const value = (row as { lie_after_recovery?: unknown }).lie_after_recovery;
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * The round-start moment for the course nudge: the first hole in play order,
 * no hole scored yet, no shot recorded on it.
 */
export function isRoundStartMoment(params: {
  holeScores: readonly (number | null | undefined)[];
  currentHoleIndex: number;
  startHole?: number;
  shotCount: number;
}): boolean {
  const { holeScores, currentHoleIndex, startHole = 1, shotCount } = params;
  const firstIndex = normalizeStartHole(startHole, holeScores.length) - 1;
  return shotCount === 0 && currentHoleIndex === firstIndex && holeScores.every((s) => s == null);
}

/**
 * A round payload shot without the recovery key, for the direct-table
 * fallbacks (used only when a round RPC is unavailable). Those write
 * golf_shots columns by name, and before the held migration the column does
 * not exist, so the key would fail the whole write; the answer is dropped on
 * that rare path rather than risk the round.
 */
export function withoutLieAfterRecovery<T extends { lie_after_recovery?: boolean }>(shot: T): Omit<T, 'lie_after_recovery'> {
  const { lie_after_recovery: _dropped, ...rest } = shot;
  return rest;
}
