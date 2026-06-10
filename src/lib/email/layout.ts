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
 * Design system ("editorial", 2026-06): cream #FFFEFA page, white card with a
 * warm hairline border, Georgia serif display heading, two hairline rules
 * separating masthead / content / footer, a 44px brand-tile masthead with a
 * tracked small-caps wordmark, and a full-pill green CTA. Premium print
 * correspondence, not SaaS notification.
 *
 * Brand: helm green #16A34A used structurally (tile, eyebrow, CTA, rules in
 *        quote blocks), warm text (#1C1917 / #78716C / #A8A29E).
 */

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const B = {
  green:       '#16A34A',
  greenDark:   '#15803D',
  greenDeep:   '#166534',
  greenLight:  '#DCFCE7',
  greenXLight: '#F0FDF4',
  dark:        '#1C1917',
  warm700:     '#44403C',
  muted:       '#78716C',
  warm400:     '#A8A29E',
  border:      '#E7E5E4',
  cream:       '#FFFEFA',
  white:       '#FFFFFF',
  pageBg:      '#FFFEFA',
} as const;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const SERIF = `Georgia,'Times New Roman',Times,serif`;

// Hosted production logo. Preview scripts swap this for an inlined data URI
// (remote images are blocked when previewing local files); production email
// MUST keep the hosted HTTPS URL — Gmail/Outlook strip data: URIs.
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

  // ── Eyebrow: small caps, green, tracked 2px ──────────────────────────────
  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 18px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${B.green};line-height:1;">${escapeHtml(eyebrow)}</p>`
    : '';

  // ── Details: editorial hairline key-value rows ────────────────────────────
  const detailsHtml =
    details && details.length > 0
      ? `
        <table role="presentation" class="details" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin:28px 0 0;border-top:1px solid ${B.border};">
          <tbody>
            ${details
              .map(
                (d) => `
            <tr>
              <td style="padding:13px 16px 13px 0;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:${B.muted};white-space:nowrap;vertical-align:middle;">
                ${escapeHtml(d.label)}
              </td>
              <td style="padding:13px 0;border-bottom:1px solid ${B.border};font-family:${FONT};font-size:14px;font-weight:500;color:${B.dark};text-align:right;vertical-align:middle;">
                ${escapeHtml(d.value)}
              </td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>`
      : '';

  // ── CTA: bulletproof solid-green pill (full-width block on mobile) ────────
  const ctaHtml = cta
    ? `
      <table role="presentation" class="cta-table" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0 0;">
        <tr>
          <td class="cta-td" style="border-radius:100px;background-color:${B.green};" bgcolor="${B.green}">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(cta.url)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${B.green}"><w:anchorlock/><center style="color:${B.white};font-family:${FONT};font-size:14px;font-weight:600;"><![endif]-->
            <a class="cta-a" href="${escapeHtml(cta.url)}"
               style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:0.3px;color:${B.white};text-decoration:none;line-height:1.4;white-space:nowrap;border-radius:100px;background-color:${B.green};">
              ${escapeHtml(cta.label)}&nbsp;&rarr;
            </a>
            <!--[if mso]></center></v:roundrect><![endif]-->
          </td>
        </tr>
      </table>`
    : '';

  // ── Hairline rule (separates masthead / content / footer) ─────────────────
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
      .wrap{width:100%!important;}
      .logo-cell{padding:28px 24px 20px!important;}
      .rule-cell{padding:0 24px!important;}
      .body-cell{padding:28px 24px 36px!important;}
      .foot-cell{padding:20px 24px!important;}
      .cta-table{width:100%!important;}
      .cta-td{display:block!important;text-align:center!important;}
      .cta-a{display:block!important;width:100%!important;padding:16px!important;font-size:16px!important;text-align:center!important;box-sizing:border-box!important;}
    }
    /* Dark mode — keep the cream stationery field */
    @media (prefers-color-scheme:dark){
      .dm-body{background-color:${B.cream}!important;}
    }
  </style>
</head>
<body class="dm-body" style="margin:0;padding:0;background-color:${B.cream};-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;" bgcolor="${B.cream}">

  <!-- Preheader spacer -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${B.cream};">${safePreheader}&#8203;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px 48px;background-color:${B.cream};" bgcolor="${B.cream}">

        <!-- Card shell — max 600px, warm hairline border -->
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background-color:${B.white};border:1px solid ${B.border};border-radius:2px;" bgcolor="${B.white}">

          <!-- ══ MASTHEAD: brand tile + tracked wordmark on a cream field ══ -->
          <tr>
            <td class="logo-cell" style="background-color:${B.cream};padding:32px 48px 24px;" bgcolor="${B.cream}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Brand tile: 44px chip with a solid light field so the
                       green mark never vanishes under dark-mode inversion.
                       Plain hosted img — no CSS filter tricks. -->
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
                  <!-- Wordmark -->
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${B.warm400};">Helm Sports Labs</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${hairline}

          <!-- ══ BODY — generous padding, editorial type ══ -->
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

          <!-- ══ FOOTER — white, minimal, single flowing line ══ -->
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
        <!-- / Card shell -->

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
