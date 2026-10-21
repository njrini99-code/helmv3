'use client';

import { loadMaxFeatures } from '@/lib/motion/load-features';
import { chReport } from './track';

/** Waits before each retry of the features chunk: right away, then after a breath, then once more. */
export const CH_FEATURES_RETRY_MS = [0, 800, 2500] as const;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The animation features for the Clubhouse's `<LazyMotion>`, retried (audit A-01, 2026-10-14). The chunk loads after
 * first paint; on a phone with a weak signal, or a tab left open across a deploy, that load can fail, and LazyMotion
 * neither retries nor surfaces it: the rejection went unhandled and every `m.*` element stayed at its `initial` (often
 * opacity 0). Each attempt is a fresh `import()`, which webpack re-requests after a failed chunk.
 */
export async function chLoadMotionFeatures(load: typeof loadMaxFeatures = loadMaxFeatures, delays: readonly number[] = CH_FEATURES_RETRY_MS) {
  let last: unknown;
  for (const ms of delays) {
    if (ms) await wait(ms);
    try {
      return await load();
    } catch (err) {
      last = err;
    }
  }
  chReport(last, { surface: 'shell.motion', action: 'loadFeatures', severity: 'high' });
  // Last resort: show what was waiting to animate in (base.css, [data-ch-motion-failed]), and settle nothing, so the
  // failure is reported once here rather than again as an unhandled rejection.
  document.documentElement.dataset.chMotionFailed = '';
  return new Promise<never>(() => {});
}
