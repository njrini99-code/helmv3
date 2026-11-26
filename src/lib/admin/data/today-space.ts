import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { parseIntegrityRows, type IntegrityRow } from '@/lib/admin/data/jobs';
import { CRON_REGISTRY, classifyCronStatus, type CronBoardStatus } from '@/lib/admin/cron-registry';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';
import { liveRef } from '@/lib/admin/clubhouse/screens';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Small, cheap reads the Bridge spaces need and no existing reader gives (plan:
 * docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md, branch E: Today, Product, Ship, Desk).
 * Each is bounded on purpose, because a space landing may be opened many times a day:
 *
 * - `fetchRoundTimestamps`: one paginated column read of golf_rounds over 12 weeks, test rounds left out.
 * - `fetchFeatureUseToday`: admin_events since 00:00 UTC only, two columns, instead of the Utilization tab's 84-day scan.
 * - `fetchJobsHealth`: the newest run per registered cron plus the latest integrity results. It skips the exact
 *   counts over admin_events and error_logs that `fetchJobsTab` adds for the Jobs tab's log-volume tiles.
 * - `servedReleaseSha`: the release stamp this deployment carries, the same stamp `npm run release:status` finds in
 *   the served chunks. Never a Vercel API call.
 *
 * CALLER must have passed requireSuperAdmin(): every query uses the service-role client.
 * Each function throws on a failed read; `settleRead` turns that into a failed `Read` the screen shows as failed.
 */

const DAY_MS = 86_400_000;

/** The SHA this deployment serves, or null when it carries no stamp (local dev, or a deploy without the stamp). */
export function servedReleaseSha(env: Record<string, string | undefined> = process.env): string | null {
  const ref = liveRef(env);
  return ref === 'main' ? null : ref;
}

/** `created_at` of every non-test GolfHelm round logged in the last `weeks` weeks. */
export async function fetchRoundTimestamps(now: number, weeks = 12): Promise<string[]> {
  const admin = createAdminClient();
  const since = new Date(now - weeks * 7 * DAY_MS).toISOString();
  const rows = await fetchAllRows<{ created_at: string | null }>(
    (from, to) =>
      admin
        .from('golf_rounds')
        .select('created_at')
        .eq('is_test', false)
        .gte('created_at', since)
        .order('id', { ascending: true })
        .range(from, to),
    1000,
    { table: 'golf_rounds', action: 'admin.spaces.fetchRoundTimestamps' },
  );
  return rows.map((r) => r.created_at).filter((t): t is string => Boolean(t));
}

/**
 * Registry features a signed-in person touched since 00:00 UTC, the same rule as Utilization's "touched today"
 * (a feature-tagged admin_events row carrying a user id). Test and demo accounts count, as they do there.
 */
export async function fetchFeatureUseToday(now: number): Promise<{ used: number; total: number }> {
  const d = new Date(now);
  const midnight = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  const registry = FEATURE_REGISTRY.filter((f) => !f.excluded);
  const keys = new Set<string>(registry.map((f) => f.key));
  const admin = createAdminClient();
  const rows = await fetchAllRows<{ feature: string | null }>(
    (from, to) =>
      admin
        .from('admin_events')
        .select('feature')
        .not('feature', 'is', null)
        .not('user_id', 'is', null)
        .gte('created_at', midnight)
        .order('id', { ascending: true })
        .range(from, to),
    1000,
    { table: 'admin_events', action: 'admin.spaces.fetchFeatureUseToday' },
  );
  const used = new Set<string>();
  for (const r of rows) if (r.feature && keys.has(r.feature)) used.add(r.feature);
  return { used: used.size, total: registry.length };
}

export interface JobsHealthRow {
  jobType: string;
  status: CronBoardStatus;
  unreadable: boolean;
}

export interface JobsHealth {
  board: JobsHealthRow[];
  integrity: IntegrityRow[];
}

export async function fetchJobsHealth(now: Date = new Date()): Promise<JobsHealth> {
  const admin = createAdminClient();
  const [latest, integrityRows] = await Promise.all([
    Promise.all(
      CRON_REGISTRY.map(async (entry) => {
        const { data, error } = await admin
          .from('background_job_logs')
          .select('status, started_at, metadata')
          .eq('job_type', entry.jobType)
          .order('started_at', { ascending: false })
          .limit(1);
        // A failed read is that job's "unreadable", never "never ran" (the board below keeps the two apart).
        return error ? { data: null, error } : { data, error: null };
      }),
    ),
    (async () => {
      const { data, error } = await admin
        .from('admin_events')
        .select('title, severity, metadata, created_at')
        .eq('source', 'integrity')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(`spaces.jobs.integrity: ${error.message}`);
      return data ?? [];
    })(),
  ]);
  const board = CRON_REGISTRY.map((entry, i): JobsHealthRow => {
    const res = latest[i];
    if (res?.error) return { jobType: entry.jobType, status: 'never-ran', unreadable: true };
    const last = (res?.data?.[0] ?? null) as { status: string; started_at: string; metadata: unknown } | null;
    return { jobType: entry.jobType, status: classifyCronStatus(entry, last, now), unreadable: false };
  });
  const integrity = [...parseIntegrityRows(integrityRows as Parameters<typeof parseIntegrityRows>[0]).values()];
  return { board, integrity };
}

export type SettledRead<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs one read and never throws: a failure becomes `{ ok: false }` and is logged once per window per label (Noise
 * Charter N4: a space on auto-refresh must not write a row a minute during an outage).
 */
export async function settleRead<T>(label: string, read: () => Promise<T>): Promise<SettledRead<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (err) {
    const error = describeError(err);
    const key = `admin:spaces:${label}`;
    if (shouldEmit(key)) {
      const collapsed = drainCollapsedCount(key);
      void logServerError(`[Bridge spaces] ${label} read failed: ${error}`, {
        action: `admin.spaces.${label}`,
        feature: 'admin_dashboard',
        sport: 'shared',
        source: 'server_component',
        errorCode: 'bridge_space_read_failed',
        errorDetails: error.slice(0, 500),
        handled: true,
        ...(collapsed > 0 ? { metadata: { collapsed_count: collapsed } } : {}),
      }).catch(() => {});
    }
    return { ok: false, error };
  }
}
