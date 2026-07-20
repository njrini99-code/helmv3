'use server';

/**
 * Server actions powering the CRM Insights dashboard at
 * `/golf/admin/crm/insights`.
 *
 * Wraps three SECURITY DEFINER RPCs declared in
 * supabase/migrations/20260527000000_prod_public_baseline.sql and amended by
 * 20260704110000_crm_rpcs_admin_gate.sql and
 * 20260708021000_gate_ungated_definer_rpcs.sql:
 *   - get_crm_template_performance(window)
 *   - get_crm_time_to_open(window)
 *   - get_crm_click_destinations(window, limit)
 *
 * get_crm_template_performance and get_crm_click_destinations had their
 * `authenticated`/`anon` EXECUTE grant revoked by the 20260708021000
 * migration (their sole intended callers were meant to go through the
 * service_role admin client — see that migration's own comment (3) — but
 * this file was still calling them via the cookie/session client). Both now
 * run their RPC call through `createAdminClient()` after `requireAdmin()`
 * has already verified the caller is an admin.
 *
 * Plus a deliverability summary that calls `get_resend_activity_stats`
 * directly (rather than through `resend-activity.ts`'s
 * `getResendActivityStats`, whose `ActivityWindow` type only accepts
 * `'24h' | '7d' | '30d' | 'all'`) so the dashboard's native `'90d'` window
 * reaches the RPC instead of being aliased to the unbounded `'all'` window.
 *
 * Plus `get_crm_funnel(window)` — the stage-transition-tracking RPC from
 * the `feat/crm-visibility-tracking` foundation — backing the outreach
 * funnel card (sent → delivered → opened → clicked → replied, plus
 * coaches_* distinct-recipient counts).
 *
 * Auth: every action enforces admin role at the action layer, mirroring
 * `crm-engagement.ts:28` and `resend-activity.ts:121`.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { ResendActivityStats } from './resend-activity';

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

export interface CrmFunnel {
  window: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  coaches_emailed: number;
  coaches_opened: number;
  coaches_clicked: number;
  coaches_replied: number;
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
  // Verify admin, then use the service-role client for the RPC itself —
  // authenticated/anon EXECUTE was revoked on this function (see file
  // header), so the cookie/session client always permission-denies here.
  await requireAdmin();
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(
    'get_crm_template_performance',
    { p_window: window },
  );

  if (error) {
    await logServerError(
      `[crm-insights] template performance rpc failed: ${describeError(error)}`,
      {
        action: 'crm_insights.getTemplatePerformance',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
      },
    );
    // Re-throw (rather than returning []) so the dashboard's error banner
    // can distinguish a real failure from a genuinely empty result —
    // InsightsDashboard.fetchAll's try/catch around Promise.all already
    // handles this.
    throw new Error(`Failed to load template performance: ${describeError(error)}`);
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
      `[crm-insights] time-to-open rpc failed: ${describeError(error)}`,
      {
        action: 'crm_insights.getTimeToOpenDistribution',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
      },
    );
    // Re-throw so a real RPC failure surfaces via the dashboard's error
    // banner instead of rendering identically to "no data yet".
    throw new Error(`Failed to load time-to-open distribution: ${describeError(error)}`);
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
  // Verify admin, then use the service-role client for the RPC itself —
  // authenticated/anon EXECUTE was revoked on this function (see file
  // header), so the cookie/session client always permission-denies here.
  await requireAdmin();
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(
    'get_crm_click_destinations',
    { p_window: window, p_limit: Math.min(Math.max(limit, 1), 100) },
  );

  if (error) {
    await logServerError(
      `[crm-insights] click destinations rpc failed: ${describeError(error)}`,
      {
        action: 'crm_insights.getClickDestinations',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
      },
    );
    // Re-throw so a real RPC failure surfaces via the dashboard's error
    // banner instead of rendering identically to "no clicks yet".
    throw new Error(`Failed to load click destinations: ${describeError(error)}`);
  }

  return (data ?? []) as ClickDestinationRow[];
}

// ---------------------------------------------------------------------------
// 4. Deliverability summary
// ---------------------------------------------------------------------------
// Calls get_resend_activity_stats directly (rather than through
// resend-activity.ts's getResendActivityStats, whose ActivityWindow type is
// '24h' | '7d' | '30d' | 'all' only) so the insights dashboard's native
// '90d' window reaches the RPC's own v_since CASE instead of being aliased
// to the unbounded 'all' window. The RPC has a matching `WHEN '90d' THEN
// now() - interval '90 days'` branch (added alongside this fix).
export async function getDeliverabilitySummary(
  window: InsightsWindow,
): Promise<DeliverabilitySummary> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_resend_activity_stats', {
    p_window: window,
  });

  if (error) {
    await logServerError(
      `[crm-insights] deliverability summary rpc failed: ${describeError(error)}`,
      {
        action: 'crm_insights.getDeliverabilitySummary',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
      },
    );
  }

  const stats = (!error ? (data as ResendActivityStats | null) : null);

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

// ---------------------------------------------------------------------------
// 5. Outreach funnel (sent → delivered → opened → clicked → replied)
// ---------------------------------------------------------------------------
export async function getCrmFunnel(window: InsightsWindow): Promise<CrmFunnel | null> {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_crm_funnel', {
    p_window: window,
  });

  if (error) {
    await logServerError(
      `[crm-insights] funnel rpc failed: ${describeError(error)}`,
      {
        action: 'crm_insights.getCrmFunnel',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
      },
    );
    return null;
  }

  const row = data as CrmFunnel | null;

  if (!row) return null;

  return {
    window: row.window,
    sent: row.sent ?? 0,
    delivered: row.delivered ?? 0,
    opened: row.opened ?? 0,
    clicked: row.clicked ?? 0,
    replied: row.replied ?? 0,
    coaches_emailed: row.coaches_emailed ?? 0,
    coaches_opened: row.coaches_opened ?? 0,
    coaches_clicked: row.coaches_clicked ?? 0,
    coaches_replied: row.coaches_replied ?? 0,
  };
}
