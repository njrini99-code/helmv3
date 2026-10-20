/**
 * The Slice 1 flag (config/feature-flags.yml `coachhelm_support_v1`, off).
 * Kept in its own module so the delivery path can check it without importing
 * the engine pass.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const SUPPORT_FLAG = 'coachhelm_support_v1';

/** True when the support pass and its exposure factors are on. */
export function isSupportPassEnabled(): boolean {
  return isFlagEnabled(SUPPORT_FLAG);
}
