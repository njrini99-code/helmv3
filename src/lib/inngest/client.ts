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
