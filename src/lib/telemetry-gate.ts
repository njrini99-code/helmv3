/**
 * admin_events/error_logs are PROD incident feeds, but every runtime holding
 * prod Supabase creds wrote to them: CI dev servers (/home/runner/...), local
 * dev + `next start` (/Users/...), and Vercel preview/prod builds
 * (/vercel/path0/...). That noise buried real incidents in the Bridge. Only
 * the live production deployment gets to write; everything else keeps
 * console/Sentry visibility. ADMIN_EVENTS_FORCE_CAPTURE=1 is the escape
 * hatch for deliberately testing the pipeline from elsewhere.
 *
 * Root cause of the 2026-07-02/03 flood: for most of that window this gate
 * didn't exist at all, so every runtime persisted unconditionally. Once
 * added, the gate still leaned on VERCEL_ENV alone (`=== 'production'`) —
 * which is *implicitly* false off Vercel, but not *guaranteed* false: the
 * Playwright workflow's `e2e`/`smoke` jobs boot `npm run dev` and
 * `npm run build`/`next start` against real prod Supabase secrets
 * (.github/workflows/playwright.yml), and a local `.env.production.local`
 * can hardcode VERCEL_ENV=production to rehearse prod-build behavior on a
 * dev machine — either would have silently satisfied the old check. CI and
 * GITHUB_ACTIONS are asserted explicitly below so a stray VERCEL_ENV value
 * can never smuggle a CI run past the gate.
 *
 * Lives in its own module (NOT server-error-logger) because that file is
 * 'use server' — every export there must be an async server action, and
 * exporting this sync helper from it broke the production build
 * ("Server Actions must be async functions").
 */
export function shouldPersistAdminTables(): boolean {
  if (process.env.ADMIN_EVENTS_FORCE_CAPTURE === '1') return true;
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  // GitHub Actions sets both CI=true and GITHUB_ACTIONS=true on every job
  // runner — never persist from there, independent of whatever VERCEL_ENV
  // happens to read (it's normally unset in CI, but this must not depend
  // on that staying true).
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') return false;
  // A VERCEL_ENV that exists but isn't 'production' (preview, or a local
  // override) is excluded explicitly rather than falling through.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return false;
  return process.env.VERCEL_ENV === 'production';
}

export type RuntimeEnv = 'production' | 'preview' | 'ci' | 'dev';

/**
 * Classifies the current runtime for tagging persisted rows (metadata only —
 * never gates persistence by itself; shouldPersistAdminTables() above is the
 * single source of truth for whether a row gets written at all). Order
 * matters: CI is checked before VERCEL_ENV so a CI runner that happens to
 * have a stray VERCEL_ENV=production value (see shouldPersistAdminTables
 * doc) is still tagged 'ci', not 'production'.
 */
export function getRuntimeEnv(): RuntimeEnv {
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') return 'ci';
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV) return 'preview';
  return 'dev';
}
