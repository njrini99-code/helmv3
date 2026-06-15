import 'server-only';

/**
 * GolfHelm Demo — server-only configuration.
 *
 * Reads non-public env (the shared demo coach credentials) and must never be
 * bundled into a client component. `import 'server-only'` enforces this at
 * build time. Client-safe constants live in `./config`.
 */

/**
 * Shared demo coach credentials. Set DEMO_COACH_EMAIL / DEMO_COACH_PASSWORD in
 * the server environment. The gate server action reads these to sign the
 * visitor into the shared account. Returns null when unconfigured.
 */
export function getDemoCoachCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_COACH_EMAIL?.trim();
  const password = process.env.DEMO_COACH_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

/** True when the given email is the shared demo coach account. */
export function isDemoCoachEmail(email: string | null | undefined): boolean {
  const demo = process.env.DEMO_COACH_EMAIL?.trim().toLowerCase();
  if (!demo || !email) return false;
  return email.trim().toLowerCase() === demo;
}
