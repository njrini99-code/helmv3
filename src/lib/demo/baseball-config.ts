/**
 * BaseballHelm Demo — client-safe configuration constants.
 *
 * A single shared demo coach account lets prospective coaches sign in and
 * explore a fully-populated program ("BaseballHelm demo team"). Visitors reach
 * it through the public demo gate (`/baseball/demo`), which captures who they
 * are for tracing, then auto-signs them into the shared account server-side.
 *
 * Mirrors `./config.ts` (the GolfHelm equivalent) but is intentionally a
 * SEPARATE module so the two sports never share secrets, sessions tables, or
 * landing paths. This module is import-safe from both client and server code —
 * it contains ONLY non-secret constants. The credential reads live in
 * `./baseball-config.server` (guarded by `import 'server-only'`).
 */

/** Public route that hosts the "Try the live demo" identity gate. */
export const BASEBALL_DEMO_GATE_PATH = '/baseball/demo';

/** Where a visitor lands after the gate auto-signs them in. */
export const BASEBALL_DEMO_LANDING_PATH = '/baseball/dashboard';

/** PostHog / admin_events event name emitted when someone enters the demo. */
export const BASEBALL_DEMO_ENTER_EVENT = 'demo_baseball_coach_entered';
