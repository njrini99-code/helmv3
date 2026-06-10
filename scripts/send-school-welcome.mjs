#!/usr/bin/env node
/**
 * send-school-welcome.mjs
 *
 * Renders welcome emails for the three initial demo-school coach accounts and
 * writes previews to /tmp/email-previews/. By default this is a DRY RUN —
 * pass --send to actually deliver via Resend.
 *
 * Usage:
 *   node scripts/send-school-welcome.mjs           # dry-run — writes previews only
 *   node scripts/send-school-welcome.mjs --send    # send live emails
 *
 * Environment: reads from .env.local (or ambient process.env).
 * Required env vars to send:
 *   RESEND_API_KEY
 *   NEXT_PUBLIC_APP_URL  (optional — defaults to https://helmsportslabs.com)
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * This script uses a compiled-on-the-fly version of the TS template (via
 * tsx if available, otherwise a pure-JS fallback that rebuilds the same HTML
 * inline). The TS source is the authoritative version; the inline copy here is
 * kept in sync manually.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Load env from .env.local ─────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local absent — rely on ambient env
  }
}
loadEnv();

// ─── Demo coach registry ──────────────────────────────────────────────────────
// Join codes are read from the DB at runtime (see fetchJoinCodes). If the DB
// is unreachable these hardcoded fallbacks are used.
const DEMO_COACHES = [
  {
    firstName: 'Chris',
    fullName: 'Chris Jones',
    email: 'Christopher.jones@lr.edu',
    schoolName: 'Lenoir-Rhyne University',
    slug: 'lr',
    // Fetched at runtime from DB; hardcoded as fallback when DB unreachable.
    joinCodeFallback: 'MZEY6MD8',
    orgId: '0bb9e8e1-0f32-4719-b9ea-657a74f76a8d',
  },
  {
    firstName: 'Dustin',
    fullName: 'Dustin Meadows',
    email: 'dmeadows@piedmont.edu',
    schoolName: 'Piedmont University',
    slug: 'piedmont',
    joinCodeFallback: 'BEU4S459',
    orgId: 'd7a79c91-ce9c-47a4-bd13-c8be81f032ea',
  },
  {
    firstName: 'Lauren',
    fullName: 'Lauren Grogan',
    email: 'grogranl@denison.edu',
    schoolName: 'Denison University',
    slug: 'denison',
    joinCodeFallback: '8JCXH3ZX',
    orgId: 'ef06ba2e-0f4d-480d-b417-2b6d3530e961',
  },
];

const SUPPORT_EMAIL = 'admin@helmsportslabs.com';

// ─── Supabase: fetch live join codes ─────────────────────────────────────────
async function fetchJoinCodes() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('  ⚠ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — using hardcoded join codes.');
    return null;
  }

  try {
    // Dynamic import so the script can run without @supabase/supabase-js compiled
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, key);

    const orgIds = DEMO_COACHES.map((c) => c.orgId);
    const { data: teams, error } = await client
      .from('golf_teams')
      .select('join_code, organization_id')
      .in('organization_id', orgIds);

    if (error) {
      console.warn(`  ⚠ DB fetch failed: ${error.message} — using hardcoded join codes.`);
      return null;
    }

    // Build orgId → join_code map
    const map = {};
    for (const t of teams ?? []) {
      map[t.organization_id] = t.join_code;
    }
    return map;
  } catch (err) {
    console.warn(`  ⚠ DB fetch threw: ${err.message} — using hardcoded join codes.`);
    return null;
  }
}

// ─── Minimal inline email renderer (mirrors src/lib/email/templates/welcome.ts)
// This allows the script to run without tsx/ts-node. The TS file is the
// canonical source — update both if copy changes.
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Hosted production logo URL — the --send path keeps this; previews swap it
// for an inlined base64 data URI (see writePreview below).
const LOGO_URL = 'https://helmsportslabs.com/helm-golf-logo-transparent.png';

function renderBrandedEmailInline(opts) {
  const {
    preheader, eyebrow, heading, bodyHtml, cta, footerNote,
  } = opts;

  const B = {
    green: '#16A34A', greenLight: '#DCFCE7', greenXLight: '#F0FDF4',
    dark: '#1C1917', muted: '#78716C', warm400: '#A8A29E',
    border: '#E7E5E4', cream: '#FFFEFA', white: '#FFFFFF',
  };
  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const SERIF = `Georgia,'Times New Roman',Times,serif`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 18px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${B.green};line-height:1;">${escHtml(eyebrow)}</p>`
    : '';
  const ctaHtml = cta
    ? `<table role="presentation" class="cta-table" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0 0;">
<tr><td class="cta-td" style="border-radius:100px;background-color:${B.green};" bgcolor="${B.green}">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escHtml(cta.url)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${B.green}"><w:anchorlock/><center style="color:${B.white};font-family:${FONT};font-size:14px;font-weight:600;"><![endif]-->
<a class="cta-a" href="${escHtml(cta.url)}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:0.3px;color:${B.white};text-decoration:none;line-height:1.4;white-space:nowrap;border-radius:100px;background-color:${B.green};">${escHtml(cta.label)}&nbsp;&rarr;</a>
<!--[if mso]></center></v:roundrect><![endif]-->
</td></tr></table>`
    : '';
  const hairline = `<tr><td class="rule-cell" style="padding:0 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:1px;background-color:${B.border};font-size:1px;line-height:1px;" bgcolor="${B.border}">&nbsp;</td></tr>
</table>
</td></tr>`;
  const footerText = footerNote ? escHtml(footerNote) : "You&#39;re receiving this because you&#39;re part of a Helm Sports team.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/>
<title>${escHtml(heading)}</title>
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
@media (prefers-color-scheme:dark){.dm-body{background-color:${B.cream}!important;}}
</style>
</head>
<body class="dm-body" style="margin:0;padding:0;background-color:${B.cream};-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;" bgcolor="${B.cream}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${B.cream};">${escHtml(preheader)}&#8203;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 16px 48px;background-color:${B.cream};" bgcolor="${B.cream}">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${B.white};border:1px solid ${B.border};border-radius:2px;" bgcolor="${B.white}">
<tr><td class="logo-cell" style="background-color:${B.cream};padding:32px 48px 24px;" bgcolor="${B.cream}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td width="44" style="width:44px;vertical-align:middle;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td width="44" height="44" align="center" valign="middle" bgcolor="${B.greenXLight}" style="width:44px;height:44px;background-color:${B.greenXLight};border:1px solid ${B.greenLight};border-radius:10px;text-align:center;vertical-align:middle;">
<a href="${baseUrl}" style="text-decoration:none;display:inline-block;font-family:${FONT};font-size:16px;font-weight:700;color:${B.green};line-height:0;">
<img src="${LOGO_URL}" alt="Helm" width="32" height="26" style="width:32px;height:26px;display:block;border:0;" border="0"/>
</a>
</td></tr>
</table>
</td>
<td style="padding-left:14px;vertical-align:middle;">
<span style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${B.warm400};">Helm Sports Labs</span>
</td>
</tr>
</table>
</td></tr>
${hairline}
<tr><td class="body-cell" style="background-color:${B.white};padding:40px 48px 44px;" bgcolor="${B.white}">
${eyebrowHtml}
<h1 style="margin:0 0 28px;font-family:${SERIF};font-size:28px;font-weight:normal;line-height:1.25;letter-spacing:-0.3px;color:${B.dark};">${escHtml(heading)}</h1>
${bodyHtml}
${ctaHtml}
</td></tr>
${hairline}
<tr><td class="foot-cell" style="background-color:${B.white};padding:20px 48px 24px;" bgcolor="${B.white}">
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${B.warm400};">${footerText} &nbsp;&middot;&nbsp; <a href="${baseUrl}/golf/dashboard/settings" style="color:${B.warm400};text-decoration:underline;">Manage preferences</a> &nbsp;&middot;&nbsp; Helm Sports Labs</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeHtml({ firstName, schoolName, teamJoinCode, supportEmail = SUPPORT_EMAIL }) {
  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
  const GREEN = '#16A34A';
  const DARK = '#1c1917';
  const WARM700 = '#44403C';
  const MUTED = '#78716c';
  const BORDER = '#E7E5E4';
  const GREEN_XLIGHT = '#F0FDF4';
  const GREEN_LIGHT = '#DCFCE7';
  const GREEN_DEEP = '#166534';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
  const dashboardUrl = `${appUrl}/golf/dashboard`;

  const safeFirst = escHtml(firstName);
  const safeSchool = escHtml(schoolName);
  const safeSupportEmail = escHtml(supportEmail);
  const safeCode = teamJoinCode ? escHtml(teamJoinCode) : '';

  const joinCodeBlock = safeCode
    ? `<div style="background-color:${GREEN_XLIGHT};border:1px solid ${GREEN_LIGHT};border-radius:2px;padding:16px 20px;margin:24px 0 0;">
<p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${GREEN};">Team Join Code</p>
<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.5;color:${GREEN_DEEP};">Share this with your players so they can join your roster in seconds:</p>
<p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:${DARK};">${safeCode}</p>
</div>` : '';

  const steps = [
    { num: '1', title: 'Log in to your dashboard',
      desc: `Head to <a href="${escHtml(dashboardUrl)}" style="color:${GREEN};text-decoration:none;font-weight:600;">helmsportslabs.com/golf/dashboard</a> and sign in. Your team and org are already set up.` },
    { num: '2', title: 'Add your roster',
      desc: safeCode
        ? `Share your join code <strong style="color:${DARK};">${safeCode}</strong> and players can join from the app — or invite them directly from your Roster page.`
        : 'Go to your Roster page and invite players by email, or generate a join code they can use to self-enroll.' },
    { num: '3', title: 'Enter a round and see CoachHelm work',
      desc: 'Once players submit a round, CoachHelm automatically surfaces patterns in scoring, approach play, and putting — and tells you exactly where to focus practice.' },
  ];

  const stepsHtml = steps.map((s) => `
<tr><td style="padding:0 0 16px;vertical-align:top;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td style="width:32px;padding-right:14px;vertical-align:top;">
<div style="width:28px;height:28px;border-radius:50%;background-color:${GREEN};display:inline-block;text-align:center;line-height:28px;">
<span style="font-family:${FONT};font-size:13px;font-weight:700;color:#FFFFFF;">${s.num}</span></div></td>
<td style="vertical-align:top;">
<p style="margin:0 0 3px;font-family:${FONT};font-size:14px;font-weight:600;color:${DARK};">${s.title}</p>
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${WARM700};">${s.desc}</p>
</td></tr></table></td></tr>`).join('');

  const subject = `Welcome to Helm, ${firstName} — your program is ready`;

  const bodyHtml = `
<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${WARM700};">Hi ${safeFirst}, welcome to Helm — we're glad you're here.</p>
<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${WARM700};">
Managing a college golf program means juggling spreadsheets, group chats, tournament logistics, and individual player development — all at once. Helm is built to replace that patchwork with one platform that actually fits how you coach. Track every round shot-by-shot, see where each player is losing or gaining strokes, and let <strong style="color:${DARK};">CoachHelm AI</strong> surface the patterns that are hardest to spot across a full roster. Instead of combing through numbers after the fact, you'll have actionable insights waiting for you — which players need work on their approach, who's leaving putts short, where a qualifier would shake out today.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr><td style="height:1px;background-color:${BORDER};line-height:1px;font-size:1px;">&nbsp;</td></tr>
</table>
<p style="margin:0 0 16px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">Three things to do first</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>${stepsHtml}</tbody></table>
${joinCodeBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px;">
<tr><td style="height:1px;background-color:${BORDER};line-height:1px;font-size:1px;">&nbsp;</td></tr>
</table>
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.7;color:${MUTED};">
Questions? Reply to this email or reach us at
<a href="mailto:${safeSupportEmail}" style="color:${GREEN};text-decoration:none;font-weight:600;">${safeSupportEmail}</a>.
We typically respond within one business day.
</p>`;

  const html = renderBrandedEmailInline({
    preheader: `Welcome to Helm, ${firstName} — your ${schoolName} program is set up and ready to go.`,
    eyebrow: 'Welcome',
    heading: `Your ${safeSchool} program is live on Helm`,
    bodyHtml,
    cta: { label: 'Go to Dashboard', url: dashboardUrl },
    footerNote: "You're receiving this because you created a coach account on Helm Sports Labs.",
  });

  return { subject, html };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const SEND = args.includes('--send');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       send-school-welcome  —  Helm Sports Labs       ║');
  console.log(`║  Mode: ${SEND ? '⚠  LIVE SEND (--send flag detected)           ' : 'DRY RUN (no --send flag)                   '}  ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Fetch live join codes from DB
  console.log('→ Fetching join codes from DB...');
  const liveCodeMap = await fetchJoinCodes();
  console.log(liveCodeMap
    ? `  ✓ DB reachable — codes fetched for ${Object.keys(liveCodeMap).length} org(s)`
    : '  ⚠ Using hardcoded fallbacks');
  console.log('');

  // Resolve join codes (live → fallback)
  const coaches = DEMO_COACHES.map((c) => ({
    ...c,
    joinCode: (liveCodeMap && liveCodeMap[c.orgId]) || c.joinCodeFallback,
  }));

  // Ensure preview dir
  const PREVIEW_DIR = '/tmp/email-previews';
  mkdirSync(PREVIEW_DIR, { recursive: true });

  // ── Optional: Resend client ───────────────────────────────────────────────
  let resend = null;
  if (SEND) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('ERROR: --send requires RESEND_API_KEY to be set. Aborting.');
      process.exit(1);
    }
    const { Resend } = await import('resend');
    resend = new Resend(apiKey);
    console.log('  ✓ Resend client initialised\n');
  }

  const FROM = process.env.RESEND_WELCOME_FROM
    || process.env.RESEND_COACH_DIGEST_FROM
    || 'Helm Sports <coachhelm@helmsportslabs.com>';

  // ── Process each coach ────────────────────────────────────────────────────
  const results = [];

  for (const coach of coaches) {
    console.log(`Processing: ${coach.fullName} (${coach.schoolName})`);
    console.log(`  Email:     ${coach.email}`);
    console.log(`  Join code: ${coach.joinCode}${liveCodeMap ? ' (live)' : ' (fallback)'}`);

    const { subject, html } = buildWelcomeHtml({
      firstName: coach.firstName,
      schoolName: coach.schoolName,
      teamJoinCode: coach.joinCode,
      supportEmail: SUPPORT_EMAIL,
    });

    // Write preview — PREVIEW FILES ONLY get the logo inlined as a base64
    // data URI (local files block remote images). The --send path below uses
    // `html` unchanged, i.e. the hosted HTTPS logo (Gmail/Outlook strip
    // data: URIs).
    const logoPng = readFileSync(resolve(ROOT, 'public', 'helm-golf-logo-transparent.png'));
    const logoDataUri = `data:image/png;base64,${logoPng.toString('base64')}`;
    const previewHtml = html.split(LOGO_URL).join(logoDataUri);
    const previewPath = `${PREVIEW_DIR}/welcome-${coach.slug}.html`;
    writeFileSync(previewPath, previewHtml, 'utf8');
    console.log(`  ✓ Preview written → ${previewPath}`);

    if (SEND && resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: FROM,
          to: coach.email,
          subject,
          html,
        });
        if (error) {
          console.error(`  ✗ Send failed: ${error.message}`);
          results.push({ coach: coach.slug, sent: false, error: error.message });
        } else {
          console.log(`  ✓ Sent — message ID: ${data?.id}`);
          results.push({ coach: coach.slug, sent: true, messageId: data?.id });
        }
      } catch (err) {
        console.error(`  ✗ Send threw: ${err.message}`);
        results.push({ coach: coach.slug, sent: false, error: err.message });
      }
    }
    console.log('');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (SEND) {
    const sent = results.filter((r) => r.sent).length;
    console.log(`Send summary: ${sent}/${results.length} delivered`);
    if (results.some((r) => !r.sent)) {
      process.exitCode = 1;
    }
  } else {
    console.log('DRY RUN — wrote previews:');
    for (const coach of coaches) {
      console.log(`  /tmp/email-previews/welcome-${coach.slug}.html`);
    }
    console.log('\nNo emails sent. Re-run with --send to deliver.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
