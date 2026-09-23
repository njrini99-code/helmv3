<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature: Outbound Customer Email (kill switch)

## Status

- active

## Current State

Owner decision, 2026-09-06: no player/coach/parent-facing or Lift Lab
customer email leaves the product for now. Every such send site routes
through `gateCustomerEmail()` in `src/lib/email/outbound-gate.ts` before it
touches Resend. This is a suppression switch, not a deletion: every send
path, template, and test stays in place.

Owner scope change, 2026-09-07: CRM outreach is explicitly excluded from
this switch and NOT gated, by owner decision. See "CRM outreach: NOT gated"
below.

`isCustomerEmailEnabled()` reads `HELM_CUSTOMER_EMAIL_ENABLED` and is `true`
ONLY for the exact string `'true'` — unset, empty, `'TRUE'`, `'1'`, anything
else is OFF. When disabled, `gateCustomerEmail()` records one throttled
`admin_events` row (`event_type: 'email.suppressed'`, severity info, kind +
source + recipientCount only — no addresses, ever) via
`logEmailSuppressed()` (`src/lib/admin-logger.ts`), then returns
`{ allowed: false, reason: 'customer_email_disabled' }`. Repeated
suppressions from the same `(kind, source)` pair collapse into one row per
60s window (`src/lib/admin/emit-throttle.ts`) so a fanned-out send (e.g. a
team announcement to 200 players) doesn't flood the event feed. The gate is
synchronous and fail-open: a Bridge outage or a throttle bug can never block
or delay a caller's send decision.

**Re-enable**: set `HELM_CUSTOMER_EMAIL_ENABLED=true` in Vercel (Production)
and redeploy. No code change required — nothing in this PR changes
production behavior until that redeploy happens.

### Stays ON (never calls the gate)

- Supabase Auth email (signup confirmation, recovery, email change) — not in
  this repo's send path at all.
- `src/lib/auth/send-password-reset.ts` — the app-sent password reset. An
  account cannot recover without it.
- `src/lib/admin/digest/transport.ts` — the admin digest / one-off ops
  alerts to `OPS_DIGEST_TO`. Dedicated transport, own secret
  (`OPS_DIGEST_RESEND_API_KEY`), touches zero customer-outreach code.

### Gated (directly — calls `gateCustomerEmail()` itself)

- `src/lib/notifications/email.ts` `sendEmailNotification` — the single
  choke point for messages, announcements, qualifiers, watchlist, pipeline,
  profile views, tasks, dev plans. Every caller in `golf.ts`,
  `recurring-events.ts`, `notifications/index.ts`,
  `coachhelm/v3/notifications/dispatch.ts`, and
  `coachhelm/v3/qualifying/player-notify.ts` is gated transitively through
  this one function.
- `src/app/golf/actions/task-reminders.ts` `sendEmailNotification` (local,
  raw Resend fetch) — task reminder emails.
- `src/lib/coachhelm/v3/foundation/email.ts` `sendEmail` — the v3 Resend
  wrapper. `src/app/api/cron/v3/weekly-coach-email/route.ts` (gated
  transitively) is also unscheduled — not in `vercel.json`.
- `src/app/lifting/actions/invites.ts` `sendInviteEmail` — Lift Lab coach
  invite email. The invite row itself is still written; only the email leg
  is suppressed.
- `src/app/api/cron/event-reminders/route.ts` — gated transitively via
  `sendEmailNotification`.

### CRM outreach: NOT gated, by owner decision 2026-09-07

The owner explicitly excluded every CRM outreach send path from this
switch — "don't touch sending anything in CRM." These are left exactly as
they are on `main`, ungated, and are out of scope for this feature:

- `src/app/api/admin/crm/send-email/route.ts` — CRM batch outreach.
- `src/app/api/cron/process-sequences/route.ts` — CRM sequence cron
  (manual-only, see `memory/features/crm_outreach.md`).
- `src/app/golf/actions/crm-gmail-send.ts` — the Gmail-API cold-outreach
  transport.
- `scripts/process-sequence-batch.mjs` and `scripts/send-coach-batch.mjs` —
  operator CLI senders for CRM sequences/batches.
- Anything else under `src/lib/crm/**` or with `crm`/`sequence`/`outreach`
  in its path.

Do not add `gateCustomerEmail()` calls to any of the above without a new,
explicit owner decision superseding 2026-09-07.

### Fixed while in this file

`src/lib/notifications/email.ts` (~line 928) swallowed a Resend `error` and
reported `{ success: true }` — fixed to destructure `{ error }` and return
`{ success: false, error: error.message }`, matching
`src/lib/coachhelm/v3/foundation/email.ts`. Matters the day the switch turns
back on.

## Primary Entry Points

- `src/lib/email/outbound-gate.ts` — the switch and the gate
- `src/lib/admin-logger.ts` `logEmailSuppressed` — the suppression event
  writer (`event_type: 'email.suppressed'`)
- `src/lib/admin/emit-throttle.ts` — the collapse window `gateCustomerEmail`
  reuses

## Next step (deferred, out of scope for this change)

Three independent gated send paths (Resend SDK ×2, raw Resend fetch ×1)
each call the gate themselves. Consolidating them into one wrapper is
deferred until email turns back on — do it then, not now, since the gate
is the only thing that needs to be correct while customer email is off.
CRM outreach is out of scope entirely (see above) and not part of this
consolidation either.
