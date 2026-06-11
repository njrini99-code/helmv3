/**
 * GolfHelm Demo — central configuration.
 *
 * A single shared demo coach account lets prospective coaches log in and
 * explore a fully-populated team ("Demo University Golf"). Visitors reach it
 * through the public demo gate (`/golf/demo`), which captures who they are for
 * tracing, then auto-signs them into the shared account server-side.
 *
 * The shared account's credentials live ONLY in server env (never shipped to
 * the client). The gate signs in on the server and sets the session cookie, so
 * many coaches can hold concurrent sessions on the same underlying account.
 */

/** The pre-populated demo team every visitor lands on. Head coach: the shared demo account. */
export const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';

/** Public route that hosts the "Try the live demo" identity gate. */
export const DEMO_GATE_PATH = '/golf/demo';

/** Where a visitor lands after the gate auto-signs them in. */
export const DEMO_LANDING_PATH = '/golf/dashboard';

/**
 * Shared demo coach credentials — server-only.
 * Set DEMO_COACH_EMAIL / DEMO_COACH_PASSWORD in the environment. The gate
 * server action reads these to sign the visitor into the shared account.
 */
export function getDemoCoachCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_COACH_EMAIL?.trim();
  const password = process.env.DEMO_COACH_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

/** PostHog / admin_events event name emitted when someone enters the demo. */
export const DEMO_ENTER_EVENT = 'demo_coach_entered';

/** True when the given email is the shared demo coach account. */
export function isDemoCoachEmail(email: string | null | undefined): boolean {
  const demo = process.env.DEMO_COACH_EMAIL?.trim().toLowerCase();
  if (!demo || !email) return false;
  return email.trim().toLowerCase() === demo;
}
