import { COACHHELM_ENGINE_RATE_LIMITED } from '@/lib/auth/action-rate-limit-messages';
import type { ChRecheckResult, ChRecheckWrites } from '../screens/coachhelm/writes';

/** A whole-team re-check that read every player and wrote three new reads. Synthetic counts. */
export const RECHECK_DONE: ChRecheckResult = { success: true, playersAnalyzed: 5, insightsCreated: 3, playersSkipped: 0, playersFailed: 0 };
/** One that read four, skipped one with nothing to read, wrote nothing new and could not finish one. */
export const RECHECK_QUIET: ChRecheckResult = { success: true, playersAnalyzed: 4, insightsCreated: 0, playersSkipped: 1, playersFailed: 1 };
export const RECHECK_RATE_LIMITED: ChRecheckResult = { success: false, error: COACHHELM_ENGINE_RATE_LIMITED };
export const RECHECK_FAILED: ChRecheckResult = { success: false, error: 'Could not load the active roster' };

const after = <T,>(v: T, ms = 900) => new Promise<T>((r) => setTimeout(() => r(v), ms));

/**
 * Re-check reads for the preview (CH-13944): `?state=recheck-running` never answers (the running state stays up),
 * `recheck-ratelimited` and `recheck-failed` refuse, `recheck-quiet` lands with nothing new; any other state lands as
 * RECHECK_DONE. Nothing reaches the server.
 */
export function previewRecheckWrites(state?: string): ChRecheckWrites {
  return {
    recheck: () => {
      if (state === 'recheck-running') return new Promise<ChRecheckResult>(() => {});
      if (state === 'recheck-ratelimited') return after(RECHECK_RATE_LIMITED);
      if (state === 'recheck-failed') return after(RECHECK_FAILED);
      if (state === 'recheck-quiet') return after(RECHECK_QUIET);
      return after(RECHECK_DONE);
    },
  };
}
