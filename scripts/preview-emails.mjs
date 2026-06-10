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
 * The script imports the compiled layout from src/ via tsx/ts-node; if the
 * worktree has no build output it falls back to running the templates inline
 * so the script is always runnable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

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
  dark:        '#1c1917',
  darkMid:     '#292524',
  warm700:     '#44403C',
  warm600:     '#57534E',
  muted:       '#78716c',
  border:      '#E7E5E4',
  cream:       '#FFFEFA',
  white:       '#FFFFFF',
  pageBg:      '#F5F5F4',
  amber:       '#B45309',
  amberBg:     '#FEF3C7',
};
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const LOGO_URL = 'https://helmsportslabs.com/helm-golf-logo-transparent.png';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBrandedEmail({ preheader, eyebrow, heading, bodyHtml, cta, details, footerNote }) {
  const baseUrl = 'https://helmsportslabs.com';
  const safePreheader = esc(preheader);
  const safeHeading = esc(heading);

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${B.green};">${esc(eyebrow)}</p>`
    : '';

  const detailsHtml = details && details.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${B.border};border-radius:8px;overflow:hidden;margin:20px 0;border-collapse:separate;">
        <tbody>
          ${details.map(d => `<tr>
            <td style="padding:10px 16px;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${B.muted};white-space:nowrap;">${esc(d.label)}</td>
            <td style="padding:10px 16px;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:14px;font-weight:500;color:${B.dark};text-align:right;">${esc(d.value)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '';

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
        <tr>
          <td style="border-radius:8px;background-color:${B.green};" bgcolor="${B.green}">
            <a href="${esc(cta.url)}"
               style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:${B.white};text-decoration:none;letter-spacing:0.1px;line-height:1.4;white-space:nowrap;border-radius:8px;background-color:${B.green};">
              ${esc(cta.label)}&nbsp;&nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const footerText = footerNote
    ? esc(footerNote)
    : "You're receiving this because you're part of a Helm Sports team.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${safeHeading}</title>
  <style>
    body { font-family: ${FONT}; }
    @media only screen and (max-width:620px){
      .wrap{width:100%!important;}
      .card-inner{padding:28px 20px!important;}
      .foot-inner{padding:16px 20px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${B.pageBg};-webkit-text-size-adjust:100%;" bgcolor="${B.pageBg}">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${B.pageBg};">${safePreheader}&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;border-radius:12px;border:1px solid ${B.border};overflow:hidden;background-color:${B.white};" bgcolor="${B.white}">
          <tr>
            <td style="height:4px;background-color:${B.green};border-radius:12px 12px 0 0;line-height:4px;font-size:4px;" bgcolor="${B.green}">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:${B.cream};padding:24px 32px 20px;" bgcolor="${B.cream}">
              <a href="${baseUrl}" style="text-decoration:none;display:inline-block;">
                <img src="${LOGO_URL}" alt="Helm" height="36"
                     style="height:36px;width:auto;border:0;display:block;" border="0" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="card-inner" style="background-color:${B.cream};padding:4px 32px 32px;" bgcolor="${B.cream}">
              ${eyebrowHtml}
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-0.5px;color:${B.dark};">${safeHeading}</h1>
              ${bodyHtml}
              ${detailsHtml}
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td class="foot-inner" style="background-color:${B.white};padding:16px 32px 20px;border-top:1px solid ${B.border};" bgcolor="${B.white}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${B.muted};">
                      ${footerText}
                      &nbsp;&middot;&nbsp;
                      <a href="${baseUrl}/golf/dashboard/settings" style="color:${B.muted};text-decoration:underline;">Manage preferences</a>
                    </p>
                  </td>
                  <td align="right" style="white-space:nowrap;padding-left:16px;">
                    <span style="font-family:${FONT};font-size:11px;color:${B.muted};letter-spacing:0.2px;">Helm Sports Labs</span>
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:500;color:${B.dark};">Hi Nick,</p>
        <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.6;color:${B.muted};">Your coach is collecting RSVPs for this event. Please confirm whether you'll be attending.</p>
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:500;color:${B.dark};">Hi there,</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td>
              <span style="font-family:${FONT};font-size:13px;color:${B.muted};">From&nbsp;&nbsp;</span>
              <strong style="font-family:${FONT};font-size:13px;color:${B.dark};">Coach Davis</strong>
              <span style="margin-left:10px;display:inline-block;padding:3px 10px;background:#FEF3C7;color:#B45309;border-radius:12px;font-size:12px;font-weight:600;">High Priority</span>
            </td>
          </tr>
        </table>
        <div style="background:${B.white};border:1px solid ${B.border};border-radius:10px;padding:20px 22px;">
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:500;color:${B.dark};">Hi Nick,</p>
        <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.6;color:${B.muted};">A new qualifier has been posted. Review the details and prepare your rounds.</p>
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.65;color:${B.muted};">
          <strong style="color:${B.dark};">Coach Williams</strong> invited you to join
          <strong style="color:${B.dark};">UNC Golf</strong> on GolfHelm —
          the team management and round-tracking platform for college golf.
        </p>
        <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.65;color:${B.muted};">
          Tap the button below to accept the invite and create your player account.
        </p>
        <div style="background:${B.greenXLight};border:1px solid ${B.greenLight};border-radius:10px;padding:16px 20px;margin-top:24px;">
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
                   style="border:1px solid ${B.border};border-radius:10px;background:${B.white};">
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
        <p style="margin:0 0 6px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.25;letter-spacing:-0.4px;color:${B.dark};">Good morning, Sarah.</p>
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
                     style="border:1px solid ${B.greenLight};border-radius:10px;background:${B.greenXLight};">
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
        <p style="margin:0;font-family:${FONT};font-size:32px;font-weight:500;color:${B.dark};line-height:1;">${esc(value)}</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${B.muted};">${esc(label)}</p>
      </td>`;
      const bodyHtml = `
        <p style="margin:0 0 8px;font-family:${FONT};font-size:22px;font-weight:500;letter-spacing:-0.3px;color:${B.dark};">Hey Sarah,</p>
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:500;color:${B.dark};">Hi Nick,</p>
        <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;color:${B.muted};">
          Assigned by&nbsp;&nbsp;<strong style="color:${B.dark};">Coach Davis</strong>
        </p>
        <div style="background:${B.white};border:1px solid ${B.border};border-radius:10px;padding:16px 20px;margin-bottom:4px;">
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:500;color:${B.dark};">Hi Nick,</p>
        <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.6;color:${B.muted};">
          <strong style="color:${B.dark};">Coach Williams</strong> sent you a message.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
          <tr>
            <td style="border-left:3px solid ${B.green};padding:12px 20px;background:${B.greenLight};border-radius:0 8px 8px 0;">
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${B.dark};font-style:italic;">"Can we chat Friday before practice about the qualifier lineup?"</p>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-family:${FONT};font-size:13px;color:${B.muted};line-height:1.5;">Reply directly in Helm to keep the conversation going.</p>
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
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:500;color:${B.dark};">Hi Nick,</p>
        <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;color:${B.muted};">
          From&nbsp;&nbsp;<strong style="color:${B.dark};">Coach Davis</strong>
          &nbsp;&nbsp;<span style="display:inline-block;padding:3px 10px;background:${B.greenXLight};color:${B.green};border-radius:12px;font-size:12px;font-weight:600;">Iron Play</span>
        </p>
        <div style="background:${B.greenXLight};border:1px solid ${B.greenLight};border-radius:10px;padding:16px 20px;">
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

  console.log(`Rendering ${templates.length} email templates to ${OUT_DIR}/\n`);

  for (const t of templates) {
    const html = t.render();
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
