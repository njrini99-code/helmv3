'use server';

/**
 * Server actions powering the CRM coach activity timeline.
 *
 * `getCoachTimeline` performs a UNION-ALL across 5 sources:
 *   1. crm_contact_log     -> source='contact_log'
 *   2. email_events        -> source='email_event' (joined via contact_log)
 *   3. crm_events          -> source='crm_event'
 *   4. crm_notes           -> source='note'
 *   5. crm_tasks           -> source='task'
 *
 * Implementation runs the 5 reads in parallel via Promise.all and merges the
 * results in TypeScript. This avoids needing a Postgres RPC + leans on the
 * per-table RLS Stream A applies in its migrations (admin-only reads).
 *
 * Auth: every call enforces admin role, mirroring crm-engagement.ts:28.
 */

import { createClient } from '@/lib/supabase/server';
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

  // Run all 5 source queries in parallel. We don't fail the whole timeline if
  // a single source errors — just log and continue with an empty bucket.
  const [
    contactLogRes,
    emailEventsRes,
    crmEventsRes,
    crmNotesRes,
    crmTasksRes,
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
  ]);

  // Surface errors via logServerError but never throw — partial timelines are
  // better than blank ones if one table is misconfigured.
  for (const [name, res] of [
    ['contact_log', contactLogRes],
    ['email_events', emailEventsRes],
    ['crm_events', crmEventsRes],
    ['crm_notes', crmNotesRes],
    ['crm_tasks', crmTasksRes],
  ] as const) {
    if (res?.error) {
      await logServerError(
        `[crm-timeline] ${name} query failed: ${res.error.message ?? String(res.error)}`,
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
    case 'email.clicked':      return 'Email link clicked';
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
