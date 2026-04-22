'use server';

/**
 * Server actions powering the admin Resend Activity dashboard.
 * Mirrors https://resend.com/emails — KPIs, searchable email list,
 * per-email drill-down, and domain breakdown.
 */

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityWindow = '24h' | '7d' | '30d' | 'all';

export interface ResendActivityStats {
  window: ActivityWindow;
  since: string;

  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  pending: number;

  open_count: number;
  click_count: number;

  by_source: Record<string, number> | null;
  by_day: Array<{
    day: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  }> | null;
}

export interface EmailRow {
  resend_message_id: string;
  from_address: string | null;
  to_addresses: string[];
  subject: string | null;
  source: string;
  contact_log_id: string | null;

  sent_at: string | null;
  delivered_at: string | null;
  delivery_delayed_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;

  last_event_type: string | null;
  last_event_at: string | null;
  open_count: number;
  click_count: number;

  first_seen_at: string;
  updated_at: string;
}

export interface EmailEventRow {
  id: string;
  resend_message_id: string;
  event_type: string;
  recipient_email: string | null;
  occurred_at: string;
  raw_payload: Record<string, unknown> | null;
  contact_log_id: string | null;
}

export interface DomainStats {
  domain: string;
  total: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export interface EmailClick {
  id: string;
  email_event_id: string;
  resend_message_id: string;
  recipient_email: string;
  clicked_url: string | null;
  user_agent: string | null;
  ip_address: string | null;
  occurred_at: string;
}

export interface CoachEmailActivity {
  /** 'valid' | 'bounced' | 'complained' | 'unknown' | null */
  email_status: string | null;
  /** 'sent' | 'delivered' | 'delivery_delayed' | 'opened' | 'clicked' | 'bounced' | 'complained' | null */
  last_email_event_type: string | null;
  last_email_event_at: string | null;
}

export interface EmailsListFilters {
  search?: string;
  status?: 'all' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'pending';
  source?: 'all' | 'crm' | 'transactional';
  since?: string; // ISO timestamp; rows with last_event_at >= since
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Auth helper — every action below requires admin role
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
// getResendActivityStats — powers the KPI cards
// ---------------------------------------------------------------------------

export async function getResendActivityStats(
  window: ActivityWindow = '7d'
): Promise<ResendActivityStats | null> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_resend_activity_stats', {
    p_window: window,
  });

  if (error) {
    await logServerError(`[resend-activity] stats rpc failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getResendActivityStats' });
    return null;
  }

  return data as ResendActivityStats;
}

// ---------------------------------------------------------------------------
// getEmailsList — searchable, filterable table of all emails
// ---------------------------------------------------------------------------

export async function getEmailsList(
  filters: EmailsListFilters = {}
): Promise<{ rows: EmailRow[]; count: number }> {
  const supabase = await requireAdmin();

  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('emails')
    .select('*', { count: 'exact' })
    .order('last_event_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (filters.source && filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }

  if (filters.since) {
    query = query.gte('last_event_at', filters.since);
  }

  if (filters.search && filters.search.trim()) {
    // Sanitize: strip every character PostgREST's `or()` DSL treats as a
    // metacharacter (commas split OR terms; parens group; colons split
    // column.op.value; braces delimit array literals; backslashes escape;
    // percent is a wildcard already implied by our %...% wrap). Without
    // this, admin-supplied search input can inject arbitrary filter terms.
    const q = filters.search.trim().replace(/[,()\\:{}%]/g, '');
    if (q) {
      query = query.or(
        `subject.ilike.%${q}%,from_address.ilike.%${q}%,to_addresses.cs.{${q}}`
      );
    }
  }

  if (filters.status && filters.status !== 'all') {
    switch (filters.status) {
      case 'delivered':
        query = query.not('delivered_at', 'is', null);
        break;
      case 'opened':
        query = query.not('opened_at', 'is', null);
        break;
      case 'clicked':
        query = query.not('clicked_at', 'is', null);
        break;
      case 'bounced':
        query = query.not('bounced_at', 'is', null);
        break;
      case 'complained':
        query = query.not('complained_at', 'is', null);
        break;
      case 'pending':
        query = query
          .not('sent_at', 'is', null)
          .is('delivered_at', null)
          .is('bounced_at', null);
        break;
    }
  }

  const { data, error, count } = await query;

  if (error) {
    await logServerError(`[resend-activity] emails list failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getEmailsList' });
    return { rows: [], count: 0 };
  }

  return {
    rows: (data ?? []) as EmailRow[],
    count: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// getEmailDetail — one email plus its full event timeline
// ---------------------------------------------------------------------------

export async function getEmailDetail(resendMessageId: string): Promise<{
  email: EmailRow | null;
  events: EmailEventRow[];
}> {
  const supabase = await requireAdmin();

  const [emailRes, eventsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('emails')
      .select('*')
      .eq('resend_message_id', resendMessageId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('email_events')
      .select('*')
      .eq('resend_message_id', resendMessageId)
      .order('occurred_at', { ascending: true }),
  ]);

  return {
    email: (emailRes.data as EmailRow) ?? null,
    events: ((eventsRes.data ?? []) as EmailEventRow[]),
  };
}

// ---------------------------------------------------------------------------
// getDomainBreakdown — per recipient domain stats
// ---------------------------------------------------------------------------

export async function getDomainBreakdown(
  window: ActivityWindow = '30d'
): Promise<DomainStats[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_resend_domain_breakdown', {
    p_window: window,
  });

  if (error) {
    await logServerError(`[resend-activity] domain breakdown rpc failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getDomainBreakdown' });
    return [];
  }

  return (data ?? []) as DomainStats[];
}

// ---------------------------------------------------------------------------
// getRecentActivityFeed — latest events across all emails
// ---------------------------------------------------------------------------

export async function getRecentActivityFeed(limit = 50): Promise<EmailEventRow[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('email_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(Math.min(limit, 200));

  if (error) {
    await logServerError(`[resend-activity] feed failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getRecentActivityFeed' });
    return [];
  }

  return (data ?? []) as EmailEventRow[];
}

// ---------------------------------------------------------------------------
// getEmailClicks — per-click telemetry (URL, UA, IP) for a single message
// ---------------------------------------------------------------------------

export async function getEmailClicks(
  resendMessageId: string
): Promise<EmailClick[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('email_clicks')
    .select('*')
    .eq('resend_message_id', resendMessageId)
    .order('occurred_at', { ascending: false });

  if (error) {
    await logServerError(`[resend-activity] email clicks query failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getEmailClicks' });
    return [];
  }

  return (data ?? []) as EmailClick[];
}

// ---------------------------------------------------------------------------
// getCoachLastEmailActivity — batch-fetch latest email activity for coaches.
// Returns a record keyed by coach id for O(1) lookup in UI rendering.
// ---------------------------------------------------------------------------

export async function getCoachLastEmailActivity(
  coachIds: string[]
): Promise<Record<string, CoachEmailActivity>> {
  if (!coachIds.length) return {};

  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('crm_coaches')
    .select('id, email_status, last_email_event_type, last_email_event_at')
    .in('id', coachIds);

  if (error) {
    await logServerError(`[resend-activity] coach email activity query failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getCoachLastEmailActivity' });
    return {};
  }

  const out: Record<string, CoachEmailActivity> = {};
  for (const row of (data ?? []) as Array<{
    id: string;
    email_status: string | null;
    last_email_event_type: string | null;
    last_email_event_at: string | null;
  }>) {
    out[row.id] = {
      email_status: row.email_status,
      last_email_event_type: row.last_email_event_type,
      last_email_event_at: row.last_email_event_at,
    };
  }

  return out;
}

// ---------------------------------------------------------------------------
// getFailedEmails — bounced / complained emails that need attention
// ---------------------------------------------------------------------------

export async function getFailedEmails(limit = 100): Promise<EmailRow[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('emails')
    .select('*')
    .or('bounced_at.not.is.null,complained_at.not.is.null')
    .order('last_event_at', { ascending: false })
    .limit(Math.min(limit, 200));

  if (error) {
    await logServerError(`[resend-activity] failed emails query failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'resend_activity.getFailedEmails' });
    return [];
  }

  return (data ?? []) as EmailRow[];
}
