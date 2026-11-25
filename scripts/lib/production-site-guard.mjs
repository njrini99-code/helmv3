/**
 * Production guard for browser suites and scripts that sign in or write.
 *
 * WHY THIS EXISTS
 * ---------------
 * The 15 Nov 2026 tooling audit found browser tools that reach production signed in, with nothing in the way: the root
 * Playwright suite takes any PLAYWRIGHT_BASE_URL and loads `.env.local`, whose Supabase URL is production (it once wrote
 * 37 production rounds); `scripts/ui-intelligence/ui-smoke.mjs` and the `ui:screenshots` capture sign in at any base URL; the baseball
 * visual audit defaulted to the live site. Opening a signed-in page writes rows (docs/clubhouse/audit/WRITES-ON-OPEN.md),
 * so "it only reads" is never true of a signed-in run. Users include players under 18.
 *
 * WHAT IT DOES
 * ------------
 * Refuses, loudly and before any browser starts, a run whose web target is the production site or whose Supabase is the
 * production project. A deliberate production run still works with HELM_ALLOW_PRODUCTION=1, so the refusal converts an
 * accidental production run into an error instead of forbidding a real task. The logged-out production lane
 * (`scripts/clubhouse/audit/prod-public.mjs`) does not use this: it never signs in and refuses every non-GET itself.
 */
import { KNOWN_PROD_PROJECT_REF, resolveProjectRef } from './prod-target-guard.mjs';

/** The production site's registrable domain. Any host under it is production (apex, www, future subdomains). */
export const PRODUCTION_SITE_DOMAIN = 'helmsportslabs.com';

/** True when `url` points at the production site. Unparseable or empty input is not a production site (nothing to open). */
export function isProductionSite(url) {
  if (!url) return false;
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  return host === PRODUCTION_SITE_DOMAIN || host.endsWith(`.${PRODUCTION_SITE_DOMAIN}`);
}

/** True when a Supabase URL is the production project. */
export function isProductionDatabase(supabaseUrl) {
  return resolveProjectRef(supabaseUrl) === KNOWN_PROD_PROJECT_REF;
}

/** The override: HELM_ALLOW_PRODUCTION=1, and nothing else. */
export function productionAllowed(env = process.env) {
  return env.HELM_ALLOW_PRODUCTION === '1';
}

/**
 * Throws when the run would reach production signed in, unless HELM_ALLOW_PRODUCTION=1.
 * @param {object} o
 * @param {string} o.what              the suite or script, for the message
 * @param {string} [o.baseUrl]         the web address it opens
 * @param {string} [o.supabaseUrl]     the Supabase URL its server or seed uses
 * @param {Record<string, string|undefined>} [o.env]
 */
export function refuseProduction({ what, baseUrl, supabaseUrl, env = process.env }) {
  if (productionAllowed(env)) return { allowed: true };
  const reasons = [];
  if (isProductionSite(baseUrl)) reasons.push(`its base URL is the production site (${new URL(baseUrl).host})`);
  if (isProductionDatabase(supabaseUrl)) reasons.push(`its Supabase URL is the production project (${KNOWN_PROD_PROJECT_REF})`);
  if (reasons.length) {
    throw new Error(
      `${what} refuses to run: ${reasons.join(' and ')}. A signed-in run writes production rows on open, and players include ` +
        'minors. Point it at a local stack or staging (Vercel Preview and Development use PROSP DATA). ' +
        'For a deliberate, owner-approved production run, set HELM_ALLOW_PRODUCTION=1.',
    );
  }
  return { allowed: false };
}
