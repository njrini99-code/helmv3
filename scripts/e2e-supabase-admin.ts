/**
 * scripts/e2e-supabase-admin.ts
 *
 * Service-role Supabase client for E2E teardown-only writes (deleting rows a
 * spec itself created). Same construction pattern as
 * `scripts/seed-baseball-e2e.ts` — `NEXT_PUBLIC_SUPABASE_URL` +
 * `SUPABASE_SERVICE_ROLE_KEY`, session-less.
 *
 * Lives in scripts/ (never bundled, Node-only) so no e2e spec file has to
 * reference the service-role env var directly — the ast-grep rule
 * `helmv3-no-service-role-key` forbids that outside admin-only paths.
 *
 * Returns `null` (callers' teardown becomes a no-op) rather than throwing
 * when either env var is missing — cleanup must never fail an
 * otherwise-passing run, and CI only exports `PLAYWRIGHT_BASEBALL_SEEDED=1`
 * (which gates the specs that use this) alongside the service-role secret
 * in the first place.
 *
 * `playwright test` does NOT auto-load `.env.local` (unlike `next dev`), so a
 * local `npm run test:e2e` would otherwise see empty `process.env` here and
 * silently no-op teardown even when `.env.local` has real creds. Load it here
 * (same pattern as the sibling `scripts/*.ts` seed/backfill utilities) —
 * `dotenv` never overwrites already-exported vars, so CI's real env still wins.
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

export function getE2eAdminClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
