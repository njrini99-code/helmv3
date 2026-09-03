import 'server-only';

/**
 * Helm Bridge — Telemetry Health (brief §35G, §40-48).
 *
 * "Is the observability system itself watching?" — composed from the SAME
 * readers this directory already exposes (fetchDatabaseMissionControl,
 * fetchDatabaseErrors, fetchQueryPerformance, fetchTableHealth,
 * fetchCollectorHealth) rather than re-querying the database a second time,
 * plus one new RPC read (`helm_debug_read_observability_sizes`,
 * 20260903190300, HELD) for table sizes and rolling-24h row counts
 * (self-monitoring). Freshness classification is pure and lives in
 * src/lib/observability/supabase/freshness.ts — this file only wires each
 * source's last-sample timestamp and readability through it.
 *
 * THE db_error_events SOURCE IS DELIBERATELY TREATED THE SAME AS EVERY
 * SCHEDULED SOURCE, EVEN THOUGH IT IS EVENT-DRIVEN. A quiet production
 * system can legitimately have zero rows in its error store for a long
 * time — that is good news about the product, not evidence the
 * out-of-band recorder still works. Brief §80-86 names "no telemetry as no
 * errors" as an explicit anti-pattern, so this file does NOT special-case
 * an empty error store into "healthy" — an empty store reads `unknown`
 * (never sampled), same as any other source with no data, which is the
 * conservative, brief-compliant answer even though it means a brand-new
 * deployment's Telemetry Health can never claim fully `green` until at
 * least one real event has round-tripped through the recorder.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { fetchDatabaseMissionControl, fetchCollectorHealth, type CollectorHealth } from './overview';
import { fetchDatabaseErrors } from './errors';
import { fetchQueryPerformance } from './performance';
import { fetchTableHealth } from './tables';
import {
  classifySourceFreshness,
  summarizeTelemetryHealth,
  type FreshnessState,
  type OverallTelemetryState,
  type TelemetrySource,
} from '@/lib/observability/supabase/freshness';

type MaybePostgrestError = { code?: string | null; message?: string | null } | null;

const FIVE_MINUTES_MS = 5 * 60_000;
const FIFTEEN_MINUTES_MS = 15 * 60_000;
const SIXTY_MINUTES_MS = 60 * 60_000;
/** db_error_events is event-driven, not scheduled — this expectation is a
 *  ceiling for "has anything ever landed", not a cadence. Sized generously
 *  (daily) so a quiet-but-working system does not read `degraded` purely
 *  from having no errors for a few hours. */
const DAILY_MS = 24 * 60 * 60_000;

export interface TelemetrySourceRow {
  name: string;
  state: FreshnessState;
  lastSampleAt: string | null;
  required: boolean;
}

export interface ObservabilityTableSize {
  tableName: string;
  totalBytes: number;
  rowCount: number;
  rowsLast24h: number;
}

export interface TelemetryHealthSnapshot {
  overall: OverallTelemetryState;
  sources: TelemetrySourceRow[];
  tableSizes: ObservabilityTableSize[];
  sizesCapability: 'available' | 'unavailable';
  collectors: CollectorHealth[];
}

interface RawSizeRow {
  table_name: string;
  total_bytes: number;
  row_count: number;
  rows_last_24h: number;
}

function buildSource(
  name: string,
  readable: boolean,
  lastSampleAt: string | null,
  expectedIntervalMs: number,
  required: boolean,
  now: Date,
): TelemetrySourceRow {
  return {
    name,
    state: classifySourceFreshness({ lastSampleAt, expectedIntervalMs, now, readable }),
    lastSampleAt,
    required,
  };
}

export async function fetchTelemetryHealth(): Promise<AdminFetchResult<TelemetryHealthSnapshot>> {
  try {
    const admin = createAdminClient();
    const now = new Date();

    const [missionControl, errors, performance, tables, collectors, sizesRaw] = await Promise.all([
      fetchDatabaseMissionControl(),
      fetchDatabaseErrors(),
      fetchQueryPerformance(),
      fetchTableHealth(),
      fetchCollectorHealth(admin),
      admin.rpc('helm_debug_read_observability_sizes' as never, {} as never),
    ]);
    const sizesResult = sizesRaw as unknown as { data: RawSizeRow[] | null; error: MaybePostgrestError };

    const sources: TelemetrySourceRow[] = [
      buildSource(
        'db_health_samples',
        missionControl.status !== 'error',
        missionControl.data?.latestSample?.sampledAt ?? null,
        FIVE_MINUTES_MS,
        true,
        now,
      ),
      buildSource(
        'db_stat_deltas',
        performance.status !== 'error',
        performance.data?.latestSampledAt ?? null,
        FIFTEEN_MINUTES_MS,
        true,
        now,
      ),
      buildSource(
        'db_table_samples',
        tables.status !== 'error',
        tables.data?.latestSampledAt ?? null,
        SIXTY_MINUTES_MS,
        true,
        now,
      ),
      buildSource(
        'db_error_events',
        errors.status !== 'error',
        errors.data?.groups[0]?.lastSeenAt ?? null,
        DAILY_MS,
        true,
        now,
      ),
    ];

    // Fail-open regardless of WHY the sizes read failed (migration held, or
    // a genuine RPC error) — telemetry health must never itself become a
    // broken page because one of its OWN reads failed. See file header.
    // isMigrationNotAppliedError is not branched on separately here: both
    // failure shapes degrade identically to an empty, capability:unavailable
    // result, which is the only distinction this snapshot needs to make.
    const tableSizes: ObservabilityTableSize[] = sizesResult.error
      ? []
      : (sizesResult.data ?? []).map((raw) => ({
          tableName: raw.table_name,
          totalBytes: raw.total_bytes,
          rowCount: raw.row_count,
          rowsLast24h: raw.rows_last_24h,
        }));
    const sizesCapability: 'available' | 'unavailable' = sizesResult.error ? 'unavailable' : 'available';

    const telemetrySources: TelemetrySource[] = sources.map((s) => ({ name: s.name, state: s.state, required: s.required }));

    return ok({
      overall: summarizeTelemetryHealth(telemetrySources),
      sources,
      tableSizes,
      sizesCapability,
      collectors,
    });
  } catch (err) {
    return failed(err instanceof Error ? err.message : 'fetchTelemetryHealth failed unexpectedly');
  }
}
