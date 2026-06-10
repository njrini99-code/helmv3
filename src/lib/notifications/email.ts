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
import { renderBrandedEmail, escapeHtml as esc, safeFormatDate } from '@/lib/email/layout';

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

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const SERIF = `Georgia,'Times New Roman',Times,serif`;


// ── Urgency config ────────────────────────────────────────────────────────────
const URGENCY: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low Priority',    color: '#78716C', bg: '#F5F4F0' },
  normal: { label: 'Normal',          color: '#1D4ED8', bg: '#EFF6FF' },
  high:   { label: 'High Priority',   color: '#B45309', bg: '#FEF3C7' },
  urgent: { label: 'Urgent',          color: '#DC2626', bg: '#FEF2F2' },
};

/** Badge pill (for urgency, stage labels, etc.) */
function badge(text: string, color: string, bg: string): string {
  return `<span style="display:inline-block;padding:3px 10px;background:${bg};color:${color};border-radius:12px;font-size:12px;font-weight:600;letter-spacing:0.2px;">${text}</span>`;
}

/**
 * Quote block for message previews — editorial pull-quote: a 2px solid green
 * left rule, a large decorative Georgia opening quotation mark, then italic
 * serif quote text.
 */
function quoteBlock(text: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
      <tr>
        <td width="2" style="background-color:${BRAND.green};width:2px;" bgcolor="${BRAND.green}">&nbsp;</td>
        <td width="20" style="width:20px;">&nbsp;</td>
        <td style="padding:16px 0;">
          <p style="margin:0 0 6px;font-family:${SERIF};font-size:36px;line-height:1;color:${BRAND.green};letter-spacing:-1px;">&ldquo;</p>
          <p style="margin:0;font-family:${SERIF};font-size:18px;font-style:italic;line-height:1.55;color:${BRAND.dark};letter-spacing:0.1px;">${text}</p>
        </td>
      </tr>
    </table>`;
}

/** Greeting paragraph — renders only when non-empty */
function greetingHtml(greeting: string): string {
  return greeting
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:16px;font-weight:500;line-height:1.5;color:${BRAND.dark};">${esc(greeting)}</p>`
    : '';
}

/**
 * Generate premium email template based on notification type.
 * All templates now route through renderBrandedEmail.
 */
function generateEmailTemplate(
  type: NotificationType,
  data: Record<string, unknown>
): EmailTemplate {

  const greeting = String(data._greeting || '');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  switch (type) {

    // ── NEW MESSAGE ───────────────────────────────────────────────────────────
    case 'new_message': {
      const preview    = String(data.preview || '').slice(0, 200);
      const senderName = String(data.senderName || 'Someone');
      const messageUrl = String(data.messageUrl || '#');
      return {
        subject: `New message from ${senderName}`,
        html: renderBrandedEmail({
          preheader: `${senderName}: ${preview}`,
          eyebrow: 'Direct Message',
          heading: `Message from ${senderName}`,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 28px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">
              <strong style="color:${BRAND.dark};font-weight:600;">${esc(senderName)}</strong> sent you a message.
            </p>
            ${quoteBlock(esc(preview + (preview.length >= 200 ? '…' : '')))}
            <p style="margin:0;font-family:${FONT};font-size:15px;color:${BRAND.muted};line-height:1.6;">Reply directly in Helm to keep the conversation going.</p>
          `,
          cta: { label: 'Open Conversation', url: messageUrl },
          footerNote: 'You received this because someone sent you a message on Helm.',
        }),
        text: `${greeting ? greeting + '\n\n' : ''}New message from ${senderName}: "${preview}"\n\nReply at: ${messageUrl}`,
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
        html: renderBrandedEmail({
          preheader: `${coachName}: ${preview}`,
          eyebrow: 'Team Announcement',
          heading: title,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:${FONT};font-size:13px;color:${BRAND.muted};">From&nbsp;&nbsp;</span>
                  <strong style="font-family:${FONT};font-size:13px;color:${BRAND.dark};">${esc(coachName)}</strong>
                  <span style="margin-left:10px;">${badge(urg.label, urg.color, urg.bg)}</span>
                </td>
              </tr>
            </table>
            <div style="background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:2px;padding:20px 22px;">
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.75;color:${BRAND.darkMid};">${content}</p>
            </div>
          `,
          cta: { label: 'View Full Announcement', url: announcementUrl },
        }),
        text: `${greeting ? greeting + '\n\n' : ''}Team Announcement from ${coachName}: ${title}\n\n${preview}\n\nView at: ${announcementUrl}`,
      };
    }

    // ── QUALIFIER CREATED ─────────────────────────────────────────────────────
    case 'qualifier_created': {
      const qualifierName = String(data.qualifierName || 'New Qualifier');
      const rawStartDate  = String(data.startDate || '');
      const startDate     = safeFormatDate(rawStartDate, null, 'date');
      const numRoundsRaw  = Number(data.numRounds) || 1;
      const numRoundsStr  = String(numRoundsRaw);
      const qualifierUrl  = String(data.qualifierUrl || '#');
      return {
        subject: `New Qualifier: ${qualifierName}`,
        html: renderBrandedEmail({
          preheader: `A new qualifier has been posted — ${qualifierName}`,
          eyebrow: 'Qualifier',
          heading: qualifierName,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">A new qualifier has been posted. Review the details and prepare your rounds.</p>
          `,
          details: [
            { label: 'Start Date', value: startDate },
            { label: 'Rounds', value: `${numRoundsStr} round${numRoundsRaw !== 1 ? 's' : ''}` },
          ],
          cta: { label: 'View Qualifier', url: qualifierUrl },
        }),
        text: `${greeting ? greeting + '\n\n' : ''}New qualifier: ${qualifierName}\nStart: ${startDate} · ${numRoundsStr} round${numRoundsRaw !== 1 ? 's' : ''}\n\nView at: ${qualifierUrl}`,
      };
    }

    // ── EVENT RSVP REMINDER ───────────────────────────────────────────────────
    case 'event_rsvp_reminder': {
      const eventName = String(data.eventName || 'Upcoming Event');
      const rawDate   = String(data.eventDate || '');
      const eventDate = safeFormatDate(rawDate, String(data.eventTimezone || ''), 'datetime');
      const location  = String(data.location  || '');
      const eventUrl  = String(data.eventUrl  || '#');
      const detailRows: Array<{ label: string; value: string }> = [{ label: 'Date & Time', value: eventDate }];
      if (location) detailRows.push({ label: 'Location', value: location });
      return {
        subject: `RSVP needed: ${eventName}`,
        html: renderBrandedEmail({
          preheader: `Please confirm your attendance for ${eventName} — ${eventDate}`,
          eyebrow: 'RSVP Reminder',
          heading: `RSVP for ${eventName}`,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">Your coach is collecting RSVPs for this event. Please confirm whether you’ll be attending.</p>
          `,
          details: detailRows,
          cta: { label: 'RSVP Now', url: eventUrl },
          footerNote: 'You received this because you have an upcoming team event on Helm.',
        }),
        text: `${greeting ? greeting + '\n\n' : ''}RSVP reminder: ${eventName}\nDate: ${eventDate}${location ? `\nLocation: ${location}` : ''}\n\nRSVP at: ${eventUrl}`,
      };
    }

    // ── WATCHLIST ADD ─────────────────────────────────────────────────────────
    case 'watchlist_add': {
      const coachName  = String(data.coachName  || 'A coach');
      const schoolName = String(data.schoolName || 'a school');
      const profileUrl = String(data.profileUrl || '#');
      return {
        subject: `${coachName} added you to their watchlist`,
        html: renderBrandedEmail({
          preheader: `${coachName} from ${schoolName} is watching your profile`,
          eyebrow: 'Watchlist',
          heading: "You’re on a coach’s watchlist",
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">
              <strong style="color:${BRAND.dark};">${esc(coachName)}</strong> from <strong style="color:${BRAND.dark};">${esc(schoolName)}</strong> added you to their recruiting watchlist.
            </p>
            <div style="background:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:2px;padding:16px 20px;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:600;color:${BRAND.green};">What this means</p>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.greenDeep};">Coaches watchlist players they’re seriously considering. Keep your profile complete and stay active.</p>
            </div>
          `,
          cta: { label: 'View Your Profile', url: profileUrl },
          footerNote: 'You received this because a coach saved your BaseballHelm profile.',
        }),
        text: `${greeting ? greeting + '\n\n' : ''}${coachName} from ${schoolName} added you to their watchlist.\n\nView your profile: ${profileUrl}`,
      };
    }

    // ── PIPELINE STAGE CHANGE ─────────────────────────────────────────────────
    case 'pipeline_stage_change': {
      const schoolName = String(data.schoolName || 'A school');
      const newStage   = String(data.newStage   || '');
      const journeyUrl = String(data.journeyUrl || '#');
      const stageLabels: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
        high_priority:  { label: 'High Priority',  color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', desc: "They’ve moved you to high priority — a strong signal of serious interest." },
        offer_extended: { label: 'Offer Extended', color: BRAND.greenDeep, bg: BRAND.greenXLight, border: BRAND.greenLight, desc: 'Congratulations — a formal offer has been extended to you.' },
        committed:      { label: 'Committed',      color: '#1E3A8A', bg: '#EFF6FF', border: '#BFDBFE', desc: "You’re committed. A significant milestone in your journey." },
        uninterested:   { label: 'Not Proceeding', color: BRAND.warm600, bg: BRAND.subtle, border: BRAND.border, desc: 'The program has decided not to proceed at this time.' },
        watchlist:      { label: 'Watchlist',      color: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE', desc: "You’ve been added to their watchlist for continued monitoring." },
      };
      const stage = stageLabels[newStage] ?? { label: newStage, color: BRAND.green, bg: BRAND.greenXLight, border: BRAND.greenLight, desc: 'Your recruiting status has been updated.' };
      return {
        subject: `Update from ${schoolName}: ${stage.label}`,
        html: renderBrandedEmail({
          preheader: `${schoolName} updated your recruiting status`,
          eyebrow: 'Recruiting Update',
          heading: `Status update from ${schoolName}`,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="font-family:${FONT};font-size:13px;color:${BRAND.muted};">New status&nbsp;&nbsp;</span>
                  ${badge(stage.label, stage.color, stage.bg)}
                </td>
              </tr>
            </table>
            <div style="background:${stage.bg};border:1px solid ${stage.border};border-radius:2px;padding:16px 20px;">
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${stage.color};">${stage.desc}</p>
            </div>
          `,
          cta: { label: 'View Your Journey', url: journeyUrl },
          footerNote: 'You received this because a coach updated your status on BaseballHelm.',
        }),
        text: `${greeting ? greeting + '\n\n' : ''}${schoolName} updated your recruiting status to: ${stage.label}.\n${stage.desc}\n\nView your journey: ${journeyUrl}`,
      };
    }

    // ── PROFILE VIEW ──────────────────────────────────────────────────────────
    case 'profile_view': {
      const viewerInfo = String(data.viewerInfo || 'A coach');
      const profileUrl = String(data.profileUrl || '#');
      return {
        subject: `${viewerInfo} viewed your profile`,
        html: renderBrandedEmail({
          preheader: `${viewerInfo} just checked out your BaseballHelm profile`,
          eyebrow: 'Profile View',
          heading: 'Your profile was viewed',
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">
              <strong style="color:${BRAND.dark};">${esc(viewerInfo)}</strong> viewed your recruiting profile. This is a signal of interest — make sure your profile is complete.
            </p>
            <div style="background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:2px;padding:16px 20px;">
              <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;font-weight:600;color:${BRAND.green};">Pro tip</p>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.muted};">Profiles with a highlight video get significantly more coach messages. Add yours to stand out.</p>
            </div>
          `,
          cta: { label: 'Update Your Profile', url: profileUrl },
          footerNote: 'You received this because a coach viewed your BaseballHelm profile.',
        }),
        text: `${greeting ? greeting + '\n\n' : ''}${viewerInfo} viewed your profile.\n\nUpdate it at: ${profileUrl}`,
      };
    }

    // ── TASK ASSIGNED ─────────────────────────────────────────────────────────
    case 'task_assigned': {
      const taskTitle       = String(data.taskTitle || 'New Task');
      const taskDescription = String(data.taskDescription || '');
      const rawDueDate      = String(data.dueDate || '');
      const dueDate         = safeFormatDate(rawDueDate, null, 'date');
      const coachName       = String(data.coachName || 'Your Coach');
      const taskUrl         = String(data.taskUrl || '#');
      return {
        subject: `New task assigned: ${taskTitle}`,
        html: renderBrandedEmail({
          preheader: `${coachName} assigned you a task — ${taskTitle}`,
          eyebrow: 'Task Assigned',
          heading: taskTitle,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;color:${BRAND.muted};">
              Assigned by&nbsp;&nbsp;<strong style="color:${BRAND.dark};">${esc(coachName)}</strong>
            </p>
            ${taskDescription ? `
            <div style="background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:2px;padding:16px 20px;margin-bottom:4px;">
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${BRAND.darkMid};">${esc(taskDescription)}</p>
            </div>` : ''}
          `,
          details: dueDate ? [{ label: 'Due Date', value: dueDate }] : undefined,
          cta: { label: 'View Task', url: taskUrl },
        }),
        text: `${greeting ? greeting + '\n\n' : ''}New task from ${coachName}: ${taskTitle}${taskDescription ? `\n\n${taskDescription}` : ''}${dueDate ? `\nDue: ${dueDate}` : ''}\n\nView at: ${taskUrl}`,
      };
    }

    // ── DEV PLAN ASSIGNED ─────────────────────────────────────────────────────
    case 'dev_plan_assigned': {
      const planTitle = String(data.planTitle || 'Development Plan');
      const areaType  = String(data.areaType || '');
      const coachName = String(data.coachName || 'Your Coach');
      const planUrl   = String(data.planUrl || '#');
      const areaLabel = areaType
        ? areaType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : '';
      return {
        subject: `New development plan: ${planTitle}`,
        html: renderBrandedEmail({
          preheader: `${coachName} created a development plan for you — ${planTitle}`,
          eyebrow: 'Development Plan',
          heading: planTitle,
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;color:${BRAND.muted};">
              From&nbsp;&nbsp;<strong style="color:${BRAND.dark};">${esc(coachName)}</strong>
              ${areaLabel ? `&nbsp;&nbsp;${badge(areaLabel, BRAND.green, BRAND.greenXLight)}` : ''}
            </p>
            <div style="background:${BRAND.greenXLight};border:1px solid ${BRAND.greenLight};border-radius:2px;padding:16px 20px;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:600;color:${BRAND.green};">Your coach has created a plan for your development</p>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.greenDeep};">Review the goals, drills, and targets your coach has set. Track your progress from your dashboard.</p>
            </div>
          `,
          cta: { label: 'View Development Plan', url: planUrl },
        }),
        text: `${greeting ? greeting + '\n\n' : ''}New development plan from ${coachName}: ${planTitle}${areaLabel ? ` (${areaLabel})` : ''}\n\nView at: ${planUrl}`,
      };
    }

    // ── DEFAULT ───────────────────────────────────────────────────────────────
    default:
      return {
        subject: 'New notification from Helm',
        html: renderBrandedEmail({
          preheader: 'You have a new notification from Helm Sports',
          eyebrow: 'Notification',
          heading: 'You have a new notification',
          bodyHtml: `
            ${greetingHtml(greeting)}
            <p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.muted};">Log in to Helm to see the latest updates from your team.</p>
          `,
          cta: { label: 'Open Helm', url: baseUrl },
        }),
        text: `${greeting ? greeting + '\n\n' : ''}You have a new notification from Helm Sports. Log in to see updates.`,
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

    // 4. Baseball coach → last name from full_name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bbCoach } = await (supabase as any)
      .from('baseball_coaches')
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

/**
 * Send notification to multiple recipients
 */
export async function sendBulkEmailNotification(
  type: NotificationType,
  recipients: Array<{ id: string; email: string }>,
  data: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendEmailNotification(
      type,
      recipient.id,
      recipient.email,
      data
    );
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
