/**
 * Incident resolver — programmatically auto-archive `admin_events` rows that
 * are still showing as active in the admin "Needs Attention" / System incident
 * feeds even though the underlying code bug has already been fixed.
 *
 * The dashboard treats any `admin_events` row whose `severity` is in
 * ('error', 'warning', 'critical') and whose `metadata.auto_resolved !== true`
 * as a live incident. By demoting `severity` to 'info' and stamping the
 * metadata with `auto_resolved`, `resolution`, and `resolved_at`, the row
 * disappears from the surfaced lists while remaining queryable for debug.
 *
 * Use from one-shot scripts (see `scripts/archive-todays-resolved-incidents.ts`)
 * or future server actions that can prove a class of incident is fixed.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/types/database';

export interface ResolveCriteria {
  /** Match against admin_events.metadata ->> 'metric' (LIKE pattern). */
  metricPrefix?: string;
  /** Match against admin_events.message (ILIKE pattern, e.g. "%ON CONFLICT specification%"). */
  messageMatch?: string;
  /** Match against admin_events.metadata ->> 'errorCode' or ->> 'code'. */
  errorCode?: string;
  /** Free-text resolution note recorded on the row. */
  resolution: string;
}

type AdminEventSeverity = 'info' | 'warning' | 'error' | 'critical';
const ACTIVE_SEVERITIES: readonly AdminEventSeverity[] = ['error', 'warning', 'critical'];

function isAlreadyAutoResolved(metadata: Json | null): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const v = (metadata as Record<string, unknown>).auto_resolved;
  return v === true;
}

export async function archiveIncidentsByCriteria(
  criteria: ResolveCriteria,
): Promise<{ archived: number }> {
  const { metricPrefix, messageMatch, errorCode, resolution } = criteria;

  if (!metricPrefix && !messageMatch && !errorCode) {
    throw new Error(
      'archiveIncidentsByCriteria: at least one of metricPrefix / messageMatch / errorCode must be provided',
    );
  }

  const admin = createAdminClient();

  // Build a query that finds candidate rows. We do an in-memory filter step
  // afterwards for the JSON metadata predicates so we keep this readable and
  // resilient to PostgREST jsonb-operator quirks.
  let query = admin
    .from('admin_events')
    .select('id, severity, metadata, message')
    .in('severity', ACTIVE_SEVERITIES as unknown as AdminEventSeverity[]);

  if (messageMatch) {
    query = query.ilike('message', messageMatch);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`archiveIncidentsByCriteria: load failed: ${error.message}`);
  }

  const candidates = (data ?? []).filter((row) => {
    if (isAlreadyAutoResolved(row.metadata)) return false;

    if (metricPrefix) {
      const md = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
      const metric = typeof md?.metric === 'string' ? (md.metric as string) : null;
      if (!metric) return false;
      // Treat trailing `%` like SQL LIKE; otherwise use prefix-match semantics.
      if (metricPrefix.endsWith('%')) {
        const stem = metricPrefix.slice(0, -1);
        if (!metric.startsWith(stem)) return false;
      } else if (!metric.startsWith(metricPrefix)) {
        return false;
      }
    }

    if (errorCode) {
      const md = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
      const codeA = typeof md?.errorCode === 'string' ? (md.errorCode as string) : null;
      const codeB = typeof md?.code === 'string' ? (md.code as string) : null;
      if (codeA !== errorCode && codeB !== errorCode) return false;
    }

    return true;
  });

  if (candidates.length === 0) return { archived: 0 };

  const resolvedAt = new Date().toISOString();
  let archived = 0;

  for (const row of candidates) {
    const baseMetadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const nextMetadata: Record<string, unknown> = {
      ...baseMetadata,
      auto_resolved: true,
      resolution,
      resolved_at: resolvedAt,
    };

    const { error: updateError } = await admin
      .from('admin_events')
      .update({
        severity: 'info',
        // The live incident feed (fetchErrorsTab/fetchTriageQueue) filters
        // on `.eq('resolved', false)`, not on severity — the same column the
        // real super-admin resolve path (resolve_admin_event RPC) sets. Without
        // this, an "archived" row keeps `resolved = false` and stays in the
        // Bridge feed until the window's 30-day cap ages it out. `resolved_by`
        // is deliberately left untouched: it's a FK to public.users(id), and
        // this path has no invoking admin user to attribute it to.
        resolved: true,
        resolved_at: resolvedAt,
        metadata: nextMetadata as unknown as Json,
      })
      .eq('id', row.id);

    if (updateError) {
      // Don't abort the whole batch — log and continue so a partial archive
      // still helps the dashboard. The script caller will see the count.
      console.error(
        `[incident-resolver] failed to archive admin_events.id=${row.id}: ${updateError.message}`,
      );
      continue;
    }
    archived += 1;
  }

  return { archived };
}
