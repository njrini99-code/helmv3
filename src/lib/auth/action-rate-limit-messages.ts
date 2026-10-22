/**
 * The words a refused gate in `./action-rate-limit` answers with, in a plain
 * module (no server imports) so a client screen can tell a rate-limited answer
 * from a failure without bundling the limiter. The gate and the screens read
 * the same constant, so the two cannot drift.
 */
export const COACHHELM_ENGINE_RATE_LIMITED =
  'Too many analyze requests in the last minute — please wait a moment and try again.';
