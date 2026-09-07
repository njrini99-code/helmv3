# Helm Jobs — durable queues on pgmq (Database Plan D6)

## Status

**HELD.** `supabase/migrations/20260906140000_helm_jobs_pgmq_queues.sql` has
not been applied to production — see `supabase/migrations/HELD.md` for the
row, the owner verification steps, and why it is R3 (privileged: extension +
new schema + grant changes). `HELM_QUEUE_ENABLED` defaults to `false` even
after the migration ships (see `.env.example`) — flipping it is a separate,
explicit owner step.

Until both are true, every producer call in this repo (`enqueueJob`) fails
open to the exact inline/Inngest path that existed before this PR. Nothing
in application behavior changes until an owner does both things.

## The three queues

| Queue | Producer | Consumer handler | Payload |
|---|---|---|---|
| `coachhelm_analysis` | `src/app/golf/actions/golf.ts` (post-round trigger) | `postRoundTrigger` (`src/lib/coachhelm/v2/post-round-trigger.ts`) | `{ roundId, playerId }` |
| `email_send` | `sendEmailNotification` (`src/lib/notifications/email.ts`) | `sendEmailNotificationDirect` | `{ type, recipientId, recipientEmail, data }` |
| `push_send` | `sendPushNotification` (`src/lib/notifications/push.ts`) | `sendPushNotificationDirect` | `{ type, userId, data }` |

The consumer route, `src/app/api/jobs/consume/route.ts`, reads a small batch
(20 messages, 60s visibility timeout) off each queue every minute
(`vercel.json`, `*/1 * * * *`), runs the matching `*Direct` handler, and
acks on success or fails with backoff on error — calling the SAME functions
the inline path already calls, so a job processed here behaves identically
to one processed inline (including the email kill-switch below).

## Enqueuing

```ts
import { enqueueJob } from '@/lib/jobs/enqueue';

const result = await enqueueJob('coachhelm_analysis', { roundId, playerId }, {
  dedupeKey: `round:${roundId}:analysis`,
});
if (!result.queued) {
  // result.reason is 'queue_disabled' | 'facade_missing' | 'enqueue_failed'
  // — run your existing inline/Inngest fallback here. Never treat this as
  // an error condition; it is the expected default today.
}
```

`dedupeKey` is optional. When passed, a second `enqueueJob` call with the
same `(queue, dedupeKey)` inside a rolling 24h window returns the
already-queued message's id instead of enqueuing a duplicate — this is
enforced in SQL (`helm_jobs_enqueue`), not in application code, so it holds
even across two different processes/instances.

## Retry policy

`helm_jobs_fail(queue, msg_id, error)` reads pgmq's own per-message
`read_ct` as the attempt number:

| Attempt | Action |
|---|---|
| 1-4 | `pgmq.set_vt()` re-queues with exponential backoff: 10s, 20s, 40s, 80s (capped at 300s) |
| 5 | Removed from the live queue and copied into `helm_jobs.dead_letters` with its payload, attempt count, and last error |

## Requeuing a dead letter

Bridge -> Jobs -> "Jobs queue" section lists dead letters per queue (payload
redacted through `redactPiiDeep` before it ever reaches the page) with a
"Requeue" button, which calls the `requeueDeadLetter` server action
(`src/app/admin/jobs/helm-jobs-actions.ts`, `requireSuperAdmin`-gated) ->
`helm_jobs_requeue_dead_letter` (service-role SQL facade). Requeuing sends
the stored payload as a brand-new message (attempts reset to 0) and deletes
the dead-letter row — it never reuses the original `msg_id` (pgmq ids are
not reusable once archived/deleted).

## Disabling

Set `HELM_QUEUE_ENABLED=false` (or unset it) — every producer immediately
falls back to inline/Inngest on the next deploy; no migration rollback
needed. In-flight queued messages are simply not consumed until re-enabled
(the consumer route itself has no flag gate, since reading an empty/off
queue is a harmless no-op — but see "pg_cron alternative" below for the one
scheduler-level thing to check first if you also disable the Vercel Cron
entry).

## The email kill-switch (agent/email-off interaction)

Customer email is being turned off in a sibling PR behind
`HELM_CUSTOMER_EMAIL_ENABLED` (default off), with the real gate helper
landing at `src/lib/email/outbound-gate.ts` (`gateCustomerEmail`). That file
was not on `main` when this queue was built. `sendEmailNotificationDirect`
implements the SAME documented contract locally (checks
`HELM_CUSTOMER_EMAIL_ENABLED`, suppresses + logs
`notifications.email.suppressed` when off) so a queued send is gated
**identically** to a direct one — the queue is never a second path around
the switch. Once `outbound-gate.ts` lands, replace that local block with a
call to the real `gateCustomerEmail` and delete the local fallback; do not
keep both.

## Bridge panel

`src/app/admin/jobs/HelmJobsQueuePanel.tsx`, rendered at the top of
`/admin/jobs`, shows per-queue depth, oldest message age, and dead-letter
count, plus the dead-letter list with requeue. Renders an explicit empty
state ("Queue not active") when the facade migration is not applied or the
queue has never been used, rather than a blank or erroring section.

## Inngest and the safety-net cron — NOT retired by this PR

This PR does not remove Inngest code or the 30-minute
`coachhelm-safety-net` cron. The queue is checked FIRST (when
`HELM_QUEUE_ENABLED=true`), Inngest second (when configured), the exact
direct/inline call last — same fallback chain that existed before, with one
more link added at the front. Retirement plan, in order:

1. Apply the pgmq migration, flip `HELM_QUEUE_ENABLED=true`.
2. Watch `helm_jobs_depth()` (Bridge panel above) for at least 7 consecutive
   days: dead-letter count should stay at/near zero and queue depth should
   drain promptly.
3. Remove the Inngest send call in `src/app/golf/actions/golf.ts` (the
   branch marked `DEPRECATED PATH` in this PR) and the corresponding
   Inngest function in `src/lib/inngest/functions.ts`. Delete the
   `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` placeholders.
4. Retire `coachhelm-safety-net` via `config/routines.yml` and
   `vercel.json` once (3) has shipped and the queue has covered its role
   for another full week — the safety net stays until the queue has proven
   it does not need a backstop, not until it merely exists.

## pg_cron alternative (not applied, owner's choice)

`supabase/migrations/20260906141000_helm_jobs_pg_cron_consume_variant.sql`
(HELD) is an alternative scheduler for `/api/jobs/consume` using pg_cron +
pg_net instead of Vercel Cron. See that file's header for the Vault secret
setup required before applying. Do not run both schedulers against the same
route at once.
