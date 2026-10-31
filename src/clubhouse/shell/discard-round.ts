'use client';

import { deleteInProgressRound } from '@/app/golf/actions/round-partial';
import { deleteOfflineRound } from '@/lib/offline/indexed-db';
import { clearEmergencySave, markRoundDiscarded } from '@/lib/utils/emergency-save';

/**
 * Discard a round in progress from outside its scorecard (the Dock's Resume bar, owner 2026-10-31). The same steps as
 * the scorecard's own discard (use-continue-round-session handleDeleteRound): delete it on the server, then clear this
 * device's copy, mark it discarded so no other tab re-creates it, and drop any queued submit so it cannot sync back.
 * Returns the action's own message on failure ("already finished or removed" reads differently from a dropped
 * connection); nothing local is cleared then, because the round is still live.
 */
export async function discardRoundInProgress(roundId: string, playerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await deleteInProgressRound(roundId);
    if (result && 'success' in result && !result.success) return { ok: false, error: result.error || 'Try again.' };
  } catch {
    return { ok: false, error: 'Check your connection and try again.' };
  }
  clearEmergencySave(roundId, playerId);
  markRoundDiscarded(roundId, playerId);
  void Promise.resolve()
    .then(() => deleteOfflineRound(roundId))
    .catch(() => {});
  return { ok: true };
}
