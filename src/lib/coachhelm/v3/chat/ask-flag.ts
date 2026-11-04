import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const ASK_V2_FLAG = 'coachhelm_ask_v2';
export const PLAYER_ASK_FLAG = 'coachhelm_player_ask_v1';

/** The redesigned Ask. Off: Ask renders and behaves as today. */
export function isAskV2Enabled(): boolean {
  return isFlagEnabled(ASK_V2_FLAG);
}

/** A player's own read-only Ask, only on top of Ask v2. */
export function isPlayerAskEnabled(): boolean {
  return isFlagEnabled(ASK_V2_FLAG) && isFlagEnabled(PLAYER_ASK_FLAG);
}
