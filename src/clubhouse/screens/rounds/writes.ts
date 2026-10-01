'use client';

import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
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
    // The device's emergency copy goes too, or the next New round would offer to restore a round that no longer exists.
    if (res.success) clearEmergencySave(roundId, playerId);
    return res;
  },
};
