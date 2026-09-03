import 'server-only';

/**
 * On-demand Supabase log evidence — brief §32. NO CONTINUOUS INGESTION.
 *
 * Disabled by default (`HELM_SUPABASE_LOG_EVIDENCE_ENABLED !== 'true'`
 * returns `UNKNOWN_MANUAL` before touching the network at all). When
 * enabled, one bounded query against the Management API's log-query
 * endpoint — `GET /v1/projects/{ref}/analytics/endpoints/logs`, confirmed
 * via `https://supabase.com/docs/reference/api/v1-get-project-logs`
 * (fetched 2026-09-03): `sql`, `iso_timestamp_start`, `iso_timestamp_end`
 * query params, Bearer `SUPABASE_ACCESS_TOKEN`, a documented 24h max window
 * (this module never asks for more than 10 minutes — `windowMinutes` is
 * clamped to <= 5 each side of `centerAt`), and a documented `402` status
 * code, which this module treats as a hard stop ("OWNER ACTION REQUIRED —
 * COST"), never a silent retry.
 *
 * SOURCE TABLE MAPPING IS BEST-EFFORT, NOT LIVE-VERIFIED. The Logs guide
 * (`https://supabase.com/docs/guides/telemetry/logs.md`, same fetch date)
 * names the ClickHouse sources (`auth_logs`, `edge_logs`,
 * `function_edge_logs`, `function_logs`, `postgres_logs`, `realtime_logs`,
 * `storage_logs`) but there is no separate `postgrest_logs` source —
 * `docs/observability/SENTRY_SUPABASE_TRACING.md` groups "API Gateway logs
 * (PostgREST, Auth, Storage, Realtime)" together, which is why PostgREST
 * maps to `edge_logs` here rather than a table that does not exist.
 * `resolveLogSource` is exported and tested so this mapping is easy to
 * correct once someone runs a real query against a live project.
 *
 * SANITIZATION IS MANDATORY, NOT OPTIONAL. Every returned line is routed
 * through `sanitizeSupabaseFreeText` (the exact redaction `db_error_events`
 * uses — see `envelope.ts`'s header) before it leaves this module; the raw
 * API response is discarded once the bounded timeline is built. At most 40
 * lines survive per call, matching the brief's "<= 40-line timeline
 * summary".
 */
import { sanitizeSupabaseFreeText, type SupabaseService } from './envelope';
import { describeError } from '@/lib/utils/describe-error';

export type LogEvidenceStatus = 'ok' | 'UNKNOWN_MANUAL' | 'error';

export interface LogEvidenceRequest {
  service: SupabaseService;
  /** Free-text trace/request id to filter by, when known. Passed through a
   *  parameterized value, never interpolated unescaped into SQL. */
  traceId?: string | null;
  /** ISO-8601 — the window is centered on this instant. */
  centerAt: string;
  /** Clamped to [1, 5] — half-width in minutes on EACH side of `centerAt`,
   *  so the true window is at most 10 minutes, well inside the Management
   *  API's documented 24h ceiling and this feature's own "±2–5 minute
   *  window" spec (brief §32). */
  windowMinutes: number;
}

export interface LogEvidenceResult {
  status: LogEvidenceStatus;
  reason?: string;
  /** Present only when `status === 'ok'`. Sanitized, <= 40 lines. */
  timeline?: string[];
}

const LOG_SOURCE_BY_SERVICE: Readonly<Record<SupabaseService, string>> = {
  postgrest: 'edge_logs', // no dedicated postgrest_logs source — see header
  postgres: 'postgres_logs',
  auth: 'auth_logs',
  storage: 'storage_logs',
  realtime: 'realtime_logs',
  edge_function: 'function_edge_logs',
  pg_cron: 'postgres_logs', // pg_cron runs inside Postgres — no separate source
  pg_net: 'postgres_logs', // same reasoning as pg_cron
};

/** Pure — exported so the source mapping can be corrected/tested without a
 *  live fetch. Throws only for a service outside the closed union, which
 *  TypeScript already prevents at the call site. */
export function resolveLogSource(service: SupabaseService): string {
  const source = LOG_SOURCE_BY_SERVICE[service];
  if (!source) throw new Error(`No log source mapping for service "${service}"`);
  return source;
}

/** Escapes a single quote for embedding inside a single-quoted SQL string
 *  literal — the ONLY untrusted input this module ever places in SQL text
 *  (the Management API log endpoint has no parameterized-query form). Never
 *  used for anything that reaches a real Postgres connection — this SQL runs
 *  against the read-only ClickHouse-backed Logs endpoint only. */
function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/** Pure — builds the bounded SQL this module sends to the Logs endpoint.
 *  Exported for tests. Always `order by timestamp desc limit 40` — this
 *  module never asks for more rows than it will keep. */
export function buildLogEvidenceSql(service: SupabaseService, traceId: string | null): string {
  const source = resolveLogSource(service);
  const base = `select id, timestamp, event_message from ${source}`;
  if (traceId && traceId.trim().length > 0) {
    return `${base} where event_message like '%${escapeSqlLiteral(traceId.trim())}%' order by timestamp desc limit 40`;
  }
  return `${base} order by timestamp desc limit 40`;
}

function clampWindowMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 5;
  return Math.max(1, Math.min(5, Math.round(minutes)));
}

interface RawLogRow {
  id?: unknown;
  timestamp?: unknown;
  event_message?: unknown;
}

/** Pure — one raw log row -> one sanitized timeline line. Exported for
 *  tests. Never includes any field but `timestamp` and the sanitized
 *  message — an `id` (often an opaque ClickHouse row id) carries no
 *  diagnostic value and is dropped. */
export function summarizeLogRow(row: RawLogRow): string {
  const ts = typeof row.timestamp === 'string' || typeof row.timestamp === 'number' ? String(row.timestamp) : 'unknown-time';
  const message = typeof row.event_message === 'string' ? row.event_message : '';
  const safe = sanitizeSupabaseFreeText(message) ?? '[message unavailable]';
  return `${ts} — ${safe}`;
}

function resolveProjectRef(): string | null {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

const MAX_TIMELINE_LINES = 40;

/**
 * Fetches one bounded, sanitized log evidence timeline. Never scheduled —
 * every caller of this function must be a human-triggered action (the
 * server action + form on `/admin/database`), never a cron route. Fails
 * open to `UNKNOWN_MANUAL`/`error` — never throws.
 */
export async function fetchSupabaseLogEvidence(request: LogEvidenceRequest): Promise<LogEvidenceResult> {
  if (process.env.HELM_SUPABASE_LOG_EVIDENCE_ENABLED !== 'true') {
    return {
      status: 'UNKNOWN_MANUAL',
      reason: 'Log evidence fetching is disabled by default (set HELM_SUPABASE_LOG_EVIDENCE_ENABLED=true to enable).',
    };
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = resolveProjectRef();
  if (!token || !projectRef) {
    return { status: 'UNKNOWN_MANUAL', reason: 'SUPABASE_ACCESS_TOKEN (and SUPABASE_PROJECT_REF/NEXT_PUBLIC_SUPABASE_URL) not configured.' };
  }

  const centerMs = Date.parse(request.centerAt);
  if (!Number.isFinite(centerMs)) {
    return { status: 'error', reason: `centerAt is not a valid ISO timestamp: ${request.centerAt}` };
  }

  const windowMinutes = clampWindowMinutes(request.windowMinutes);
  const startIso = new Date(centerMs - windowMinutes * 60_000).toISOString();
  const endIso = new Date(centerMs + windowMinutes * 60_000).toISOString();
  const sql = buildLogEvidenceSql(request.service, request.traceId ?? null);

  try {
    const url = new URL(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs`);
    url.searchParams.set('sql', sql);
    url.searchParams.set('iso_timestamp_start', startIso);
    url.searchParams.set('iso_timestamp_end', endIso);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 402) {
      return { status: 'error', reason: 'OWNER ACTION REQUIRED — COST: Supabase Logs endpoint returned 402 Payment Required.' };
    }
    if (!res.ok) {
      return { status: 'error', reason: `Logs endpoint returned HTTP ${res.status}` };
    }

    const body = (await res.json()) as { result?: unknown; error?: unknown };
    if (body.error) {
      return { status: 'error', reason: typeof body.error === 'string' ? body.error : 'Logs endpoint returned an error field' };
    }

    const rows = Array.isArray(body.result) ? (body.result as RawLogRow[]) : [];
    const timeline = rows.slice(0, MAX_TIMELINE_LINES).map(summarizeLogRow);
    // The raw `body`/`rows` go out of scope here — nothing beyond `timeline`
    // (already sanitized, already bounded) survives this function call.
    return { status: 'ok', timeline };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}
