# Feature: CRM Outreach (NCAA cold email)

## Status

- active

**Read this before touching anything below.** The runtime feature registry
carries an explicit owner directive on this feature:

> CRM is NEVER touched — no wrapping, no feature tag, no board presence beyond
> this registry row. File paths are intentionally NOT listed here so no scan or
> tooling can mistake CRM for a wrap target.
> — `src/lib/admin/feature-registry.ts`

That directive governs the **Helm Bridge observability system**: no
`withFeature` wrapping, no error tagging, no health-board presence.
`src/lib/admin/feature-registry.ts:1624` therefore declares
`crm_recruiting_pipeline` with `excluded: 'crm'`, an empty `actions` map, and
`primaryTable: null` — deliberately, and a foundation test
(`coverage-contract.foundation.test.ts`) fails the build if a CRM file is ever
wrapped.

This document is a **knowledge** artifact, not an observability one. It exists
because AGENTS.md requires a live surface to be either mapped or named as a gap,
and it was named as a gap (`feature_awareness_gap`) until this doc was written
from the code. It adds no Bridge coverage and changes no runtime registry row.

## Current State

Coach-facing outreach CRM for NCAA cold email: a private, admin-only operator
tool used to contact college golf coaches, track replies, and move them through
a pipeline. It is **not** a customer-facing product surface.

Not to be confused with **`recruiting`** — the runtime registry labels that one
"Recruiting HQ (coach tracker — NOT CRM)", it is player-facing, and it lives in
`src/app/golf/actions/recruiting.ts` over `golf_recruits`. Two different
products. One feature doc must never answer for both.

Architecturally it is a **single-page shell**: one route renders everything, and
the "tabs" are client state plus `history.replaceState` (`?tab=`, `?outreach=`,
`?view=`), not distinct Next.js routes.

Sending is **human-triggered by design.** The sequence-processing route is fully
wired but deliberately absent from `vercel.json`, so nothing sends on a
schedule; an operator runs `scripts/process-sequence-batch.mjs` to send the next
batch. Enabling automation is a one-line `vercel.json` addition — treat that as
a product decision, not a config tidy-up.

## Primary Entry Points

### Routes

- `src/app/golf/admin/crm/page.tsx` — the SPA shell (`/golf/admin/crm`)
- `src/app/golf/admin/crm/coach/[id]/page.tsx` — coach detail, `force-dynamic`
- `src/app/golf/admin/crm/layout.tsx` — pass-through; the gate is one level up

Access is gated by `src/app/golf/admin/layout.tsx`: session check, then
`users.role === 'admin'`. The whole `/golf/admin/*` subtree is also hidden from
the native iOS app (`AdminNativeGuard`) for App Store review reasons — not
CRM-specific.

### Components

Colocated at `src/app/golf/admin/crm/components/**` — roughly ninety files, and
deliberately NOT under `src/components/**`. From the shared design system it
consumes only Fairway primitives and `src/components/ui/*`.

### Actions

Eighteen `'use server'` files under `src/app/golf/actions/crm-*.ts`, plus two
that break the naming convention and are easy to miss:

- `src/app/golf/actions/resend-activity.ts` — the Resend activity dashboard;
  no `crm-` prefix
- `src/app/golf/admin/crm/components/resend/actions.ts` — colocated with its
  component rather than in `actions/`

### API routes

- `src/app/api/admin/crm/send-email/route.ts` — bulk send, ≤100 recipients per
  call via the Resend Batch API, super-admin gated, daily cap, suppression and
  `email_status` gating
- `src/app/api/crm/book-call/route.ts` — tracked redirect with a fixed,
  non-parameterised destination (deliberate open-redirect hardening)
- `src/app/api/crm/google-calendar/{auth,callback,sync}/route.ts`
- `src/app/api/crm/unsubscribe/route.ts` — RFC 8058 one-click unsubscribe
- `src/app/api/webhooks/resend/route.ts` — outbound events, svix-verified
- `src/app/api/webhooks/resend-inbound/route.ts` — inbound replies
- `src/app/api/cron/{process-sequences,ingest-gmail-replies,refresh-engagement}/route.ts`
  — all `Bearer ${CRON_SECRET}` via `requireCronAuth`

## Core Data

Owned tables, all `crm_`-prefixed except the email ledger:

`crm_coaches`, `crm_contact_log`, `crm_email_suppressions`,
`crm_email_templates`, `crm_events`, `crm_google_calendar_tokens`, `crm_notes`,
`crm_replies`, `crm_segments`, `crm_sequences`, `crm_sequence_steps`,
`crm_sequence_enrollments`, `crm_tasks`, `crm_automations`,
`crm_stage_transitions`, `crm_unmatched_inbound`, plus `emails`,
`email_events`, `email_clicks` and `golf_demo_sessions`.

Derived: `crm_coach_engagement` (materialized view, refreshed by cron) and
`v_crm_coach_signal_summary`.

Reached only through `SECURITY DEFINER` RPCs, never a direct `.from()`:
`get_crm_email_stats`, `get_crm_stage_ages`, `get_crm_weekly_kpis`,
`get_crm_coach_stage_history`.

Touched but **not owned**: `users` (role check), `admin_events`,
`demo_requests` (written upstream by `src/app/actions/demo-request.ts`; CRM only
reads it), `background_job_logs`.

## Integrations

- **Resend** — bulk send, inbound receiving, and the outbound event webhook
- **Gmail API, send** — Workspace domain-wide delegation, true 1:1 text/plain
  for Primary-inbox placement (`src/lib/crm/gmail-send.ts`)
- **Gmail API, read** — polls the admin mailbox every 30 minutes and mirrors
  replies, deliberately not through Resend so Reply-To stays the real mailbox
- **Gmail compose** — a pure URL builder for "Open in Gmail"; no API call
- **Google Calendar** — OAuth2 with an HMAC-signed `state` parameter
  (`src/lib/crm/oauth-state.ts`), added after a CSRF/account-linking fix
- **`deep-email-validator`** — pre-send deliverability checks; SMTP probing is
  deliberately disabled
- **DNS TXT** — SPF/DKIM/DMARC self-check (`src/lib/crm/domain-auth-check.ts`)

Cron is **Vercel Cron, not Inngest** — this feature registers no Inngest
functions.

## Known Risk Areas

- **Two files break the `crm-` naming convention** (`resend-activity.ts` and the
  colocated `components/resend/actions.ts`). A sweep keyed on the prefix misses
  both.
- **`scripts/process-sequence-batch.mjs` duplicates** the merge, unsubscribe and
  header logic in `crm-gmail-send.ts` / `outreach-headers.ts` rather than
  importing it, and the two are kept in step by comment convention alone.
- **A stale schedule comment.** `refresh-engagement/route.ts` and
  `crm-engagement.ts` both say "every 5 minutes"; `vercel.json` schedules
  `10 */4 * * *`. `vercel.json` is what runs. Recorded rather than silently
  corrected, because which one is intended is a product question.
- **A dated cleanup**: `src/lib/crm/unsubscribe-token.ts` carries
  `TODO(2026-11-01)` to delete the `CRM_UNSUB_LEGACY_SECRET` fallback, tied to a
  hardcoded `LEGACY_VERIFY_UNTIL` cutoff.
- **Automated sending is off by omission**, not by a flag. Someone adding the
  `process-sequences` cron to `vercel.json` to "fix a missing schedule" would
  start sending cold email automatically.

## Related Docs

- `docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md` — the exclusion
  contract and the file-by-file list it covers
- `src/lib/admin/feature-registry.ts` — the runtime row and the owner directive
