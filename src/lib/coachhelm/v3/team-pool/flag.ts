/**
 * The Slice 7a flag (config/feature-flags.yml `coachhelm_team_pool_v1`, off).
 * Its own module so the support pass can check it without importing the
 * team pool loader.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/** Off until the owner turns it on. */
export const TEAM_POOL_FLAG = 'coachhelm_team_pool_v1';

export function teamPoolEnabled(): boolean {
  return isFlagEnabled(TEAM_POOL_FLAG);
}
