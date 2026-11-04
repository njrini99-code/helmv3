import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const TEAM_BOARD_FLAG = 'coachhelm_team_board_v1';

export function isTeamBoardEnabled(): boolean {
  return isFlagEnabled(TEAM_BOARD_FLAG);
}

/** Which Team view opens first; Nick's flip: `'board'` opens on today's board (02-PLAN 0.1). */
export const TEAM_BOARD_FIRST_VIEW: 'hole' | 'board' = 'hole';
/** The fifth tab; Nick's flip: false hides it, and the reads stay in player sheets (02-PLAN 0.1). */
export const COURSE_TAB = true;
