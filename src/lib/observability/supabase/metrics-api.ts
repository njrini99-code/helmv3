import 'server-only';

/**
 * Supabase Metrics API — brief §20.
 *
 * Fetches the project's Prometheus-compatible metrics endpoint
 * (`https://<project-ref>.supabase.co/customer/v1/privileged/metrics`,
 * confirmed via `https://supabase.com/docs/guides/telemetry/metrics.md`,
 * fetched 2026-09-03) with HTTP Basic Auth — username `service_role`,
 * password a Secret API key, per that same page. This module reuses the
 * existing `SUPABASE_SERVICE_ROLE_KEY` for that password rather than
 * inventing a second secret: the docs call for "a Secret API key" without
 * naming a specific env var, and every other server-only Supabase caller in
 * this repo already holds that credential (`src/lib/supabase/admin.ts`).
 * If the owner later rotates to a dedicated `sb_secret_...` key, that is a
 * value change on the same env var, not a new one.
 *
 * ALLOW-LIST PROVENANCE — READ BEFORE TRUSTING A FIELD
 * ---------------------------------------------------------
 * `SUPABASE_ACCESS_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` were UNAVAILABLE in
 * this worktree (`.env.local` is deliberately withheld from worktrees — see
 * AGENTS.md), so `scripts/db-observability-metrics-names.mjs` (the script
 * that fetches the LIVE endpoint and prints only metric/label names) could
 * not be run against production. This allow-list is therefore
 * **DOCS-DERIVED, NOT LIVE-VERIFIED**: it comes from
 * `https://raw.githubusercontent.com/supabase/supabase-grafana/main/metrics.md`
 * (fetched 2026-09-03), a community reference project the official Metrics
 * API docs page itself points to for "dashboard JSON and alert examples" —
 * not Supabase's own primary documentation, which lists categories
 * ("~200 Postgres performance and health series") without enumerating exact
 * names. Treat every metric name below as a best guess. This is why every
 * derived field is independently nullable: a name that does not actually
 * appear in this project's scrape yields `null` for that one field, not a
 * parse failure and not a fabricated zero. When the owner supplies
 * `SUPABASE_ACCESS_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY`, run the discovery
 * script once and correct this list against its real output.
 *
 * CACHE AND TIMEOUT
 * ----------------------
 * A 60s in-memory cache (module-level — reset on cold start, which is fine:
 * a cold instance simply re-fetches) and a 5s fetch timeout, both per brief
 * §20. The cache also holds the previous scrape's raw CPU-seconds counters
 * so `cpuPct` can be computed as a delta/rate across two scrapes
 * (`computeCpuPct`, pure and unit-tested) — a raw
 * `node_cpu_seconds_total` value is a cumulative counter, not a percentage,
 * and the brief's own §16 warning against treating a cumulative counter as
 * an instantaneous rate applies here exactly as it does to
 * `pg_stat_statements`.
 */
import { getServiceRoleKey } from '@/lib/supabase/admin';

export type PlatformSourceStatus = 'ok' | 'unconfigured' | 'unreachable' | 'unparseable';

export interface PoolReading {
  used: number | null;
  max: number | null;
  saturationPct: number | null;
}

/** Every field is independently `number | null` (or `0 | 1 | null` for
 *  `dbUp`) — a missing metric is `null`, never a fabricated `0`, per brief
 *  §20's own instruction and this repo's wider "unknown never renders as
 *  healthy" rule (see `src/lib/admin/incidents/sources.ts`'s header). */
export interface PlatformHealthModel {
  dbUp: 0 | 1 | null;
  cpuPct: number | null;
  /** Resident memory, `1 - MemAvailable/MemTotal` — see `computeMemoryPct`. */
  memoryPct: number | null;
  connectionsUsed: number | null;
  connectionsMax: number | null;
  /** Generic connection-pool saturation, `connectionsUsed / connectionsMax`
   *  when both are known; distinct from the per-service pools below. */
  poolSaturationPct: number | null;
  /** Seconds of WAL/physical-replication lag when this project has a
   *  replica/read-replica exposing the metric; null on a project with none —
   *  that is the expected, healthy null, not a blind spot. */
  walOrReplicationLagSeconds: number | null;
  /** NOT exposed by the metrics scrape per the docs consulted for this
   *  allow-list — always null in this phase. Documented rather than
   *  guessed at; a future phase with a verified metric name can fill it. */
  ioPressure: number | null;
  dbSizeBytes: number | null;
  /** NOT exposed by the metrics scrape either — the table-health hourly
   *  collector (brief §29, not in this phase's scope) is the intended
   *  source for a real bloat/autovacuum signal. Always null here. */
  autovacuumOrBloatSignal: number | null;
  postgrestPool: PoolReading;
  /** GoTrue does not expose a connection-pool gauge in this allow-list —
   *  only a user-count metric, which is not a saturation signal. Always a
   *  null-filled reading in this phase. */
  authPool: PoolReading;
  /** The brief names this field `realtimePressure`; the metrics scrape
   *  exposes subscription COUNTS, not a resource-pressure gauge, so this is
   *  an explicitly-approximated proxy, not literal pressure. */
  realtimeSubscriptions: number | null;
  sampledAt: string; // ISO-8601
  sourceStatus: PlatformSourceStatus;
}

function emptyPool(): PoolReading {
  return { used: null, max: null, saturationPct: null };
}

function emptyModel(sourceStatus: PlatformSourceStatus, sampledAt: string): PlatformHealthModel {
  return {
    dbUp: null,
    cpuPct: null,
    memoryPct: null,
    connectionsUsed: null,
    connectionsMax: null,
    poolSaturationPct: null,
    walOrReplicationLagSeconds: null,
    ioPressure: null,
    dbSizeBytes: null,
    autovacuumOrBloatSignal: null,
    postgrestPool: emptyPool(),
    authPool: emptyPool(),
    realtimeSubscriptions: null,
    sampledAt,
    sourceStatus,
  };
}

// ---------------------------------------------------------------------------
// Prometheus exposition-format parser — generic, allow-list applied by caller
// ---------------------------------------------------------------------------

export interface PrometheusSample {
  name: string;
  labels: Readonly<Record<string, string>>;
  value: number;
}

const SAMPLE_LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(\S+)(?:\s+\d+)?$/;
const LABEL_PAIR_RE = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/** Parses the Prometheus text exposition format into samples. Comment lines
 *  (`# HELP` / `# TYPE`) and blank lines are skipped; a line that doesn't
 *  match the sample grammar is skipped rather than throwing — one malformed
 *  line must never take down the whole parse. Returns `null` only when NO
 *  line in the whole body matched the sample grammar at all (the
 *  "unparseable" case — the body probably isn't Prometheus text, e.g. an
 *  HTML error page from a gateway that failed before reaching the origin,
 *  the exact failure mode `describe-error.ts`'s header documents for a
 *  different endpoint). */
export function parsePrometheusText(text: string): PrometheusSample[] | null {
  const samples: PrometheusSample[] = [];
  let matchedAnyLine = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const match = SAMPLE_LINE_RE.exec(line);
    if (!match) continue;
    matchedAnyLine = true;
    const [, name, labelBlock, rawValue] = match;
    if (name === undefined || rawValue === undefined) continue; // regex groups 1 and 3 are mandatory; guard for noUncheckedIndexedAccess
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const labels: Record<string, string> = {};
    if (labelBlock) {
      const inner = labelBlock.slice(1, -1);
      LABEL_PAIR_RE.lastIndex = 0;
      let labelMatch: RegExpExecArray | null;
      while ((labelMatch = LABEL_PAIR_RE.exec(inner))) {
        const key = labelMatch[1];
        const val = labelMatch[2];
        if (key === undefined || val === undefined) continue;
        labels[key] = val.replace(/\\"/g, '"');
      }
    }
    samples.push({ name, labels, value });
  }
  return matchedAnyLine ? samples : null;
}

// ---------------------------------------------------------------------------
// Allow-listed metric names — see the module header for provenance
// ---------------------------------------------------------------------------

export const PLATFORM_METRIC_ALLOW_LIST = [
  'pg_up',
  'pg_database_size_bytes',
  'pg_stat_database_num_backends',
  'connection_stats_connection_count',
  'max_connections_connection_count',
  'node_memory_MemTotal_bytes',
  'node_memory_MemAvailable_bytes',
  'node_cpu_seconds_total',
  'physical_replication_lag_physical_replication_lag_seconds',
  'pg_stat_replication_replay_lag',
  'pgrst_db_pool_max',
  'pgrst_db_pool_available',
  'realtime_postgres_changes_total_subscriptions',
] as const;

const ALLOW_LIST_SET: ReadonlySet<string> = new Set(PLATFORM_METRIC_ALLOW_LIST);

function firstValue(samples: readonly PrometheusSample[], name: string): number | null {
  const found = samples.find((s) => s.name === name);
  return found ? found.value : null;
}

// ---------------------------------------------------------------------------
// Pure derivation — unit-testable independent of any live fetch
// ---------------------------------------------------------------------------

export interface CpuDeltaInput {
  /** Sum of `node_cpu_seconds_total` across every series NOT labeled
   *  `mode="idle"` — i.e. total busy CPU-seconds since process start. */
  busySecondsCumulative: number;
  sampledAtMs: number;
}

/** Rate-based CPU percentage from two cumulative-counter scrapes — brief
 *  §16's "never treat totals as a rate" rule, applied to CPU. `null` when
 *  there is no prior sample (first scrape after a cold start), the interval
 *  is non-positive (clock skew, duplicate scrape), or the counter went
 *  backwards (a counter reset — never reported as a negative percentage).
 *  Clamped to [0, 100]: a single-core busy-second delta should never exceed
 *  one wall-clock second per wall-clock second, but a multi-series sum with
 *  an unverified label shape (see module header) could overshoot, and an
 *  overshoot must degrade to "fully saturated", never to a nonsensical
 *  >100% reading. */
export function computeCpuPct(current: CpuDeltaInput, previous: CpuDeltaInput | null): number | null {
  if (!previous) return null;
  const intervalSeconds = (current.sampledAtMs - previous.sampledAtMs) / 1000;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return null;
  const busyDelta = current.busySecondsCumulative - previous.busySecondsCumulative;
  if (!Number.isFinite(busyDelta) || busyDelta < 0) return null; // counter reset
  const pct = (busyDelta / intervalSeconds) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function computeMemoryPct(memTotalBytes: number | null, memAvailableBytes: number | null): number | null {
  if (memTotalBytes === null || memAvailableBytes === null) return null;
  if (!Number.isFinite(memTotalBytes) || memTotalBytes <= 0) return null;
  if (!Number.isFinite(memAvailableBytes) || memAvailableBytes < 0) return null;
  const pct = (1 - memAvailableBytes / memTotalBytes) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function computePoolReading(used: number | null, max: number | null): PoolReading {
  const saturationPct =
    used !== null && max !== null && Number.isFinite(used) && Number.isFinite(max) && max > 0
      ? Math.max(0, Math.min(100, (used / max) * 100))
      : null;
  return { used, max, saturationPct };
}

/** Builds the typed model from parsed samples plus the prior scrape's CPU
 *  counter (for the rate calculation). Pure — no I/O. */
export function buildPlatformHealthModel(
  samples: readonly PrometheusSample[],
  sampledAtIso: string,
  sampledAtMs: number,
  previousCpu: CpuDeltaInput | null,
): { model: PlatformHealthModel; currentCpu: CpuDeltaInput | null } {
  const dbUpRaw = firstValue(samples, 'pg_up');
  const dbUp: 0 | 1 | null = dbUpRaw === 0 || dbUpRaw === 1 ? dbUpRaw : null;

  const cpuSeries = samples.filter((s) => s.name === 'node_cpu_seconds_total' && s.labels.mode !== 'idle');
  const busySecondsCumulative = cpuSeries.length > 0 ? cpuSeries.reduce((sum, s) => sum + s.value, 0) : null;
  const currentCpu: CpuDeltaInput | null = busySecondsCumulative !== null ? { busySecondsCumulative, sampledAtMs } : null;
  const cpuPct = currentCpu ? computeCpuPct(currentCpu, previousCpu) : null;

  const memTotal = firstValue(samples, 'node_memory_MemTotal_bytes');
  const memAvailable = firstValue(samples, 'node_memory_MemAvailable_bytes');
  const memoryPct = computeMemoryPct(memTotal, memAvailable);

  const connectionsUsed = firstValue(samples, 'connection_stats_connection_count') ?? firstValue(samples, 'pg_stat_database_num_backends');
  const connectionsMax = firstValue(samples, 'max_connections_connection_count');
  const poolSaturationPct =
    connectionsUsed !== null && connectionsMax !== null && connectionsMax > 0
      ? Math.max(0, Math.min(100, (connectionsUsed / connectionsMax) * 100))
      : null;

  const walOrReplicationLagSeconds =
    firstValue(samples, 'physical_replication_lag_physical_replication_lag_seconds') ??
    firstValue(samples, 'pg_stat_replication_replay_lag');

  const dbSizeBytes = firstValue(samples, 'pg_database_size_bytes');

  const postgrestPool = computePoolReading(
    firstValue(samples, 'pgrst_db_pool_max') !== null && firstValue(samples, 'pgrst_db_pool_available') !== null
      ? (firstValue(samples, 'pgrst_db_pool_max') as number) - (firstValue(samples, 'pgrst_db_pool_available') as number)
      : null,
    firstValue(samples, 'pgrst_db_pool_max'),
  );

  const realtimeSubscriptions = firstValue(samples, 'realtime_postgres_changes_total_subscriptions');

  return {
    model: {
      dbUp,
      cpuPct,
      memoryPct,
      connectionsUsed,
      connectionsMax,
      poolSaturationPct,
      walOrReplicationLagSeconds,
      ioPressure: null,
      dbSizeBytes,
      autovacuumOrBloatSignal: null,
      postgrestPool,
      authPool: emptyPool(),
      realtimeSubscriptions,
      sampledAt: sampledAtIso,
      sourceStatus: 'ok',
    },
    currentCpu,
  };
}

// ---------------------------------------------------------------------------
// Fetch — 60s cache, 5s timeout
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

let cachedModel: PlatformHealthModel | null = null;
let cachedAtMs = 0;
let lastCpu: CpuDeltaInput | null = null;

function resolveProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

/** Test-only hook — clears the module-level cache between test cases. Not
 *  exported from the package's public surface via any barrel; imported
 *  directly by the test file, same convention as other server-only modules
 *  with in-memory state in this repo. */
export function __resetPlatformMetricsCacheForTests(): void {
  cachedModel = null;
  cachedAtMs = 0;
  lastCpu = null;
}

export async function fetchSupabasePlatformMetrics(nowMs: number = Date.now()): Promise<PlatformHealthModel> {
  if (cachedModel && nowMs - cachedAtMs < CACHE_TTL_MS) {
    return cachedModel;
  }

  const projectRef = resolveProjectRef();
  const credential = getServiceRoleKey();
  const sampledAtIso = new Date(nowMs).toISOString();

  if (!projectRef || !credential) {
    const model = emptyModel('unconfigured', sampledAtIso);
    cachedModel = model;
    cachedAtMs = nowMs;
    return model;
  }

  try {
    const basicAuth = Buffer.from(`service_role:${credential}`).toString('base64');
    const res = await fetch(`https://${projectRef}.supabase.co/customer/v1/privileged/metrics`, {
      headers: { Authorization: `Basic ${basicAuth}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      const model = emptyModel('unreachable', sampledAtIso);
      cachedModel = model;
      cachedAtMs = nowMs;
      return model;
    }

    const text = await res.text();
    const parsed = parsePrometheusText(text);
    if (parsed === null) {
      const model = emptyModel('unparseable', sampledAtIso);
      cachedModel = model;
      cachedAtMs = nowMs;
      return model;
    }

    const allowListed = parsed.filter((s) => ALLOW_LIST_SET.has(s.name));
    const { model, currentCpu } = buildPlatformHealthModel(allowListed, sampledAtIso, nowMs, lastCpu);
    lastCpu = currentCpu;
    cachedModel = model;
    cachedAtMs = nowMs;
    return model;
  } catch {
    // Network failure, timeout, or anything else — fail open to
    // 'unreachable', never throw into a caller that may not be prepared to
    // catch (the health-sampler cron, in particular, must not fail its own
    // job run because the platform metrics fetch failed).
    const model = emptyModel('unreachable', sampledAtIso);
    cachedModel = model;
    cachedAtMs = nowMs;
    return model;
  }
}
