import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

// ============================================================================
// Resend Inbound Email Receiving webhook
// ============================================================================
//
// Resend offers Inbound Email Receiving (a separate product from outbound).
// The operator must:
//   1. Configure an inbound domain (e.g. mx.helmsportslabs.com) in the
//      Resend dashboard with the documented MX records.
//   2. Add a webhook endpoint pointing at /api/webhooks/resend-inbound.
//   3. Re-use the existing RESEND_WEBHOOK_SECRET (Svix-signed payloads —
//      same verification flow as the outbound /api/webhooks/resend route).
//
// Inbound payload shape (per Resend docs at the time of writing):
//   {
//     "type": "email.received",
//     "created_at": "2026-04-29T18:00:00.000Z",
//     "data": {
//       "from": "coach@example.edu",
//       "to": ["admin@helmsportslabs.com"],
//       "subject": "Re: Quick intro",
//       "text": "Sounds good — let's chat next week.",
//       "html": "<p>Sounds good — let's chat next week.</p>",
//       "messageId": "<inbound-id@example.edu>",
//       "inReplyTo": "<outbound-id@helmsportslabs.com>",
//       "references": ["<thread-root@helmsportslabs.com>", "<outbound-id@helmsportslabs.com>"]
//     }
//   }
//
// We tolerate alternate casings (in_reply_to, message_id, etc.) defensively
// in case Resend's payload format drifts.
// ============================================================================

interface ResendInboundPayload {
  type?: string;
  created_at?: string;
  data?: {
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
    message_id?: string;
    inReplyTo?: string;
    in_reply_to?: string;
    references?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Field accessors — Resend payload casing has been observed to drift.
// ----------------------------------------------------------------------------
function pickMessageId(data: NonNullable<ResendInboundPayload['data']>): string | null {
  return (data.messageId as string | undefined) ?? (data.message_id as string | undefined) ?? null;
}

function pickInReplyTo(data: NonNullable<ResendInboundPayload['data']>): string | null {
  return (
    (data.inReplyTo as string | undefined) ?? (data.in_reply_to as string | undefined) ?? null
  );
}

function pickReferences(data: NonNullable<ResendInboundPayload['data']>): string[] {
  return Array.isArray(data.references) ? (data.references as string[]) : [];
}

// thread_id = root of the conversation. Prefer references[0] (always the
// thread root by RFC 5322), fall back to inReplyTo, then the message's own
// Message-ID (orphan = thread of one).
function computeThreadId(data: NonNullable<ResendInboundPayload['data']>): string | null {
  const refs = pickReferences(data);
  if (refs.length > 0 && typeof refs[0] === 'string') return refs[0];
  const irt = pickInReplyTo(data);
  if (irt) return irt;
  return pickMessageId(data);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    await logServerError(
      '[Resend Inbound Webhook] RESEND_WEBHOOK_SECRET not configured',
      { action: 'route.POST' },
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Read raw body for signature verification.
  const rawBody = await request.text();

  // Extract Svix headers (Resend uses Svix under the hood — same verification
  // flow as the outbound webhook at /api/webhooks/resend).
  const svixId = request.headers.get('svix-id') ?? '';
  const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
  const svixSignature = request.headers.get('svix-signature') ?? '';

  const wh = new Webhook(webhookSecret);
  let event: ResendInboundPayload;

  try {
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendInboundPayload;
  } catch (err) {
    await logServerError(
      `[Resend Inbound Webhook] Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'route.POST' },
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const data = event.data ?? {};
  const messageId = pickMessageId(data);

  if (!messageId) {
    // No Message-ID → can't dedupe. Log & accept (200) so Resend doesn't retry.
    await logServerError(
      '[Resend Inbound Webhook] Inbound payload missing Message-ID',
      { action: 'route.POST' },
    );
    return NextResponse.json({ received: true, skipped: true, reason: 'missing_message_id' });
  }

  const fromAddress = (data.from as string | undefined) ?? '';
  if (!fromAddress) {
    await logServerError(
      '[Resend Inbound Webhook] Inbound payload missing From address',
      { action: 'route.POST' },
    );
    return NextResponse.json({ received: true, skipped: true, reason: 'missing_from' });
  }

  try {
    const adminClient = createAdminClient();
    const inReplyTo = pickInReplyTo(data);
    const threadId = computeThreadId(data);

    // Best-effort: try to attach the reply to the original outbound contact_log
    // by matching in_reply_to → crm_contact_log.resend_message_id. Pull coach_id
    // through for downstream surfaces (coach timeline / sequence stop trigger).
    let coachId: string | null = null;
    let contactLogId: string | null = null;

    if (inReplyTo) {
      const { data: contactLog } = await adminClient
        .from('crm_contact_log')
        .select('id, coach_id')
        .eq('resend_message_id', inReplyTo)
        .maybeSingle();
      if (contactLog) {
        contactLogId = (contactLog as { id: string }).id;
        coachId = (contactLog as { coach_id: string | null }).coach_id ?? null;
      }
    }

    // Insert idempotently on message_id (UNIQUE in 20260429T3_crm_replies.sql).
    const { error } = await adminClient
      // Supabase typed client doesn't know crm_replies yet (DB types regen
      // happens after migration applies). Cast through `as any` to bypass.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('crm_replies' as any)
      .upsert(
        {
          coach_id: coachId,
          contact_log_id: contactLogId,
          thread_id: threadId,
          message_id: messageId,
          in_reply_to: inReplyTo,
          from_address: fromAddress,
          to_addresses: Array.isArray(data.to) ? data.to : [],
          subject: (data.subject as string | undefined) ?? null,
          body_text: (data.text as string | undefined) ?? null,
          body_html: (data.html as string | undefined) ?? null,
          received_at: event.created_at ?? new Date().toISOString(),
          raw_payload: JSON.parse(JSON.stringify(event)),
        },
        {
          onConflict: 'message_id',
          ignoreDuplicates: true,
        },
      );

    if (error) {
      await logServerError(
        `[Resend Inbound Webhook] Failed to store reply: ${error.message}`,
        { action: 'route.POST' },
      );
    }

    // TODO (orchestrator): once Wave A1's 20260505T1_crm_sequences.sql lands,
    // add a separate migration with a trigger that flips active
    // crm_sequence_enrollments rows to status='stopped',
    // stop_reason='replied' on insert here. Skipping in this wave to avoid
    // migration ordering issues.
  } catch (err) {
    await logServerError(
      `[Resend Inbound Webhook] Processing error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'route.POST' },
    );
    // Still return 200 to prevent retry storms.
  }

  return NextResponse.json({ received: true });
}
