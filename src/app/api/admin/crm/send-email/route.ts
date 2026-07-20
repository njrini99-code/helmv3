import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { mergeTags } from '@/lib/crm/merge-tags';
import { applyUnsubTag } from '@/lib/crm/unsubscribe-token';
import { buildOutreachExtras } from '@/lib/crm/outreach-headers';

interface Recipient {
  id: string;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  school?: string;
  conference?: string;
  division?: string;
  program?: string;
  team_size?: number;
  current_software?: string;
}

interface SendEmailRequest {
  recipients: Recipient[];
  subject: string;
  body?: string;
  logOnly?: boolean;
  templateId?: string;
  /** plain (default) wraps body in greeting/signature shell.
   *  html  sends the body verbatim as the full email document.
   *  text  sends a true text/plain email — no HTML shell, no logo. Best for
   *        personal cold outreach that should land in Gmail Primary. The body
   *        must be self-contained (its own greeting + sign-off). */
  format?: 'plain' | 'html' | 'text';
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    // Auth check - must be logged-in admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email ?? null;

    // Verify admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { recipients, subject, body, logOnly, templateId, format } = (await request.json()) as SendEmailRequest;
    const isHtmlBody = format === 'html';
    const isTextBody = format === 'text';

    if (!recipients?.length || !subject?.trim()) {
      return NextResponse.json({ error: 'Missing required fields: recipients, subject' }, { status: 400 });
    }

    if (recipients.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 recipients per batch' }, { status: 400 });
    }

    // ── Log-only mode (used when sending via Gmail — just record the contact) ──
    if (logOnly) {
      const now = new Date().toISOString();
      const loggingFailures: Array<{ recipientId: string; recipientEmail: string; message: string }> = [];

      for (const recipient of recipients) {
        try {
          await supabase.from('crm_contact_log').insert({
            coach_id: recipient.id,
            contact_type: 'email',
            notes: `Sent via Gmail (BCC): "${subject}"`,
            created_by: user.id,
          });
          // Auto-advance new_lead → contacted on first outreach
          await supabase.from('crm_coaches').update({
            last_contacted_at: now,
            updated_at: now,
          }).eq('id', recipient.id);
          await supabase.from('crm_coaches').update({
            status: 'contacted',
          }).eq('id', recipient.id).eq('status', 'new_lead');
        } catch (error) {
          loggingFailures.push({
            recipientId: recipient.id,
            recipientEmail: recipient.email,
            message: error instanceof Error ? error.message : String(error),
          });
          // Continue logging others even if one fails
        }
      }

      if (loggingFailures.length > 0) {
        await logServerError(`CRM log-only email logging partially failed for ${loggingFailures.length} recipient(s)`, {
          action: 'crmSendEmailApi.logOnly',
          source: 'route_handler',
          featureArea: 'admin_crm',
          route: '/api/admin/crm/send-email',
          userId,
          userEmail,
          extra: {
            subject,
            totalRecipients: recipients.length,
            failedCount: loggingFailures.length,
            failures: loggingFailures.slice(0, 10),
          },
        }, 'warning');
      }

      return NextResponse.json({ logged: recipients.length });
    }

    // ── Send mode (individual branded emails via Resend) ──
    if (!body?.trim()) {
      return NextResponse.json({ error: 'Message body is required for sending' }, { status: 400 });
    }

    // ── Daily limit check ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: dailyCount } = await supabase
      .from('crm_contact_log')
      .select('*', { count: 'exact', head: true })
      .not('resend_message_id', 'is', null)
      .gte('contact_date', today.toISOString());

    if ((dailyCount ?? 0) >= 500) {
      return NextResponse.json({ error: 'Daily email limit reached (500). Try again tomorrow.' }, { status: 429 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      await logServerError('CRM send-email route is missing RESEND_API_KEY', {
        action: 'crmSendEmailApi.missingApiKey',
        source: 'route_handler',
        featureArea: 'admin_crm',
        route: '/api/admin/crm/send-email',
        userId,
        userEmail,
        extra: {
          recipientCount: recipients.length,
          subject,
        },
      }, 'critical');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    // ── Fetch email_status for all recipients to skip bounced ──
    const recipientIds = recipients.map(r => r.id);
    const { data: coachStatuses } = await supabase
      .from('crm_coaches')
      .select('id, email_status')
      .in('id', recipientIds) as { data: Array<{ id: string; email_status: string | null }> | null };

    const statusMap = new Map<string, string>();
    for (const cs of coachStatuses ?? []) {
      statusMap.set(cs.id, cs.email_status ?? 'valid');
    }

    // ── Also skip any address on the suppression list ──
    // crm_email_suppressions is the authoritative do-not-contact source. An address
    // can be suppressed (hard_bounce/complained/unsubscribed) without crm_coaches.
    // email_status reflecting it — e.g. an unlinked webhook event (coach_id null), an
    // Audiences unsubscribe, or an email shared across multiple coach rows. Checking
    // only email_status would re-mail those, the exact harm suppression prevents.
    const recipientEmailsLower = recipients.map(r => r.email.toLowerCase());
    const { data: suppRows } = await supabase
      .from('crm_email_suppressions')
      .select('email')
      .in('email', recipientEmailsLower) as { data: Array<{ email: string }> | null };
    const suppressedEmails = new Set((suppRows ?? []).map(s => (s.email ?? '').toLowerCase()));

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failedRecipients: Array<{ recipientId: string; recipientEmail: string; message: string }> = [];
    const skippedRecipients: Array<{ recipientId: string; recipientEmail: string; reason: string }> = [];
    // Flat detail rows the BulkEmailModal "Show details" panel reads off data.details.
    const details: Array<{ name: string; email: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }> = [];

    const fromAddress = process.env.HELM_FROM_EMAIL ?? 'Helm Sports Labs <admin@helmsportslabs.com>';

    // ── Build the batch: one email object per NON-skipped recipient ──
    // `included[i]` (the recipient) stays index-aligned with `batchEmails[i]`
    // (the payload) and with the batch response `data[i].id`, so we can map a
    // Resend message id back to the right coach for the contact-log + status promotion.
    type BatchEmail = {
      from: string;
      to: string[];
      subject: string;
      reply_to?: string;
      headers: Record<string, string>;
      tags: { name: string; value: string }[];
      text?: string;
      html?: string;
    };
    const included: Array<{ recipient: Recipient; subject: string }> = [];
    const batchEmails: BatchEmail[] = [];

    for (const recipient of recipients) {
      // Skip bounced/complained coaches AND anyone on the suppression list.
      const emailStatus = statusMap.get(recipient.id) ?? 'valid';
      const isSuppressed = suppressedEmails.has(recipient.email.toLowerCase());
      if (emailStatus !== 'valid' || isSuppressed) {
        skipped++;
        const reason = emailStatus !== 'valid'
          ? `email_status: ${emailStatus}`
          : 'suppressed (do-not-contact list)';
        skippedRecipients.push({
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          reason,
        });
        details.push({ name: recipient.name, email: recipient.email, status: 'skipped', reason });
        continue;
      }

      // Replace merge tags with recipient-specific data (shared single source — closes G10)
      const personalizedSubject = mergeTags(subject, recipient);
      // {unsubscribe_url} resolves server-side only (HMAC token) — after mergeTags.
      const personalizedBody = applyUnsubTag(mergeTags(body, recipient), recipient.id);

      const extras = buildOutreachExtras({
        coachId: recipient.id,
        format: format ?? 'plain',
        campaign: 'crm_bulk',
        division: recipient.division,
      });

      const email: BatchEmail = {
        from: fromAddress,
        to: [recipient.email],
        subject: personalizedSubject,
        reply_to: extras.reply_to,
        headers: extras.headers,
        tags: extras.tags,
        // text → true text/plain (no shell); html → verbatim; plain → branded shell.
        ...(isTextBody
          ? { text: personalizedBody }
          : {
              html: isHtmlBody
                ? personalizedBody
                : buildEmailHtml(recipient.name, personalizedSubject, personalizedBody),
            }),
      };

      included.push({ recipient, subject: personalizedSubject });
      batchEmails.push(email);
    }

    // ── Single Resend BATCH call for every included recipient (max 100) ──
    // Records the per-recipient outcome: a successful batch maps data[i].id back
    // to included[i]; a non-200 batch / network error records every included
    // recipient as failed (closes G2, G13).
    if (included.length > 0) {
      let batchData: Array<{ id?: string }> | null = null;
      let batchErrorMessage: string | null = null;

      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            // Provider-side exactly-once for the whole batch: survives a crash/retry
            // between POST-success and the DB writes below. Keyed on the chunk's first
            // recipient + size so two same-day 100-recipient chunks don't collide.
            'Idempotency-Key': `crm-bulk-${user.id}-${today.getTime()}-${included[0]!.recipient.id}-${included.length}`,
          },
          body: JSON.stringify(batchEmails),
        });

        if (res.ok) {
          const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
          batchData = Array.isArray(json?.data) ? json!.data : null;
          if (!batchData) {
            batchErrorMessage = 'Resend batch returned an unexpected response shape';
          }
        } else {
          batchErrorMessage = (await res.text().catch(() => '')).slice(0, 500) || `Resend batch returned ${res.status}`;
        }
      } catch (error) {
        batchErrorMessage = error instanceof Error ? error.message : String(error);
      }

      const sendNow = new Date().toISOString();

      for (let i = 0; i < included.length; i++) {
        const { recipient, subject: personalizedSubject } = included[i]!;
        const resendId = batchData ? batchData[i]?.id : undefined;

        if (resendId) {
          sent++;
          details.push({ name: recipient.name, email: recipient.email, status: 'sent' });
          // A test send (sendTestTemplate) uses a synthetic `test-<uuid>` recipient id
          // that is NOT a real coach — never log it, promote a status, or it would
          // create an orphan/misattributed contact-log row.
          const isTestSend = recipient.id.startsWith('test-');
          if (!isTestSend) {
            // Structured attribution in `metadata` jsonb (added by migration
            // 20260617180000); the daily-cap counter still keys on resend_message_id.
            await supabase.from('crm_contact_log').insert({
              coach_id: recipient.id,
              contact_type: 'email',
              subject: personalizedSubject,
              notes: `Bulk email: "${personalizedSubject}"`,
              resend_message_id: resendId,
              created_by: user.id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              metadata: { campaign: 'crm_bulk', template_id: templateId ?? null } as any,
            });
            // Auto-advance new_lead → contacted on first outreach
            await supabase.from('crm_coaches').update({
              last_contacted_at: sendNow,
              updated_at: sendNow,
            }).eq('id', recipient.id);
            await supabase.from('crm_coaches').update({
              status: 'contacted',
            }).eq('id', recipient.id).eq('status', 'new_lead');
          }
        } else {
          failed++;
          const message = batchErrorMessage ?? 'Resend batch did not return an id for this recipient';
          failedRecipients.push({
            recipientId: recipient.id,
            recipientEmail: recipient.email,
            message,
          });
          details.push({ name: recipient.name, email: recipient.email, status: 'failed', reason: message });
        }
      }
    }

    // ── Track template usage: count EMAILS SENT (not send-clicks) + last use ──
    if (templateId && sent > 0) {
      try {
        const { data: tpl } = (await fromUntyped(supabase, 'crm_email_templates')
          .select('usage_count')
          .eq('id', templateId)
          .single()) as { data: { usage_count: number | null } | null };

        if (tpl) {
          await fromUntyped(supabase, 'crm_email_templates')
            .update({
              usage_count: (tpl.usage_count ?? 0) + sent,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', templateId);
        }
      } catch {
        // Non-critical — don't fail the response
      }
    }

    if (failed > 0) {
      await logServerError(`CRM send-email route failed for ${failed} of ${recipients.length} recipient(s)`, {
        action: 'crmSendEmailApi.send',
        source: 'route_handler',
        featureArea: 'admin_crm',
        route: '/api/admin/crm/send-email',
        userId,
        userEmail,
        extra: {
          subject,
          sent,
          failed,
          skipped,
          totalRecipients: recipients.length,
          failures: failedRecipients.slice(0, 10),
          skippedRecipients: skippedRecipients.slice(0, 10),
        },
      }, failed === recipients.length ? 'critical' : 'warning');
    }

    // `details` is the flat, per-recipient outcome array the BulkEmailModal "Show
    // details" panel reads off data.details — returning it makes that panel go live
    // (closes G11). The {sent,failed,skipped,total} aggregate counts are preserved.
    return NextResponse.json({ sent, failed, skipped, total: recipients.length, details });
  } catch (error) {
    await logServerError(`CRM send-email route failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'crmSendEmailApi',
      source: 'route_handler',
      featureArea: 'admin_crm',
      route: '/api/admin/crm/send-email',
      userId,
      userEmail,
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
      },
    }, 'critical');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildEmailHtml(recipientName: string, _subject: string, body: string): string {
  // Extract last name for greeting, handling suffixes like Jr., Sr., III, IV, II
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
    .map(line => line.trim() === '' ? '<br/>' : `<p style="margin:0 0 12px 0;line-height:1.6;color:#44403c;font-size:15px;">${escapeHtml(line)}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Greeting -->
        <tr><td style="padding:32px 32px 0 32px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:#1c1917;font-weight:600;">Coach ${escapeHtml(lastName)},</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 32px 32px;">
          ${bodyHtml}
        </td></tr>
        <!-- Signature -->
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
