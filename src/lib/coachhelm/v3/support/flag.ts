/**
 * The Slice 1 flag (config/feature-flags.yml `coachhelm_support_v1`, off).
 * Kept in its own module so the delivery path can check it without importing
 * the engine pass.
 */
import { isCoachHelmFlagEnabled } from '@/lib/coachhelm/canary';

export const SUPPORT_FLAG = 'coachhelm_support_v1';

/** True when the support pass and its exposure factors are on. */
export function isSupportPassEnabled(): boolean {
  return isCoachHelmFlagEnabled(SUPPORT_FLAG);
}
