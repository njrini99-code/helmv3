import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import {
  evaluateAutomationsForEvent,
  type CrmAutomation,
  type CrmAutomationEvent,
  type CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';

// Resend event types we track
const TRACKED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  // Resend emits TWO distinct unsubscribe shapes: the legacy `email.unsubscribed`
  // on a per-email event, and `contact.unsubscribed` from the Audiences product
  // (the real event fired when a recipient uses a managed unsubscribe link).
  // Track both so neither slips through to suppression. (G16)
  'email.unsubscribed',
  'contact.unsubscribed',
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

// crm_email_suppressions.reason / .source allowed values (see DB enum). The
// enum carries 'hard_bounce' / 'complained' / 'unsubscribed' values that were
// previously dead because no webhook code wrote them. (G7)
type SuppressionReason = 'hard_bounce' | 'complained' | 'unsubscribed' | 'manual' | 'invalid';

// Idempotently add an address to crm_email_suppressions so future sends skip
// it. Mirrors the check-then-insert dedupe in
// src/app/api/crm/unsubscribe/route.ts (the table has no app-relied-on unique
// constraint). Best-effort: failures are logged but never block the webhook.
async function suppressEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string | null,
  reason: SuppressionReason,
  coachId: string | null,
): Promise<void> {
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return;
  try {
    const { data: existing } = await adminClient
      .from('crm_email_suppressions')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();
    if (!existing) {
      await adminClient.from('crm_email_suppressions').insert({
        email: normalized,
        reason,
        source: 'resend_webhook',
        metadata: coachId ? { coach_id: coachId } : null,
      });
    }
  } catch (err) {
    await logServerError(
      `[Resend Webhook] Failed to suppress ${reason} for ${normalized}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'route.POST', metadata: { reason, coachId } },
    );
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    await logServerError('[Resend Webhook] RESEND_WEBHOOK_SECRET not configured', { action: 'route.POST' });
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
    await logServerError(`[Resend Webhook] Signature verification failed: ${err instanceof Error ? err.message : String(err)}`, { action: 'route.POST' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only process tracked event types
  if (!TRACKED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    // Use admin client (service role) since webhooks have no user session
    const adminClient = createAdminClient();
    // `email.*` events carry the recipient in data.to[]; the Audiences
    // `contact.unsubscribed` event carries it in data.email instead. Fall
    // back across both so suppression always has an address to key on.
    const recipientEmail =
      event.data.to?.[0] || (event.data.email as string | undefined) || null;

    // Look up the contact_log entry by resend_message_id
    const { data: contactLog } = await adminClient
      .from('crm_contact_log')
      .select('id, coach_id')
      .eq('resend_message_id', event.data.email_id)
      .maybeSingle();

    // Upsert the event (idempotent via unique constraint).
    // Table renamed from `crm_email_events` -> `email_events` in
    // 20260420000000_resend_activity_mirror.sql. A trigger on this table
    // auto-syncs the `emails` snapshot used by the admin dashboard.
    const { error } = await adminClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('email_events' as any)
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
      await logServerError(`[Resend Webhook] Failed to store event: ${error instanceof Error ? error.message : String(error)}`, { action: 'route.POST' });
    }

    // ── Coach-level side effects ──
    //
    // Hardwired safety actions stay here (bounce/complaint MUST suppress
    // future sends — too risky to defer to a configurable rule). Everything
    // else (open/click → engaged, etc.) flows through crm_automations so the
    // operator can edit/disable rules in Settings → Automations without a
    // deploy.
    const coachId = contactLog?.coach_id ?? null;

    // Hardwired suppression-list writes (G7). bounce/complaint/unsubscribe each
    // permanently disqualify the address — write a crm_email_suppressions row
    // keyed on the recipient email so the send-time guard skips it forever.
    // These run independently of coachId because an Audiences
    // `contact.unsubscribed` event won't resolve a contact_log row, and even an
    // un-linked bounce should still be suppressed.
    if (event.type === 'email.bounced') {
      await suppressEmail(adminClient, recipientEmail, 'hard_bounce', coachId);
    } else if (event.type === 'email.complained') {
      await suppressEmail(adminClient, recipientEmail, 'complained', coachId);
    } else if (event.type === 'email.unsubscribed' || event.type === 'contact.unsubscribed') {
      // G16: the real Audiences unsubscribe event is `contact.unsubscribed`.
      await suppressEmail(adminClient, recipientEmail, 'unsubscribed', coachId);
    }

    if (coachId) {
      // Hardwired: bounce/complaint marks the coach email as bad so future
      // sends skip them. This is a deliverability invariant, not a tunable
      // policy — keep it in code.
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
      if (event.type === 'email.unsubscribed' || event.type === 'contact.unsubscribed') {
        await adminClient
          .from('crm_coaches')
          .update({ email_status: 'unsubscribed', updated_at: new Date().toISOString() })
          .eq('id', coachId);
      }

      // Configurable rules: load active automations matching this trigger
      // event, evaluate against the coach + event metadata, execute the
      // resulting actions. Seeded rules in 20260429T2_crm_automations.sql
      // mirror the previous hardcoded open/click → 'engaged' behavior.
      try {
        const trigger = event.type as CrmAutomationTrigger;
        const { data: rulesData } = await adminClient
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('crm_automations' as any)
          .select('*')
          .eq('trigger_event', trigger)
          .eq('is_active', true);

        if (rulesData && rulesData.length > 0) {
          // Pull the coach snapshot so conditions like coach.status work.
          const { data: coach } = await adminClient
            .from('crm_coaches')
            .select('id, status, email_status, priority, division, conference, tags')
            .eq('id', coachId)
            .maybeSingle();

          const evalEvent: CrmAutomationEvent = {
            trigger_event: trigger,
            coach: coach ?? null,
            metadata: {
              email_id: event.data.email_id,
              recipient_email: recipientEmail,
              event_type: event.type,
            },
          };

          const { actions } = evaluateAutomationsForEvent(
            evalEvent,
            rulesData as unknown as CrmAutomation[],
          );

          for (const action of actions) {
            try {
              if (action.kind === 'set_coach_status') {
                const value = (action.params as { value?: string }).value;
                if (value) {
                  await adminClient
                    .from('crm_coaches')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .update({ status: value as any, updated_at: new Date().toISOString() })
                    .eq('id', coachId);
                }
              } else if (action.kind === 'add_tag') {
                const tag = (action.params as { tag?: string }).tag;
                if (tag && coach) {
                  // Append to tags[] array; dedupe in TS since SQL array_append
                  // doesn't dedupe.
                  const existing = Array.isArray(coach.tags) ? coach.tags : [];
                  if (!existing.includes(tag)) {
                    await adminClient
                      .from('crm_coaches')
                      .update({ tags: [...existing, tag], updated_at: new Date().toISOString() })
                      .eq('id', coachId);
                  }
                }
              } else if (action.kind === 'create_task') {
                const params = action.params as {
                  title?: string;
                  due_in_hours?: number;
                  priority?: string;
                  kind?: string;
                };
                if (params.title) {
                  const dueAt = params.due_in_hours
                    ? new Date(Date.now() + params.due_in_hours * 3600_000).toISOString()
                    : null;
                  await adminClient
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('crm_tasks' as any)
                    .insert({
                      coach_id: coachId,
                      title: params.title,
                      due_at: dueAt,
                      priority: params.priority ?? 'normal',
                      kind: params.kind ?? 'follow_up',
                      source: 'automation',
                      // FK-required: use the rule's created_by as the task author.
                      created_by: (rulesData[0] as unknown as { created_by: string }).created_by,
                    });
                }
              } else if (action.kind === 'enroll_in_sequence') {
                const sequenceId = (action.params as { sequence_id?: string }).sequence_id;
                if (sequenceId) {
                  await adminClient
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('crm_sequence_enrollments' as any)
                    .insert({
                      sequence_id: sequenceId,
                      coach_id: coachId,
                      enrolled_by: (rulesData[0] as unknown as { created_by: string }).created_by,
                      next_send_at: new Date().toISOString(),
                    })
                    .select()
                    .maybeSingle();
                }
              }
            } catch (actionErr) {
              await logServerError(
                `[Resend Webhook] Automation action ${action.kind} failed: ${actionErr instanceof Error ? actionErr.message : String(actionErr)}`,
                { action: 'route.POST', metadata: { coachId, event: event.type, action } },
              );
            }
          }
        }
      } catch (autoErr) {
        await logServerError(
          `[Resend Webhook] Automation evaluation failed: ${autoErr instanceof Error ? autoErr.message : String(autoErr)}`,
          { action: 'route.POST', metadata: { coachId, event: event.type } },
        );
      }
    }
  } catch (err) {
    await logServerError(`[Resend Webhook] Processing error: ${err instanceof Error ? err.message : String(err)}`, { action: 'route.POST' });
    // Still return 200 to prevent retry storms
  }

  return NextResponse.json({ received: true });
}
