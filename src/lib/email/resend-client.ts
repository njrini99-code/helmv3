/**
 * Resend client — typed wrapper.
 *
 * Lazy-initializes the Resend SDK using `RESEND_API_KEY`. In environments
 * without the key (local dev, preview branches, tests), the module exports a
 * null client and `sendCoachDigest()` short-circuits to a no-op. This keeps
 * the 06:30 UTC cron idempotent and safe to trigger from any deploy.
 *
 * We purposefully do NOT reuse the notification-email.ts Resend client — this
 * wrapper is Wave 1C's surface and stays scoped to the coach digest.
 */

import { Resend } from 'resend';
import { logServerError } from '@/lib/server-error-logger';

// ─── Singleton client ───────────────────────────────────────────────────────

let _resend: Resend | null | undefined;

/** Lazy singleton. Returns `null` when `RESEND_API_KEY` is absent. */
export function getResendClient(): Resend | null {
  if (_resend !== undefined) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    _resend = null;
    return null;
  }
  _resend = new Resend(apiKey);
  return _resend;
}

/** Exposed for tests — allows resetting the cached client between runs. */
export function __resetResendClientForTests(): void {
  _resend = undefined;
}

// ─── Public send API ────────────────────────────────────────────────────────

export interface SendCoachDigestArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  coachId?: string;
}

export interface SendCoachDigestResult {
  sent: boolean;
  skipped: boolean;
  messageId?: string;
  reason?: string;
}

const DEFAULT_FROM = 'Helm CoachHelm <coachhelm@helmsportslabs.com>';

/**
 * Sends a single coach-digest email.
 *
 * Returns `{ sent: false, skipped: true }` when the client is not configured
 * (missing `RESEND_API_KEY`) or the recipient is empty — callers count these
 * as "skipped" rather than "failed".
 *
 * Throws any unexpected SDK error after logging via `logServerError`, so the
 * cron's per-coach `try/catch` can bump the failure counter cleanly.
 */
export async function sendCoachDigest(
  args: SendCoachDigestArgs,
): Promise<SendCoachDigestResult> {
  const to = (args.to ?? '').trim();
  if (!to) {
    return { sent: false, skipped: true, reason: 'missing-recipient' };
  }

  const client = getResendClient();
  if (!client) {
    return { sent: false, skipped: true, reason: 'resend-not-configured' };
  }

  const from = process.env.RESEND_COACH_DIGEST_FROM || DEFAULT_FROM;

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (error) {
      await logServerError(
        `sendCoachDigest failed: ${error.message ?? 'unknown error'}`,
        {
          action: 'email.sendCoachDigest',
          featureArea: 'coach-digest',
          extra: {
            coachId: args.coachId ?? null,
            resendErrorName: error.name ?? null,
          },
        },
        'error',
      );
      return { sent: false, skipped: false, reason: error.message };
    }

    return { sent: true, skipped: false, messageId: data?.id };
  } catch (err) {
    await logServerError(
      `sendCoachDigest threw: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'email.sendCoachDigest',
        featureArea: 'coach-digest',
        extra: {
          coachId: args.coachId ?? null,
          stack: err instanceof Error ? err.stack : undefined,
        },
      },
      'error',
    );
    throw err;
  }
}
