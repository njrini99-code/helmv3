import type { LadderRung } from '@/lib/coachhelm/v3/support/ladder';

/** The ladder word a brief row prints (the same words as the Clubhouse `LADDER_WORD`). */
export const LADDER_RUNG_WORD: Record<LadderRung, string> = {
  seen_repeatedly: 'Seen repeatedly',
  observed: 'Observed',
  likely: 'Likely',
  working_hypothesis: 'Working hypothesis',
  not_enough_yet: 'Not enough yet',
};

/** The brief's address in CoachHelm (the coach's `?view=monday-brief`; with the flag off it shows the board). */
export const MONDAY_BRIEF_PATH = '/golf/dashboard/coachhelm?view=monday-brief';
