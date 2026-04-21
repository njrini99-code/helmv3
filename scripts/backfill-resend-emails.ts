/**
 * Backfill historical Resend emails into the `emails` + `email_events` tables.
 *
 * Reads every email from the Resend REST API, upserts a row into `emails`,
 * and synthesizes a minimal email_events row per known event timestamp so
 * the admin dashboard has a consistent event timeline for historical data.
 *
 * Usage:
 *   npx tsx scripts/backfill-resend-emails.ts
 *
 * Env vars required (pull from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *
 * Optional:
 *   RESEND_BACKFILL_LIMIT        max emails to process (default: all)
 *   RESEND_BACKFILL_PAGE_SIZE    per-page size (default: 100, max 100)
 *   RESEND_BACKFILL_DRY_RUN      "1" to print without writing
 */

/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const LIMIT = process.env.RESEND_BACKFILL_LIMIT
  ? parseInt(process.env.RESEND_BACKFILL_LIMIT, 10)
  : Infinity;
const PAGE_SIZE = Math.min(
  parseInt(process.env.RESEND_BACKFILL_PAGE_SIZE || '100', 10),
  100
);
const DRY_RUN = process.env.RESEND_BACKFILL_DRY_RUN === '1';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error(
    'Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resend API types (partial)
// ---------------------------------------------------------------------------
interface ResendEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  created_at: string;
  last_event?: string;
  // Per-event timestamp columns (present for historical emails)
  sent_at?: string | null;
  delivered_at?: string | null;
  delivery_delayed_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
}

interface ResendListResponse {
  object: 'list';
  data: ResendEmail[];
  has_more?: boolean;
}

// ---------------------------------------------------------------------------
// HTTP helper with pagination cursor
// ---------------------------------------------------------------------------
async function fetchResendPage(
  after?: string
): Promise<{ data: ResendEmail[]; cursor: string | undefined }> {
  const url = new URL('https://api.resend.com/emails');
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (after) url.searchParams.set('after', after);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as ResendListResponse;
  const data = json.data ?? [];
  // Cursor is the last id per Resend docs
  const cursor =
    data.length === PAGE_SIZE && (json.has_more ?? data.length === PAGE_SIZE)
      ? data[data.length - 1]?.id
      : undefined;

  return { data, cursor };
}

// ---------------------------------------------------------------------------
// Event synthesis
// ---------------------------------------------------------------------------
const EVENT_TIMESTAMP_FIELDS: Array<[string, keyof ResendEmail]> = [
  ['email.sent', 'sent_at'],
  ['email.delivery_delayed', 'delivery_delayed_at'],
  ['email.delivered', 'delivered_at'],
  ['email.opened', 'opened_at'],
  ['email.clicked', 'clicked_at'],
  ['email.bounced', 'bounced_at'],
  ['email.complained', 'complained_at'],
];

function synthesizeEvents(email: ResendEmail) {
  const events: Array<{
    resend_message_id: string;
    event_type: string;
    recipient_email: string | null;
    occurred_at: string;
    raw_payload: Record<string, unknown>;
  }> = [];

  const recipient = email.to?.[0] ?? null;

  for (const [eventType, field] of EVENT_TIMESTAMP_FIELDS) {
    const value = email[field] as string | null | undefined;
    if (!value) continue;

    events.push({
      resend_message_id: email.id,
      event_type: eventType,
      recipient_email: recipient,
      occurred_at: value,
      raw_payload: {
        backfilled: true,
        type: eventType,
        created_at: value,
        data: {
          email_id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
        },
      },
    });
  }

  // If no event timestamps at all, synthesize a "sent" event from created_at
  if (events.length === 0 && email.created_at) {
    events.push({
      resend_message_id: email.id,
      event_type: 'email.sent',
      recipient_email: recipient,
      occurred_at: email.created_at,
      raw_payload: {
        backfilled: true,
        type: 'email.sent',
        created_at: email.created_at,
        data: {
          email_id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
        },
      },
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let totalEmails = 0;
  let totalEvents = 0;
  let cursor: string | undefined = undefined;
  let pageNum = 0;

  console.log(`[backfill] starting${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(
    `[backfill] limit=${LIMIT === Infinity ? 'all' : LIMIT}, page_size=${PAGE_SIZE}`
  );

  while (totalEmails < LIMIT) {
    pageNum += 1;
    console.log(`[backfill] fetching page ${pageNum}${cursor ? ` (after=${cursor})` : ''}...`);

    const { data, cursor: nextCursor } = await fetchResendPage(cursor);

    if (data.length === 0) {
      console.log('[backfill] no more results');
      break;
    }

    // Slice if we would exceed LIMIT
    const remaining = LIMIT - totalEmails;
    const batch = data.slice(0, remaining);

    // --- Upsert into `emails` snapshot table ---
    const emailRows = batch.map((e) => {
      // Determine source: transactional by default, 'crm' gets backfilled by
      // the trigger when a matching crm_contact_log is found via webhook. For
      // purely historical rows with no contact_log_id, mark 'transactional'.
      return {
        resend_message_id: e.id,
        from_address: e.from,
        to_addresses: e.to,
        subject: e.subject,
        tags: null,
        contact_log_id: null,
        source: 'transactional',
        sent_at: e.sent_at ?? e.created_at ?? null,
        delivered_at: e.delivered_at ?? null,
        delivery_delayed_at: e.delivery_delayed_at ?? null,
        opened_at: e.opened_at ?? null,
        clicked_at: e.clicked_at ?? null,
        bounced_at: e.bounced_at ?? null,
        complained_at: e.complained_at ?? null,
        last_event_type: e.last_event ? `email.${e.last_event}` : null,
        last_event_at:
          e.complained_at ??
          e.bounced_at ??
          e.clicked_at ??
          e.opened_at ??
          e.delivered_at ??
          e.delivery_delayed_at ??
          e.sent_at ??
          e.created_at ??
          null,
        first_seen_at: e.created_at,
      };
    });

    if (!DRY_RUN && emailRows.length > 0) {
      // Upsert via the snapshot table — ON CONFLICT on resend_message_id
      const { error: upsertErr } = await (supabase as any)
        .from('emails')
        .upsert(emailRows, {
          onConflict: 'resend_message_id',
          ignoreDuplicates: false,
        });

      if (upsertErr) {
        console.error('[backfill] upsert emails failed:', upsertErr);
        // Continue — the event insert below may still succeed and the trigger
        // will reconstruct the snapshot on future webhook deliveries.
      }
    }

    // --- Insert synthesized events (idempotent via unique constraint) ---
    // NOTE: Turn off the trigger-based snapshot overwrite while inserting
    // backfill events by piggy-backing on ignoreDuplicates=true: we've already
    // populated the snapshot above with the authoritative timestamps from the
    // API, so duplicate snapshot syncs from the trigger are harmless.
    const eventRows = batch.flatMap((e) => synthesizeEvents(e));

    if (!DRY_RUN && eventRows.length > 0) {
      const { error: insErr } = await (supabase as any)
        .from('email_events')
        .upsert(eventRows, {
          onConflict: 'resend_message_id,event_type,occurred_at',
          ignoreDuplicates: true,
        });

      if (insErr) {
        console.error('[backfill] insert email_events failed:', insErr);
      }
    }

    totalEmails += emailRows.length;
    totalEvents += eventRows.length;

    console.log(
      `[backfill] page ${pageNum}: ${emailRows.length} emails, ${eventRows.length} events synthesized · total ${totalEmails}/${LIMIT === Infinity ? '∞' : LIMIT}`
    );

    if (!nextCursor || batch.length < data.length) break;
    cursor = nextCursor;

    // Gentle rate limit — Resend allows ~10 req/s
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(
    `[backfill] done${DRY_RUN ? ' (DRY RUN)' : ''}: ${totalEmails} emails, ${totalEvents} events`
  );
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
