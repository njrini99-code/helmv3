'use server';

/**
 * Server actions powering the CRM Insights dashboard at
 * `/golf/admin/crm/insights`.
 *
 * Wraps three SECURITY DEFINER RPCs declared in
 * supabase/migrations/20260429T4_crm_insights_rpcs.sql:
 *   - get_crm_template_performance(window)
 *   - get_crm_time_to_open(window)
 *   - get_crm_click_destinations(window, limit)
 *
 * Plus a deliverability summary that re-uses `getResendActivityStats` from
 * `resend-activity.ts` (mapped from its `'24h' | '7d' | '30d' | 'all'`
 * window vocab to the insights-dashboard's `'7d' | '30d' | '90d'`).
 *
 * Auth: every action enforces admin role at the action layer, mirroring
 * `crm-engagement.ts:28` and `resend-activity.ts:121`.
 */

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { getResendActivityStats } from './resend-activity';

// ---------------------------------------------------------------------------
// Types — exported for component consumers
// ---------------------------------------------------------------------------

export type InsightsWindow = '7d' | '30d' | '90d';

export interface TemplatePerformanceRow {
  template_id: string;
  template_name: string;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  /** Computed in TS: opened / delivered, 0..1, null when delivered = 0. */
  open_rate: number | null;
  /** Computed in TS: clicked / delivered, 0..1, null when delivered = 0. */
  click_rate: number | null;
}

export interface TimeToOpenBucket {
  bucket_min: number;
  bucket_max: number;
  count: number;
  /** UI-friendly label for the bucket (e.g. "0-1m", "1-10m", ">1d"). */
  label: string;
}

export interface ClickDestinationRow {
  clicked_url: string;
  click_count: number;
  unique_recipients: number;
}

export interface DeliverabilitySummary {
  window: InsightsWindow;
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  /** delivered / total_sent, 0..1, null when total_sent = 0. */
  delivery_rate: number | null;
  /** opened / delivered, 0..1, null when delivered = 0. */
  open_rate: number | null;
  /** clicked / delivered, 0..1, null when delivered = 0. */
  click_rate: number | null;
  /** bounced / total_sent, 0..1, null when total_sent = 0. */
  bounce_rate: number | null;
}

// ---------------------------------------------------------------------------
// Auth helper — admin role required.
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
// Helpers
// ---------------------------------------------------------------------------

function safeRate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}

const TIME_TO_OPEN_LABELS: Record<string, string> = {
  '0-60': '0-1m',
  '60-600': '1-10m',
  '600-3600': '10m-1h',
  '3600-14400': '1h-4h',
  '14400-86400': '4h-1d',
  '86400-999999': '>1d',
};

// ---------------------------------------------------------------------------
// 1. Per-template performance
// ---------------------------------------------------------------------------
export async function getTemplatePerformance(
  window: InsightsWindow,
): Promise<TemplatePerformanceRow[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    'get_crm_template_performance',
    { p_window: window },
  );

  if (error) {
    await logServerError(
      `[crm-insights] template performance rpc failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'crm_insights.getTemplatePerformance' },
    );
    return [];
  }

  interface RawRow {
    template_id: string;
    template_name: string;
    sent_count: number;
    delivered_count: number;
    opened_count: number;
    clicked_count: number;
    bounced_count: number;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    template_id: row.template_id,
    template_name: row.template_name,
    sent_count: row.sent_count ?? 0,
    delivered_count: row.delivered_count ?? 0,
    opened_count: row.opened_count ?? 0,
    clicked_count: row.clicked_count ?? 0,
    bounced_count: row.bounced_count ?? 0,
    // Rates use delivered as the denominator — same convention as Resend's
    // dashboard. Falls back to sent if delivered is 0 to avoid hiding all-
    // bounce templates from the table.
    open_rate: safeRate(
      row.opened_count ?? 0,
      row.delivered_count > 0 ? row.delivered_count : row.sent_count,
    ),
    click_rate: safeRate(
      row.clicked_count ?? 0,
      row.delivered_count > 0 ? row.delivered_count : row.sent_count,
    ),
  }));
}

// ---------------------------------------------------------------------------
// 2. Time-to-open distribution
// ---------------------------------------------------------------------------
export async function getTimeToOpenDistribution(
  window: InsightsWindow,
): Promise<TimeToOpenBucket[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_crm_time_to_open', {
    p_window: window,
  });

  if (error) {
    await logServerError(
      `[crm-insights] time-to-open rpc failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'crm_insights.getTimeToOpenDistribution' },
    );
    return [];
  }

  interface RawBucket {
    bucket_min: number;
    bucket_max: number;
    count: number;
  }

  return ((data ?? []) as RawBucket[]).map((row) => {
    const key = `${row.bucket_min}-${row.bucket_max}`;
    return {
      bucket_min: row.bucket_min,
      bucket_max: row.bucket_max,
      count: row.count ?? 0,
      label: TIME_TO_OPEN_LABELS[key] ?? key,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Click destinations heatmap
// ---------------------------------------------------------------------------
export async function getClickDestinations(
  window: InsightsWindow,
  limit = 25,
): Promise<ClickDestinationRow[]> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    'get_crm_click_destinations',
    { p_window: window, p_limit: Math.min(Math.max(limit, 1), 100) },
  );

  if (error) {
    await logServerError(
      `[crm-insights] click destinations rpc failed: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'crm_insights.getClickDestinations' },
    );
    return [];
  }

  return (data ?? []) as ClickDestinationRow[];
}

// ---------------------------------------------------------------------------
// 4. Deliverability summary (wraps existing getResendActivityStats)
// ---------------------------------------------------------------------------
export async function getDeliverabilitySummary(
  window: InsightsWindow,
): Promise<DeliverabilitySummary> {
  // getResendActivityStats already enforces admin; no need to duplicate here.
  // It accepts '24h' | '7d' | '30d' | 'all'. The insights window vocabulary
  // adds '90d' (which maps to 'all' as the closest superset; the dashboard
  // labels both as "90d" since 'all' returns a no-window scan).
  const resendWindow = window === '90d' ? 'all' : window;
  const stats = await getResendActivityStats(resendWindow);

  if (!stats) {
    return {
      window,
      total_sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      delivery_rate: null,
      open_rate: null,
      click_rate: null,
      bounce_rate: null,
    };
  }

  return {
    window,
    total_sent: stats.total ?? 0,
    delivered: stats.delivered ?? 0,
    opened: stats.opened ?? 0,
    clicked: stats.clicked ?? 0,
    bounced: stats.bounced ?? 0,
    complained: stats.complained ?? 0,
    delivery_rate: safeRate(stats.delivered ?? 0, stats.total ?? 0),
    open_rate: safeRate(stats.opened ?? 0, stats.delivered ?? 0),
    click_rate: safeRate(stats.clicked ?? 0, stats.delivered ?? 0),
    bounce_rate: safeRate(stats.bounced ?? 0, stats.total ?? 0),
  };
}
