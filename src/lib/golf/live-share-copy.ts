/**
 * The three failure sentences of live sharing (P-6, CH-16664 to CH-16666). They live here because the server action's
 * error mapping (src/app/golf/actions/round-live-errors.ts) may not import from src/clubhouse; the Clubhouse's
 * SHARE_COPY re-exports them, so the words are written once.
 */
export const LIVE_SHARE_FAILURE_COPY = {
  /** CH-16664 */
  error: 'Couldn’t change sharing. Try again.',
  /** CH-16665 */
  tooMany: 'Sharing was changed too many times on this round.',
  /** CH-16666 */
  unavailable: 'Sharing isn’t available yet.',
} as const;
