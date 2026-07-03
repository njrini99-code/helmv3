/**
 * Email Notification Service
 *
 * Uses Resend for transactional emails.
 * Falls back gracefully if Resend is not configured.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationPreferences, NotificationType, EmailTemplate } from './types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';

// Resend client - lazy loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resendClient: any = null;

async function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[CRITICAL] RESEND_API_KEY not configured — no emails will be sent in production');
    } else {
      console.warn('[Notifications] RESEND_API_KEY not configured — emails disabled');
    }
    return null;
  }

  if (!resendClient) {
    const { Resend } = await import('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

/**
 * Get user's notification preferences
 * Reads from users.notification_preferences JSONB column.
 * Falls back to defaults if preferences not set or column missing.
 *
 * SECURITY CONTRACT: `userId` MUST be server-sourced (derived from an
 * authenticated session or a trusted DB lookup) — NEVER pass raw user input.
 * This read uses the service-role client (it runs from background cron/notifier
 * contexts where the cookie client throws), which BYPASSES RLS. A user-supplied
 * `userId` would therefore be an IDOR. All current callers pass DB-derived ids.
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    // Service-role client: this preference read runs from background contexts
    // (the insight-notifier push hook, the cron roster sweep) where the
    // cookie-based server client throws "cookies was called outside a request
    // scope". That exception was being swallowed by the catch below and
    // silently returning DEFAULTS — so a player who turned push OFF still
    // received background insight pushes. The admin client reads the real row
    // by id in any context.
    const supabase = createAdminClient();
    // .maybeSingle() returns null (no error) when the user row does not exist.
    // The cron roster sweep can hand us stale or detached player_ids whose
    // backing `users` row was deleted; .single() would throw PGRST116
    // ("Cannot coerce the result to a single JSON object") and surface as a
    // noisy "Failed to fetch notification preferences" log every iteration.
    // Falling back to DEFAULT_NOTIFICATION_PREFERENCES is the existing
    // behaviour for the missing-column / no-row case.
    const { data, error } = await supabase
      .from('users')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // Column might not exist yet - use defaults
      console.warn('Failed to fetch notification preferences:', error.message);
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    if (data?.notification_preferences && typeof data.notification_preferences === 'object') {
      // Merge with defaults to ensure all required fields exist
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(data.notification_preferences as Partial<NotificationPreferences>),
      };
    }

    return DEFAULT_NOTIFICATION_PREFERENCES;
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Check if user wants notifications for a specific type
 */
function shouldSendEmail(
  type: NotificationType,
  prefs: NotificationPreferences
): boolean {
  switch (type) {
    // Messages
    case 'new_message':
      return prefs.email_messages;

    // Pipeline/Recruiting
    case 'watchlist_add':
    case 'pipeline_stage_change':
      return prefs.email_pipeline_updates;

    // Events
    case 'camp_registration':
    case 'event_rsvp_reminder':
    case 'qualifier_created':
    case 'qualifier_updated':
      return prefs.email_event_reminders;

    // Profile activity
    case 'profile_view':
      return prefs.email_profile_views;

    // Announcements
    case 'team_announcement':
    case 'round_submitted':
      return prefs.email_announcements;

    // CoachHelm insights — separate so muting AI insights doesn't also
    // mute team announcements.
    case 'coachhelm_insight':
      return prefs.email_coachhelm;

    // Tasks
    case 'task_reminder':
    case 'task_assigned':
    case 'task_completed':
    case 'dev_plan_assigned':
      return prefs.email_task_reminders;

    default:
      return true;
  }
}

// ============================================================================
// PREMIUM EMAIL TEMPLATE SYSTEM
// ============================================================================

// Exact Helm brand tokens from tailwind.config.ts
const BRAND = {
  // Primary green scale
  green:        '#16A34A',  // primary-600
  greenDark:    '#15803D',  // primary-700
  greenDeep:    '#166534',  // primary-800
  greenLight:   '#DCFCE7',  // primary-100
  greenXLight:  '#F0FDF4',  // primary-50

  // Warm neutral scale
  dark:         '#1C1917',  // warm-900 — headers, primary text
  darkMid:      '#292524',  // warm-800
  warm700:      '#44403C',  // warm-700
  warm600:      '#57534E',  // warm-600
  muted:        '#78716C',  // warm-500
  warm400:      '#A8A29E',  // warm-400
  border:       '#E7E5E4',  // warm-200
  subtle:       '#F5F5F4',  // warm-100
  offWhite:     '#FAFAF9',  // warm-50

  // Base
  cream:        '#FFFEFA',  // cream default
  white:        '#FFFFFF',
};

// ============================================================================
// SVG ICON LIBRARY  (inline, email-safe, 20×20 viewBox)
// ============================================================================

const ICONS: Record<string, string> = {
  message: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h13A1.5 1.5 0 0 1 18 4.5v8A1.5 1.5 0 0 1 16.5 14H11l-3.5 3v-3H3.5A1.5 1.5 0 0 1 2 12.5v-8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 7.5h8M6 10.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  announcement: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.5h1.5m0 0V13a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.5M4.5 7.5H16a1 1 0 0 0 0-2H4.5a1 1 0 0 0 0 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 5.5v9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="15" cy="15.5" r="1" fill="currentColor"/></svg>`,

  flag: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v14M5 3h10l-2.5 4L15 11H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  calendar: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4" width="15" height="13.5" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 8.5h15M7 2.5V5.5M13 2.5V5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="12" r="1" fill="currentColor"/><circle cx="10" cy="12" r="1" fill="currentColor"/><circle cx="13" cy="12" r="1" fill="currentColor"/></svg>`,

  bookmark: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3h10a1 1 0 0 1 1 1v13l-6-4-6 4V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,

  chart: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 14.5l4.5-5 3.5 3 4-5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 17h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  eye: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/></svg>`,

  bell: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5H2.5L4 11V8a6 6 0 0 1 6-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 15.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

/** Renders an icon in a circle on dark bg for use in the body */
function iconCircle(iconKey: string, size = 48): string {
  const svg = ICONS[iconKey] ?? ICONS['bell']!;
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="width:${size}px;height:${size}px;background-color:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:12px;text-align:center;vertical-align:middle;">
          <div style="display:inline-block;color:${BRAND.green};width:20px;height:20px;margin-top:${Math.floor((size - 20) / 2) - 1}px;">
            ${svg.replace('currentColor', BRAND.green)}
          </div>
        </td>
      </tr>
    </table>`;
}

/** Small icon for the header pill (white, 16×16) */
function headerPillIcon(iconKey: string): string {
  const svg = ICONS[iconKey] ?? ICONS['bell']!;
  return svg
    .replace(/width="20"/g, 'width="14"')
    .replace(/height="20"/g, 'height="14"')
    .replace(/viewBox="0 0 20 20"/g, 'viewBox="0 0 20 20"')
    .replace(/currentColor/g, 'rgba(255,255,255,0.85)');
}

/**
 * Shared premium layout shell.
 * Dark warm header · cream body · subtle footer
 */
function emailShell(opts: {
  previewText: string;
  headerLabel: string;
  headerIconKey: string;
  iconKey: string;
  title: string;
  body: string;
  cta: { label: string; url: string };
  greeting?: string;
  footerNote?: string;
}): string {
  const { previewText, headerLabel, headerIconKey, iconKey, title, body, cta, greeting, footerNote } = opts;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:620px){
      .wrap{width:100%!important;padding:0 12px!important;}
      .card{border-radius:12px!important;}
      .body-pad{padding:28px 24px!important;}
      .head-pad{padding:22px 24px!important;}
      .foot-pad{padding:16px 24px!important;}
      .cta-btn{display:block!important;text-align:center!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.subtle};-webkit-text-size-adjust:100%;" bgcolor="${BRAND.subtle}">

  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${BRAND.subtle};">${previewText}&#8203;&#65279;&#65279;&#65279;&#65279;&#65279;&#65279;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="wrap" width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

          <!-- ═══ GREEN ACCENT BAR ═══ -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${BRAND.green} 0%,${BRAND.greenDark} 100%);border-radius:12px 12px 0 0;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <!-- ═══ HEADER ═══ -->
          <tr>
            <td class="head-pad" style="background-color:${BRAND.dark};padding:24px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <a href="${baseUrl}" style="text-decoration:none;display:inline-block;">
                      <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.white};">Helm</span><span style="font-size:21px;font-weight:700;letter-spacing:-0.6px;color:${BRAND.green};">.</span>
                    </a>
                  </td>
                  <td valign="middle" align="right">
                    <span style="display:inline-block;vertical-align:middle;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
                        <tr>
                          <td style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:5px 12px 5px 10px;white-space:nowrap;">
                            <span style="display:inline-block;vertical-align:middle;margin-right:6px;line-height:0;">${headerPillIcon(headerIconKey)}</span>
                            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;color:rgba(255,255,255,0.65);letter-spacing:0.3px;vertical-align:middle;">${headerLabel}</span>
                          </td>
                        </tr>
                      </table>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ BODY ═══ -->
          <tr>
            <td class="body-pad" style="background-color:${BRAND.cream};padding:36px 36px 28px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">

              ${greeting ? `<p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:500;color:${BRAND.muted};">${greeting}</p>` : ''}

              ${iconCircle(iconKey)}

              <!-- Title -->
              <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.25;letter-spacing:-0.5px;color:${BRAND.dark};">${title}</h1>

              <!-- Body -->
              ${body}

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="border-radius:8px;background:linear-gradient(135deg,${BRAND.green} 0%,${BRAND.greenDark} 100%);">
                    <a href="${cta.url}" class="cta-btn"
                       style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BRAND.white};text-decoration:none;letter-spacing:0.1px;line-height:1.4;white-space:nowrap;">
                      ${cta.label}&nbsp;&nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ═══ DIVIDER ═══ -->
          <tr>
            <td style="height:1px;background-color:${BRAND.border};line-height:1px;font-size:1px;">&nbsp;</td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td class="foot-pad" style="background-color:${BRAND.white};padding:18px 36px;border-radius:0 0 12px 12px;border:1px solid ${BRAND.border};border-top:none;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                      ${footerNote ?? 'You\'re receiving this because you\'re part of a Helm Sports team.'}
                      &nbsp;&middot;&nbsp;
                      <a href="${baseUrl}/golf/dashboard/settings" style="color:${BRAND.muted};text-decoration:underline;">Manage preferences</a>
                    </p>
                  </td>
                  <td align="right" style="white-space:nowrap;padding-left:16px;">
                    <a href="${baseUrl}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.warm400};text-decoration:none;font-weight:500;">helmsportslabs.com</a>
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

/** Renders a key-value detail row used in several templates */
function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid ${BRAND.border};">
        <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND.muted};">${label}</span>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid ${BRAND.border};text-align:right;">
        <span style="font-size:14px;font-weight:500;color:${BRAND.dark};">${value}</span>
      </td>
    </tr>`;
}

/** Wraps detail rows in a table */
function detailTable(rows: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;margin:20px 0;border-collapse:collapse;">
      <tbody>${rows}</tbody>
    </table>`;
}

/** Quote block for message previews */
function quoteBlock(text: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
      <tr>
        <td style="border-left:3px solid ${BRAND.green};padding:12px 20px;background:${BRAND.greenLight};border-radius:0 8px 8px 0;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.dark};font-style:italic;">"${text}"</p>
        </td>
      </tr>
    </table>`;
}

/** Badge pill (for urgency, stage labels, etc.) */
function badge(text: string, color: string, bg: string): string {
  return `<span style="display:inline-block;padding:3px 10px;background:${bg};color:${color};border-radius:12px;font-size:12px;font-weight:600;letter-spacing:0.2px;">${text}</span>`;
}

// ── Urgency config ────────────────────────────────────────────────────────────
const URGENCY: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low Priority',    color: '#78716C', bg: '#F5F4F0' },
  normal: { label: 'Normal',          color: '#1D4ED8', bg: '#EFF6FF' },
  high:   { label: 'High Priority',   color: '#B45309', bg: '#FEF3C7' },
  urgent: { label: 'Urgent',          color: '#DC2626', bg: '#FEF2F2' },
};

/**
 * Generate premium email template based on notification type
 */
function generateEmailTemplate(
  type: NotificationType,
  data: Record<string, unknown>
): EmailTemplate {

  switch (type) {

    // ── NEW MESSAGE ───────────────────────────────────────────────────────────
    case 'new_message': {
      const preview    = String(data.preview || '').slice(0, 200);
      const senderName = String(data.senderName || 'Someone');
      const messageUrl = String(data.messageUrl || '#');
      return {
        subject: `New message from ${senderName}`,
        html: emailShell({
          previewText: `${senderName}: ${preview}`,
          headerLabel: 'Direct Message',
          headerIconKey: 'message',
          iconKey: 'message',
          title: `Message from ${senderName}`,
          body: `
            <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.muted};">
              <strong style="color:${BRAND.dark};">${senderName}</strong> sent you a message.
            </p>
            ${quoteBlock(preview + (preview.length >= 200 ? '\u2026' : ''))}
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.muted};line-height:1.5;">Reply directly in Helm to keep the conversation going.</p>
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'Open Conversation', url: messageUrl },
          footerNote: 'You received this because someone sent you a message on Helm.',
        }),
        text: `New message from ${senderName}: "${preview}"\n\nReply at: ${messageUrl}`,
      };
    }

    // ── TEAM ANNOUNCEMENT ─────────────────────────────────────────────────────
    case 'team_announcement': {
      const title           = String(data.title || 'Team Announcement');
      const content         = String(data.content || '');
      const coachName       = String(data.coachName || 'Your Coach');
      const announcementUrl = String(data.announcementUrl || '#');
      const urgency         = String(data.urgency || 'normal');
      const urg             = URGENCY[urgency] ?? URGENCY['normal']!;
      const preview         = content.replace(/<[^>]*>/g, '').slice(0, 160);
      return {
        subject: `Team Announcement: ${title}`,
        html: emailShell({
          previewText: `${coachName}: ${preview}`,
          headerLabel: 'Team Announcement',
          headerIconKey: 'announcement',
          iconKey: 'announcement',
          title,
          body: `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.muted};">From&nbsp;&nbsp;</span>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.dark};">${coachName}</span>
                  <span style="margin-left:10px;">${badge(urg.label, urg.color, urg.bg)}</span>
                </td>
              </tr>
            </table>
            <div style="background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:10px;padding:20px 22px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.75;color:${BRAND.darkMid};">${content}</p>
            </div>
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'View Full Announcement', url: announcementUrl },
        }),
        text: `Team Announcement from ${coachName}: ${title}\n\n${preview}\n\nView at: ${announcementUrl}`,
      };
    }

    // ── QUALIFIER CREATED ─────────────────────────────────────────────────────
    case 'qualifier_created': {
      const qualifierName = String(data.qualifierName || 'New Qualifier');
      const startDate     = String(data.startDate || '');
      const numRounds     = String(data.numRounds || '');
      const qualifierUrl  = String(data.qualifierUrl || '#');
      return {
        subject: `New Qualifier: ${qualifierName}`,
        html: emailShell({
          previewText: `A new qualifier has been posted \u2014 ${qualifierName}`,
          headerLabel: 'Qualifier',
          headerIconKey: 'flag',
          iconKey: 'flag',
          title: qualifierName,
          body: `
            <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.muted};">A new qualifier has been posted. Review the details and prepare your rounds.</p>
            ${detailTable(
              detailRow('Start Date', startDate) +
              detailRow('Rounds', `${numRounds} round${Number(numRounds) !== 1 ? 's' : ''}`)
            )}
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'View Qualifier', url: qualifierUrl },
        }),
        text: `New qualifier: ${qualifierName}\nStart: ${startDate} \u00b7 ${numRounds} rounds\n\nView at: ${qualifierUrl}`,
      };
    }

    // ── EVENT RSVP REMINDER ───────────────────────────────────────────────────
    case 'event_rsvp_reminder': {
      const eventName = String(data.eventName || 'Upcoming Event');
      const eventDate = String(data.eventDate || '');
      const location  = String(data.location  || '');
      const eventUrl  = String(data.eventUrl  || '#');
      return {
        subject: `RSVP needed: ${eventName}`,
        html: emailShell({
          previewText: `Please confirm your attendance for ${eventName} \u2014 ${eventDate}`,
          headerLabel: 'RSVP Reminder',
          headerIconKey: 'calendar',
          iconKey: 'calendar',
          title: `RSVP for ${eventName}`,
          body: `
            <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.muted};">Your coach is collecting RSVPs for this event. Please confirm whether you\u2019ll be attending.</p>
            ${detailTable(
              detailRow('Date', eventDate) +
              (location ? detailRow('Location', location) : '')
            )}
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'RSVP Now', url: eventUrl },
          footerNote: 'You received this because you have an upcoming team event on Helm.',
        }),
        text: `RSVP reminder: ${eventName}\nDate: ${eventDate}${location ? `\nLocation: ${location}` : ''}\n\nRSVP at: ${eventUrl}`,
      };
    }

    // ── WATCHLIST ADD ─────────────────────────────────────────────────────────
    case 'watchlist_add': {
      const coachName  = String(data.coachName  || 'A coach');
      const schoolName = String(data.schoolName || 'a school');
      const profileUrl = String(data.profileUrl || '#');
      return {
        subject: `${coachName} added you to their watchlist`,
        html: emailShell({
          previewText: `${coachName} from ${schoolName} is watching your profile`,
          headerLabel: 'Watchlist',
          headerIconKey: 'bookmark',
          iconKey: 'bookmark',
          title: "You're on a coach\u2019s watchlist",
          body: `
            <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.muted};">
              <strong style="color:${BRAND.dark};">${coachName}</strong> from <strong style="color:${BRAND.dark};">${schoolName}</strong> added you to their recruiting watchlist.
            </p>
            <div style="background:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:10px;padding:16px 20px;">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.green};">What this means</p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.greenDeep};">Coaches watchlist players they\u2019re seriously considering. Keep your profile complete and stay active.</p>
            </div>
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'View Your Profile', url: profileUrl },
          footerNote: 'You received this because a coach saved your BaseballHelm profile.',
        }),
        text: `${coachName} from ${schoolName} added you to their watchlist.\n\nView your profile: ${profileUrl}`,
      };
    }

    // ── PIPELINE STAGE CHANGE ─────────────────────────────────────────────────
    case 'pipeline_stage_change': {
      const schoolName = String(data.schoolName || 'A school');
      const newStage   = String(data.newStage   || '');
      const journeyUrl = String(data.journeyUrl || '#');
      const stageLabels: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
        high_priority:  { label: 'High Priority',  color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', desc: "They've moved you to high priority \u2014 a strong signal of serious interest." },
        offer_extended: { label: 'Offer Extended', color: BRAND.greenDeep, bg: BRAND.greenXLight, border: BRAND.greenLight, desc: 'Congratulations \u2014 a formal offer has been extended to you.' },
        committed:      { label: 'Committed',      color: '#1E3A8A', bg: '#EFF6FF', border: '#BFDBFE', desc: "You're committed. A significant milestone in your journey." },
        uninterested:   { label: 'Not Proceeding', color: BRAND.warm600, bg: BRAND.subtle, border: BRAND.border, desc: 'The program has decided not to proceed at this time.' },
        watchlist:      { label: 'Watchlist',      color: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE', desc: "You've been added to their watchlist for continued monitoring." },
      };
      const stage = stageLabels[newStage] ?? { label: newStage, color: BRAND.green, bg: BRAND.greenXLight, border: BRAND.greenLight, desc: 'Your recruiting status has been updated.' };
      return {
        subject: `Update from ${schoolName}: ${stage.label}`,
        html: emailShell({
          previewText: `${schoolName} updated your recruiting status`,
          headerLabel: 'Recruiting Update',
          headerIconKey: 'chart',
          iconKey: 'chart',
          title: `Status update from ${schoolName}`,
          body: `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.muted};">New status&nbsp;&nbsp;</span>
                  ${badge(stage.label, stage.color, stage.bg)}
                </td>
              </tr>
            </table>
            <div style="background:${stage.bg};border:1px solid ${stage.border};border-radius:10px;padding:16px 20px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${stage.color};">${stage.desc}</p>
            </div>
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'View Your Journey', url: journeyUrl },
          footerNote: 'You received this because a coach updated your status on BaseballHelm.',
        }),
        text: `${schoolName} updated your recruiting status to: ${stage.label}.\n${stage.desc}\n\nView your journey: ${journeyUrl}`,
      };
    }

    // ── PROFILE VIEW ──────────────────────────────────────────────────────────
    case 'profile_view': {
      const viewerInfo = String(data.viewerInfo || 'A coach');
      const profileUrl = String(data.profileUrl || '#');
      return {
        subject: `${viewerInfo} viewed your profile`,
        html: emailShell({
          previewText: `${viewerInfo} just checked out your BaseballHelm profile`,
          headerLabel: 'Profile View',
          headerIconKey: 'eye',
          iconKey: 'eye',
          title: 'Your profile was viewed',
          body: `
            <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.muted};">
              <strong style="color:${BRAND.dark};">${viewerInfo}</strong> viewed your recruiting profile. This is a signal of interest \u2014 make sure your profile is complete.
            </p>
            <div style="background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:10px;padding:16px 20px;">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.green};">Pro tip</p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.muted};">Profiles with a highlight video get significantly more coach messages. Add yours to stand out.</p>
            </div>
          `,
          greeting: String(data._greeting || ''),
          cta: { label: 'Update Your Profile', url: profileUrl },
          footerNote: 'You received this because a coach viewed your BaseballHelm profile.',
        }),
        text: `${viewerInfo} viewed your profile.\n\nUpdate it at: ${profileUrl}`,
      };
    }

    // ── TASK ASSIGNED ─────────────────────────────────────────────────────────
    case 'task_assigned': {
      const taskTitle       = String(data.taskTitle || 'New Task');
      const taskDescription = String(data.taskDescription || '');
      const dueDate         = String(data.dueDate || '');
      const coachName       = String(data.coachName || 'Your Coach');
      const taskUrl         = String(data.taskUrl || '#');
      return {
        subject: `New task assigned: ${taskTitle}`,
        html: emailShell({
          previewText: `${coachName} assigned you a task — ${taskTitle}`,
          headerLabel: 'Task Assigned',
          headerIconKey: 'flag',
          iconKey: 'flag',
          greeting: String(data._greeting || ''),
          title: taskTitle,
          body: `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.muted};">Assigned by&nbsp;&nbsp;</span>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.dark};">${coachName}</span>
                </td>
              </tr>
            </table>
            ${taskDescription ? `
            <div style="background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:${BRAND.darkMid};">${taskDescription}</p>
            </div>` : ''}
            ${dueDate ? detailTable(detailRow('Due Date', dueDate)) : ''}
          `,
          cta: { label: 'View Task', url: taskUrl },
        }),
        text: `New task from ${coachName}: ${taskTitle}${taskDescription ? `\n\n${taskDescription}` : ''}${dueDate ? `\nDue: ${dueDate}` : ''}\n\nView at: ${taskUrl}`,
      };
    }

    // ── DEV PLAN ASSIGNED ─────────────────────────────────────────────────────
    case 'dev_plan_assigned': {
      const planTitle = String(data.planTitle || 'Development Plan');
      const areaType  = String(data.areaType || '');
      const coachName = String(data.coachName || 'Your Coach');
      const planUrl   = String(data.planUrl || '#');
      const areaLabel = areaType
        ? areaType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : '';
      return {
        subject: `New development plan: ${planTitle}`,
        html: emailShell({
          previewText: `${coachName} created a development plan for you — ${planTitle}`,
          headerLabel: 'Development Plan',
          headerIconKey: 'chart',
          iconKey: 'chart',
          greeting: String(data._greeting || ''),
          title: planTitle,
          body: `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.muted};">From&nbsp;&nbsp;</span>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.dark};">${coachName}</span>
                  ${areaLabel ? `<span style="margin-left:10px;">${badge(areaLabel, BRAND.green, BRAND.greenXLight)}</span>` : ''}
                </td>
              </tr>
            </table>
            <div style="background:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:10px;padding:16px 20px;">
              <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.green};">Your coach has created a plan for your development</p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.greenDeep};">Review the goals, drills, and targets your coach has set. Track your progress from your dashboard.</p>
            </div>
          `,
          cta: { label: 'View Development Plan', url: planUrl },
        }),
        text: `New development plan from ${coachName}: ${planTitle}${areaLabel ? ` (${areaLabel})` : ''}\n\nView at: ${planUrl}`,
      };
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    default:
      return {
        subject: 'New notification from Helm',
        html: emailShell({
          previewText: 'You have a new notification from Helm Sports',
          headerLabel: 'Notification',
          headerIconKey: 'bell',
          iconKey: 'bell',
          title: 'You have a new notification',
          body: `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.muted};">Log in to Helm to see the latest updates from your team.</p>`,
          greeting: String(data._greeting || ''),
          cta: { label: 'Open Helm', url: process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com' },
        }),
        text: 'You have a new notification from Helm Sports. Log in to see updates.',
      };
  }
}


/**
 * Resolve a personalized greeting for the recipient.
 * Checks all four profile tables in priority order.
 *   Players  → "Hi Nick,"
 *   Coaches  → "Hi Coach Smith,"  (last word of full_name used as last name)
 */
async function getRecipientGreeting(userId: string): Promise<string> {
  try {
    const supabase = await createClient();

    // 1. Golf player → first name
    const { data: golfPlayer } = await supabase
      .from('golf_players')
      .select('first_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (golfPlayer?.first_name) return `Hi ${golfPlayer.first_name},`;

    // 2. Golf coach → last name from full_name
    const { data: golfCoach } = await supabase
      .from('golf_coaches')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (golfCoach?.full_name) {
      const lastName = golfCoach.full_name.trim().split(' ').pop() ?? golfCoach.full_name;
      return `Hi Coach ${lastName},`;
    }

    // 3. Baseball player → first name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bbPlayer } = await (supabase as any)
      .from('baseball_players')
      .select('first_name')
      .eq('user_id', userId)
      .maybeSingle() as { data: { first_name: string | null } | null };
    if (bbPlayer?.first_name) return `Hi ${bbPlayer.first_name},`;

    // 4. Baseball coach → last name from full_name.
    // Read from the baseball_coaches_public view (non-PII) so this greeting
    // still resolves for the recipient coach once baseball_coaches RLS is
    // narrowed away from blanket read. (Session-less/anon callers get null
    // here either way and fall through to the default greeting.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bbCoach } = await (supabase as any)
      .from('baseball_coaches_public')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle() as { data: { full_name: string | null } | null };
    if (bbCoach?.full_name) {
      const lastName = bbCoach.full_name.trim().split(' ').pop() ?? bbCoach.full_name;
      return `Hi Coach ${lastName},`;
    }
  } catch {
    // Non-critical — fall through to default
  }
  return 'Hi there,';
}

/**
 * Send an email notification
 */
export async function sendEmailNotification(
  type: NotificationType,
  recipientId: string,
  recipientEmail: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check user preferences
    const prefs = await getUserNotificationPreferences(recipientId);
    if (!shouldSendEmail(type, prefs)) {
      return { success: true }; // User opted out, but not an error
    }

    // Get Resend client
    const resend = await getResendClient();
    if (!resend) {
      return { success: false, error: 'Email service not configured' };
    }

    // Resolve personalized greeting and inject into data
    const greeting = await getRecipientGreeting(recipientId);
    const enrichedData = { ...data, _greeting: greeting };

    // Generate email content
    const template = generateEmailTemplate(type, enrichedData);

    // Send email
    await resend.emails.send({
      from: 'Helm Sports <notifications@helmsportslabs.com>',
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    // Note: In-app notifications are handled by the golf_calendar_notifications table
    // (written at the call site in golf.ts, messages.ts, announcements.ts, etc.)
    // The generic `notifications` table is not read by any golf UI, so we skip it.

    return { success: true };
  } catch (error) {
    console.error('Failed to send email notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


