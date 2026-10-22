/**
 * The Slice 4 flag (config/feature-flags.yml `coachhelm_verdicts_v1`, off).
 * Kept in its own module so the focus-area actions and the lifecycle cron
 * can check it without importing the verdict job.
 */
import { isCoachHelmFlagEnabled } from '@/lib/coachhelm/canary';

export const VERDICTS_FLAG = 'coachhelm_verdicts_v1';

/** True when prescription fields are stamped and verdicts are computed. */
export function isVerdictsEnabled(): boolean {
  return isCoachHelmFlagEnabled(VERDICTS_FLAG);
}
