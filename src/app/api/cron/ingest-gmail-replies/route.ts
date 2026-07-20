import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { isGmailReadConfigured, listInboundMessages } from '@/lib/crm/gmail-read';

// ============================================================================
// CRON: mirror coach replies from the admin@ Gmail inbox into crm_replies.
// ============================================================================
//
// Why polling instead of the Resend inbound webhook: outreach deliberately
// keeps Reply-To on the real mailbox so replies feel 1:1 (product decision,
// 2026-07-20) — which means replies never touch Resend. This cron reads the
// mailbox via the DWD service account (gmail.readonly) and inserts any message
// whose sender matches a crm_coaches email. Dedupe: crm_replies.message_id is
// UNIQUE — re-runs and overlapping lookbacks are safe.
//
// INERT until the gmail.readonly scope is added to the DWD client in Google
// Workspace Admin (see src/lib/crm/gmail-read.ts header) — until then the
// token exchange 4xxs and this route reports {ok:true, skipped:'not-armed'}.
//
// Auth: Authorization: Bearer ${CRON_SECRET} (same as sibling crons).
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  // Wrapped in recordJobRun so the admin cron board sees every run, matching
  // every other registered cron (enforced by cron-job-log-coverage.test.ts).
  return recordJobRun('ingest-gmail-replies', async () => {
    if (!isGmailReadConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'gmail-env-missing' });
    }

    try {
      let inbound;
      try {
        inbound = await listInboundMessages(2, 50);
      } catch (err) {
        // Almost certainly the readonly scope isn't granted yet — treat as
        // not-armed rather than an error so the cron stays quiet until setup.
        const msg = err instanceof Error ? err.message : String(err);
        if (/40[13]/.test(msg) || /unauthorized_client|access_denied/i.test(msg)) {
          return NextResponse.json({ ok: true, skipped: 'not-armed', detail: msg.slice(0, 160) });
        }
        throw err;
      }
      if (inbound.length === 0) return NextResponse.json({ ok: true, matched: 0, inserted: 0 });

      const supabase = createAdminClient();

      // Match senders against known coach emails (lowercased).
      const senders = Array.from(new Set(inbound.map((m) => m.fromAddress).filter(Boolean))) as string[];
      const { data: coaches } = await supabase
        .from('crm_coaches')
        .select('id, email')
        .in('email', senders);
      const coachByEmail = new Map(
        ((coaches ?? []) as Array<{ id: string; email: string | null }>)
          .filter((c) => c.email)
          .map((c) => [c.email!.toLowerCase(), c.id] as const),
      );

      let inserted = 0;
      let matched = 0;
      for (const m of inbound) {
        const fromAddress = m.fromAddress;
        if (!fromAddress) continue;
        const coachId = coachByEmail.get(fromAddress);
        if (!coachId) continue;
        matched++;
        // message_id is UNIQUE — ignore duplicates so overlapping lookbacks are free.
        const { error } = await supabase.from('crm_replies').upsert(
          {
            coach_id: coachId,
            thread_id: m.threadId,
            message_id: m.messageIdHeader ?? `gmail:${m.gmailId}`,
            in_reply_to: m.inReplyTo,
            from_address: fromAddress,
            to_addresses: m.toAddresses,
            subject: m.subject,
            body_text: m.bodyText,
            body_html: m.bodyHtml,
            received_at: m.receivedAt,
            raw_payload: { source: 'gmail_poll', gmail_id: m.gmailId },
            is_read: false,
          },
          { onConflict: 'message_id', ignoreDuplicates: true },
        );
        if (error) {
          await logServerError(`ingest-gmail-replies upsert failed: ${error.message}`, {
            action: 'cron.ingest_gmail_replies',
            featureArea: 'crm',
            extra: { gmailId: m.gmailId },
          });
          continue;
        }
        inserted++;
      }

      return NextResponse.json({ ok: true, scanned: inbound.length, matched, inserted });
    } catch (err) {
      await logServerError(
        `ingest-gmail-replies failed: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.ingest_gmail_replies', featureArea: 'crm' },
      );
      return NextResponse.json({ ok: false, error: 'ingest failed' }, { status: 500 });
    }
  });
}
