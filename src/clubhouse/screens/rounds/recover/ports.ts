'use client';

import {
  savePartialRound,
  submitGolfRoundComprehensive,
  type PartialRoundData,
} from '@/app/golf/actions/golf';
import { deleteOfflineRound, deleteOfflineRoundThrough } from '@/lib/offline/indexed-db';
import { clearRoundRecoverySnapshotThrough, deleteRoundRecoverySnapshot } from '@/lib/offline/shot-storage';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { clearEmergencySave, clearEmergencySaveThrough, markRoundDiscarded } from '@/lib/utils/emergency-save';
import { describeRoundWriteResult, isQualifierClosedError, writeRoundRecreatingIfMissing } from '@/lib/golf/round-missing-recovery';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { normalise, type ServerResult } from '../../../lib/use-action';
import { ROUNDS_LIBRARY } from '../entry/routes';
import { LIVE_ROUNDS_WRITES } from '../writes';
import { deleteLegacyRound, localKeyOf, scanDevice, scoredHoles, serverRoundIdOf, type ChDeviceCopy, type ChDeviceScan, type ChRecoverRound } from './scan';

/** Where a restore lands, and the words for the toast that says so. */
export interface ChRecoverLanding {
  href: string;
  done: string;
}

/** What a sync pass did, in the numbers the screen words. */
export interface ChSyncOutcome {
  /** Rounds the engine sent. */
  synced: number;
  /** A pass was already running, so this one did nothing and the running one will do the work. */
  declined: boolean;
}

/**
 * Everything the recovery screen reads and writes, so a test or the preview passes its own set (as the Rounds
 * library's `ChRoundsWrites`). The live set is Fairway's recovery flow and the round engines' own discard, unchanged:
 * one write path per behaviour.
 */
export interface ChRecoverPorts {
  scan(playerId: string): Promise<ChDeviceScan>;
  /** Writes the round to the server, then says where to open it. Clears the device copies only after the server confirms. */
  resume(round: ChRecoverRound, playerId: string): Promise<ServerResult<ChRecoverLanding>>;
  /** Asks the sync engine to send the queued and failed rounds again. */
  retrySync(): Promise<ServerResult<ChSyncOutcome>>;
  /** Deletes the round: the server's unfinished copy (when it has one) and every copy on this device. */
  discard(round: ChRecoverRound, playerId: string): Promise<ServerResult>;
}

/**
 * The discard action's refusal for a round the server holds in another state than unfinished (it was submitted, or
 * removed elsewhere). It deletes nothing, so the device copy is the only thing left to clear.
 */
const STALE_ROUND_REFUSAL = /can no longer be discarded/i;

/** The unfinished round a copy restores, as `savePartialRound` takes it. */
function partialRoundOf(copy: ChDeviceCopy, scored: HoleStats[]): PartialRoundData {
  const draft = copy.draftData;
  const inProgressShots = Object.entries(draft.inProgressShots ?? {})
    .filter(([, shots]) => Array.isArray(shots) && shots.length > 0)
    .map(([holeIndex, shots]) => {
      const index = Number(holeIndex);
      return { holeNumber: draft.holes[index]?.number ?? index + 1, shots: shots as ShotRecord[] };
    });
  const holesToPlay = draft.holes.length === 9 ? 9 : 18;
  return {
    courseName: draft.setupData.courseName,
    courseCity: draft.setupData.courseCity || undefined,
    courseState: draft.setupData.courseState || undefined,
    courseRating: draft.setupData.courseRating ? parseFloat(draft.setupData.courseRating) : undefined,
    courseSlope: draft.setupData.courseSlope ? parseInt(draft.setupData.courseSlope) : undefined,
    teesPlayed: draft.setupData.teesPlayed || undefined,
    roundType: draft.setupData.roundType,
    roundDate: draft.setupData.roundDate,
    qualifierId: draft.setupData.qualifierId || undefined,
    qualifierRoundNumber: draft.setupData.qualifierRoundNumber || undefined,
    currentHole: Math.max(1, Math.min(draft.currentHoleIndex + 1, holesToPlay)),
    holesToPlay,
    holes: scored,
    inProgressShots,
    holeConfigs: draft.holes.map((hole, index) => ({ holeNumber: hole.number ?? index + 1, par: hole.par, yardage: hole.yardage })),
  };
}

/** The server's answer for a round that is already submitted. The qualifier's own "already completed" refusal is not it (round-missing-recovery, C3). */
function isCompletedRoundError(message?: string): boolean {
  if (typeof message !== 'string' || isQualifierClosedError(message)) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('already been completed') || normalized.includes('already been submitted') || normalized.includes('may have already been completed');
}

/**
 * Clears the device copies of a round the server has now acknowledged, as Fairway's recovery does: each only through
 * the time it was written, so a newer save made while the request was in flight stays recoverable. Never throws: the
 * server has the round, so a copy left behind only shows up once more, and restoring it again is safe.
 */
async function clearAcknowledged(round: ChRecoverRound, playerId: string): Promise<void> {
  const through = round.primary.timestamp;
  for (const copy of round.copies) {
    const key = localKeyOf(copy);
    try {
      clearEmergencySaveThrough(key, playerId, through);
      if (copy.source === 'modern-indexeddb') await deleteOfflineRoundThrough(copy.id, through);
      else if (copy.source === 'recovery-cache') await clearRoundRecoverySnapshotThrough(key, playerId, through);
      else if (copy.source === 'legacy-indexeddb') await deleteLegacyRound(copy.id, through);
    } catch {
      // See above.
    }
  }
}

async function resume(round: ChRecoverRound, playerId: string): Promise<ServerResult<ChRecoverLanding>> {
  try {
    const copy = round.primary;
    const draft = copy.draftData;
    const scored = scoredHoles(copy);
    const roundId = serverRoundIdOf(copy);
    const partial = partialRoundOf(copy, scored);
    if (scored.length === 0 && (partial.inProgressShots?.length ?? 0) === 0) return { success: false, error: 'No shot data was found in this saved round.' };

    // A failed final submit is the only recovery that completes a round by itself. Any other copy, a first-hole shot
    // included, is restored as an unfinished round and opened to continue, so a golfer never loses partial work or
    // submits it by accident.
    if (!round.finished || !draft.terminalSubmission) {
      // `allowReuse` (A1): this screen exists to reconnect a real device copy to its server round, including when the
      // id is unknown (a copy that never reached the server). The default gate, which reuses an empty shell only,
      // would refuse the round being recovered. It goes on the first call alone; the re-create of a vanished id is a
      // create, never a reuse.
      const { result } = await writeRoundRecreatingIfMissing(savePartialRound, partial, roundId, { firstCallOptions: { allowReuse: true } });
      if (!result.success) return { success: false, error: describeRoundWriteResult(result) };
      await clearAcknowledged(round, playerId);
      return { success: true, data: { href: `${ROUNDS_LIBRARY}/continue/${result.data.roundId}`, done: 'Round progress restored' } };
    }

    // The exact payload of the failed submit. A vanished id is submitted as a new round in one call, never retried.
    const { result } = await writeRoundRecreatingIfMissing(submitGolfRoundComprehensive, draft.terminalSubmission, roundId);
    if (!result.success) {
      if (roundId && isCompletedRoundError(result.error)) {
        await clearAcknowledged(round, playerId);
        return { success: true, data: { href: `${ROUNDS_LIBRARY}/${roundId}`, done: 'This round was already submitted' } };
      }
      return { success: false, error: describeRoundWriteResult(result) };
    }
    await clearAcknowledged(round, playerId);
    return { success: true, data: { href: `${ROUNDS_LIBRARY}/${result.data.roundId}`, done: 'Round submitted' } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : undefined };
  }
}

/** Every copy of the round on this device, and the marks that keep another tab or the queue from bringing it back. */
async function clearDeviceCopies(round: ChRecoverRound, playerId: string): Promise<void> {
  for (const copy of round.copies) {
    // The sync drain skips a round marked discarded under `serverRoundId ?? id`; the round screens read the round's own id (R-4, R-10).
    const marks = new Set([serverRoundIdOf(copy), copy.source === 'modern-indexeddb' ? (copy.serverRoundId ?? copy.id) : undefined]);
    for (const mark of marks) if (mark) markRoundDiscarded(mark, playerId);
    const key = localKeyOf(copy);
    clearEmergencySave(key, playerId);
    if (copy.source === 'modern-indexeddb') await deleteOfflineRound(copy.id);
    else if (copy.source === 'recovery-cache') await deleteRoundRecoverySnapshot(key, playerId);
    else if (copy.source === 'legacy-indexeddb') await deleteLegacyRound(copy.id);
  }
}

async function discard(round: ChRecoverRound, playerId: string): Promise<ServerResult> {
  try {
    const roundId = round.roundId;
    if (roundId) {
      // The Library's discard, which is the round engines' own: the server's unfinished round goes, then the device copy,
      // the tombstone and the queued submit.
      const result = await LIVE_ROUNDS_WRITES.discard(roundId, playerId);
      if (!normalise(result).success && !STALE_ROUND_REFUSAL.test(result.error ?? '')) return result;
    }
    // A round only on this device has no server row to delete. One the server holds as submitted or already removed
    // refused above and deleted nothing, so the copies on this device are all that is left, and they are cleared the
    // same way. Either way every copy goes: clearing the one shown would let the next scan find another.
    await clearDeviceCopies(round, playerId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : undefined };
  }
}

async function retrySync(): Promise<ServerResult<ChSyncOutcome>> {
  try {
    const result = await getSyncEngine().retryFailed();
    // Declined is not failed: a pass is already running and will do this work.
    if (result.declined) return { success: true, data: { synced: 0, declined: true } };
    if (!result.success) return { success: false, error: result.errors[0] };
    return { success: true, data: { synced: result.syncedRounds, declined: false } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : undefined };
  }
}

export const LIVE_RECOVER_PORTS: ChRecoverPorts = {
  scan: (playerId) => scanDevice(playerId),
  resume,
  retrySync,
  discard,
};
