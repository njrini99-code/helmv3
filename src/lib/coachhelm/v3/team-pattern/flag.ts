/**
 * The Slice 7b flag (config/feature-flags.yml `coachhelm_team_pattern_v1`,
 * off). One flag gates the three pieces of the slice: the team pattern rows
 * on the Clubhouse coach board, and the same-day field context on the
 * bad-day-floor and pressure reads. Its own module so a generator can check it
 * without importing the pattern code.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/** Off until the owner turns it on. */
export const TEAM_PATTERN_FLAG = 'coachhelm_team_pattern_v1';

export function teamPatternEnabled(): boolean {
  return isFlagEnabled(TEAM_PATTERN_FLAG);
}
