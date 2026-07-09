/**
 * RELOCATED (security fix): the actual goal-progress driver implementation
 * now lives at `@/lib/golf/progress-drivers` — a plain server module WITHOUT
 * 'use server', so it can never be registered as a public, directly-POSTable
 * action. It ran createAdminClient() (full RLS bypass) keyed on a
 * caller-supplied player_id / player_id[] with zero auth inside the
 * function body, which is safe only because every real caller already
 * scoped those ids via its own session/cron auth — exporting it from a
 * 'use server' file made it a public endpoint regardless (Next.js: every
 * exported async function in a 'use server' file is directly callable).
 *
 * This file intentionally re-exports NOTHING and has no 'use server'
 * directive — it is not a server-actions module anymore. Import directly
 * from `@/lib/golf/progress-drivers` instead. Kept in place (empty) only so
 * this path continues to exist for tooling that still lists it (e.g. the
 * Helm Bridge feature-registry file inventory).
 */
export {};
