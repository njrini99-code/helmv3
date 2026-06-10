/**
 * Team invite email — used by `invitePlayerToTeam`.
 *
 * Sends a transactional email to a prospective player containing the team
 * join URL plus a fallback join code. Recipients are NOT yet users, so we
 * cannot route through `sendEmailNotification` (which requires a user id for
 * preference lookup). Instead we use the same lazy `getResendClient` wrapper
 * the coach digest uses.
 *
 * The function is fire-and-forget at the call site — failures are logged via
 * `logServerError` (warning) but never thrown, so a coach who clicks "invite"
 * still receives the join URL even when email delivery is degraded.
 *
 * Retrofit (2026-06-10): HTML now uses renderBrandedEmail for consistent
 * logo + card + footer across all Helm transactional mail.
 */

import { getResendClient } from './resend-client';
import { logServerError } from '@/lib/server-error-logger';
import { renderBrandedEmail, escapeHtml } from '@/lib/email/layout';

const BRAND = {
  green:      '#16A34A',
  greenLight: '#DCFCE7',
  greenXLight:'#F0FDF4',
  greenDeep:  '#166534',
  dark:       '#1C1917',
  muted:      '#78716C',
  white:      '#FFFFFF',
} as const;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const DEFAULT_FROM = 'Helm Sports <invites@helmsportslabs.com>';

// RFC 5322-ish lightweight check — strict enough to skip obviously bad input,
// loose enough to avoid rejecting valid addresses with plus-aliases etc.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return EMAIL_RE.test(trimmed);
}

export interface SendTeamInviteEmailArgs {
  to: string;
  teamName: string;
  coachName: string;
  joinUrl: string;
  joinCode: string;
}

export interface SendTeamInviteEmailResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  messageId?: string;
}

function buildSubject(teamName: string): string {
  return `You've been invited to join ${teamName} on GolfHelm`;
}

function buildText(args: SendTeamInviteEmailArgs, fullJoinUrl: string): string {
  const { teamName, coachName, joinCode } = args;
  return [
    `${coachName} invited you to join ${teamName} on GolfHelm.`,
    '',
    'Tap the link below to accept and create your player account:',
    fullJoinUrl,
    '',
    `Or paste this join code on the join page: ${joinCode}`,
    '',
    "If you weren't expecting this invitation you can safely ignore this email.",
  ].join('\n');
}

function buildHtml(args: SendTeamInviteEmailArgs, fullJoinUrl: string): string {
  const teamName  = escapeHtml(args.teamName);
  const coachName = escapeHtml(args.coachName);
  const joinCode  = escapeHtml(args.joinCode);

  return renderBrandedEmail({
    preheader: `${args.coachName} invited you to join ${args.teamName} on GolfHelm`,
    eyebrow: 'Team Invitation',
    heading: `You're invited to join ${teamName}`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.muted};">
        <strong style="color:${BRAND.dark};">${coachName}</strong> invited you to join
        <strong style="color:${BRAND.dark};">${teamName}</strong> on GolfHelm —
        the team management and round-tracking platform for college golf.
      </p>
      <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.muted};">
        Tap the button below to accept the invite and create your player account.
      </p>

      <!-- Join code fallback -->
      <div style="background:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:10px;padding:16px 20px;margin-top:24px;">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;color:${BRAND.green};letter-spacing:0.4px;text-transform:uppercase;">Button not working?</p>
        <p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.greenDeep};">Visit the join page and paste this code:</p>
        <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:${BRAND.dark};">${joinCode}</p>
      </div>

      <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    `,
    cta: { label: `Join ${teamName}`, url: fullJoinUrl },
    footerNote: 'You received this because a GolfHelm coach added your email to a team roster invite.',
  });
}

/**
 * Send a team-invite email.
 *
 * Returns `{ sent: false, skipped: true }` when the recipient is missing/invalid
 * or Resend isn't configured. Logs (warning) but never throws on send failure.
 */
export async function sendTeamInviteEmail(
  args: SendTeamInviteEmailArgs,
): Promise<SendTeamInviteEmailResult> {
  const to = (args.to ?? '').trim();
  if (!isValidEmail(to)) {
    return { sent: false, skipped: true, reason: 'invalid-recipient' };
  }
  if (!args.teamName?.trim() || !args.joinCode?.trim() || !args.joinUrl?.trim()) {
    return { sent: false, skipped: true, reason: 'missing-required-fields' };
  }

  const client = getResendClient();
  if (!client) {
    return { sent: false, skipped: true, reason: 'resend-not-configured' };
  }

  // Build absolute URL for the email body. Accept either an absolute URL or a
  // path-only string; in the latter case prefix with NEXT_PUBLIC_APP_URL.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
  const fullJoinUrl = /^https?:\/\//i.test(args.joinUrl)
    ? args.joinUrl
    : `${baseUrl.replace(/\/$/, '')}${args.joinUrl.startsWith('/') ? '' : '/'}${args.joinUrl}`;

  const from = process.env.RESEND_TEAM_INVITE_FROM || DEFAULT_FROM;
  const subject = buildSubject(args.teamName);

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html: buildHtml(args, fullJoinUrl),
      text: buildText(args, fullJoinUrl),
    });

    if (error) {
      await logServerError(
        `sendTeamInviteEmail failed: ${error.message ?? 'unknown error'}`,
        {
          action: 'email.sendTeamInviteEmail',
          featureArea: 'team-invite',
          extra: {
            recipient: to,
            teamName: args.teamName,
            resendErrorName: error.name ?? null,
          },
        },
        'warning',
      );
      return { sent: false, skipped: false, reason: error.message };
    }

    return { sent: true, skipped: false, messageId: data?.id };
  } catch (err) {
    await logServerError(
      `sendTeamInviteEmail threw: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'email.sendTeamInviteEmail',
        featureArea: 'team-invite',
        extra: {
          recipient: to,
          teamName: args.teamName,
          stack: err instanceof Error ? err.stack : undefined,
        },
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
