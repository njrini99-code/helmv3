/**
 * The coach Monday brief's flag (config/feature-flags.yml
 * `coachhelm_monday_brief_v1`; production off, preview on). One flag gates
 * the Clubhouse view, its link on the coach board and the Monday 05:00 UTC
 * delivery cron. Off: the view's address shows the board, no link is drawn,
 * and the cron returns before it reads or sends anything. Its own module so
 * the cron route checks it without importing the loader.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const MONDAY_BRIEF_FLAG = 'coachhelm_monday_brief_v1';

export function isMondayBriefEnabled(): boolean {
  return isFlagEnabled(MONDAY_BRIEF_FLAG);
}
