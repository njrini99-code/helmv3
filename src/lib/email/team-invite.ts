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
 */

import { getResendClient } from './resend-client';
import { logServerError } from '@/lib/server-error-logger';

// Same brand tokens as the notification template — kept inline so this file
// has no cross-import dependency on `src/lib/notifications/email.ts`.
const BRAND = {
  green:        '#16A34A',
  greenDark:    '#15803D',
  greenDeep:    '#166534',
  greenLight:   '#DCFCE7',
  greenXLight:  '#F0FDF4',
  dark:         '#1C1917',
  darkMid:      '#292524',
  warm700:      '#44403C',
  muted:        '#78716C',
  warm400:      '#A8A29E',
  border:       '#E7E5E4',
  subtle:       '#F5F5F4',
  offWhite:     '#FAFAF9',
  cream:        '#FFFEFA',
  white:        '#FFFFFF',
};

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const teamName = escapeHtml(args.teamName);
  const coachName = escapeHtml(args.coachName);
  const joinCode = escapeHtml(args.joinCode);
  const joinUrlSafe = escapeHtml(fullJoinUrl);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  const fontStack = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const previewText = `${coachName} invited you to join ${teamName} on GolfHelm`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(buildSubject(args.teamName))}</title>
  <style>
    @media only screen and (max-width:620px){
      .wrap{width:100%!important;padding:0 12px!important;}
      .body-pad{padding:28px 24px!important;}
      .head-pad{padding:22px 24px!important;}
      .foot-pad{padding:16px 24px!important;}
      .cta-btn{display:block!important;text-align:center!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.subtle};-webkit-text-size-adjust:100%;" bgcolor="${BRAND.subtle}">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${BRAND.subtle};">${escapeHtml(previewText)}&#8203;&#65279;&#65279;&#65279;&#65279;&#65279;&#65279;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="wrap" width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${BRAND.green} 0%,${BRAND.greenDark} 100%);border-radius:12px 12px 0 0;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <tr>
            <td class="head-pad" style="background-color:${BRAND.dark};padding:24px 36px;">
              <a href="${escapeHtml(baseUrl)}" style="text-decoration:none;display:inline-block;">
                <span style="font-family:${fontStack};font-size:21px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.white};">Helm</span><span style="font-size:21px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.green};">.</span>
              </a>
            </td>
          </tr>

          <tr>
            <td class="body-pad" style="background-color:${BRAND.cream};padding:36px 36px 28px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">

              <p style="margin:0 0 12px;font-family:${fontStack};font-size:14px;font-weight:500;color:${BRAND.muted};letter-spacing:0.4px;text-transform:uppercase;">Team Invitation</p>

              <h1 style="margin:0 0 16px;font-family:${fontStack};font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-0.5px;color:${BRAND.dark};">You're invited to join ${teamName}</h1>

              <p style="margin:0 0 20px;font-family:${fontStack};font-size:15px;line-height:1.65;color:${BRAND.warm700};">
                <strong style="color:${BRAND.dark};">${coachName}</strong> invited you to join <strong style="color:${BRAND.dark};">${teamName}</strong> on GolfHelm — the team management and round-tracking platform for college golf.
              </p>

              <p style="margin:0 0 12px;font-family:${fontStack};font-size:15px;line-height:1.65;color:${BRAND.warm700};">
                Tap the button below to accept the invite and create your player account.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:linear-gradient(135deg,${BRAND.green} 0%,${BRAND.greenDark} 100%);">
                    <a href="${joinUrlSafe}" class="cta-btn"
                       style="display:inline-block;padding:13px 26px;font-family:${fontStack};font-size:14px;font-weight:600;color:${BRAND.white};text-decoration:none;letter-spacing:0.1px;line-height:1.4;white-space:nowrap;">
                      Join ${teamName}&nbsp;&nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
                <p style="margin:0 0 6px;font-family:${fontStack};font-size:12px;font-weight:600;color:${BRAND.green};letter-spacing:0.4px;text-transform:uppercase;">Button not working?</p>
                <p style="margin:0 0 8px;font-family:${fontStack};font-size:14px;line-height:1.6;color:${BRAND.greenDeep};">Visit the join page and paste this code:</p>
                <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:${BRAND.dark};">${joinCode}</p>
              </div>

              <p style="margin:0;font-family:${fontStack};font-size:13px;line-height:1.6;color:${BRAND.muted};">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>

            </td>
          </tr>

          <tr>
            <td style="height:1px;background-color:${BRAND.border};line-height:1px;font-size:1px;">&nbsp;</td>
          </tr>

          <tr>
            <td class="foot-pad" style="background-color:${BRAND.white};padding:18px 36px;border-radius:0 0 12px 12px;border:1px solid ${BRAND.border};border-top:none;">
              <p style="margin:0;font-family:${fontStack};font-size:12px;line-height:1.6;color:${BRAND.muted};">
                You received this because a GolfHelm coach added your email to a team roster invite.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
