/**
 * Shared branded email layout — the single source of truth for all
 * transactional email rendering in Helm Sports.
 *
 * Every product email (RSVP, event invite, qualifier, digest, team invite,
 * weekly recap) routes through `renderBrandedEmail`. Templates supply their
 * content via `opts` and receive a complete, email-client-safe HTML string
 * back. No React, no JSX — inline-styles-only tables that survive Gmail,
 * Apple Mail, Outlook, and dark-mode rewriting.
 *
 * Brand: cream #FFFEFA page, white card, helm green #16A34A accents,
 *        warm text (#1c1917 / #78716c), logo image at top.
 */

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const B = {
  green:       '#16A34A',
  greenDark:   '#15803D',
  greenDeep:   '#166534',
  greenLight:  '#DCFCE7',
  greenXLight: '#F0FDF4',
  dark:        '#1c1917',
  warm700:     '#44403C',
  muted:       '#78716c',
  border:      '#E7E5E4',
  cream:       '#FFFEFA',
  white:       '#FFFFFF',
  pageBg:      '#F5F5F4',
} as const;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;

const LOGO_URL = 'https://helmsportslabs.com/helm-golf-logo-transparent.png';
const BASE_URL = () =>
  process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

// ─── HTML escape ──────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface BrandedEmailOpts {
  /** Shown in inbox preheader (before subject expansion). */
  preheader: string;
  /** Small uppercase chip above the heading — e.g. "RSVP Reminder". */
  eyebrow?: string;
  heading: string;
  /** Inner HTML of the body (already-escaped or containing safe markup). */
  bodyHtml: string;
  /** Primary CTA button. Omit for digest-style emails that have no single action. */
  cta?: { label: string; url: string };
  /** Two-column detail rows (e.g. Date / Location). Values are HTML-escaped internally. */
  details?: Array<{ label: string; value: string }>;
  /** Muted one-liner in the footer (why you're receiving this). */
  footerNote?: string;
}

// ─── Main renderer ─────────────────────────────────────────────────────────────

export function renderBrandedEmail(opts: BrandedEmailOpts): string {
  const {
    preheader,
    eyebrow,
    heading,
    bodyHtml,
    cta,
    details,
    footerNote,
  } = opts;

  const baseUrl = BASE_URL();
  const safePreheader = escapeHtml(preheader);
  const safeHeading = escapeHtml(heading);

  // ── Eyebrow chip ─────────────────────────────────────────────────────────
  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${B.green};">${escapeHtml(eyebrow)}</p>`
    : '';

  // ── Details table ─────────────────────────────────────────────────────────
  const detailsHtml =
    details && details.length > 0
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid ${B.border};border-radius:8px;overflow:hidden;margin:20px 0;border-collapse:separate;">
          <tbody>
            ${details
              .map(
                (d) => `
            <tr>
              <td style="padding:10px 16px;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${B.muted};white-space:nowrap;">
                ${escapeHtml(d.label)}
              </td>
              <td style="padding:10px 16px;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:14px;font-weight:500;color:${B.dark};text-align:right;">
                ${escapeHtml(d.value)}
              </td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
      : '';

  // ── CTA button (bulletproof: padded td, not just anchor css) ──────────────
  const ctaHtml = cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
        <tr>
          <td style="border-radius:8px;background-color:${B.green};" bgcolor="${B.green}">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(cta.url)}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="18%" stroke="f" fillcolor="${B.green}"><w:anchorlock/><center style="color:${B.white};font-family:${FONT};font-size:14px;font-weight:bold;"><!
            [endif]-->
            <a href="${escapeHtml(cta.url)}"
               style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:${B.white};text-decoration:none;letter-spacing:0.1px;line-height:1.4;white-space:nowrap;border-radius:8px;background-color:${B.green};">
              ${escapeHtml(cta.label)}&nbsp;&nbsp;&rarr;
            </a>
            <!--[if mso]></center></v:roundrect><![endif]-->
          </td>
        </tr>
      </table>`
    : '';

  // ── Footer note ───────────────────────────────────────────────────────────
  const footerText = footerNote
    ? escapeHtml(footerNote)
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
      .wrap{width:100%!important;padding:0!important;}
      .card-inner{padding:28px 20px!important;}
      .foot-inner{padding:16px 20px!important;}
    }
    /* Dark mode — prevent pure-white-on-transparent blowout */
    @media (prefers-color-scheme:dark){
      .dm-body{background-color:${B.pageBg}!important;}
    }
  </style>
</head>
<body class="dm-body" style="margin:0;padding:0;background-color:${B.pageBg};-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;" bgcolor="${B.pageBg}">

  <!-- Preheader spacer -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${B.pageBg};">${safePreheader}&#8203;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">

        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;border-radius:12px;border:1px solid ${B.border};overflow:hidden;background-color:${B.white};" bgcolor="${B.white}">

          <!-- ══ GREEN ACCENT BAR ══ -->
          <tr>
            <td style="height:4px;background-color:${B.green};border-radius:12px 12px 0 0;line-height:4px;font-size:4px;" bgcolor="${B.green}">&nbsp;</td>
          </tr>

          <!-- ══ LOGO ROW ══ -->
          <tr>
            <td style="background-color:${B.cream};padding:24px 32px 20px;" bgcolor="${B.cream}">
              <a href="${baseUrl}" style="text-decoration:none;display:inline-block;">
                <img src="${LOGO_URL}"
                     alt="Helm"
                     height="36"
                     style="height:36px;width:auto;border:0;display:block;"
                     border="0" />
              </a>
            </td>
          </tr>

          <!-- ══ BODY ══ -->
          <tr>
            <td class="card-inner" style="background-color:${B.cream};padding:4px 32px 32px;" bgcolor="${B.cream}">

              ${eyebrowHtml}

              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-0.5px;color:${B.dark};">${safeHeading}</h1>

              ${bodyHtml}

              ${detailsHtml}

              ${ctaHtml}

            </td>
          </tr>

          <!-- ══ FOOTER ══ -->
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

// ─── Date formatting helpers (shared across email templates) ──────────────────

/**
 * Format an ISO datetime string to a human-readable event time.
 * Output: "Tuesday, June 10 · 2:00 PM"
 *
 * The `timezone` param can be an IANA zone string (e.g. "America/Chicago").
 * Falls back to UTC when the zone is absent or unrecognised.
 */
export function formatEventDateTime(
  isoString: string,
  timezone?: string | null,
): string {
  try {
    const tz = timezone || 'UTC';
    const date = new Date(isoString);
    // Verify it's a valid date
    if (isNaN(date.getTime())) return isoString;

    const datePart = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    });
    const timePart = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
    return `${datePart} · ${timePart}`;
  } catch {
    // Unknown timezone — fall back without tz conversion
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const datePart = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const timePart = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${datePart} · ${timePart}`;
    } catch {
      return isoString;
    }
  }
}

/**
 * Format an ISO date-only or datetime string to a short date: "June 10, 2026"
 */
export function formatShortDate(isoString: string, timezone?: string | null): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return isoString;
  }
}

/**
 * Detect whether a string looks like a raw ISO datetime (contains 'T' and
 * optionally a timezone offset). Used to guard against leaking raw ISO strings
 * to users.
 */
export function isRawIsoDatetime(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
}

/**
 * Safe-format a date string that may or may not already be human-readable.
 * If it looks like an ISO datetime, formats it. Otherwise passes it through.
 */
export function safeFormatDate(
  s: string,
  timezone?: string | null,
  mode: 'datetime' | 'date' = 'datetime',
): string {
  if (!s) return s;
  if (!isRawIsoDatetime(s)) return s; // already formatted by caller
  return mode === 'date'
    ? formatShortDate(s, timezone)
    : formatEventDateTime(s, timezone);
}
