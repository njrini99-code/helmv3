import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import {
  classifyEngagement,
  countsAsHumanEngagement,
  type EngagementClassification,
} from '@/lib/crm/engagement-quality';
import {
  evaluateAutomationsForEvent,
  type CrmAutomation,
  type CrmAutomationEvent,
  type CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';
import { describeError } from '@/lib/utils/describe-error';

// Resend event types we track.
// Unsubscribe handling note: Resend has NO `email.unsubscribed` / `contact.unsubscribed`
// event. An Audiences managed unsubscribe surfaces as `contact.updated` with the
// contact's `unsubscribed` flag flipped to true — that's what we key on below. The
// PRIMARY unsubscribe channel for this CRM is the one-click List-Unsubscribe header
// → /api/crm/unsubscribe route (which writes suppression directly). `email.unsubscribed`
// is kept tracked only because a legacy DB trigger (trg_write_suppression_on_unsubscribe)
// fires off its email_events row; app code does NOT double-write it.
const TRACKED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.unsubscribed',
  'contact.updated',
]);

// The only two Resend events an email-security scanner can manufacture, and
// therefore the only two we run through the engagement classifier. `sent` /
// `delivered` / `delivery_delayed` are emitted by Resend's own pipeline and
// `bounced` / `complained` / `unsubscribed` are mailbox-provider verdicts —
// none of those can be forged by a machine walking the links in a message, so
// gating them on engagement quality would only suppress real deliverability
// signal. See src/lib/crm/engagement-quality.ts for the measurements.
const ENGAGEMENT_EVENTS = new Set(['email.opened', 'email.clicked']);

/**
 * The per-event detail block Resend attaches to open and click webhooks
 * (`data.open` / `data.click`). Shape confirmed against stored `raw_payload`
 * rows in production.
 *
 * `userAgent` here is very nearly always the literal string
 * `"Amazon CloudFront"` — Resend proxies opens and clicks through its own
 * tracking edge, so the *originating* client's UA never reaches us. That is
 * one more reason latency (not user-agent matching) is the operative
 * discriminator in the classifier; the field is still forwarded because the
 * classifier treats UA as a one-way downgrade that can never manufacture a
 * human verdict.
 */
interface ResendEngagementDetail {
  ipAddress?: string;
  userAgent?: string;
  timestamp?: string;
  link?: string;
}

interface ResendWebhookPayload {
  type: string;
  /** Envelope timestamp — when the EVENT happened. */
  created_at: string;
  data: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    /**
     * The payload's own copy of the message's SEND time — not the event time
     * (that is the envelope `created_at` above). Verified across 1,656 stored
     * open/click events: it tracks `emails.sent_at` to within 0.33s. Used as
     * the last-resort reference timestamp when the `emails` snapshot row is
     * missing, so classification keeps working instead of degrading to
     * 'unknown'.
     */
    created_at?: string;
    open?: ResendEngagementDetail;
    click?: ResendEngagementDetail;
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
    // The table's unique key is (email, reason), so the existence check keys on
    // both — otherwise a later 'complained' would be skipped because a
    // 'hard_bounce' row already exists, losing the reason dimension.
    const { data: existing } = await adminClient
      .from('crm_email_suppressions')
      .select('id')
      .eq('email', normalized)
      .eq('reason', reason)
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
      `[Resend Webhook] Failed to suppress ${reason} for ${normalized}: ${describeError(err)}`,
      { action: 'route.POST', metadata: { reason, coachId } },
    );
  }
}

/**
 * Fallback coach resolution for an event whose `email_id` never matched a
 * `crm_contact_log` row.
 *
 * Why this exists: CRM outreach stopped writing `crm_contact_log.resend_message_id`
 * on 2026-06-17 (the outreach path moved to Gmail), so from 2026-06-26 onward
 * *every* incoming Resend event resolved `contact_log_id = null`. 170 opens and
 * clicks landed in `email_events` attached to nobody, driving no automation and
 * freezing the coach mirror. Measured against that backlog, matching on the
 * recipient address recovers 96 of the 170.
 *
 * Case-insensitivity is load-bearing, not defensive politeness: of those 96,
 * only 86 match with a byte-exact comparison. Ten real engagements hinge purely
 * on the address being stored in `crm_coaches` with different casing than the
 * mailbox reports it.
 *
 * PostgREST cannot express `lower(email) = $1`, so we narrow with ILIKE and
 * then confirm the match in TypeScript. ILIKE treats `_` and `%` as wildcards
 * and `_` genuinely occurs in coach addresses (`smith_a@lynchburg.edu` is in
 * the live table), so an unescaped pattern can only ever match MORE rows than
 * intended, never fewer — and the exact lowercase comparison below discards the
 * extras. Escaping the wildcards instead would push a backslash through the
 * PostgREST query string, which is the more fragile of the two options and
 * risks the opposite (and much worse) failure mode of silently matching
 * nothing.
 */
async function resolveCoachIdByEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string | null,
): Promise<string | null> {
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return null;

  try {
    const { data } = await adminClient
      .from('crm_coaches')
      .select('id, email, created_at')
      .ilike('email', normalized)
      .order('created_at', { ascending: true })
      .limit(10);

    const matches = (data ?? []).filter(
      (row) => typeof row.email === 'string' && row.email.toLowerCase().trim() === normalized,
    );
    if (matches.length === 0) return null;

    // Deterministic winner when the table holds the same address twice under
    // different casing: prefer the byte-exact row, else the oldest.
    const exact = matches.find((row) => row.email === email);
    return (exact ?? matches[0])?.id ?? null;
  } catch (err) {
    await logServerError(
      `[Resend Webhook] Coach lookup by recipient failed for ${normalized}: ${describeError(err)}`,
      { action: 'route.POST', metadata: { recipient: normalized } },
    );
    return null;
  }
}

/**
 * Advance `crm_coaches.last_email_event_type` / `last_email_event_at`.
 *
 * ## Why this lives in app code at all
 *
 * There is already a DB trigger for this — `email_events_sync_coach` →
 * `sync_coach_last_email_event()`. It is not broken and it is not disabled.
 * Its first statement is:
 *
 *     IF NEW.contact_log_id IS NULL THEN RETURN NEW; END IF;
 *
 * It resolves the coach *only* through `contact_log_id`. Once CRM outreach
 * stopped stamping `crm_contact_log.resend_message_id` (last one written
 * 2026-06-17), every subsequent `email_events` row carried a NULL
 * `contact_log_id` and the trigger short-circuited on its very first line. The
 * mirror's last advance is 2026-06-25 22:32 — the same day the final event with
 * a resolvable contact log arrived. Since 2026-06-26, 0 of ~500 events had one.
 *
 * So the mirror was never "not keeping up": it was structurally unreachable for
 * the coach-resolution path this route now adds. This function is therefore not
 * a redundant second write — it covers exactly the rows the trigger declines to
 * handle, and it is deliberately SKIPPED when `contact_log_id` resolved a coach,
 * so the two paths can never fight over the same row.
 *
 * The normalization and the monotonic guard below replicate the trigger's
 * semantics exactly ('opened', not 'email.opened'; `>=` so a same-instant event
 * still refreshes the type). Keeping them identical is the point — a coach whose
 * events arrive down one path must end up indistinguishable from one whose
 * events arrive down the other.
 *
 * (The long-term fix is to teach the trigger about `email_events.coach_id` so
 * one mechanism owns this again. That is a migration on a table with live
 * triggers and belongs in its own change.)
 */
async function syncCoachLastEmailEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  coachId: string,
  eventType: string,
  occurredAt: string,
): Promise<void> {
  // Trigger parity: the denorm column stores the bare verb so downstream
  // consumers read 'opened' rather than 'email.opened'.
  const normalizedType = eventType.startsWith('email.') ? eventType.slice(6) : eventType;

  try {
    const { data: coach } = await adminClient
      .from('crm_coaches')
      .select('last_email_event_at')
      .eq('id', coachId)
      .maybeSingle();

    // Monotonic guard, matching the trigger's
    // `(last_email_event_at IS NULL OR NEW.occurred_at >= last_email_event_at)`.
    // Read-then-write is not atomic here; the worst case is an out-of-order
    // webhook pair landing in the same millisecond and the older type winning.
    // Resend delivers these seconds apart and the field is a display
    // convenience, so a compare-and-set round trip would cost more than the
    // race does.
    const previous = coach?.last_email_event_at ?? null;
    if (previous !== null && new Date(occurredAt).getTime() < new Date(previous).getTime()) {
      return;
    }

    await adminClient
      .from('crm_coaches')
      .update({
        last_email_event_type: normalizedType,
        last_email_event_at: occurredAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', coachId);
  } catch (err) {
    await logServerError(
      `[Resend Webhook] Failed to sync last_email_event for coach ${coachId}: ${describeError(err)}`,
      { action: 'route.POST', metadata: { coachId, eventType } },
    );
  }
}

/** `data.click` for a click event, `data.open` for an open, `null` otherwise. */
function engagementDetail(event: ResendWebhookPayload): ResendEngagementDetail | null {
  const detail = event.type === 'email.clicked' ? event.data.click : event.data.open;
  return typeof detail === 'object' && detail !== null ? detail : null;
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
    await logServerError(`[Resend Webhook] Signature verification failed: ${describeError(err)}`, { action: 'route.POST' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only process tracked event types
  if (!TRACKED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    // Use admin client (service role) since webhooks have no user session
    const adminClient = createAdminClient();
    const isEmailEvent = event.type.startsWith('email.');
    // `email.*` events carry the recipient in data.to[]; the `contact.updated`
    // event carries it in data.email instead. Fall back across both so
    // suppression always has an address to key on.
    const recipientEmail =
      event.data.to?.[0] || (event.data.email as string | undefined) || null;

    // Only `email.*` events have a resend message id / email_events row. A
    // `contact.*` event isn't an email event — skip the contact-log lookup +
    // email_events mirror for it (it only drives suppression below).
    let contactLog: { id: string; coach_id: string | null } | null = null;
    // Provider retries are normal. Only the request that actually creates the
    // immutable event row may run configurable CRM automations; otherwise one
    // Resend retry can create duplicate tasks or replay a stage transition.
    let emailEventCreated = false;
    // Set when the contact-log path failed and the recipient address resolved a
    // coach instead. Drives the app-side mirror write (the DB trigger cannot
    // see this resolution — see syncCoachLastEmailEvent).
    let resolvedViaRecipient = false;
    let coachId: string | null = null;

    if (isEmailEvent && event.data.email_id) {
      const { data } = await adminClient
        .from('crm_contact_log')
        .select('id, coach_id')
        .eq('resend_message_id', event.data.email_id)
        .maybeSingle();
      contactLog = data as { id: string; coach_id: string | null } | null;

      // Attribution, in priority order. The contact log is authoritative when
      // present; the recipient address is the recovery path for the ~100% of
      // current events that have no contact log at all. Resolving BEFORE the
      // upsert lets the attribution ride along on the event row itself.
      coachId = contactLog?.coach_id ?? null;
      if (!coachId) {
        coachId = await resolveCoachIdByEmail(adminClient, recipientEmail);
        resolvedViaRecipient = coachId !== null;
      }

      // Upsert the event (idempotent via unique constraint).
      // Table renamed from `crm_email_events` -> `email_events` in
      // 20260420000000_resend_activity_mirror.sql. A trigger on this table
      // auto-syncs the `emails` snapshot used by the admin dashboard.
      //
      // `coach_id` is the new denorm column from
      // 20260724000000_crm_inbound_signal_capture.sql. Persisting the resolution
      // here is what makes "which coach did this open belong to?" answerable in
      // SQL — previously the answer only ever existed for the duration of this
      // request. The `as any` cast (already required for this table) also covers
      // the column not yet being in the generated types.
      const { data: insertedEvent, error } = await adminClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('email_events' as any)
        .upsert(
          {
            contact_log_id: contactLog?.id || null,
            coach_id: coachId,
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
        )
        .select('id')
        .maybeSingle();

      if (error) {
        await logServerError(`[Resend Webhook] Failed to store event: ${describeError(error)}`, { action: 'route.POST' });
      } else {
        // ON CONFLICT DO NOTHING returns no row. That is the reliable signal
        // that this delivery was a replay and its side effects already ran.
        emailEventCreated = Boolean(insertedEvent);
      }
    }

    // ── Engagement quality ──
    //
    // Corporate mail security appliances follow every link in a message before
    // the recipient sees it, and they spoof real browser user-agents while
    // doing it (79 demo sessions, one Chrome UA, 49 distinct IPs). 93% of all
    // recorded clicks fired under two minutes after delivery. Treating those as
    // buying signals is what put fake "engaged" coaches on the board.
    //
    // The raw event is ALWAYS recorded above — we are not throwing data away,
    // we are refusing to let a machine drive a CRM side effect.
    let engagement: EngagementClassification | null = null;
    if (isEmailEvent && ENGAGEMENT_EVENTS.has(event.type) && event.data.email_id) {
      // Reference timestamp, most authoritative first:
      //   1. emails.delivered_at — when the mailbox accepted the message, i.e.
      //      the moment a scanner starts walking its links.
      //   2. emails.sent_at — when we handed it to Resend.
      //   3. event.data.created_at — the payload's own send time (see the
      //      interface doc). Keeps classification alive when the `emails`
      //      snapshot row is missing or hasn't been written yet.
      // If all three are absent we pass null and accept 'unknown'. Substituting
      // a merely nearby timestamp would produce a confident wrong answer.
      const { data: emailRow } = await adminClient
        .from('emails')
        .select('delivered_at, sent_at')
        .eq('resend_message_id', event.data.email_id)
        .maybeSingle();

      const detail = engagementDetail(event);
      engagement = classifyEngagement({
        occurredAt: event.created_at,
        referenceAt: emailRow?.delivered_at ?? emailRow?.sent_at ?? event.data.created_at ?? null,
        userAgent: detail?.userAgent ?? null,
        ip: detail?.ipAddress ?? null,
      });
    }

    // ── Coach-level side effects ──
    //
    // Hardwired safety actions stay here (bounce/complaint MUST suppress
    // future sends — too risky to defer to a configurable rule). Everything
    // else (open/click → engaged, etc.) flows through crm_automations so the
    // operator can edit/disable rules in Settings → Automations without a
    // deploy.

    // `contact.updated` only means an unsubscribe when its `unsubscribed` flag is true.
    const isAudienceUnsub = event.type === 'contact.updated' && event.data.unsubscribed === true;

    // Hardwired suppression-list writes (G7). bounce/complaint/unsubscribe each
    // permanently disqualify the address — write a crm_email_suppressions row
    // keyed on the recipient email so the send-time guard skips it forever.
    // These run independently of coachId because an Audiences unsubscribe won't
    // resolve a contact_log row, and even an un-linked bounce should still suppress.
    // NOTE: `email.unsubscribed` is intentionally NOT handled here — the legacy DB
    // trigger trg_write_suppression_on_unsubscribe writes that suppression off the
    // email_events row, so app code would only double-write it.
    if (event.type === 'email.bounced') {
      await suppressEmail(adminClient, recipientEmail, 'hard_bounce', coachId);
    } else if (event.type === 'email.complained') {
      await suppressEmail(adminClient, recipientEmail, 'complained', coachId);
    } else if (isAudienceUnsub) {
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
      if (event.type === 'email.unsubscribed' || isAudienceUnsub) {
        await adminClient
          .from('crm_coaches')
          .update({ email_status: 'unsubscribed', updated_at: new Date().toISOString() })
          .eq('id', coachId);
      }

      // Advance the activity mirror for coaches the DB trigger cannot reach.
      //
      // Predicate note: this uses `verdict !== 'automated'` rather than
      // countsAsHumanEngagement(), and the difference is deliberate.
      // `last_email_event_*` is a factual "most recent thing the mailbox told us
      // about this address" field, not a buying signal — an 'unknown' verdict
      // (no reference timestamp available) must still advance it. Gating the
      // mirror on countsAsHumanEngagement() would freeze it again for exactly
      // the unmeasurable events that froze it the first time. Status
      // promotions, tasks and enrolments below use the strict predicate.
      if (
        emailEventCreated &&
        resolvedViaRecipient &&
        (engagement === null || engagement.verdict !== 'automated')
      ) {
        await syncCoachLastEmailEvent(adminClient, coachId, event.type, event.created_at);
      }

      // Configurable rules: load active automations matching this trigger
      // event, evaluate against the coach + event metadata, execute the
      // resulting actions. Seeded rules in 20260429T2_crm_automations.sql
      // mirror the previous hardcoded open/click → 'engaged' behavior.
      //
      // The engagement gate below is what stops a security scanner from
      // promoting a coach to 'engaged' (the seeded open/click rule does exactly
      // that) or from opening a follow-up task for an email nobody read.
      // countsAsHumanEngagement() is the strict predicate: 'unknown' returns
      // false, on purpose. An event we cannot measure is not evidence of a
      // buyer, and quietly assuming otherwise is how six weeks of poisoned
      // metrics got here. Non-engagement events (bounce, complaint,
      // unsubscribe, delivered) are unclassified and pass through untouched.
      const automationsAllowed =
        (!isEmailEvent || emailEventCreated) &&
        (engagement === null || countsAsHumanEngagement(engagement));

      if (automationsAllowed) {
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
                  const tag = (action.params as { value?: string }).value;
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
                  `[Resend Webhook] Automation action ${action.kind} failed: ${describeError(actionErr)}`,
                  { action: 'route.POST', metadata: { coachId, event: event.type, action } },
                );
              }
            }
          }
        } catch (autoErr) {
          await logServerError(
            `[Resend Webhook] Automation evaluation failed: ${describeError(autoErr)}`,
            { action: 'route.POST', metadata: { coachId, event: event.type } },
          );
        }
      }
    }
  } catch (err) {
    await logServerError(`[Resend Webhook] Processing error: ${describeError(err)}`, { action: 'route.POST' });
    // Still return 200 to prevent retry storms
  }

  return NextResponse.json({ received: true });
}
