import { COACHHELM_ENGINE_RATE_LIMITED } from '@/lib/auth/action-rate-limit-messages';
import type { ChRecheckResult } from '../screens/coachhelm/writes';

/** A whole-team re-check that read every player and wrote three new reads. Synthetic counts. */
export const RECHECK_DONE: ChRecheckResult = { success: true, playersAnalyzed: 5, insightsCreated: 3, playersSkipped: 0, playersFailed: 0 };
/** One that read four, skipped one with nothing to read, wrote nothing new and could not finish one. */
export const RECHECK_QUIET: ChRecheckResult = { success: true, playersAnalyzed: 4, insightsCreated: 0, playersSkipped: 1, playersFailed: 1 };
export const RECHECK_RATE_LIMITED: ChRecheckResult = { success: false, error: COACHHELM_ENGINE_RATE_LIMITED };
export const RECHECK_FAILED: ChRecheckResult = { success: false, error: 'Could not load the active roster' };
