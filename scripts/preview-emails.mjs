/**
 * scripts/preview-emails.mjs
 *
 * Renders every Helm transactional email template with realistic fixture data
 * and writes one HTML file per template to /tmp/email-previews/.
 *
 * Usage:
 *   node scripts/preview-emails.mjs
 *
 * No env vars needed — all rendering is pure functions.
 *
 * NOTE ON THE LOGO: production emails use the hosted HTTPS logo
 * (https://helmsportslabs.com/helm-golf-logo-transparent.png) because Gmail
 * and Outlook strip data: URIs. Preview files are opened from the local
 * filesystem where remote images are often blocked, so THIS SCRIPT ONLY swaps
 * the hosted URL for an inlined base64 data URI read from
 * public/helm-golf-logo-transparent.png just before writing each file.
 *
 * The inline renderer below mirrors src/lib/email/layout.ts (editorial
 * design, 2026-06). The TS source is authoritative — keep both in sync.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = '/tmp/email-previews';

// ─── Inline brand + helpers (avoids needing tsx/tsconfig at runtime) ─────────

const B = {
  green:       '#16A34A',
  greenDark:   '#15803D',
  greenDeep:   '#166534',
  greenLight:  '#DCFCE7',
  greenXLight: '#F0FDF4',
  dark:        '#1C1917',
  darkMid:     '#292524',
  warm700:     '#44403C',
  warm600:     '#57534E',
  muted:       '#78716C',
  warm400:     '#A8A29E',
  border:      '#E7E5E4',
  cream:       '#FFFEFA',
  white:       '#FFFFFF',
  amber:       '#B45309',
  amberBg:     '#FEF3C7',
};
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const SERIF = `Georgia,'Times New Roman',Times,serif`;
const LOGO_URL = 'https://helmsportslabs.com/helm-golf-logo-transparent.png';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirrors src/lib/email/layout.ts renderBrandedEmail (editorial design).
function renderBrandedEmail({ preheader, eyebrow, heading, bodyHtml, cta, details, footerNote }) {
  const baseUrl = 'https://helmsportslabs.com';
  const safePreheader = esc(preheader);
  const safeHeading = esc(heading);

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 18px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${B.green};line-height:1;">${esc(eyebrow)}</p>`
    : '';

  const detailsHtml = details && details.length > 0
    ? `
        <table role="presentation" class="details" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin:28px 0 0;border-top:1px solid ${B.border};">
          <tbody>
            ${details.map((d) => `
            <tr>
              <td style="padding:13px 16px 13px 0;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:${B.muted};white-space:nowrap;vertical-align:middle;">
                ${esc(d.label)}
              </td>
              <td style="padding:13px 0;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:14px;font-weight:500;color:${B.dark};text-align:right;vertical-align:middle;">
                ${esc(d.value)}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`
    : '';

  const ctaHtml = cta
    ? `
      <table role="presentation" class="cta-table" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0 0;">
        <tr>
          <td class="cta-td" style="border-radius:100px;background-color:${B.green};" bgcolor="${B.green}">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(cta.url)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${B.green}"><w:anchorlock/><center style="color:${B.white};font-family:${FONT};font-size:14px;font-weight:600;"><![endif]-->
            <a class="cta-a" href="${esc(cta.url)}"
               style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:0.3px;color:${B.white};text-decoration:none;line-height:1.4;white-space:nowrap;border-radius:100px;background-color:${B.green};">
              ${esc(cta.label)}&nbsp;&rarr;
            </a>
            <!--[if mso]></center></v:roundrect><![endif]-->
          </td>
        </tr>
      </table>`
    : '';

  const hairline = `
          <tr>
            <td class="rule-cell" style="padding:0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:1px;background-color:${B.border};font-size:1px;line-height:1px;" bgcolor="${B.border}">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>`;

  const footerText = footerNote
    ? esc(footerNote)
    : "You're receiving this because you're part of a Helm Sports team.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${safeHeading}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:620px){
      .wrap{width:100%!important;}
      .logo-cell{padding:28px 24px 20px!important;}
      .rule-cell{padding:0 24px!important;}
      .body-cell{padding:28px 24px 36px!important;}
      .foot-cell{padding:20px 24px!important;}
      .cta-table{width:100%!important;}
      .cta-td{display:block!important;text-align:center!important;}
      .cta-a{display:block!important;width:100%!important;padding:16px!important;font-size:16px!important;text-align:center!important;box-sizing:border-box!important;}
    }
    @media (prefers-color-scheme:dark){
      .dm-body{background-color:${B.cream}!important;}
    }
  </style>
</head>
<body class="dm-body" style="margin:0;padding:0;background-color:${B.cream};-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;" bgcolor="${B.cream}">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${B.cream};">${safePreheader}&#8203;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px 48px;background-color:${B.cream};" bgcolor="${B.cream}">

        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background-color:${B.white};border:1px solid ${B.border};border-radius:2px;" bgcolor="${B.white}">

          <tr>
            <td class="logo-cell" style="background-color:${B.cream};padding:32px 48px 24px;" bgcolor="${B.cream}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" style="width:44px;vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="44" height="44" align="center" valign="middle" bgcolor="${B.greenXLight}"
                            style="width:44px;height:44px;background-color:${B.greenXLight};border:1px solid ${B.greenLight};border-radius:10px;text-align:center;vertical-align:middle;">
                          <a href="${baseUrl}" style="text-decoration:none;display:inline-block;font-family:${FONT};font-size:16px;font-weight:700;color:${B.green};line-height:0;">
                            <img src="${LOGO_URL}"
                                 alt="Helm"
                                 width="32" height="26"
                                 style="width:32px;height:26px;display:block;border:0;"
                                 border="0" />
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${B.warm400};">Helm Sports Labs</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${hairline}

          <tr>
            <td class="body-cell" style="background-color:${B.white};padding:40px 48px 44px;" bgcolor="${B.white}">

              ${eyebrowHtml}

              <h1 style="margin:0 0 28px;font-family:${SERIF};font-size:28px;font-weight:normal;line-height:1.25;letter-spacing:-0.3px;color:${B.dark};">${safeHeading}</h1>

              ${bodyHtml}

              ${detailsHtml}

              ${ctaHtml}

            </td>
          </tr>
${hairline}

          <tr>
            <td class="foot-cell" style="background-color:${B.white};padding:20px 48px 24px;" bgcolor="${B.white}">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${B.warm400};">
                ${footerText}
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/golf/dashboard/settings" style="color:${B.warm400};text-decoration:underline;">Manage preferences</a>
                &nbsp;&middot;&nbsp;
                Helm Sports Labs
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

// ─── Shared body fragments (mirror src/lib/notifications/email.ts) ───────────

function greetingHtml(greeting) {
  return greeting
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:16px;font-weight:500;line-height:1.5;color:${B.dark};">${esc(greeting)}</p>`
    : '';
}

function quoteBlock(text) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
      <tr>
        <td width="2" style="background-color:${B.green};width:2px;" bgcolor="${B.green}">&nbsp;</td>
        <td width="20" style="width:20px;">&nbsp;</td>
        <td style="padding:16px 0;">
          <p style="margin:0 0 6px;font-family:${SERIF};font-size:36px;line-height:1;color:${B.green};letter-spacing:-1px;">&ldquo;</p>
          <p style="margin:0;font-family:${SERIF};font-size:18px;font-style:italic;line-height:1.55;color:${B.dark};letter-spacing:0.1px;">${text}</p>
        </td>
      </tr>
    </table>`;
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const BASE = 'https://helmsportslabs.com';

// ─── Template renderers ───────────────────────────────────────────────────────

const templates = [

  {
    name: '01-rsvp-reminder',
    render: () => renderBrandedEmail({
      preheader: 'Please confirm your attendance for Spring Team Scrimmage — Tuesday, June 10 · 2:00 PM',
      eyebrow: 'RSVP Reminder',
      heading: 'RSVP for Spring Team Scrimmage',
      bodyHtml: `
        ${greetingHtml('Hi Nick,')}
        <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:${B.muted};">Your coach is collecting RSVPs for this event. Please confirm whether you'll be attending.</p>
      `,
      details: [
        { label: 'Date & Time', value: 'Tuesday, June 10 · 2:00 PM' },
        { label: 'Location', value: 'University Golf Course, Chapel Hill NC' },
      ],
      cta: { label: 'RSVP Now', url: `${BASE}/golf/dashboard/calendar?event=evt_123` },
      footerNote: 'You received this because you have an upcoming team event on Helm.',
    }),
  },

  {
    name: '02-team-announcement',
    render: () => renderBrandedEmail({
      preheader: 'Coach Davis: Practice cancelled tomorrow due to weather — check the app for updates',
      eyebrow: 'Team Announcement',
      heading: 'Practice Cancelled Tomorrow',
      bodyHtml: `
        ${greetingHtml('Hi there,')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td>
              <span style="font-family:${FONT};font-size:13px;color:${B.muted};">From&nbsp;&nbsp;</span>
              <strong style="font-family:${FONT};font-size:13px;color:${B.dark};">Coach Davis</strong>
              <span style="margin-left:10px;display:inline-block;padding:3px 10px;background:#FEF3C7;color:#B45309;border-radius:12px;font-size:12px;font-weight:600;">High Priority</span>
            </td>
          </tr>
        </table>
        <div style="background:${B.white};border:1px solid ${B.border};border-radius:2px;padding:20px 22px;">
          <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.75;color:${B.darkMid};">
            Due to incoming weather, tomorrow's 8am practice at Finley is cancelled. We'll resume Thursday. Stay sharp — do your putting drills at home.
          </p>
        </div>
      `,
      cta: { label: 'View Full Announcement', url: `${BASE}/golf/dashboard/announcements/ann_456` },
    }),
  },

  {
    name: '03-qualifier-created',
    render: () => renderBrandedEmail({
      preheader: 'A new qualifier has been posted — Fall Qualifier #1',
      eyebrow: 'Qualifier',
      heading: 'Fall Qualifier #1',
      bodyHtml: `
        ${greetingHtml('Hi Nick,')}
        <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:${B.muted};">A new qualifier has been posted. Review the details and prepare your rounds.</p>
      `,
      details: [
        { label: 'Start Date', value: 'August 25, 2026' },
        { label: 'Rounds', value: '2 rounds' },
      ],
      cta: { label: 'View Qualifier', url: `${BASE}/golf/dashboard/qualifiers/qual_789` },
    }),
  },

  {
    name: '04-team-invite',
    render: () => renderBrandedEmail({
      preheader: 'Coach Williams invited you to join UNC Golf on GolfHelm',
      eyebrow: 'Team Invitation',
      heading: "You're invited to join UNC Golf",
      bodyHtml: `
        <p style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${B.muted};">
          <strong style="color:${B.dark};">Coach Williams</strong> invited you to join
          <strong style="color:${B.dark};">UNC Golf</strong> on GolfHelm —
          the team management and round-tracking platform for college golf.
        </p>
        <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:${B.muted};">
          Tap the button below to accept the invite and create your player account.
        </p>
        <div style="background:${B.greenXLight};border:1px solid ${B.greenLight};border-radius:2px;padding:16px 20px;margin-top:24px;">
          <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;color:${B.green};letter-spacing:0.4px;text-transform:uppercase;">Button not working?</p>
          <p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.6;color:${B.greenDeep};">Visit the join page and paste this code:</p>
          <p style="margin:0;font-family:'SFMono-Regular',Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:${B.dark};">GH-XKTZ</p>
        </div>
        <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${B.muted};">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      `,
      cta: { label: 'Join UNC Golf', url: `${BASE}/golf/join?code=GH-XKTZ` },
      footerNote: 'You received this because a GolfHelm coach added your email to a team roster invite.',
    }),
  },

  {
    name: '05-coach-digest',
    render: () => {
      const insightCard = (player, strokes, title, content, url) => `
        <tr>
          <td style="padding:0 0 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="border:1px solid ${B.border};border-radius:2px;background:${B.white};">
              <tr>
                <td style="padding:18px 20px 14px;">
                  <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${B.muted};">
                    ${esc(player)}&nbsp;·&nbsp;${strokes} strokes
                  </p>
                  <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.35;color:${B.dark};">${esc(title)}</p>
                  <p style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:1.55;color:${B.warm700};">${esc(content)}</p>
                  <a href="${esc(url)}" style="font-family:${FONT};font-size:13px;font-weight:600;color:${B.green};text-decoration:none;">Open in CoachHelm&nbsp;&rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
      const bodyHtml = `
        <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;font-weight:500;color:${B.muted};">Tuesday, June 10</p>
        <p style="margin:0 0 6px;font-family:${SERIF};font-size:22px;font-weight:normal;line-height:1.3;letter-spacing:-0.3px;color:${B.dark};">Good morning, Sarah.</p>
        <p style="margin:0 0 24px;font-family:${FONT};font-size:14px;line-height:1.55;color:${B.warm700};">Here is what changed overnight on UNC Women's Golf.</p>
        <p style="margin:0 0 10px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${B.muted};">Top concerns today</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${insightCard('Emma Johnson', '1.4', 'Approach consistency declining', 'GIR% dropped from 68% to 52% over last 4 rounds — approach from 150–175y trending long.', `${BASE}/golf/dashboard/coaching-intelligence#insight-abc`)}
          ${insightCard('Ava Martinez', '0.9', 'Short game regression from rough', 'Up-and-down from rough sitting at 28% vs 45% season avg. Chip technique may need review.', `${BASE}/golf/dashboard/coaching-intelligence#insight-def`)}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:0 0 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border:1px solid ${B.greenLight};border-radius:2px;background:${B.greenXLight};">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${B.greenDeep};">Bright spot</p>
                    <p style="margin:0 0 10px;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${B.greenDeep};">Chloe Park just resolved Inconsistent putting speed control. Send them props.</p>
                    <a href="${BASE}/golf/dashboard/coaching-intelligence#insight-ghi" style="font-family:${FONT};font-size:13px;font-weight:600;color:${B.greenDeep};text-decoration:none;">Open in CoachHelm&nbsp;&rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:8px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${B.muted};">
          <a href="${BASE}/golf/dashboard/settings/coaching-intelligence" style="color:${B.muted};text-decoration:underline;">Manage digest preferences</a>
        </p>
      `;
      return renderBrandedEmail({
        preheader: 'Emma Johnson: Approach consistency declining · UNC Women\'s Golf',
        eyebrow: 'Morning Digest',
        heading: "Sarah's morning digest",
        bodyHtml,
        footerNote: 'You are receiving this because daily digests are enabled on your coaching profile.',
      });
    },
  },

  {
    name: '06-weekly-recap',
    render: () => {
      const statCell = (label, value) => `<td valign="top" style="padding:0 8px;width:25%;text-align:center;">
        <p style="margin:0;font-family:${SERIF};font-size:32px;font-weight:normal;color:${B.dark};line-height:1;">${esc(value)}</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${B.muted};">${esc(label)}</p>
      </td>`;
      const bodyHtml = `
        <p style="margin:0 0 8px;font-family:${SERIF};font-size:22px;font-weight:normal;line-height:1.3;letter-spacing:-0.3px;color:${B.dark};">Hey Sarah,</p>
        <p style="margin:0 0 32px;font-family:${FONT};font-size:15px;color:${B.muted};">Here's how UNC Women's Golf ran this week.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:36px;">
          <tr>
            ${statCell('Rounds', '7')}
            ${statCell('Avg to par', '+2.4')}
            ${statCell('Insights', '12')}
            ${statCell('Active goals', '5')}
          </tr>
        </table>
        <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${B.muted};">Most active</p>
        ${['Emma Johnson · 3 rounds · +1.7', 'Chloe Park · 2 rounds · +3.2', 'Ava Martinez · 2 rounds · +2.1'].map(row => `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom:1px solid ${B.border};">
            <tr>
              <td valign="middle" style="padding:10px 0;font-family:${FONT};font-size:15px;color:${B.dark};">${row.split(' · ')[0]}</td>
              <td valign="middle" align="right" style="padding:10px 0;font-family:${FONT};font-size:13px;color:${B.muted};">${row.split(' · ').slice(1).join(' · ')}</td>
            </tr>
          </table>`).join('')}
        <p style="margin:28px 0 12px;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${B.muted};">Team patterns</p>
        ${['Approach consistency · 3 players', 'Putting distance control · 2 players'].map(row => `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td valign="middle" style="padding:6px 0;">
                <span style="display:inline-block;width:8px;height:8px;background:${B.green};border-radius:50%;margin-right:8px;vertical-align:middle;"></span>
                <span style="font-family:${FONT};font-size:14px;color:${B.dark};vertical-align:middle;">${row.split(' · ')[0]}</span>
              </td>
              <td valign="middle" align="right" style="padding:6px 0;font-family:${FONT};font-size:12px;color:${B.muted};">${row.split(' · ')[1]}</td>
            </tr>
          </table>`).join('')}
      `;
      return renderBrandedEmail({
        preheader: "UNC Women's Golf week in review — 7 rounds, avg +2.4",
        eyebrow: 'Weekly Recap · Jun 3 – Jun 9',
        heading: "UNC Women's Golf this week",
        bodyHtml,
        footerNote: "You're receiving this because you're the head coach of UNC Women's Golf. Manage email preferences from your CoachHelm settings.",
      });
    },
  },

  {
    name: '07-task-reminder',
    render: () => renderBrandedEmail({
      preheader: 'Coach Davis assigned you a task — Film your swing for review',
      eyebrow: 'Task Assigned',
      heading: 'Film your swing for review',
      bodyHtml: `
        ${greetingHtml('Hi Nick,')}
        <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;color:${B.muted};">
          Assigned by&nbsp;&nbsp;<strong style="color:${B.dark};">Coach Davis</strong>
        </p>
        <div style="background:${B.white};border:1px solid ${B.border};border-radius:2px;padding:16px 20px;margin-bottom:4px;">
          <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${B.darkMid};">
            Please record a face-on and down-the-line view of your full swing at the range. Upload to the app before our Thursday session.
          </p>
        </div>
      `,
      details: [{ label: 'Due Date', value: 'Wednesday, June 11, 2026' }],
      cta: { label: 'View Task', url: `${BASE}/golf/dashboard/tasks?task=task_321` },
    }),
  },

  {
    name: '08-new-message',
    render: () => renderBrandedEmail({
      preheader: 'Coach Williams: Can we chat Friday before practice about the qualifier lineup?',
      eyebrow: 'Direct Message',
      heading: 'Message from Coach Williams',
      bodyHtml: `
        ${greetingHtml('Hi Nick,')}
        <p style="margin:0 0 28px;font-family:${FONT};font-size:16px;line-height:1.6;color:${B.muted};">
          <strong style="color:${B.dark};font-weight:600;">Coach Williams</strong> sent you a message.
        </p>
        ${quoteBlock('Can we chat Friday before practice about the qualifier lineup?')}
        <p style="margin:0;font-family:${FONT};font-size:15px;color:${B.muted};line-height:1.6;">Reply directly in Helm to keep the conversation going.</p>
      `,
      cta: { label: 'Open Conversation', url: `${BASE}/golf/dashboard/messages/conv_654` },
      footerNote: 'You received this because someone sent you a message on Helm.',
    }),
  },

  {
    name: '09-dev-plan-assigned',
    render: () => renderBrandedEmail({
      preheader: 'Coach Davis created a development plan for you — Approach Shot Precision',
      eyebrow: 'Development Plan',
      heading: 'Approach Shot Precision',
      bodyHtml: `
        ${greetingHtml('Hi Nick,')}
        <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;color:${B.muted};">
          From&nbsp;&nbsp;<strong style="color:${B.dark};">Coach Davis</strong>
          &nbsp;&nbsp;<span style="display:inline-block;padding:3px 10px;background:${B.greenXLight};color:${B.green};border-radius:12px;font-size:12px;font-weight:600;">Iron Play</span>
        </p>
        <div style="background:${B.greenXLight};border:1px solid ${B.greenLight};border-radius:2px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:600;color:${B.green};">Your coach has created a plan for your development</p>
          <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${B.greenDeep};">Review the goals, drills, and targets your coach has set. Track your progress from your dashboard.</p>
        </div>
      `,
      cta: { label: 'View Development Plan', url: `${BASE}/golf/dashboard/my-development` },
    }),
  },

];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // PREVIEW-ONLY logo inlining: local preview files block remote images, so
  // swap the hosted logo URL for a base64 data URI before writing. Production
  // rendering (src/lib/email/layout.ts) keeps the hosted HTTPS URL.
  const logoPng = await readFile(join(ROOT, 'public', 'helm-golf-logo-transparent.png'));
  const logoDataUri = `data:image/png;base64,${logoPng.toString('base64')}`;

  console.log(`Rendering ${templates.length} email templates to ${OUT_DIR}/\n`);

  for (const t of templates) {
    const html = t.render().split(LOGO_URL).join(logoDataUri);
    const filePath = join(OUT_DIR, `${t.name}.html`);
    await writeFile(filePath, html, 'utf8');
    console.log(`  ✓  ${t.name}.html  (${Math.round(html.length / 1024)}kb)`);
  }

  console.log(`\nDone. Open file:///tmp/email-previews/ in a browser to preview.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
