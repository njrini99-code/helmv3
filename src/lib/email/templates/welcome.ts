/**
 * Welcome email template for new coach accounts.
 *
 * Rendered via the shared `renderBrandedEmail` layout. Used initially for
 * three demo school accounts (Lenoir-Rhyne, Piedmont, Denison) and intended
 * for any new coach signup once the sendWelcomeEmail helper is wired in.
 */

import { renderBrandedEmail, escapeHtml } from '@/lib/email/layout';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface WelcomeEmailInput {
  /** Coach's first name — used in the subject + greeting. */
  firstName: string;
  /** Full school/program name, e.g. "Lenoir-Rhyne University". */
  schoolName: string;
  /**
   * The team's join code players will use to join. Optional — if absent the
   * join-code block is omitted (e.g. for coaches who haven't created a team
   * yet).
   */
  teamJoinCode?: string;
  /**
   * Support contact email shown in the footer paragraph.
   * Callers should pass the real address; fallback is admin@helmsportslabs.com.
   */
  supportEmail?: string;
}

export interface WelcomeEmailResult {
  subject: string;
  html: string;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function renderWelcomeEmail(input: WelcomeEmailInput): WelcomeEmailResult {
  const {
    firstName,
    schoolName,
    teamJoinCode,
    supportEmail = 'admin@helmsportslabs.com',
  } = input;

  const subject = `Welcome to Helm, ${firstName} — your program is ready`;

  const appUrl =
    typeof process !== 'undefined'
      ? (process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com')
      : 'https://helmsportslabs.com';

  const dashboardUrl = `${appUrl}/golf/dashboard`;

  const safeFirst = escapeHtml(firstName);
  const safeSchool = escapeHtml(schoolName);
  const safeSupportEmail = escapeHtml(supportEmail);
  const safeCode = teamJoinCode ? escapeHtml(teamJoinCode) : '';

  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const GREEN = '#16A34A';
  const DARK = '#1c1917';
  const WARM700 = '#44403C';
  const MUTED = '#78716c';
  const BORDER = '#E7E5E4';
  const GREEN_XLIGHT = '#F0FDF4';
  const GREEN_LIGHT = '#DCFCE7';
  const GREEN_DEEP = '#166534';

  // ── Join-code block (only rendered when a code is present) ───────────────
  const joinCodeBlock = safeCode
    ? `
      <div style="background-color:${GREEN_XLIGHT};border:1px solid ${GREEN_LIGHT};border-radius:2px;padding:16px 20px;margin:24px 0 0;">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${GREEN};">Team Join Code</p>
        <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.5;color:${GREEN_DEEP};">Share this with your players so they can join your roster in seconds:</p>
        <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:${DARK};">${safeCode}</p>
      </div>`
    : '';

  // ── First-steps list ──────────────────────────────────────────────────────
  const steps: Array<{ num: string; title: string; desc: string }> = [
    {
      num: '1',
      title: 'Log in to your dashboard',
      desc: `Head to <a href="${escapeHtml(dashboardUrl)}" style="color:${GREEN};text-decoration:none;font-weight:600;">helmsportslabs.com/golf/dashboard</a> and sign in. Your team and org are already set up.`,
    },
    {
      num: '2',
      title: 'Add your roster',
      desc: teamJoinCode
        ? `Share your join code <strong style="color:${DARK};">${safeCode}</strong> and players can join from the app — or invite them directly from your Roster page.`
        : 'Go to your Roster page and invite players by email, or generate a join code they can use to self-enroll.',
    },
    {
      num: '3',
      title: 'Enter a round and see CoachHelm work',
      desc: 'Once players submit a round, CoachHelm automatically surfaces patterns in scoring, approach play, and putting — and tells you exactly where to focus practice.',
    },
  ];

  const stepsHtml = steps
    .map(
      (s) => `
      <tr>
        <td style="padding:0 0 16px;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="width:32px;padding-right:14px;vertical-align:top;">
                <div style="width:28px;height:28px;border-radius:50%;background-color:${GREEN};display:inline-block;text-align:center;line-height:28px;">
                  <span style="font-family:${FONT};font-size:13px;font-weight:700;color:#FFFFFF;">${s.num}</span>
                </div>
              </td>
              <td style="vertical-align:top;">
                <p style="margin:0 0 3px;font-family:${FONT};font-size:14px;font-weight:600;color:${DARK};">${s.title}</p>
                <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${WARM700};">${s.desc}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `
    <!-- Greeting -->
    <p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${WARM700};">
      Hi ${safeFirst}, welcome to Helm — we're glad you're here.
    </p>

    <!-- Why Helm paragraph — grounded in actual product positioning -->
    <p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${WARM700};">
      Managing a college golf program means juggling spreadsheets, group chats, tournament logistics,
      and individual player development — all at once. Helm is built to replace that patchwork with one
      platform that actually fits how you coach. Track every round shot-by-shot, see where each player is
      losing or gaining strokes, and let <strong style="color:${DARK};">CoachHelm AI</strong> surface the
      patterns that are hardest to spot across a full roster. Instead of combing through numbers after
      the fact, you'll have actionable insights waiting for you — which players need work on their approach,
      who's leaving putts short, where a qualifier would shake out today.
    </p>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr><td style="height:1px;background-color:${BORDER};line-height:1px;font-size:1px;">&nbsp;</td></tr>
    </table>

    <!-- First steps heading -->
    <p style="margin:0 0 16px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">
      Three things to do first
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody>
        ${stepsHtml}
      </tbody>
    </table>

    ${joinCodeBlock}

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px;">
      <tr><td style="height:1px;background-color:${BORDER};line-height:1px;font-size:1px;">&nbsp;</td></tr>
    </table>

    <!-- Support -->
    <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.7;color:${MUTED};">
      Questions? Reply to this email or reach us at
      <a href="mailto:${safeSupportEmail}" style="color:${GREEN};text-decoration:none;font-weight:600;">${safeSupportEmail}</a>.
      We typically respond within one business day.
    </p>`;

  const html = renderBrandedEmail({
    preheader: `Welcome to Helm, ${firstName} — your ${schoolName} program is set up and ready to go.`,
    eyebrow: 'Welcome',
    heading: `Your ${safeSchool} program is live on Helm`,
    bodyHtml,
    cta: { label: 'Go to Dashboard', url: dashboardUrl },
    footerNote: `You're receiving this because you created a coach account on Helm Sports Labs.`,
  });

  return { subject, html };
}
