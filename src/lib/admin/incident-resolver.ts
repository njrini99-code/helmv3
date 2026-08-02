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
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { Json } from '@/lib/types/database';
import { describeError } from '@/lib/utils/describe-error';

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
  //
  // PAGINATED on purpose: PostgREST caps a response at `max_rows = 1000`
  // (supabase/config.toml), so an unbounded select archived at most 1,000 rows
  // per bucket per run. That is invisible — the call returns cleanly with a
  // truncated set. Worse, the metadata predicates below (`metricPrefix`,
  // `errorCode`) are applied in MEMORY, i.e. AFTER the cap: with >1,000 active
  // rows and no stable order, matching rows could fall outside the arbitrary
  // slice on every run and never be archived at all. `.order('id')` is
  // load-bearing — it is what keeps page boundaries from drifting.
  const { data, error } = await fetchAllRowsResult((from, to) => {
    let query = admin
      .from('admin_events')
      .select('id, severity, metadata, message')
      .in('severity', ACTIVE_SEVERITIES as unknown as AdminEventSeverity[]);

    if (messageMatch) {
      query = query.ilike('message', messageMatch);
    }

    return query.order('id', { ascending: true }).range(from, to);
  }, undefined, {
    table: 'admin_events',
    action: 'archiveIncidentsByCriteria',
  });
  if (error) {
    // See the integrity-check route: a transport failure puts an entire
    // Cloudflare error page in `.message`, and this string is what the incident
    // fingerprint hashes. describeError collapses it to one stable line.
    throw new Error(`archiveIncidentsByCriteria: load failed: ${describeError(error)}`);
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

export interface KnownIncidentHygieneResult {
  archived: number;
  buckets: Array<{ label: string; archived: number }>;
}

const KNOWN_NON_ACTIONABLE_INCIDENTS: ReadonlyArray<ResolveCriteria & { label: string }> = [
  {
    label: 'next_dynamic_server_usage',
    messageMatch: '%Dynamic server usage:%',
    resolution:
      'Auto-resolved: Next.js static-render/control-flow signal, not a runtime incident. Server logger now drops these before admin_events.',
  },
  {
    label: 'log_event_malformed_json',
    messageMatch: '%[log-event] Unexpected error: Unexpected end of JSON input%',
    resolution:
      'Auto-resolved: malformed/empty client beacon input. /api/admin/log-event now reads text and returns 204/400 without logging itself.',
  },
  {
    label: 'coachhelm_philosophy_gate_counts',
    messageMatch: '%philosophy gate filtered%tier-1 insight(s)%',
    resolution:
      'Auto-resolved: expected CoachHelm philosophy-gate telemetry, not a user-impacting incident.',
  },
  {
    label: 'lifting_access_denied_control_flow',
    messageMatch: '%You do not have access to this Lifting Lab.%',
    resolution:
      'Auto-resolved: expected Lifting Lab access control flow. The wrapper now logs these as info instead of warning incidents.',
  },
  {
    label: 'signed_out_control_flow',
    messageMatch: '%You must be signed in%',
    resolution:
      'Auto-resolved: expected signed-out control flow, excluded from triage.',
  },
  {
    label: 'baseball_no_active_team_control_flow',
    messageMatch: '%No active baseball team%',
    resolution:
      'Auto-resolved: expected no-active-team control flow, excluded from triage.',
  },
];

/**
 * Daily hygiene for known fixed or deliberately non-actionable admin_events.
 * This is intentionally allowlisted: it does not archive generic
 * `[object Object]`, database, or route failures because those still need a
 * source fix unless a specific resolution is added here.
 */
export async function archiveKnownResolvedIncidents(): Promise<KnownIncidentHygieneResult> {
  const buckets: KnownIncidentHygieneResult['buckets'] = [];

  for (const criteria of KNOWN_NON_ACTIONABLE_INCIDENTS) {
    const { label, ...rest } = criteria;
    const result = await archiveIncidentsByCriteria(rest);
    buckets.push({ label, archived: result.archived });
  }

  return {
    archived: buckets.reduce((sum, bucket) => sum + bucket.archived, 0),
    buckets,
  };
}
