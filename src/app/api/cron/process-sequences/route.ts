/**
 * Vercel Cron handler that processes due email-sequence enrollments.
 *
 * Schedule: every 10 minutes — see vercel.json `crons` entry (added by the
 *           orchestrator).
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends
 *       this header automatically; do not trust `x-vercel-cron` alone since
 *       it is not stripped from inbound external traffic.
 *
 * Per-tick algorithm (see Phase 2 plan):
 *   1. Fetch enrollments where status='active' AND next_send_at <= now()
 *      (limit 100).
 *   2. For each enrollment, in parallel via Promise.allSettled:
 *      a. Stop conditions:
 *           - coach in crm_email_suppressions          → stop, 'unsubscribed'
 *           - coach.email_status in ('bounced','complained','unsubscribed')
 *                                                       → stop, 'bounced'
 *      b. Look up the step at current_step (1-indexed: step_order = current_step + 1).
 *           - No more steps → mark completed, stop_reason='sequence_completed'.
 *      c. Otherwise: render the email (template + per-step overrides) and
 *         send via Resend with the same buildEmailHtml shell as
 *         /api/admin/crm/send-email/route.ts. Insert a contact_log row,
 *         bump current_step, set next_send_at to now()+next_step.delay_hours
 *         OR null when no next step (and mark completed).
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICK_BATCH_SIZE = 100;

// ============================================================================
// Types — kept local; the action file's types are not imported here because
// this route uses the service-role admin client (bypasses RLS) and operates
// against raw rows.
// ============================================================================
interface EnrollmentRow {
  id: string;
  sequence_id: string;
  coach_id: string;
  status: string;
  current_step: number;
  next_send_at: string | null;
}

interface StepRow {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_hours: number;
  template_id: string | null;
  subject_override: string | null;
  body_override: string | null;
}

interface CoachRow {
  id: string;
  name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  school: string | null;
  conference: string | null;
  division: string | null;
  program: string | null;
  team_size: number | null;
  current_software: string | null;
  email_status: string | null;
}

interface TemplateRow {
  id: string;
  subject: string;
  body: string;
  format: string | null;
}

// ============================================================================
// HTTP entry
// ============================================================================
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await tick();
    return NextResponse.json({
      ok: true,
      processed_at: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logServerError(
      `[cron.process-sequences] unexpected error: ${message}`,
      { action: 'cron.process_sequences' },
      'error',
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// One tick — fetch due enrollments and process each.
// ============================================================================
async function tick(): Promise<{
  candidates: number;
  sent: number;
  stopped: number;
  completed: number;
  failed: number;
}> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  const nowIso = new Date().toISOString();

  // 1. Pull due enrollments.
  const { data: due, error: dueErr } = await client
    .from('crm_sequence_enrollments')
    .select('id, sequence_id, coach_id, status, current_step, next_send_at')
    .eq('status', 'active')
    .not('next_send_at', 'is', null)
    .lte('next_send_at', nowIso)
    .order('next_send_at', { ascending: true })
    .limit(TICK_BATCH_SIZE);

  if (dueErr) {
    throw new Error(`Failed to fetch due enrollments: ${dueErr.message}`);
  }

  const enrollments = (due ?? []) as EnrollmentRow[];
  if (enrollments.length === 0) {
    return { candidates: 0, sent: 0, stopped: 0, completed: 0, failed: 0 };
  }

  let sent = 0;
  let stopped = 0;
  let completed = 0;
  let failed = 0;

  // 2. Process each enrollment in parallel; one failure shouldn't block the
  // batch.
  const settled = await Promise.allSettled(
    enrollments.map((e) => processEnrollment(client, e)),
  );

  for (const r of settled) {
    if (r.status !== 'fulfilled') {
      failed += 1;
      continue;
    }
    if (r.value.outcome === 'sent') sent += 1;
    else if (r.value.outcome === 'stopped') stopped += 1;
    else if (r.value.outcome === 'completed') completed += 1;
    else if (r.value.outcome === 'failed') failed += 1;
  }

  return { candidates: enrollments.length, sent, stopped, completed, failed };
}

type ProcessOutcome = 'sent' | 'stopped' | 'completed' | 'failed';

async function processEnrollment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  enrollment: EnrollmentRow,
): Promise<{ outcome: ProcessOutcome }> {
  // ── Load coach (we need email + merge-tag fields + email_status) ──
  const { data: coachRaw, error: coachErr } = await client
    .from('crm_coaches')
    .select(
      'id, name, email, first_name, last_name, title, school, conference, division, program, team_size, current_software, email_status',
    )
    .eq('id', enrollment.coach_id)
    .single();

  if (coachErr || !coachRaw) {
    await stopEnrollment(client, enrollment.id, 'manual');
    return { outcome: 'stopped' };
  }
  const coach = coachRaw as CoachRow;

  // ── Stop condition: bounced / complained / unsubscribed status ──
  const status = (coach.email_status ?? 'valid').toLowerCase();
  if (status === 'bounced' || status === 'complained') {
    await stopEnrollment(client, enrollment.id, 'bounced');
    return { outcome: 'stopped' };
  }
  if (status === 'unsubscribed') {
    await stopEnrollment(client, enrollment.id, 'unsubscribed');
    return { outcome: 'stopped' };
  }

  // ── Stop condition: email present in suppression list ──
  if (coach.email) {
    const { data: supp, error: suppErr } = await client
      .from('crm_email_suppressions')
      .select('id')
      .eq('email', coach.email)
      .limit(1);
    if (!suppErr && supp && (supp as Array<unknown>).length > 0) {
      await stopEnrollment(client, enrollment.id, 'unsubscribed');
      return { outcome: 'stopped' };
    }
  } else {
    // No email — nothing to send. Stop manually so we don't re-tick.
    await stopEnrollment(client, enrollment.id, 'manual');
    return { outcome: 'stopped' };
  }

  // ── Resolve current step (step_order = current_step + 1) ──
  const targetOrder = enrollment.current_step + 1;
  const { data: stepData, error: stepErr } = await client
    .from('crm_sequence_steps')
    .select(
      'id, sequence_id, step_order, delay_hours, template_id, subject_override, body_override',
    )
    .eq('sequence_id', enrollment.sequence_id)
    .eq('step_order', targetOrder)
    .maybeSingle();

  if (stepErr) {
    throw new Error(`Failed to load step: ${stepErr.message}`);
  }

  if (!stepData) {
    // No step at this order → sequence finished.
    await client
      .from('crm_sequence_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        stop_reason: 'sequence_completed',
        next_send_at: null,
      })
      .eq('id', enrollment.id);
    return { outcome: 'completed' };
  }

  const step = stepData as StepRow;

  // ── Resolve subject/body. Override > template > skip ──
  let subject = step.subject_override ?? '';
  let body = step.body_override ?? '';
  let format: 'plain' | 'html' = 'plain';

  if ((!subject || !body) && step.template_id) {
    const { data: tplData, error: tplErr } = await client
      .from('crm_email_templates')
      .select('id, subject, body, format')
      .eq('id', step.template_id)
      .maybeSingle();
    if (tplErr) {
      throw new Error(`Failed to load template: ${tplErr.message}`);
    }
    if (tplData) {
      const tpl = tplData as TemplateRow;
      if (!subject) subject = tpl.subject;
      if (!body) body = tpl.body;
      if (tpl.format === 'html') format = 'html';
    }
  }

  if (!subject || !body) {
    // Mis-configured step — stop the enrollment manually so it doesn't loop.
    await stopEnrollment(client, enrollment.id, 'manual');
    return { outcome: 'stopped' };
  }

  // ── Personalize merge tags ──
  const personalizedSubject = applyMergeTags(subject, coach);
  const personalizedBody = applyMergeTags(body, coach);

  // ── Send via Resend ──
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await logServerError(
      'process-sequences cron is missing RESEND_API_KEY',
      { action: 'cron.process_sequences.missing_api_key' },
      'critical',
    );
    return { outcome: 'failed' };
  }

  const recipientName = coach.name ?? coach.email!;
  const html =
    format === 'html'
      ? personalizedBody
      : buildEmailHtml(recipientName, personalizedSubject, personalizedBody);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:
        process.env.HELM_FROM_EMAIL ??
        'Helm Sports Labs <admin@helmsportslabs.com>',
      to: [coach.email],
      subject: personalizedSubject,
      html,
    }),
  });

  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 500);
    await logServerError(
      `[cron.process-sequences] Resend send failed (${res.status}): ${text}`,
      {
        action: 'cron.process_sequences.send_failed',
        extra: {
          enrollment_id: enrollment.id,
          coach_id: coach.id,
          step_id: step.id,
        },
      },
      'warning',
    );
    return { outcome: 'failed' };
  }

  const json = (await res.json()) as { id?: string };
  const resendMessageId = json.id ?? null;

  // ── Log contact ──
  await client.from('crm_contact_log').insert({
    coach_id: coach.id,
    contact_type: 'email',
    subject: personalizedSubject,
    notes: `Sequence step ${step.step_order}: "${personalizedSubject}"`,
    resend_message_id: resendMessageId,
    metadata: {
      sequence_id: enrollment.sequence_id,
      sequence_enrollment_id: enrollment.id,
      sequence_step_id: step.id,
      sequence_step_order: step.step_order,
    },
  });

  // ── Look up next step to schedule next_send_at ──
  const { data: nextStepData } = await client
    .from('crm_sequence_steps')
    .select('id, delay_hours')
    .eq('sequence_id', enrollment.sequence_id)
    .eq('step_order', targetOrder + 1)
    .maybeSingle();

  if (nextStepData) {
    const nextStep = nextStepData as { delay_hours: number };
    const nextSendAt = new Date(
      Date.now() + nextStep.delay_hours * 60 * 60 * 1000,
    ).toISOString();
    await client
      .from('crm_sequence_enrollments')
      .update({
        current_step: targetOrder,
        next_send_at: nextSendAt,
      })
      .eq('id', enrollment.id);
  } else {
    // No next step — mark completed.
    await client
      .from('crm_sequence_enrollments')
      .update({
        current_step: targetOrder,
        status: 'completed',
        completed_at: new Date().toISOString(),
        stop_reason: 'sequence_completed',
        next_send_at: null,
      })
      .eq('id', enrollment.id);
  }

  return { outcome: 'sent' };
}

// ============================================================================
// Helpers
// ============================================================================
async function stopEnrollment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  enrollmentId: string,
  reason: 'replied' | 'unsubscribed' | 'bounced' | 'manual' | 'sequence_completed',
): Promise<void> {
  await client
    .from('crm_sequence_enrollments')
    .update({
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      stop_reason: reason,
      next_send_at: null,
    })
    .eq('id', enrollmentId);
}

function applyMergeTags(input: string, coach: CoachRow): string {
  const name = coach.name ?? '';
  const firstName = coach.first_name ?? name.split(' ')[0] ?? '';
  const lastName = coach.last_name ?? name.split(' ').slice(1).join(' ') ?? '';
  return input
    .replace(/\{name\}/g, name)
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{last_name\}/g, lastName)
    .replace(/\{title\}/g, coach.title ?? '')
    .replace(/\{school\}/g, coach.school ?? '')
    .replace(/\{conference\}/g, coach.conference ?? '')
    .replace(/\{division\}/g, coach.division ?? '')
    .replace(/\{program\}/g, coach.program ?? '')
    .replace(/\{team_size\}/g, String(coach.team_size ?? ''))
    .replace(/\{current_software\}/g, coach.current_software ?? '');
}

// ----------------------------------------------------------------------------
// Email shell — mirrors buildEmailHtml from
// src/app/api/admin/crm/send-email/route.ts so plain-text bodies render with
// the same greeting + signature shell. Kept in-file rather than imported to
// keep the cron route's surface area self-contained.
// ----------------------------------------------------------------------------
function buildEmailHtml(
  recipientName: string,
  _subject: string,
  body: string,
): string {
  const knownSuffixes = ['jr.', 'sr.', 'iii', 'iv', 'ii'];
  const nameParts = recipientName.split(' ');
  let lastName: string;
  if (nameParts.length > 1) {
    const lastWord = nameParts[nameParts.length - 1]!.toLowerCase();
    if (knownSuffixes.includes(lastWord) && nameParts.length > 2) {
      lastName = nameParts[nameParts.length - 2]!;
    } else {
      lastName = nameParts[nameParts.length - 1]!;
    }
  } else {
    lastName = nameParts[0]!;
  }

  const bodyHtml = body
    .split('\n')
    .map((line) =>
      line.trim() === ''
        ? '<br/>'
        : `<p style="margin:0 0 12px 0;line-height:1.6;color:#44403c;font-size:15px;">${escapeHtml(line)}</p>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:32px 32px 0 32px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:#1c1917;font-weight:600;">Coach ${escapeHtml(lastName)},</p>
        </td></tr>
        <tr><td style="padding:0 32px 32px 32px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:0 32px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="border-top:1px solid #e7e5e4;padding-top:20px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:top;padding-right:14px;">
                  <img src="${escapeHtml(process.env.HELM_LOGO_URL ?? 'https://helmsportslabs.com/helm-golf-logo-transparent.png')}" alt="GolfHelm" width="44" height="44" style="display:block;border:0;" />
                </td>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 2px 0;font-size:15px;color:#44403c;line-height:1.5;">Best,</p>
                  <p style="margin:0 0 2px 0;font-size:15px;color:#1c1917;font-weight:600;line-height:1.5;">${escapeHtml(process.env.HELM_FOUNDER_LINE ?? 'Leah Potter & Nick Rini')}</p>
                  <p style="margin:0 0 4px 0;font-size:13px;color:#78716c;line-height:1.5;">Co-Founders, Helm Sports Labs</p>
                  <p style="margin:0;font-size:13px;line-height:1.5;">
                    <a href="https://${escapeHtml(process.env.HELM_DOMAIN ?? 'helmsportslabs.com')}" style="color:#16A34A;text-decoration:none;font-weight:500;">${escapeHtml(process.env.HELM_DOMAIN ?? 'helmsportslabs.com')}</a>
                    <span style="color:#d6d3d1;margin:0 6px;">|</span>
                    <a href="mailto:admin@${escapeHtml(process.env.HELM_DOMAIN ?? 'helmsportslabs.com')}" style="color:#78716c;text-decoration:none;">admin@${escapeHtml(process.env.HELM_DOMAIN ?? 'helmsportslabs.com')}</a>
                  </p>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
