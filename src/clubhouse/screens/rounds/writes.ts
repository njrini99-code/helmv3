'use client';

import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { deleteOfflineRound } from '@/lib/offline/indexed-db';
import { clearEmergencySave, markRoundDiscarded } from '@/lib/utils/emergency-save';
import type { ServerResult } from '../../lib/use-action';

/**
 * Every Rounds library write, as the page calls it. The live set is the
 * action the legacy library's Discard uses, unchanged (one write path per
 * behaviour). Preview and tests pass their own set.
 */
export interface ChRoundsWrites {
  discard(roundId: string, playerId: string): Promise<ServerResult>;
}

export const LIVE_ROUNDS_WRITES: ChRoundsWrites = {
  async discard(roundId, playerId) {
    const res = await deleteInProgressRound(roundId);
    if (res.success) {
      // The device's emergency copy goes too, or the next New round would offer to restore a round that no longer exists.
      clearEmergencySave(roundId, playerId);
      // A round screen open in another tab must not re-create it on its next save, and a failed-submit entry queued
      // for it must not sync it back (swap audit R-4, R-10).
      markRoundDiscarded(roundId, playerId);
      void Promise.resolve().then(() => deleteOfflineRound(roundId)).catch(() => {});
    }
    return res;
  },
};
