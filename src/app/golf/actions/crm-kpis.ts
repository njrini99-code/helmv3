'use server';

/**
 * Server action powering the CRM Dashboard "Weekly Pulse" trend strip.
 *
 * Wraps the `get_crm_weekly_kpis(p_weeks)` RPC declared in
 * supabase/migrations/20260720150000_crm_stage_tracking.sql — a
 * SECURITY DEFINER function that self-gates on `users.role = 'admin'`
 * (RAISE EXCEPTION 'Forbidden' for non-admins), so no separate
 * requireAdmin() round-trip is needed here beyond confirming the caller
 * is authenticated at all (mirrors crm-foundations.ts:36).
 *
 * Returns rows ascending by week_start:
 *   [{ week_start, sent, calls, opened, clicked, replied, stage_advances }]
 */

import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';

export interface WeeklyKpiRow {
  week_start: string;
  sent: number;
  calls: number;
  opened: number;
  clicked: number;
  replied: number;
  stage_advances: number;
}

// ---------------------------------------------------------------------------
// Auth helper — mirrors crm-foundations.ts:36. The RPC itself re-checks
// admin role server-side (SECURITY DEFINER), so this only needs to fail
// fast on unauthenticated callers with a clean error rather than letting
// the RPC's RAISE EXCEPTION surface as an opaque PostgrestError.
// ---------------------------------------------------------------------------
async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function coerceRow(raw: unknown): WeeklyKpiRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.week_start !== 'string' || row.week_start.length === 0) return null;
  return {
    week_start: row.week_start,
    sent: toNumber(row.sent),
    calls: toNumber(row.calls),
    opened: toNumber(row.opened),
    clicked: toNumber(row.clicked),
    replied: toNumber(row.replied),
    stage_advances: toNumber(row.stage_advances),
  };
}

/**
 * Fetch the last `weeks` weeks of CRM outreach + movement KPIs, ascending
 * by week_start. Degrades to `[]` on any auth/RPC/shape failure so the
 * Weekly Pulse card can render nothing rather than break the dashboard.
 */
export async function getWeeklyKpis(weeks = 8): Promise<WeeklyKpiRow[]> {
  try {
    const { supabase } = await getAuthedClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_crm_weekly_kpis', {
      p_weeks: weeks,
    });

    if (error) {
      throw new Error(`Failed to load weekly KPIs: ${error.message}`);
    }
    if (!Array.isArray(data)) {
      return [];
    }

    const rows: WeeklyKpiRow[] = [];
    for (const raw of data) {
      const row = coerceRow(raw);
      if (row) rows.push(row);
    }
    return rows;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_kpis.getWeeklyKpis',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return [];
  }
}
