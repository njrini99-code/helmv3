import { Inngest, type LogArg, type Logger } from 'inngest';


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
/**
 * One rejected signature, three error groups.
 *
 * When a signed request fails validation the SDK calls its internal logger as
 * `error({ err, method }, 'Signature validation failed')`, and the console
 * logger renders that as three separate entries in Vercel's runtime-error
 * table: `Signature validation failed`, `{ method: 'GET' }`, and
 * `Error: Invalid signature`. Not one of the three names a cause or a fix, and
 * they arrive together, so a single bad credential reads as three unrelated
 * production incidents at the top of the queue.
 *
 * The condition itself is NOT suppressed. `src/app/api/inngest/route.ts`
 * reports every one of these occurrences to admin_events, once, having first
 * measured whether the signature was stale (clock) or simply wrong (key), and
 * spelling out what to change. That line is the actionable record; these three
 * are the same event rendered three unactionable ways.
 *
 * So they are demoted to `warn` — still in the function logs, still greppable,
 * no longer masquerading as three crashes. Only signature messages are
 * demoted; every other SDK error still goes to console.error untouched.
 */
const SIGNATURE_REJECTION =
  /signature validation failed|invalid signature|signature has expired|x-inngest-signature/i;

function isSignatureRejection(args: unknown[]): boolean {
  return args.some((arg) => {
    if (typeof arg === 'string') return SIGNATURE_REJECTION.test(arg);
    if (arg instanceof Error) return SIGNATURE_REJECTION.test(arg.message);
    if (arg && typeof arg === 'object') {
      const nested = (arg as { err?: unknown }).err;
      if (nested instanceof Error) return SIGNATURE_REJECTION.test(nested.message);
    }
    return false;
  });
}

/** Exported for the over-matching test — see inngest-signature-noise.test.ts. */
export const internalLogger: Logger = {
  debug: (...args: LogArg[]) => console.debug(...args),
  info: (...args: LogArg[]) => console.info(...args),
  warn: (...args: LogArg[]) => console.warn(...args),
  error: (...args: LogArg[]) => {
    if (isSignatureRejection(args)) {
      console.warn('[inngest] signature rejected (reported once by /api/inngest):', ...args);
      return;
    }
    console.error(...args);
  },
};

export const inngest = new Inngest({
  id: 'helmv3',
  // env is detected from NODE_ENV; explicit override only if needed.
  internalLogger,
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
