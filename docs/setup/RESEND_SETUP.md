# Resend Activity — Setup

This integration mirrors the Resend dashboard (https://resend.com/emails) inside the admin CRM, with live event streaming, per-email drill-downs, domain deliverability, failure tracking, per-click telemetry, and per-coach email status rollups.

## 1. Prerequisites

- A Resend account with at least one verified domain.
- Service role access to the Supabase project (for running migrations + backfill).
- These env vars in `.env.local` and your production environment (Vercel):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...     # created in step 3
```

## 2. Run the migrations

Two migrations make up the Resend activity schema. Apply them in order:

1. `20260420000000_resend_activity_mirror.sql` — renames `crm_email_events` → `email_events`, adds the `emails` snapshot table, installs the auto-sync trigger, and publishes both tables to Supabase Realtime. A back-compat `crm_email_events` VIEW is created so any existing code that still references the old table name keeps working.
2. `20260421000000_email_clicks_and_coach_denorm.sql` — adds the `email_clicks` table (id, email_event_id FK, resend_message_id, recipient_email, clicked_url, user_agent, ip_address, occurred_at, inserted_at), an AFTER INSERT trigger on `email_events` that extracts `raw_payload.data.click.{link,userAgent,ipAddress}` into a normalized row for `email.clicked` events, and two new denorm columns on `crm_coaches` (`last_email_event_type` and `last_email_event_at`). A second trigger keeps those coach columns fresh for any event with a linked `contact_log_id`, guarded by a monotonic check so a late backfill cannot clobber newer state. Both data sets are backfilled from existing rows during migration, and `email_clicks` is added to the `supabase_realtime` publication.

```bash
# Using Supabase CLI (linked project)
supabase db push

# Or apply just these migrations
supabase migration up
```

`last_email_event_type` is stored without the `email.` prefix — one of `sent`, `delivered`, `delivery_delayed`, `opened`, `clicked`, `bounced`, `complained`.

## 3. Configure the Resend webhook

In the Resend dashboard → Webhooks → Add endpoint:

- **Endpoint URL**: `https://<your-domain>/api/webhooks/resend`
- **Events**: enable all seven —
  - `email.sent`
  - `email.delivered`
  - `email.delivery_delayed`
  - `email.opened`
  - `email.clicked`
  - `email.bounced`
  - `email.complained`
- Copy the signing secret (starts with `whsec_`) into `RESEND_WEBHOOK_SECRET`.

The handler lives in `src/app/api/webhooks/resend/route.ts` and verifies signatures via Svix.

## 4. Backfill historical emails (optional but recommended)

Pulls every email from the Resend REST API and seeds the snapshot + event timeline. The click-extraction and coach-denorm triggers fire on each inserted event, so running the backfill also populates `email_clicks` and `crm_coaches.last_email_event_*` for historical traffic.

```bash
# Dry run first to preview counts
RESEND_BACKFILL_DRY_RUN=1 npx tsx scripts/backfill-resend-emails.ts

# Full run
npx tsx scripts/backfill-resend-emails.ts

# Only the most recent 500 (faster smoke test)
RESEND_BACKFILL_LIMIT=500 npx tsx scripts/backfill-resend-emails.ts
```

The script is idempotent — safe to re-run if it fails mid-way.

## 5. View the dashboard

Log in as an admin user and navigate to:

```
/golf/admin/crm?tab=resend
```

You'll see five sub-tabs:

- **Overview** — KPIs, daily volume chart, source breakdown
- **Activity** — live event feed (Supabase Realtime, no refresh needed)
- **All emails** — searchable, filterable table of every tracked email
- **Failed** — bounces & complaints that need attention
- **Domains** — deliverability by recipient domain

Clicking any row opens a side panel with the full event timeline for that message. Below the metadata block, a **Clicks** section lists every link the recipient opened — recipient address, clicked URL, user agent / device, and timestamp — sourced from `email_clicks` via `getEmailClicks(resendMessageId)`. The panel header also carries a **Send follow-up** action: it fires the `onSendFollowup` callback that `ResendActivityView` forwards up to the admin CRM page, which opens `BulkEmailModal` with recipients prefilled. Recipients are matched to `crm_coaches` by `coach_id` first, then by case-insensitive email; anyone not found in CRM is synthesized as an ad-hoc recipient so the send flow still works.

## 6. Email status in the coaches & inbound views

`CoachTable` and `InboundLeadsView` render an **Email** status badge column, hydrated in bulk via `getCoachLastEmailActivity(coachIds)` against the new `crm_coaches.last_email_event_{type,at}` columns. The badge follows a fixed priority so the worst-signal-wins: `bounced`/`complained` override everything, otherwise `clicked` → `opened` → `delivered` → `delivery_delayed` → `sent`. Coaches with no recorded email event render an em-dash.

## 7. What's automatic vs. manual

Automatic (no action needed):

- Incoming webhooks insert into `email_events`.
- A trigger materializes the per-email snapshot in `emails`.
- For `email.clicked` events, a trigger extracts the click payload into a normalized `email_clicks` row.
- For any event with a linked `contact_log_id`, a trigger updates `crm_coaches.last_email_event_type` and `last_email_event_at` (monotonic — never overwritten by an older event).
- Opened/clicked events advance CRM coach status `contacted → engaged`.
- Bounced/complained events mark `crm_coaches.email_status` accordingly.
- Supabase Realtime broadcasts new rows in `emails`, `email_events`, and `email_clicks` to the admin UI.

Manual:

- Running the migrations (step 2).
- Configuring the webhook in Resend (step 3).
- Optional backfill of historical data (step 4).

## Troubleshooting

**No events appearing after sending email**
Check the webhook configuration in Resend — the endpoint URL must point at your production domain, not localhost. For local testing, use a tunnel like `ngrok` and add that URL as a separate webhook endpoint.

**"Signature verification failed"**
`RESEND_WEBHOOK_SECRET` doesn't match what Resend signs with. Copy it again from the webhook detail page in Resend.

**Backfill crashes with 401**
`RESEND_API_KEY` is missing or revoked. Regenerate at https://resend.com/api-keys.

**KPIs all zero after webhooks are firing**
Check the `emails` and `email_events` tables in Supabase Studio. If `email_events` has rows but `emails` is empty, the sync trigger didn't install — re-apply the migration.

**Clicks section empty even though `email.clicked` events exist**
The click-extraction trigger didn't install or the payload shape changed. Confirm `email_clicks` exists and that `raw_payload.data.click.link` is populated on the source event; re-apply `20260421000000_email_clicks_and_coach_denorm.sql` to reinstall the trigger and re-run the embedded backfill.

**Email status badge always shows em-dash**
`crm_coaches.last_email_event_type` is NULL. Either no events have a `contact_log_id` linking them to the coach, or the denorm trigger didn't install. Re-apply the second migration — the backfill block will repopulate from existing `email_events` rows.

## Files

- Migrations:
  - `supabase/migrations/20260420000000_resend_activity_mirror.sql`
  - `supabase/migrations/20260421000000_email_clicks_and_coach_denorm.sql`
- Webhook: `src/app/api/webhooks/resend/route.ts`
- Server actions: `src/app/golf/actions/resend-activity.ts` (includes `getEmailClicks` and `getCoachLastEmailActivity`)
- UI components: `src/app/golf/admin/crm/components/resend/`
- Backfill script: `scripts/backfill-resend-emails.ts`
