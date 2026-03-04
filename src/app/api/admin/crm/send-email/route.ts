import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Recipient {
  id: string;
  email: string;
  name: string;
}

interface SendEmailRequest {
  recipients: Recipient[];
  subject: string;
  body?: string;
  logOnly?: boolean;
}

export async function POST(request: Request) {
  try {
    // Auth check - must be logged-in admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { recipients, subject, body, logOnly } = (await request.json()) as SendEmailRequest;

    if (!recipients?.length || !subject?.trim()) {
      return NextResponse.json({ error: 'Missing required fields: recipients, subject' }, { status: 400 });
    }

    if (recipients.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 recipients per batch' }, { status: 400 });
    }

    // ── Log-only mode (used when sending via Gmail — just record the contact) ──
    if (logOnly) {
      const now = new Date().toISOString();
      for (const recipient of recipients) {
        try {
          await supabase.from('crm_contact_log').insert({
            coach_id: recipient.id,
            contact_type: 'email',
            notes: `Sent via Gmail (BCC): "${subject}"`,
            created_by: user.id,
          });
          await supabase.from('crm_coaches').update({
            last_contacted_at: now,
            updated_at: now,
          }).eq('id', recipient.id);
        } catch {
          // Continue logging others even if one fails
        }
      }
      return NextResponse.json({ logged: recipients.length });
    }

    // ── Send mode (individual branded emails via Resend) ──
    if (!body?.trim()) {
      return NextResponse.json({ error: 'Message body is required for sending' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const personalizedBody = body.replace(/\{name\}/g, recipient.name);

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: 'Helm Sports Labs <admin@helmsportslabs.com>',
            to: [recipient.email],
            subject,
            html: buildEmailHtml(recipient.name, subject, personalizedBody),
          }),
        });

        if (res.ok) {
          sent++;
          await supabase.from('crm_contact_log').insert({
            coach_id: recipient.id,
            contact_type: 'email',
            notes: `Bulk email: "${subject}"`,
            created_by: user.id,
          });
          await supabase.from('crm_coaches').update({
            last_contacted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', recipient.id);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ sent, failed, total: recipients.length });
  } catch {
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
