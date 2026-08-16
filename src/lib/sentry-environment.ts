/**
 * Which `environment` a Sentry event should be tagged with.
 *
 * Extracted from `instrumentation.ts` / `instrumentation-client.ts` so the rule
 * can be tested over an env matrix instead of being asserted by reading it.
 *
 * THE ONLY SAFETY PROPERTY THAT MATTERS HERE: a genuine Vercel production event
 * must never be relabelled. Sentry alert rules filter on
 * `environment:production`, so a wrong "downgrade" silences paging — strictly
 * worse than the noise it would be fixing. Every rule below is therefore
 * written as "downgrade ONLY on positive evidence of a local machine", never as
 * "upgrade when something looks like production".
 */

/**
 * The subset of env we read. Declared structurally rather than as
 * `Pick<NodeJS.ProcessEnv, …>` so tests can pass plain literals — Next narrows
 * `NODE_ENV` to a literal union and marks the keys required, which makes the
 * Pick unusable as a test input.
 */
export interface EnvironmentInput {
  VERCEL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_VERCEL_ENV?: string | undefined;
}

/** What a local optimized build gets tagged as instead of `production`. */
export const LOCAL_BUILD_ENVIRONMENT = 'local-production-build';

/**
 * Server/edge runtimes.
 *
 * `NODE_ENV` is `'production'` in ANY optimized build, so `next build && next
 * start` on a laptop reported `environment: production` — a real
 * `ReferenceError` from an agent QA worktree
 * (`/private/tmp/.../wt-qa/.next/server/...`, `http://localhost:3210`,
 * `server_name: Mac.lan`) landed in Sentry indistinguishable from a live
 * outage.
 *
 * `VERCEL` is set to `"1"` on every Vercel build and every Vercel runtime. Its
 * ABSENCE is the strong signal — much stronger than `VERCEL_ENV` alone, which
 * is also absent in several legitimate Vercel contexts. We only ever act on
 * that absence, and only when `NODE_ENV` claims production; a real production
 * event on Vercel has `VERCEL=1` and is returned untouched by the first branch.
 */
export function resolveServerEnvironment(
  env: EnvironmentInput = process.env,
): string {
  // On Vercel: trust VERCEL_ENV verbatim (production | preview | development).
  // This branch is what makes the fix safe — it runs BEFORE any downgrade.
  if (env.VERCEL) return env.VERCEL_ENV || env.NODE_ENV || 'development';

  // Not Vercel. An optimized local build is the case we are here to catch.
  if (env.NODE_ENV === 'production') return LOCAL_BUILD_ENVIRONMENT;

  return env.NODE_ENV || 'development';
}

/**
 * Browser runtime.
 *
 * The client CANNOT use `VERCEL`: Next only inlines `NEXT_PUBLIC_*` into the
 * browser bundle, so `process.env.VERCEL` is `undefined` in every browser event
 * including genuine production — keying off it there would relabel ALL client
 * production errors, the exact failure this must not cause.
 *
 * Worse, `next.config.mjs` inlines
 * `NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || process.env.NODE_ENV`
 * at BUILD time, so a local `next build` bakes the literal string
 * `"production"` into the bundle. No client-side environment variable can tell
 * the truth here — the value was decided on the machine that ran the build.
 *
 * The one trustworthy runtime signal is where the browser actually is. A local
 * hostname is positive evidence of a developer machine; production serves from
 * a public host, and Vercel previews from `*.vercel.app`, neither of which
 * matches. So this can only ever downgrade a local page, never a deployed one.
 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export function isLocalHostname(hostname: string | undefined | null): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (LOCAL_HOSTNAMES.has(host) || LOCAL_HOSTNAMES.has(hostname.toLowerCase())) return true;
  if (host.endsWith('.local') || host.endsWith('.localhost')) return true;
  // RFC1918 / link-local — the LAN address `next dev` prints as "Network:".
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

export function resolveClientEnvironment(
  env: EnvironmentInput,
  hostname: string | undefined | null,
): string {
  const declared =
    env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV || env.NODE_ENV || 'development';

  // Downgrade ONLY when the browser is demonstrably on a local machine AND the
  // build claims production. Any deployed host — helmsportslabs.com, a
  // *.vercel.app preview — fails isLocalHostname and is returned untouched.
  if (declared === 'production' && isLocalHostname(hostname)) {
    return LOCAL_BUILD_ENVIRONMENT;
  }

  return declared;
}
