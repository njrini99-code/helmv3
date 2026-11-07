import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const PLAYER_FILE_FLAG = 'coachhelm_player_file_v1';

/** One file per player for a coach, and the player's "Your week" (coachhelm-lenses 02-PLAN 2.1). Off everywhere. */
export function isPlayerFileEnabled(): boolean {
  return isFlagEnabled(PLAYER_FILE_FLAG);
}
