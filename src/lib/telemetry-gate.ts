/**
 * admin_events/error_logs are PROD incident feeds, but every runtime holding
 * prod Supabase creds wrote to them: CI dev servers (/home/runner/...), local
 * dev + `next start` (/Users/...), and Vercel preview/prod builds
 * (/vercel/path0/...). That noise buried real incidents in the Bridge. Only
 * the live production deployment gets to write; everything else keeps
 * console/Sentry visibility. ADMIN_EVENTS_FORCE_CAPTURE=1 is the escape
 * hatch for deliberately testing the pipeline from elsewhere.
 *
 * Lives in its own module (NOT server-error-logger) because that file is
 * 'use server' — every export there must be an async server action, and
 * exporting this sync helper from it broke the production build
 * ("Server Actions must be async functions").
 */
export function shouldPersistAdminTables(): boolean {
  if (process.env.ADMIN_EVENTS_FORCE_CAPTURE === '1') return true;
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return process.env.VERCEL_ENV === 'production';
}
