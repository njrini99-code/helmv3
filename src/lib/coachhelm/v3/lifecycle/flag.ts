/**
 * The Slice 3 flag (config/feature-flags.yml `coachhelm_recheck_v1`, off).
 * Kept in its own module so the lifecycle cron and the insight upsert can
 * check it without importing the lifecycle job.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const RECHECK_FLAG = 'coachhelm_recheck_v1';

/** True when checkpoints, recheck, pairing and round-based archiving run. */
export function isRecheckEnabled(): boolean {
  return isFlagEnabled(RECHECK_FLAG);
}
