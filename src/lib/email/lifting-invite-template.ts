/**
 * Helm Lifting Lab — invite email template.
 *
 * Pure function: receives invite context, returns { subject, html, text }.
 * No I/O, no Resend imports — callers pipe the output into the Resend SDK.
 *
 * Design:
 *   - Branded helm-green + cream palette.
 *   - Transactional voice: one clear CTA, no promotional blocks.
 *   - Table-based layout for broad email-client compatibility; inline styles only.
 *   - Plain-text fallback is content-complete.
 */

// ─── Brand tokens ───────────────────────────────────────────────────────────

const BRAND = {
  green: '#16A34A',
  greenDark: '#15803D',
  greenDeep: '#166534',
  greenLight: '#DCFCE7',
  greenXLight: '#F0FDF4',
  dark: '#1C1917',
  darkMid: '#292524',
  warm700: '#44403C',
  warm600: '#57534E',
  muted: '#78716C',
  warm400: '#A8A29E',
  border: '#E7E5E4',
  subtle: '#F5F5F4',
  offWhite: '#FAFAF9',
  cream: '#FFFEFA',
  white: '#FFFFFF',
} as const;

// ─── Input / output types ───────────────────────────────────────────────────

export interface LiftingInviteEmailData {
  /** Name of the head coach who sent the invite (or org name fallback). */
  inviterName: string;
  /** Name of the inviting organization (school / club). */
  orgName: string;
  /** Optional title/role the invitee will hold (e.g. "Strength & Conditioning Coach"). */
  roleTitle?: string | null;
  /** The full accept URL: <baseUrl>/lifting/join/<token> */
  acceptUrl: string;
  /**
   * When the invite expires. Passed as an ISO string; rendered human-friendly.
   * Defaults to 14 days from now if not provided.
   */
  expiresAt?: string | null;
}

export interface RenderedLiftingInviteEmail {
  subject: string;
  html: string;
  text: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '14 days';
  try {
    const d = new Date(expiresAt);
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '14 days';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── renderLiftingInviteEmail ────────────────────────────────────────────────

/**
 * Render the Helm Lifting Lab coaching invite email.
 * Returns `{ subject, html, text }` ready to pass to Resend.
 */
export function renderLiftingInviteEmail(
  data: LiftingInviteEmailData,
): RenderedLiftingInviteEmail {
  const { inviterName, orgName, roleTitle, acceptUrl, expiresAt } = data;

  const expiryLabel = formatExpiry(expiresAt);
  const roleLine = roleTitle
    ? ` as <strong style="color:${BRAND.dark};">${escapeHtml(roleTitle)}</strong>`
    : '';
  const roleLinePlain = roleTitle ? ` as ${roleTitle}` : '';

  const subject = `You're invited to join ${orgName}'s Lifting Lab on Helm`;

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.subtle};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:${BRAND.subtle};padding:40px 20px;">
    <tr>
      <td align="center">
        <!-- Card wrapper -->
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;background-color:${BRAND.white};
                      border-radius:16px;overflow:hidden;
                      box-shadow:0 1px 3px rgba(0,0,0,.08);">

          <!-- Header bar -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.greenDeep} 0%,${BRAND.green} 100%);
                        padding:32px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:700;
                         letter-spacing:-.4px;color:${BRAND.white};">
                Helm Lifting Lab
              </p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,.75);
                         letter-spacing:.4px;text-transform:uppercase;font-weight:500;">
                Coaching Invitation
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">

              <!-- Icon badge -->
              <table cellpadding="0" cellspacing="0" role="presentation"
                     style="margin:0 auto 28px;">
                <tr>
                  <td style="background-color:${BRAND.greenXLight};border-radius:50%;
                              width:64px;height:64px;text-align:center;vertical-align:middle;">
                    <span style="font-size:30px;line-height:64px;">🏋️</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:20px;font-weight:700;
                         color:${BRAND.dark};text-align:center;letter-spacing:-.3px;">
                You've been invited
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:${BRAND.muted};
                         text-align:center;line-height:1.6;">
                <strong style="color:${BRAND.dark};">${escapeHtml(inviterName)}</strong>
                has invited you to join
                <strong style="color:${BRAND.dark};">${escapeHtml(orgName)}</strong>
                ${roleLine ? `'s Lifting Lab${roleLine}` : `'s Lifting Lab`} on Helm Sports Labs.
              </p>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(acceptUrl)}"
                       style="display:inline-block;padding:14px 36px;
                              background-color:${BRAND.green};color:${BRAND.white};
                              font-size:15px;font-weight:600;text-decoration:none;
                              border-radius:10px;letter-spacing:-.1px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry note -->
              <p style="margin:0 0 28px;font-size:13px;color:${BRAND.warm400};
                         text-align:center;">
                This invitation expires on <strong>${escapeHtml(expiryLabel)}</strong>.
              </p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-top:1px solid ${BRAND.border};padding-top:24px;">
                    <p style="margin:0 0 6px;font-size:12px;color:${BRAND.warm400};line-height:1.5;">
                      If you can't click the button above, copy and paste this URL into your browser:
                    </p>
                    <p style="margin:0;font-size:12px;color:${BRAND.green};word-break:break-all;">
                      <a href="${escapeHtml(acceptUrl)}" style="color:${BRAND.green};">
                        ${escapeHtml(acceptUrl)}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:${BRAND.subtle};padding:20px 40px;
                        border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;color:${BRAND.warm400};text-align:center;
                         line-height:1.6;">
                Helm Sports Labs &bull; Strength &amp; Conditioning Portal<br/>
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Plain text ─────────────────────────────────────────────────────────────
  const text = [
    `HELM LIFTING LAB — Coaching Invitation`,
    ``,
    `${inviterName} has invited you to join ${orgName}'s Lifting Lab${roleLinePlain} on Helm Sports Labs.`,
    ``,
    `Accept your invitation here:`,
    acceptUrl,
    ``,
    `This invitation expires on ${expiryLabel}.`,
    ``,
    `──────────────────────────────`,
    `Helm Sports Labs · Strength & Conditioning Portal`,
    `If you weren't expecting this invitation, you can safely ignore this email.`,
  ].join('\n');

  return { subject, html, text };
}
