/**
 * Coach morning digest — email template.
 *
 * Pure function that renders the 06:30 UTC daily digest for a single coach.
 * No I/O, no Resend imports here — the caller pipes `{ subject, html, text }`
 * into `sendCoachDigest()` in `./resend-client.ts`.
 *
 * Design constraints (from Wave 1C brief):
 *   - Transactional voice. No marketing CTAs, no promotional blocks.
 *   - Resend-friendly, email-client-safe HTML. Tables for layout; inline
 *     styles only; brand tokens mirror `src/lib/notifications/email.ts` so
 *     coaches see a consistent look across transactional mail.
 *   - Plain-text fallback is content-complete — no feature gap vs HTML.
 *   - Deep links anchor-target insights on the coach dashboard so clicking
 *     goes straight to the card (`#insight-{id}`).
 */

// ─── Brand tokens (kept in sync with src/lib/notifications/email.ts) ────────

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
  amber: '#B45309',
  amberBg: '#FEF3C7',
} as const;

// ─── Public types ────────────────────────────────────────────────────────────

export interface CoachDigestInsight {
  title: string;
  content: string;
  player_name: string;
  strokes_impact: number;
  deep_link: string;
}

export interface CoachDigestCelebration {
  title: string;
  player_name: string;
  deep_link?: string;
}

export interface CoachDigestWatch {
  title: string;
  player_name: string;
  deep_link?: string;
}

export interface CoachDigestData {
  coachName: string;
  teamName: string;
  /** Human-friendly, e.g. `"Tuesday, April 22"` */
  date: string;
  topInsights: CoachDigestInsight[];
  celebration: CoachDigestCelebration | null;
  watch: CoachDigestWatch | null;
  /** Optional base URL (defaults to NEXT_PUBLIC_APP_URL or the production host). */
  baseUrl?: string;
}

export interface RenderedCoachDigest {
  subject: string;
  html: string;
  text: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStrokes(n: number): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(abs)) return '0.0';
  return abs.toFixed(1);
}

function absoluteUrl(base: string, link: string): string {
  if (!link) return base;
  if (/^https?:\/\//i.test(link)) return link;
  return `${base.replace(/\/$/, '')}${link.startsWith('/') ? link : `/${link}`}`;
}

function defaultBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://helmsportslabs.com'
  );
}

// ─── HTML section builders ───────────────────────────────────────────────────

function renderInsightRow(insight: CoachDigestInsight, baseUrl: string): string {
  const url = absoluteUrl(baseUrl, insight.deep_link);
  const player = escapeHtml(insight.player_name);
  const title = escapeHtml(insight.title);
  const content = escapeHtml(insight.content);
  const strokes = formatStrokes(insight.strokes_impact);

  return `
    <tr>
      <td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid ${BRAND.border};border-radius:10px;background:${BRAND.white};">
          <tr>
            <td style="padding:18px 20px 14px;">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${BRAND.muted};">
                ${player}&nbsp;·&nbsp;${strokes} strokes
              </p>
              <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.35;color:${BRAND.dark};">
                ${title}
              </p>
              <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:${BRAND.warm700};">
                ${content}
              </p>
              <a href="${escapeHtml(url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.green};text-decoration:none;">
                Open in CoachHelm&nbsp;&rarr;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderCelebration(
  celebration: CoachDigestCelebration,
  baseUrl: string,
): string {
  const player = escapeHtml(celebration.player_name);
  const title = escapeHtml(celebration.title);
  const link = celebration.deep_link
    ? `<a href="${escapeHtml(absoluteUrl(baseUrl, celebration.deep_link))}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.greenDeep};text-decoration:none;">Open in CoachHelm&nbsp;&rarr;</a>`
    : '';

  return `
    <tr>
      <td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid ${BRAND.greenLight};border-radius:10px;background:${BRAND.greenXLight};">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${BRAND.greenDeep};">
                Bright spot
              </p>
              <p style="margin:0 0 ${link ? '10px' : '0'};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:1.5;color:${BRAND.greenDeep};">
                ${player} just resolved ${title}. Send them props.
              </p>
              ${link}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderWatch(watch: CoachDigestWatch, baseUrl: string): string {
  const player = escapeHtml(watch.player_name);
  const title = escapeHtml(watch.title);
  const link = watch.deep_link
    ? `<a href="${escapeHtml(absoluteUrl(baseUrl, watch.deep_link))}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.amber};text-decoration:none;">Open in CoachHelm&nbsp;&rarr;</a>`
    : '';

  return `
    <tr>
      <td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid #FDE68A;border-radius:10px;background:${BRAND.amberBg};">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${BRAND.amber};">
                On the watch list
              </p>
              <p style="margin:0 0 ${link ? '10px' : '0'};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:1.5;color:${BRAND.amber};">
                ${player} is trending toward a concern — ${title}. Keep an eye.
              </p>
              ${link}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

// ─── Main renderer ──────────────────────────────────────────────────────────

export function renderCoachDigest(data: CoachDigestData): RenderedCoachDigest {
  const baseUrl = data.baseUrl ?? defaultBaseUrl();
  const coachName = escapeHtml(data.coachName || 'Coach');
  const teamName = escapeHtml(data.teamName || 'your team');
  const date = escapeHtml(data.date || '');

  const subject = '3 things to know about your team this morning';

  const previewText = data.topInsights[0]
    ? `${data.topInsights[0].player_name}: ${data.topInsights[0].title}`
    : `Morning digest for ${data.teamName}`;

  // ─── Body sections ────────────────────────────────────────────────────────

  const topConcernHeading = data.topInsights.length
    ? `
      <tr>
        <td style="padding:0 0 10px;">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${BRAND.muted};">
            ${data.topInsights.length === 1 ? 'Top concern today' : 'Top concerns today'}
          </p>
        </td>
      </tr>`
    : '';

  const insightsHtml = data.topInsights
    .map((insight) => renderInsightRow(insight, baseUrl))
    .join('');

  const celebrationHtml = data.celebration
    ? renderCelebration(data.celebration, baseUrl)
    : '';

  const watchHtml = data.watch ? renderWatch(data.watch, baseUrl) : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.subtle};-webkit-text-size-adjust:100%;" bgcolor="${BRAND.subtle}">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${BRAND.subtle};">${escapeHtml(previewText)}&#8203;&#65279;&#65279;&#65279;&#65279;&#65279;&#65279;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${BRAND.green} 0%,${BRAND.greenDark} 100%);border-radius:12px 12px 0 0;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background-color:${BRAND.dark};padding:22px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <a href="${escapeHtml(baseUrl)}" style="text-decoration:none;display:inline-block;">
                      <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.white};">Helm</span><span style="font-size:20px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.green};">.</span>
                    </a>
                  </td>
                  <td valign="middle" align="right">
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.3px;color:rgba(255,255,255,0.65);">
                      Morning digest
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:${BRAND.cream};padding:32px 32px 8px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:500;color:${BRAND.muted};">
                ${date}
              </p>
              <h1 style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.25;letter-spacing:-0.4px;color:${BRAND.dark};">
                Good morning, ${coachName}.
              </h1>
              <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:${BRAND.warm700};">
                Here is what changed overnight on ${teamName}.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:${BRAND.cream};padding:0 32px 24px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${topConcernHeading}
                ${insightsHtml}
                ${celebrationHtml}
                ${watchHtml}
              </table>
            </td>
          </tr>

          <tr>
            <td style="height:1px;background-color:${BRAND.border};line-height:1px;font-size:1px;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background-color:${BRAND.white};padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid ${BRAND.border};border-top:none;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                You are receiving this because daily digests are enabled on your coaching profile.
                &nbsp;&middot;&nbsp;
                <a href="${escapeHtml(absoluteUrl(baseUrl, '/golf/dashboard/settings/coaching-intelligence'))}" style="color:${BRAND.muted};text-decoration:underline;">Manage digest</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = buildPlainText(data);

  return { subject, html, text };
}

// ─── Plain-text variant ─────────────────────────────────────────────────────

function buildPlainText(data: CoachDigestData): string {
  const baseUrl = data.baseUrl ?? defaultBaseUrl();
  const lines: string[] = [];

  lines.push(`Morning digest — ${data.date}`);
  lines.push(`Good morning, ${data.coachName}.`);
  lines.push(`Here is what changed overnight on ${data.teamName}.`);
  lines.push('');

  if (data.topInsights.length) {
    lines.push(
      data.topInsights.length === 1 ? 'Top concern today' : 'Top concerns today',
    );
    lines.push('');
    for (const insight of data.topInsights) {
      lines.push(
        `- ${insight.player_name} (${formatStrokes(insight.strokes_impact)} strokes): ${insight.title}`,
      );
      if (insight.content) lines.push(`  ${insight.content}`);
      lines.push(`  Open: ${absoluteUrl(baseUrl, insight.deep_link)}`);
      lines.push('');
    }
  }

  if (data.celebration) {
    lines.push('Bright spot');
    lines.push(
      `- ${data.celebration.player_name} just resolved ${data.celebration.title}. Send them props.`,
    );
    if (data.celebration.deep_link) {
      lines.push(`  Open: ${absoluteUrl(baseUrl, data.celebration.deep_link)}`);
    }
    lines.push('');
  }

  if (data.watch) {
    lines.push('On the watch list');
    lines.push(
      `- ${data.watch.player_name} is trending toward a concern — ${data.watch.title}. Keep an eye.`,
    );
    if (data.watch.deep_link) {
      lines.push(`  Open: ${absoluteUrl(baseUrl, data.watch.deep_link)}`);
    }
    lines.push('');
  }

  lines.push('Manage your digest preferences:');
  lines.push(absoluteUrl(baseUrl, '/golf/dashboard/settings/coaching-intelligence'));

  return lines.join('\n');
}
