import 'server-only';

/**
 * BaseballHelm Demo — server-only configuration.
 *
 * Reads the shared demo coach credentials and must never be bundled into a
 * client component. `import 'server-only'` enforces this at build time.
 * Client-safe constants live in `./baseball-config`.
 *
 * Unlike GolfHelm (whose shared account password is a setup-time random secret
 * read strictly from env), the BaseballHelm demo coach is created by
 * `scripts/seed-baseball-demo.ts` with DETERMINISTIC credentials so the gate is
 * reachable on any environment the seed has run against. We therefore prefer
 * env overrides (`DEMO_BASEBALL_COACH_EMAIL` / `DEMO_BASEBALL_COACH_PASSWORD`)
 * but fall back to the seed's baked-in values. Keep these two in sync with the
 * seed script (`DEMO_COACH_EMAIL` / `DEMO_PASSWORD` there).
 */

// Seed defaults — MUST match scripts/seed-baseball-demo.ts.
const SEED_DEMO_COACH_EMAIL = 'demo-coach@baseballhelmdemo.com';
const SEED_DEMO_PASSWORD = 'BaseballDemo2026';

/**
 * Shared demo coach credentials. Env overrides win; otherwise the seed's
 * deterministic values are used. Always returns a value (the seed creates the
 * account), but the sign-in itself will fail cleanly if the account is absent.
 */
export function getBaseballDemoCoachCredentials(): { email: string; password: string } {
  const email = process.env.DEMO_BASEBALL_COACH_EMAIL?.trim() || SEED_DEMO_COACH_EMAIL;
  const password = process.env.DEMO_BASEBALL_COACH_PASSWORD?.trim() || SEED_DEMO_PASSWORD;
  return { email, password };
}

/** True when the given email is the shared baseball demo coach account. */
export function isBaseballDemoCoachEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const demo = getBaseballDemoCoachCredentials().email.toLowerCase();
  return email.trim().toLowerCase() === demo;
}
