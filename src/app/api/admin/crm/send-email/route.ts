import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

interface Recipient {
  id: string;
  email: string;
  name: string;
  school?: string;
  conference?: string;
}

interface SendEmailRequest {
  recipients: Recipient[];
  subject: string;
  body?: string;
  logOnly?: boolean;
  templateId?: string;
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

    const { recipients, subject, body, logOnly, templateId } = (await request.json()) as SendEmailRequest;

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

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failedRecipients: Array<{ recipientId: string; recipientEmail: string; message: string }> = [];
    const skippedRecipients: Array<{ recipientId: string; recipientEmail: string; reason: string }> = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]!;

      // Skip bounced/complained coaches
      const emailStatus = statusMap.get(recipient.id) ?? 'valid';
      if (emailStatus !== 'valid') {
        skipped++;
        skippedRecipients.push({
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          reason: `email_status: ${emailStatus}`,
        });
        continue;
      }

      try {
        // Replace merge tags with recipient-specific data
        const personalizedSubject = subject
          .replace(/\{name\}/g, recipient.name)
          .replace(/\{school\}/g, recipient.school ?? '')
          .replace(/\{conference\}/g, recipient.conference ?? '');

        const personalizedBody = body
          .replace(/\{name\}/g, recipient.name)
          .replace(/\{school\}/g, recipient.school ?? '')
          .replace(/\{conference\}/g, recipient.conference ?? '');

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: 'Helm Sports Labs <admin@helmsportslabs.com>',
            to: [recipient.email],
            subject: personalizedSubject,
            html: buildEmailHtml(recipient.name, personalizedSubject, personalizedBody),
          }),
        });

        if (res.ok) {
          const resendData = await res.json() as { id: string };
          sent++;
          await supabase.from('crm_contact_log').insert({
            coach_id: recipient.id,
            contact_type: 'email',
            subject: personalizedSubject,
            notes: `Bulk email: "${personalizedSubject}"`,
            resend_message_id: resendData.id,
            created_by: user.id,
          });
          const sendNow = new Date().toISOString();
          // Auto-advance new_lead → contacted on first outreach
          await supabase.from('crm_coaches').update({
            last_contacted_at: sendNow,
            updated_at: sendNow,
          }).eq('id', recipient.id);
          await supabase.from('crm_coaches').update({
            status: 'contacted',
          }).eq('id', recipient.id).eq('status', 'new_lead');
        } else {
          failed++;
          const failureBody = (await res.text().catch(() => '')).slice(0, 500);
          failedRecipients.push({
            recipientId: recipient.id,
            recipientEmail: recipient.email,
            message: failureBody || `Resend returned ${res.status}`,
          });
        }
      } catch (error) {
        failed++;
        failedRecipients.push({
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      // 200ms delay between sends to avoid Resend rate limits
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // ── Increment template usage count ──
    if (templateId && sent > 0) {
      try {
        const { data: tpl } = await supabase
          .from('crm_email_templates' as 'crm_contact_log')
          .select('usage_count')
          .eq('id', templateId)
          .single() as { data: { usage_count: number } | null };

        if (tpl) {
          await supabase
            .from('crm_email_templates' as 'crm_contact_log')
            .update({ usage_count: (tpl.usage_count ?? 0) + 1 } as Record<string, unknown>)
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

    return NextResponse.json({ sent, failed, skipped, total: recipients.length });
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

function buildEmailHtml(_recipientName: string, subject: string, body: string): string {
  const bodyHtml = body
    .split('\n')
    .map(line => line.trim() === '' ? '<br/>' : `<p style="margin:0 0 12px 0;line-height:1.6;color:#44403c;">${escapeHtml(line)}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#FFFEFA;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background-color:#1C1917;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#16A34A,#15803d);border-radius:10px;display:inline-block;text-align:center;line-height:36px;color:white;font-weight:bold;font-size:16px;">H</div>
              </td>
              <td style="padding-left:12px;">
                <span style="color:white;font-size:18px;font-weight:700;letter-spacing:-0.02em;">Helm Sports Labs</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Green accent -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#16A34A,#15803d);"></td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 20px 0;font-size:20px;font-weight:700;color:#1c1917;">${escapeHtml(subject)}</h1>
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background-color:#fafaf9;border-top:1px solid #e7e5e4;">
          <p style="margin:0;font-size:12px;color:#a8a29e;text-align:center;">
            Helm Sports Labs &bull; College Golf Team Management
          </p>
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
