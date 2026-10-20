import 'server-only';

// =============================================================================
// src/lib/lifting/invite-email.ts
//
// The Lift Lab coach-invite email leg. Lives OUTSIDE the `'use server'`
// actions module on purpose:
//   - a `'use server'` file may only export async functions; an earlier
//     `export const __testables = { sendInviteEmail }` in
//     src/app/lifting/actions/invites.ts made Next throw at module load and
//     500'd every action reachable from it, including baseball coach
//     onboarding (incident 2026-10-13, fingerprint d9ed17ef);
//   - exporting `sendInviteEmail` from that file instead would have made it a
//     public, directly-POSTable action that mails arbitrary addresses.
// A plain server-only module is testable and has no action id.
// =============================================================================

import { logServerException } from '@/lib/server-error-logger';
import { renderLiftingInviteEmail } from '@/lib/email/lifting-invite-template';
import { gateCustomerEmail } from '@/lib/email/outbound-gate';

const FEATURE = 'lifting-invites';

/**
 * Build the full accept URL from the token.
 *
 * NEXT_PUBLIC_APP_URL wins; then VERCEL_URL (scheme added when missing); then
 * the production origin. The previous inline version parsed as
 * `(APP_URL ?? VERCEL_URL?.startsWith('http')) ? VERCEL_URL : …`, so a set
 * NEXT_PUBLIC_APP_URL returned the scheme-less deployment host instead.
 */
export function buildLiftingInviteAcceptUrl(token: string): string {
  const vercel = process.env.VERCEL_URL;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (vercel ? (vercel.startsWith('http') ? vercel : `https://${vercel}`) : 'https://helmsportslabs.com');
  return `${base.replace(/\/+$/, '')}/lifting/join/${token}`;
}

/**
 * Send the invite email via Resend. No-op if RESEND_API_KEY is absent (keeps
 * dev/preview safe) or the outbound customer-email gate is closed.
 */
export async function sendLiftingInviteEmail(params: {
  toEmail: string;
  inviterName: string;
  orgName: string;
  roleTitle: string | null;
  token: string;
  expiresAt: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return;
  }

  // Outbound customer-email kill switch (owner decision, 2026-09-06). The
  // invite record itself is still written by the caller — only the email
  // leg is suppressed. See memory/features/email_outbound.md.
  const gate = gateCustomerEmail({
    kind: 'lifting_invite',
    recipientCount: 1,
    source: 'lifting/actions/invites.sendInviteEmail',
  });
  if (!gate.allowed) {
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const acceptUrl = buildLiftingInviteAcceptUrl(params.token);
    const { subject, html, text } = renderLiftingInviteEmail({
      inviterName: params.inviterName,
      orgName: params.orgName,
      roleTitle: params.roleTitle,
      acceptUrl,
      expiresAt: params.expiresAt,
    });

    await resend.emails.send({
      from: 'Helm Sports Labs <noreply@helmsportslabs.com>',
      to: params.toEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    // Email failure must never block the invite being written to the DB.
    await logServerException(
      err instanceof Error ? err : new Error(String(err)),
      {
        action: 'sendLiftingInviteEmail',
        featureArea: FEATURE,
        source: 'server_action',
        handled: true,
        skipSentry: false,
        tags: { sport: 'lifting', feature: FEATURE },
      },
      'warning',
    );
  }
}
