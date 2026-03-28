import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';

// Resend event types we track
const TRACKED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
]);

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    [key: string]: unknown;
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Resend Webhook] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();

  // Extract Svix headers (Resend uses Svix under the hood)
  const svixId = request.headers.get('svix-id') || '';
  const svixTimestamp = request.headers.get('svix-timestamp') || '';
  const svixSignature = request.headers.get('svix-signature') || '';

  // Verify the webhook signature
  const wh = new Webhook(webhookSecret);
  let event: ResendWebhookPayload;

  try {
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload;
  } catch (err) {
    console.error('[Resend Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only process tracked event types
  if (!TRACKED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    // Use admin client (service role) since webhooks have no user session
    const adminClient = createAdminClient();
    const recipientEmail = event.data.to?.[0] || null;

    // Look up the contact_log entry by resend_message_id
    const { data: contactLog } = await adminClient
      .from('crm_contact_log')
      .select('id, coach_id')
      .eq('resend_message_id', event.data.email_id)
      .maybeSingle();

    // Upsert the event (idempotent via unique constraint)
    const { error } = await adminClient
      .from('crm_email_events')
      .upsert(
        {
          contact_log_id: contactLog?.id || null,
          resend_message_id: event.data.email_id,
          event_type: event.type,
          recipient_email: recipientEmail,
          occurred_at: event.created_at,
          raw_payload: JSON.parse(JSON.stringify(event)),
        },
        {
          onConflict: 'resend_message_id,event_type,occurred_at',
          ignoreDuplicates: true,
        }
      );

    if (error) {
      console.error('[Resend Webhook] Failed to store event:', error);
    }

    // ── Coach-level side effects based on event type ──
    const coachId = contactLog?.coach_id;

    if (coachId) {
      // Bounce/complaint: mark coach email as invalid so future sends skip them
      if (event.type === 'email.bounced') {
        await adminClient
          .from('crm_coaches')
          .update({ email_status: 'bounced', updated_at: new Date().toISOString() })
          .eq('id', coachId);
      }

      if (event.type === 'email.complained') {
        await adminClient
          .from('crm_coaches')
          .update({ email_status: 'complained', updated_at: new Date().toISOString() })
          .eq('id', coachId);
      }

      // Opened: if coach is still "contacted", auto-advance to "engaged"
      // (they opened our email — that's engagement signal)
      if (event.type === 'email.opened') {
        await adminClient
          .from('crm_coaches')
          .update({ status: 'engaged', updated_at: new Date().toISOString() })
          .eq('id', coachId)
          .eq('status', 'contacted');
      }

      // Clicked: also advance to engaged (stronger signal)
      if (event.type === 'email.clicked') {
        await adminClient
          .from('crm_coaches')
          .update({ status: 'engaged', updated_at: new Date().toISOString() })
          .eq('id', coachId)
          .eq('status', 'contacted');
      }
    }
  } catch (err) {
    console.error('[Resend Webhook] Processing error:', err);
    // Still return 200 to prevent retry storms
  }

  return NextResponse.json({ received: true });
}
