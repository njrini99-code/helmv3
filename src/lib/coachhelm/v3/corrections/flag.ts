/**
 * The Slice 6a flag (config/feature-flags.yml `coachhelm_corrections_v1`,
 * off). Kept in its own module so the ranking loader and the server action
 * can check it without importing each other.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const CORRECTIONS_FLAG = 'coachhelm_corrections_v1';

/** True when corrections may be recorded and feed the coach weight W. */
export function isCorrectionsEnabled(): boolean {
  return isFlagEnabled(CORRECTIONS_FLAG);
}
