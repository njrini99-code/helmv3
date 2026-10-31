/**
 * GolfHelm player invite email: a coach asks a player to join the team.
 *
 * Pure function: receives the invite context, returns { subject, html, text }. No I/O and no Resend import; the send
 * leg (src/lib/golf/player-invite-email.ts) pipes the output into the SDK after the outbound customer-email gate.
 *
 * One clear action: the link opens the team's join page, where the code is already filled in. The code is also written
 * out, so a player who is not on the phone that got the email can type it in Settings. Table layout and inline styles
 * only, for broad client support; the plain-text version carries everything the HTML does.
 */

const INK = '#1C1917';
const MUTED = '#78716C';
const FAINT = '#A8A29E';
const LINE = '#E7E5E4';
const PAPER = '#FAFAF9';
const GREEN = '#166534';
const GREEN_SOFT = '#F0FDF4';

export interface GolfPlayerInviteEmailData {
  /** The coach who is inviting, by name; falls back to "Your coach". */
  coachName?: string | null;
  teamName: string;
  /** The team's join code, as players type it. */
  joinCode: string;
  /** The full join URL, code included. */
  joinUrl: string;
}

export interface RenderedGolfPlayerInviteEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A header value must stay on one line: a name with a line break in it must not add a header. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export function renderGolfPlayerInviteEmail(data: GolfPlayerInviteEmailData): RenderedGolfPlayerInviteEmail {
  const coach = oneLine(data.coachName ?? '') || 'Your coach';
  const team = oneLine(data.teamName) || 'the team';
  const subject = `${coach} invited you to join ${team} on GolfHelm`;
  const { joinCode, joinUrl } = data;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${PAPER};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background-color:#FFFFFF;border:1px solid ${LINE};border-radius:16px;">
          <tr>
            <td style="padding:36px 40px 8px;">
              <p style="margin:0 0 20px;font-size:13px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:${GREEN};">GolfHelm</p>
              <p style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.3px;color:${INK};">
                Join ${escapeHtml(team)}
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${MUTED};">
                <strong style="color:${INK};">${escapeHtml(coach)}</strong> invited you to join <strong style="color:${INK};">${escapeHtml(team)}</strong> on GolfHelm, where your rounds, schedule and team messages live.
              </p>
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:${GREEN};border-radius:10px;">
                    <a href="${escapeHtml(joinUrl)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">Join the team</a>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:${GREEN_SOFT};border-radius:10px;padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:12px;color:${MUTED};">Already on GolfHelm? Enter the team code in Settings</p>
                    <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:3px;color:${INK};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(joinCode)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-top:1px solid ${LINE};padding-top:20px;">
                    <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${FAINT};">If the button does not work, paste this link into your browser:</p>
                    <p style="margin:0 0 16px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(joinUrl)}" style="color:${GREEN};">${escapeHtml(joinUrl)}</a></p>
                    <p style="margin:0;font-size:12px;line-height:1.5;color:${FAINT};">You got this because ${escapeHtml(coach)} typed your address. If you do not know them, you can ignore this email: nothing happens unless you join.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${coach} invited you to join ${team} on GolfHelm.`,
    '',
    `Join the team: ${joinUrl}`,
    '',
    `Already on GolfHelm? Enter the team code in Settings: ${joinCode}`,
    '',
    `You got this because ${coach} typed your address. If you do not know them, you can ignore this email: nothing happens unless you join.`,
  ].join('\n');

  return { subject, html, text };
}
