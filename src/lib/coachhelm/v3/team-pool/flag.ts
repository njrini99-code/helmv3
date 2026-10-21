/**
 * The Slice 7a flag (config/feature-flags.yml `coachhelm_team_pool_v1`, off).
 * Its own module so the support pass can check it without importing the
 * team pool loader.
 */
import { isCoachHelmFlagEnabled } from '@/lib/coachhelm/canary';

/** Off until the owner turns it on. */
export const TEAM_POOL_FLAG = 'coachhelm_team_pool_v1';

export function teamPoolEnabled(): boolean {
  return isCoachHelmFlagEnabled(TEAM_POOL_FLAG);
}
