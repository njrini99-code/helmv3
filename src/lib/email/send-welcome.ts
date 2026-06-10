/**
 * sendWelcomeEmail — helper that renders + sends a welcome email for a
 * newly-onboarded coach account.
 *
 * NOT wired into any live flow yet. See the TODO comment in
 * `src/app/golf/actions/onboarding.ts` (completeCoachOnboarding) for the
 * intended integration point.
 *
 * Usage (when wired up):
 *   import { sendWelcomeEmail } from '@/lib/email/send-welcome';
 *   const result = await sendWelcomeEmail(userId);
 *   // fire-and-forget — never throws; logs on failure
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getResendClient } from '@/lib/email/resend-client';
import { renderWelcomeEmail } from '@/lib/email/templates/welcome';
import { logServerError } from '@/lib/server-error-logger';

export interface SendWelcomeEmailResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  messageId?: string;
}

/**
 * Look up the coach record + team for `userId`, then send a branded welcome
 * email via Resend.
 *
 * Returns `{ sent: false, skipped: true }` when:
 *   - No golf_coaches row exists for the user
 *   - The coach has no email address
 *   - RESEND_API_KEY is absent (local dev / preview)
 *
 * Never throws — all failures are logged via logServerError and returned as
 * `{ sent: false, skipped: false, reason }` so callers stay non-blocking.
 */
export async function sendWelcomeEmail(
  userId: string,
): Promise<SendWelcomeEmailResult> {
  if (!userId) {
    return { sent: false, skipped: true, reason: 'missing-userId' };
  }

  const client = getResendClient();
  if (!client) {
    return { sent: false, skipped: true, reason: 'resend-not-configured' };
  }

  try {
    const admin = createAdminClient();

    // Resolve coach + org name
    const { data: coach, error: coachErr } = await admin
      .from('golf_coaches')
      .select('id, full_name, email, organization_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (coachErr) {
      await logServerError(
        `[sendWelcomeEmail] Coach lookup failed: ${coachErr.message}`,
        { action: 'email.sendWelcomeEmail', featureArea: 'welcome', extra: { userId } },
        'warning',
      );
      return { sent: false, skipped: false, reason: coachErr.message };
    }
    if (!coach) {
      return { sent: false, skipped: true, reason: 'no-coach-record' };
    }
    if (!coach.email?.trim()) {
      return { sent: false, skipped: true, reason: 'missing-email' };
    }

    // Resolve org name (for schoolName) and team join code
    const orgId: string = coach.organization_id ?? '';
    const [orgResult, teamResult] = await Promise.all([
      orgId
        ? admin.from('organizations').select('name').eq('id', orgId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      orgId
        ? admin.from('golf_teams').select('join_code').eq('organization_id', orgId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const schoolName = orgResult.data?.name ?? 'Your Program';
    const teamJoinCode = teamResult.data?.join_code ?? undefined;

    // Parse first name from full_name (e.g. "Chris Jones" → "Chris")
    const firstName = (coach.full_name ?? '').trim().split(/\s+/)[0] || 'Coach';

    const supportEmail =
      process.env.HELM_SUPPORT_EMAIL || 'admin@helmsportslabs.com';

    const { subject, html } = renderWelcomeEmail({
      firstName,
      schoolName,
      teamJoinCode,
      supportEmail,
    });

    const from =
      process.env.RESEND_WELCOME_FROM ||
      process.env.RESEND_COACH_DIGEST_FROM ||
      'Helm Sports <coachhelm@helmsportslabs.com>';

    const { data, error } = await client.emails.send({
      from,
      to: coach.email.trim(),
      subject,
      html,
    });

    if (error) {
      await logServerError(
        `[sendWelcomeEmail] Resend error: ${error.message ?? 'unknown'}`,
        {
          action: 'email.sendWelcomeEmail',
          featureArea: 'welcome',
          extra: { userId, coachId: coach.id, resendErrorName: error.name ?? null },
        },
        'warning',
      );
      return { sent: false, skipped: false, reason: error.message };
    }

    return { sent: true, skipped: false, messageId: data?.id };
  } catch (err) {
    await logServerError(
      `[sendWelcomeEmail] threw: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'email.sendWelcomeEmail',
        featureArea: 'welcome',
        extra: { userId, stack: err instanceof Error ? err.stack : undefined },
      },
      'warning',
    );
    return {
      sent: false,
      skipped: false,
      reason: err instanceof Error ? err.message : 'unknown-error',
    };
  }
}
