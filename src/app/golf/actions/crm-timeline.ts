'use server';

/**
 * Server actions powering the CRM coach activity timeline.
 *
 * `getCoachTimeline` performs a UNION-ALL across 7 sources:
 *   1. crm_contact_log     -> source='contact_log'
 *   2. email_events        -> source='email_event' (joined via contact_log)
 *   3. crm_events          -> source='crm_event'
 *   4. crm_notes           -> source='note'
 *   5. crm_tasks           -> source='task'
 *   6. crm_replies         -> source='reply'
 *   7. golf_demo_sessions  -> source='demo_session'
 *
 * 2026-07-29: crm_replies was the missing sixth. Every other source is outbound
 * activity (what we sent, scheduled, or logged) or internal record-keeping — so a
 * coach's timeline could show six touches from us and give no indication that
 * they had written back. That is the one event a rep most needs to see, and it
 * was the only one absent.
 *
 * 2026-07-31: golf_demo_sessions was entirely absent, despite being the single
 * strongest buying signal in the system — 170 real coaches toured the demo.
 * Joined primarily on the (now largely backfilled) crm_coach_id FK, with a
 * fallback to a case-insensitive email match for the handful of sessions that
 * predate the backfill. `golf_demo_sessions` has a RESTRICTIVE deny-all RLS
 * policy (confirmed live), so unlike every other source in this file it is
 * read via createAdminClient(), not the RLS-scoped client — see the try/catch
 * around that query below. Only 'likely_human' and NULL traffic_quality rows
 * are surfaced; 'automated' rows are scanner/bot traffic, not a coach.
 *
 * Implementation runs the reads in parallel via Promise.all and merges the
 * results in TypeScript. This avoids needing a Postgres RPC + leans on the
 * per-table RLS Stream A applies in its migrations (admin-only reads).
 *
 * Auth: every call enforces admin role, mirroring crm-engagement.ts:28.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import type { TimelineItem } from '@/app/golf/admin/crm/types/foundations';

// ---------------------------------------------------------------------------
// Auth helper — mirrors crm-engagement.ts and resend-activity.ts pattern.
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden');
  }

  return supabase;
}

// ---------------------------------------------------------------------------
// Internal row shapes (only the columns we actually read).
// ---------------------------------------------------------------------------
interface ContactLogRow {
  id: string;
  contact_type: string | null;
  contact_date: string | null;
  subject: string | null;
  notes: string | null;
  created_by: string | null;
}

interface EmailEventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  recipient_email: string | null;
  resend_message_id: string | null;
  contact_log_id: string | null;
  crm_contact_log: { coach_id: string | null } | null;
}

interface CrmEventRow {
  id: string;
  event_type: string | null;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  meeting_url: string | null;
  status: string | null;
  outcome: string | null;
  created_by: string | null;
}

interface CrmNoteRow {
  id: string;
  body: string;
  kind: string;
  is_pinned: boolean | null;
  author_id: string | null;
  created_at: string;
}

interface CrmTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  kind: string | null;
  priority: string | null;
  assignee_id: string | null;
  created_by: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface CrmReplyRow {
  id: string;
  from_address: string;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  is_read: boolean;
  thread_id: string | null;
  message_id: string;
  contact_log_id: string | null;
}

interface DemoSessionTimelineRow {
  id: string;
  name: string;
  email: string;
  school: string | null;
  referrer: string | null;
  entered_at: string;
  traffic_quality: string | null;
  quality_reason: string | null;
  crm_coach_id: string | null;
}

// Minimal shape for the coach-email lookup that powers the demo-session
// fallback join — not rendered as a timeline item itself.
interface CoachEmailRow {
  email: string | null;
}

// ---------------------------------------------------------------------------
// getCoachTimeline — merged DESC list of activity events for one coach.
// ---------------------------------------------------------------------------
export async function getCoachTimeline(
  coachId: string,
  opts?: { limit?: number; since?: string },
): Promise<TimelineItem[]> {
  if (!coachId) return [];

  const supabase = await requireAdmin();
  const limit = opts?.limit ?? 100;
  const since = opts?.since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Run the 6 RLS-scoped source queries (+ a coach-email lookup) in parallel.
  // We don't fail the whole timeline if a single source errors — just log and
  // continue with an empty bucket.
  const [
    contactLogRes,
    emailEventsRes,
    crmEventsRes,
    crmNotesRes,
    crmTasksRes,
    crmRepliesRes,
    coachEmailRes,
  ] = await Promise.all([
    // 1. Contact log entries (email/call/demo/meeting/note actions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('crm_contact_log')
      .select('id, contact_type, contact_date, subject, notes, created_by')
      .eq('coach_id', coachId)
      .gte('contact_date', since)
      .order('contact_date', { ascending: false })
      .limit(limit),

    // 2. Email events (sent/delivered/opened/clicked/bounced/complained/unsubscribed)
    //    These don't have coach_id directly — filter via the joined contact_log.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('email_events')
      .select('id, event_type, occurred_at, recipient_email, resend_message_id, contact_log_id, crm_contact_log!inner(coach_id)')
      .eq('crm_contact_log.coach_id', coachId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(limit),

    // 3. CRM events (scheduled demos / meetings / follow-ups)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('crm_events')
      .select('id, event_type, title, description, start_time, end_time, location, meeting_url, status, outcome, created_by')
      .eq('coach_id', coachId)
      .gte('start_time', since)
      .order('start_time', { ascending: false })
      .limit(limit),

    // 4. Notes (Phase 1 new table — Stream A migration T2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('crm_notes')
      .select('id, body, kind, is_pinned, author_id, created_at')
      .eq('coach_id', coachId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 5. Tasks (Phase 1 new table — Stream A migration T3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('crm_tasks')
      .select('id, title, description, status, kind, priority, assignee_id, created_by, due_at, completed_at, created_at')
      .eq('coach_id', coachId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 6. Inbound replies from the coach (Gmail poll / Resend inbound)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('crm_replies')
      .select('id, from_address, subject, body_text, received_at, is_read, thread_id, message_id, contact_log_id')
      .eq('coach_id', coachId)
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(limit),

    // 7a. Coach email — not rendered itself, only used below to fall back-match
    // golf_demo_sessions rows that predate the crm_coach_id backfill.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('crm_coaches')
      .select('email')
      .eq('id', coachId)
      .maybeSingle(),
  ]);

  // 7b. Demo sessions (golf_demo_sessions). This runs outside the Promise.all
  // batch above because it depends on coachEmailRes for its fallback match,
  // and it reads through createAdminClient() rather than the RLS-scoped
  // `supabase` client — the table carries a RESTRICTIVE deny-all policy on
  // {public} (which covers `authenticated` too), so the admin-gated caller
  // (requireAdmin() already ran above) is the only way to read it at all.
  // Wrapped in its own try/catch so a misconfigured service-role env var
  // degrades to "demo sessions missing" rather than throwing past the admin
  // check and blanking the whole timeline.
  let demoSessionsRes: { data: DemoSessionTimelineRow[] | null; error: unknown } = { data: [], error: null };
  try {
    const admin = createAdminClient();
    const coachEmail = (coachEmailRes?.data as CoachEmailRow | null)?.email ?? null;
    // SANITIZE: `.or()` takes a RAW PostgREST expression — a comma/paren/wildcard
    // in the interpolated email would inject extra OR-conditions. Same precedent
    // as course-library.ts's search-query sanitizer. coachId is a trusted UUID
    // (used unsanitized elsewhere in this file) so only the email needs this.
    const sanitize = (s: string) => s.replace(/[,()%*\\]/g, ' ').trim();
    const matchClause = coachEmail
      ? `crm_coach_id.eq.${coachId},email.ilike.${sanitize(coachEmail)}`
      : `crm_coach_id.eq.${coachId}`;
    demoSessionsRes = await (admin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('golf_demo_sessions')
      .select('id, name, email, school, referrer, entered_at, traffic_quality, quality_reason, crm_coach_id')
      .or(matchClause)
      // Chained .or() calls AND together in PostgREST — this is a second,
      // independent OR-group applied on top of the coach-match group above.
      // CLICKS ARE SCANNER NOISE elsewhere in this file; the analogous rule for
      // demo sessions is 'automated' traffic is a bot, not a coach — never
      // surface it as engagement. NULL is treated as showable (unclassified).
      .or('traffic_quality.eq.likely_human,traffic_quality.is.null')
      .gte('entered_at', since)
      .order('entered_at', { ascending: false })
      .limit(limit);
  } catch (error) {
    demoSessionsRes = { data: null, error };
  }

  // Surface errors via logServerError but never throw — partial timelines are
  // better than blank ones if one table is misconfigured.
  for (const [name, res] of [
    ['contact_log', contactLogRes],
    ['email_events', emailEventsRes],
    ['crm_events', crmEventsRes],
    ['crm_notes', crmNotesRes],
    ['crm_tasks', crmTasksRes],
    ['crm_replies', crmRepliesRes],
    ['crm_coaches_email_lookup', coachEmailRes],
    ['golf_demo_sessions', demoSessionsRes],
  ] as const) {
    if (res?.error) {
      await logServerError(
        `[crm-timeline] ${name} query failed: ${(res.error as { message?: string })?.message ?? String(res.error)}`,
        { action: 'crm_timeline.getCoachTimeline', metadata: { coachId, source: name } },
      );
    }
  }

  const items: TimelineItem[] = [];

  // ---- contact_log ---------------------------------------------------------
  for (const r of (contactLogRes?.data ?? []) as ContactLogRow[]) {
    if (!r.contact_date) continue;
    const subType = r.contact_type ?? 'note';
    const titleSubject = r.subject ? `: ${r.subject}` : '';
    items.push({
      id: `contact_log-${r.id}`,
      source: 'contact_log',
      type: subType,
      occurred_at: r.contact_date,
      title: `${humanizeContactType(subType)}${titleSubject}`,
      body: r.notes,
      actor_id: r.created_by,
      metadata: {
        contact_log_id: r.id,
        subject: r.subject,
      },
    });
  }

  // ---- demo_session ----------------------------------------------------------
  // 2026-07-31: golf_demo_sessions is the single strongest buying signal in the
  // system (170 real coaches toured the demo) and was completely absent from
  // this timeline. The query above already restricts to traffic_quality IN
  // ('likely_human', NULL) — 'automated' never reaches this loop in production.
  // The re-check below is defense in depth, not redundant: it is what makes the
  // exclusion independently verifiable at the mapping layer (and in unit tests
  // that stub the query builder without honoring filters).
  //
  // Placement note: this loop runs before email_events on purpose. The final
  // sort below is untouched (stable, by occurred_at DESC) — on an exact-
  // timestamp tie, push order is the only remaining lever, and a demo tour
  // should read as a stronger signal than an email open/click at the same
  // instant.
  for (const r of (demoSessionsRes?.data ?? []) as DemoSessionTimelineRow[]) {
    if (!r.entered_at) continue;
    if (r.traffic_quality !== null && r.traffic_quality !== 'likely_human') continue;
    items.push({
      id: `demo_session-${r.id}`,
      source: 'demo_session',
      type: r.traffic_quality ?? 'unclassified',
      occurred_at: r.entered_at,
      title: r.school ? `Toured the demo (${r.school})` : 'Toured the demo',
      body: null,
      actor_id: null,
      metadata: {
        name: r.name,
        email: r.email,
        school: r.school,
        referrer: r.referrer,
        traffic_quality: r.traffic_quality,
        quality_reason: r.quality_reason,
        matched_via: r.crm_coach_id === coachId ? 'crm_coach_id' : 'email',
      },
    });
  }

  // ---- email_events --------------------------------------------------------
  for (const r of (emailEventsRes?.data ?? []) as EmailEventRow[]) {
    if (!r.occurred_at) continue;
    items.push({
      id: `email_event-${r.id}`,
      source: 'email_event',
      type: r.event_type,
      occurred_at: r.occurred_at,
      title: humanizeEmailEvent(r.event_type),
      body: null,
      actor_id: null,
      metadata: {
        contact_log_id: r.contact_log_id,
        recipient_email: r.recipient_email,
        resend_message_id: r.resend_message_id,
        // CLICKS ARE SCANNER NOISE: 1,073 of 1,219 all-time clicks fired on the
        // day of one 511-email send — that is email-security-gateway link
        // scanning, not coach intent. Never let a click read as stronger than
        // an open; this caveat is what lets the UI label it rather than hide
        // it (we don't silently drop clicks, we contextualize them).
        scanner_caveat: r.event_type === 'email.clicked'
          ? 'Link clicks are frequently automated email-security-gateway scans, not coach intent — do not read as stronger than an open.'
          : null,
      },
    });
  }

  // ---- crm_events ----------------------------------------------------------
  for (const r of (crmEventsRes?.data ?? []) as CrmEventRow[]) {
    if (!r.start_time) continue;
    items.push({
      id: `crm_event-${r.id}`,
      source: 'crm_event',
      type: r.event_type ?? 'other',
      occurred_at: r.start_time,
      title: r.title ?? humanizeCrmEvent(r.event_type ?? 'other'),
      body: r.description,
      actor_id: r.created_by,
      metadata: {
        end_time: r.end_time,
        location: r.location,
        meeting_url: r.meeting_url,
        status: r.status,
        outcome: r.outcome,
      },
    });
  }

  // ---- crm_notes -----------------------------------------------------------
  for (const r of (crmNotesRes?.data ?? []) as CrmNoteRow[]) {
    items.push({
      id: `note-${r.id}`,
      source: 'note',
      type: r.kind,
      occurred_at: r.created_at,
      title: humanizeNoteKind(r.kind),
      body: r.body,
      actor_id: r.author_id,
      metadata: {
        is_pinned: r.is_pinned ?? false,
      },
    });
  }

  // ---- crm_tasks -----------------------------------------------------------
  for (const r of (crmTasksRes?.data ?? []) as CrmTaskRow[]) {
    // Tasks expose two timeline beats: creation and completion. We surface the
    // most-recent beat (completed_at if completed, else created_at).
    const occurredAt = r.completed_at ?? r.created_at;
    const subType = `${r.status}${r.kind ? `:${r.kind}` : ''}`;
    items.push({
      id: `task-${r.id}`,
      source: 'task',
      type: subType,
      occurred_at: occurredAt,
      title: r.title,
      body: r.description,
      actor_id: r.assignee_id ?? r.created_by,
      metadata: {
        status: r.status,
        kind: r.kind,
        priority: r.priority,
        due_at: r.due_at,
        completed_at: r.completed_at,
      },
    });
  }

  // ---- crm_replies ---------------------------------------------------------
  for (const r of (crmRepliesRes?.data ?? []) as CrmReplyRow[]) {
    if (!r.received_at) continue;
    items.push({
      id: `reply-${r.id}`,
      source: 'reply',
      // Unread is the actionable state, so it belongs in the sub-type where the
      // UI can style on it, not buried in metadata.
      type: r.is_read ? 'read' : 'unread',
      occurred_at: r.received_at,
      title: r.subject ? `Reply: ${r.subject}` : 'Reply',
      // body_text can be a full quoted thread; the timeline clamps display, and
      // truncating here would throw away text a rep may want to expand.
      body: r.body_text,
      // Deliberately null: the coach wrote this, and actor_id resolves against
      // `users` (our internal staff). Attributing an inbound reply to a staff
      // member would be wrong in exactly the way that matters.
      actor_id: null,
      metadata: {
        from_address: r.from_address,
        subject: r.subject,
        is_read: r.is_read,
        thread_id: r.thread_id,
        message_id: r.message_id,
        contact_log_id: r.contact_log_id,
      },
    });
  }

  // Final sort: most-recent first; cap at limit.
  items.sort((a, b) => {
    const at = new Date(a.occurred_at).getTime();
    const bt = new Date(b.occurred_at).getTime();
    return bt - at;
  });

  return items.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Title-builders — small label normalizers for the per-source sub-types.
// ---------------------------------------------------------------------------
function humanizeContactType(t: string): string {
  switch (t) {
    case 'email':   return 'Email';
    case 'call':    return 'Call';
    case 'demo':    return 'Demo';
    case 'meeting': return 'Meeting';
    case 'note':    return 'Note';
    default:        return t.charAt(0).toUpperCase() + t.slice(1);
  }
}

function humanizeEmailEvent(t: string): string {
  switch (t) {
    case 'email.sent':         return 'Email sent';
    case 'email.delivered':    return 'Email delivered';
    case 'email.opened':       return 'Email opened';
    case 'email.clicked':      return 'Email link clicked (likely scanner)';
    case 'email.bounced':      return 'Email bounced';
    case 'email.complained':   return 'Marked as spam';
    case 'email.unsubscribed': return 'Unsubscribed';
    case 'email.delivery_delayed': return 'Email delayed';
    default:                   return t.replace(/^email\./, '').replace(/_/g, ' ');
  }
}

function humanizeCrmEvent(t: string): string {
  switch (t) {
    case 'demo':           return 'Demo scheduled';
    case 'follow_up':      return 'Follow-up';
    case 'call':           return 'Call';
    case 'meeting':        return 'Meeting';
    case 'email_reminder': return 'Email reminder';
    default:               return t.replace(/_/g, ' ');
  }
}

function humanizeNoteKind(k: string): string {
  switch (k) {
    case 'note':            return 'Note';
    case 'call_log':        return 'Call log';
    case 'meeting_summary': return 'Meeting summary';
    case 'internal':        return 'Internal note';
    default:                return 'Note';
  }
}
