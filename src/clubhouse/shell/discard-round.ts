'use client';

import { deleteInProgressRound } from '@/app/golf/actions/round-partial';
import { deleteOfflineRound } from '@/lib/offline/indexed-db';
import { clearEmergencySave, markRoundDiscarded } from '@/lib/utils/emergency-save';
import { OFFLINE_LINE } from '../ui/Retry';
import { chReport } from '../lib/track';

/**
 * Discard a round in progress from outside its scorecard (the Dock's Resume bar, owner 2026-10-31). The same steps as
 * the scorecard's own discard (use-continue-round-session handleDeleteRound): delete it on the server, then clear this
 * device's copy, mark it discarded so no other tab re-creates it, and drop any queued submit so it cannot sync back.
 * Returns the action's own message on failure (null when there is none, so the caller's hint stands) ("already finished or removed" reads differently from a dropped
 * connection); nothing local is cleared then, because the round is still live.
 */
export async function discardRoundInProgress(roundId: string, playerId: string): Promise<{ ok: true } | { ok: false; error: string | null }> {
  try {
    const result = await deleteInProgressRound(roundId);
    if (result && 'success' in result && !result.success) return { ok: false, error: result.error || null };
  } catch (err) {
    // Only an offline device gets the offline line; any other throw is not a guess at the cause (B10.3).
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    chReport(err, { surface: 'shell.resume', action: 'discardRound', severity: offline ? 'low' : 'high', extra: { roundId } });
    return { ok: false, error: offline ? OFFLINE_LINE : null };
  }
  clearEmergencySave(roundId, playerId);
  markRoundDiscarded(roundId, playerId);
  void Promise.resolve()
    .then(() => deleteOfflineRound(roundId))
    // The round is already marked discarded, so a copy left on this device cannot sync back; reported to find it.
    .catch((err: unknown) => chReport(err, { surface: 'shell.resume', action: 'deleteOfflineCopy', severity: 'low', extra: { roundId } }));
  return { ok: true };
}
