import { Inngest } from 'inngest';

/**
 * Inngest client — durable, retryable, observable background jobs.
 *
 * Wire this in to replace ad-hoc cron + retry loops scattered across
 * src/app/api/cron/* and Supabase Edge Functions. Step-level retries,
 * sleep, and crash recovery — see https://www.inngest.com/docs.
 *
 * Local dev: `npx inngest-cli@latest dev` (auto-discovers /api/inngest).
 * Cloud setup: set INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY in env.
 *
 * The v3 master plan's W12/W20/W27/W33/W35 backfills are the prime
 * migration target — they need idempotency + chunk-boundary safety +
 * partial-failure resumability (see docs/v3-testing-standards.md
 * "Backfill"). Inngest step retries solve all three.
 */
export const inngest = new Inngest({
  id: 'helmv3',
  // env is detected from NODE_ENV; explicit override only if needed.
});

/**
 * True only when both env vars needed for Inngest to actually deliver
 * events are present. Vercel bakes env vars into a deployment at deploy
 * time, so this reflects whatever was set when the CURRENT deployment was
 * built — a key added in the dashboard afterward has no effect until the
 * next deploy.
 *
 * Single source of truth for "is Inngest wired" (2026-07-25, Fix 3 of the
 * CoachHelm remediation plan) — both the golf round-submit routing branch
 * (src/app/golf/actions/golf.ts) and the admin Bridge jobs board
 * (src/lib/admin/data/jobs.ts) call this instead of each re-deriving the
 * same boolean from process.env, so the two can't silently drift apart.
 */
export function isInngestConfigured(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY);
}
