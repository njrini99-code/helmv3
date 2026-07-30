import { Resend } from 'resend';
import type { DigestEmail } from './build-digest';

/**
 * DEDICATED ops-notification transport (owner decision #10).
 * Own client instance + OWN SECRET (OPS_DIGEST_RESEND_API_KEY) — follows
 * the codebase's isolated-client-per-surface convention (see
 * the notification layer's own refusal to share clients) with a stricter
 * secret boundary. Touches ZERO customer-outreach tables and imports ZERO
 * CRM code. Fail-soft: unconfigured → skipped, never a cron failure.
 */

let _client: Resend | null | undefined;

function getOpsClient(): Resend | null {
  if (_client !== undefined) return _client;
  const key = process.env.OPS_DIGEST_RESEND_API_KEY;
  _client = key ? new Resend(key) : null;
  return _client;
}

export function __resetOpsTransportForTests(): void {
  _client = undefined;
}

export interface SendOpsDigestResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  messageId?: string;
}

const DEFAULT_FROM = 'Cup of Helm <bridge@helmsportslabs.com>';

export interface OpsAlert {
  subject: string;
  text: string;
  html?: string;
}

/**
 * One-off ops notification through the same dedicated transport — for events
 * that shouldn't wait for the daily digest (e.g. a new demo request). Same
 * fail-soft contract: unconfigured → skipped, never throws.
 */
export async function sendOpsAlert(alert: OpsAlert): Promise<SendOpsDigestResult> {
  const client = getOpsClient();
  if (!client) return { sent: false, skipped: true, reason: 'ops-transport-not-configured' };

  const to = (process.env.OPS_DIGEST_TO ?? '').trim();
  if (!to) return { sent: false, skipped: true, reason: 'missing-recipient' };

  const { data, error } = await client.emails.send({
    from: process.env.OPS_DIGEST_FROM || DEFAULT_FROM,
    to,
    subject: alert.subject,
    text: alert.text,
    ...(alert.html ? { html: alert.html } : {}),
  });
  if (error) return { sent: false, skipped: false, reason: error.message ?? 'send failed' };
  return { sent: true, skipped: false, messageId: data?.id };
}

export async function sendOpsDigest(email: DigestEmail): Promise<SendOpsDigestResult> {
  return sendOpsAlert({ subject: email.subject, text: email.text, html: email.html });
}
