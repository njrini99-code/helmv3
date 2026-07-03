/**
 * GolfHelm Demo — client-safe configuration constants.
 *
 * A single shared demo coach account lets prospective coaches log in and
 * explore a fully-populated team ("Demo University Golf"). Visitors reach it
 * through the public demo gate (`/golf/demo`), which captures who they are for
 * tracing, then auto-signs them into the shared account server-side.
 *
 * This module is import-safe from both client and server code — it contains
 * ONLY non-secret constants. The credential reads + env-dependent helpers live
 * in `./config.server` (guarded by `import 'server-only'`).
 */

/**
 * The pre-populated demo team every visitor lands on. Head coach: the shared
 * demo account.
 *
 * NOTE: this UUID is a Helm-Production record. It does not exist in local or
 * staging Supabase instances — to run this flow elsewhere, seed a matching
 * `golf_teams` row (see `supabase/demo/`) or the gate will land on an empty /
 * RLS-blocked team.
 */
export const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';



/** Where a visitor lands after the gate auto-signs them in. */
export const DEMO_LANDING_PATH = '/golf/dashboard';

/** PostHog / admin_events event name emitted when someone enters the demo. */
export const DEMO_ENTER_EVENT = 'demo_coach_entered';
