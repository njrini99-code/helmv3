import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { type AdminFailure, buildIngest, type BridgeColumns } from '@/lib/admin/clubhouse/ingest';
import { INGEST_V1, INGEST_V2, noteV2Missing, tryRoutesAt } from '@/lib/admin/clubhouse/ingest-version';
import { stampReport } from '@/lib/admin/clubhouse/report-stamp';
import { type ChSignal, parseSignalBatch, redactSignal } from '@/lib/admin/clubhouse/signal';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { logServerError } from '@/lib/server-error-logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getRuntimeEnv, shouldPersistAdminTables } from '@/lib/telemetry-gate';
import { describeError } from '@/lib/utils/describe-error';

/**
 * POST /api/ch/signal: the Clubhouse signal pipe (Bridge plan §4.4).
 *
 * Clubhouse pages queue signal envelopes (src/clubhouse/lib/signal.ts) and post them here in batches: every 10 s, at 20
 * envelopes, and with sendBeacon when the page is hidden. The route
 *
 * 1. does nothing while the `clubhouse_signals` kill switch is off (204);
 * 2. answers only a signed-in caller from this site (Sec-Fetch-Site / Origin): Clubhouse is a signed-in surface, so an
 *    anonymous or cross-site post stores nothing (security review of #2611, H1 and L3);
 * 3. holds three durable limits (Upstash through checkRateLimit): 30 batches a minute per IP, 12 a minute per user (the
 *    user is the server's, never the client's session id), and a global budget; in production it stores nothing when the
 *    limiter has fallen back to its per-instance memory;
 * 3. parses the batch, dropping and counting what doesn't fit (signal.ts), and redacts free text as /api/log-error does;
 * 4. resolves each envelope against the graph this deploy was built with and builds one ingest call per session
 *    (ingest.ts), sent to `clubhouse_ingest_signals_v2` through the service role (or the first function while v2 is
 *    held, ingest-version.ts);
 * 5. writes a failure nobody reported yet as an `admin_events` row, and stamps the Bridge columns on the row a failure
 *    `chReport` already wrote (report-stamp.ts; when the report lands after the signal, /api/log-error stamps it).
 *
 * Until the held migration 20261124090000 is applied, the ingest function doesn't exist: the route says
 * `persisted: false` and still writes failures to `admin_events` without the new columns. The hourly rows split by
 * screen only through `clubhouse_ingest_signals_v2` (the held route migration 20261128090000): until it exists, the
 * route builds the plan again without screens and sends it to the first function, so nothing is lost meanwhile.
 *
 * Sending never fails a tap: the client never awaits this, and it ignores the answer.
 */
export const dynamic = 'force-dynamic';

const SIGNAL_IP_LIMIT = { maxAttempts: 30, windowMs: 60_000 };
const SIGNAL_USER_LIMIT = { maxAttempts: 12, windowMs: 60_000 };
/** Backstop across every caller: about 300 active tabs at one flush every 10 s. */
const SIGNAL_GLOBAL_LIMIT = { maxAttempts: 1_800, windowMs: 60_000 };
/** A batch stamps at most as many reported rows as it may write new ones (ingest.ts MAX_ADMIN_ROWS_PER_BATCH). */
const MAX_STAMPS_PER_BATCH = 5;
/** A batch is at most 50 envelopes plus 50 of context, each a few hundred bytes; sendBeacon itself stops at 64 KB. */
const MAX_BODY_BYTES = 256 * 1024;
/** One batch is one tab's; more sessions than this in one post is not a Clubhouse page. */
const MAX_SESSIONS_PER_BATCH = 3;
// The function isn't there: not in PostgREST's schema cache (the migration is held), or dropped since the cache was
// read (a rolled-back migration, before the cache reloads). A column isn't there (same).
const FUNCTION_MISSING = new Set(['PGRST202', '42883']);
const COLUMN_MISSING = new Set(['PGRST204', '42703']);

type DbError = { code?: string; message?: string } | null;

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** sendBeacon posts are CORS-simple requests: only this site's own pages may send them. */
export function isSameSite(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('origin');
  if (!origin) return true; // Older WebKit and the iOS shell send neither on a same-origin beacon.
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function tooMany(resetAt: number) {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } },
  );
}

function adminRow(f: AdminFailure, user: { id: string; email?: string | null } | null) {
  const s = f.signal;
  const fingerprint = buildIncidentSignature({ severity: f.severity, errorCode: f.code || null, route: null, message: f.title });
  return {
    event_type: 'error',
    title: f.title,
    severity: f.severity,
    message: s.message ?? f.title,
    source: 'client',
    sport: 'golf',
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    fingerprint,
    metadata: {
      source: 'client',
      runtime: 'browser',
      ui: 'clubhouse',
      sport: 'golf',
      errorCode: f.code || null,
      action: s.act ?? null,
      runtimeEnv: getRuntimeEnv(),
      context: { ui: 'clubhouse', surface: s.surface ?? null, action: s.act ?? null, anonymous: !user },
      bridge: {
        code: f.code || null,
        sentCode: s.code ?? null,
        bridgeId: f.resolved.bridgeId,
        page: s.page,
        actionId: f.resolved.actionId,
        control: s.control ?? null,
        kind: s.kind,
        outcome: s.outcome ?? null,
        drift: f.resolved.drift,
        role: s.role,
        release: s.release,
        platform: s.platform,
        viewport: s.viewport,
        online: s.online,
        sessionId: s.sessionId,
        seq: s.seq,
        serverCode: s.serverCode ?? null,
        durationMs: s.durationMs ?? null,
        trail: s.trail ?? [],
        sentryEventId: s.sentryEventId ?? null,
        replayId: s.replayId ?? null,
      },
    },
  };
}

async function insertAdminRows(db: SupabaseClient, rows: AdminFailure[], user: { id: string; email?: string | null } | null): Promise<{ written: number; columns: boolean }> {
  if (rows.length === 0) return { written: 0, columns: true };
  const withColumns = rows.map((f) => ({ ...adminRow(f, user), ...f.columns }));
  const first = await db.from('admin_events').insert(withColumns);
  if (!first.error) return { written: rows.length, columns: true };
  if (!COLUMN_MISSING.has((first.error as DbError)?.code ?? '')) throw first.error;
  // The held migration hasn't added the columns yet: the Bridge fields still travel in metadata.bridge.
  const second = await db.from('admin_events').insert(rows.map((f) => adminRow(f, user)));
  if (second.error) throw second.error;
  return { written: rows.length, columns: false };
}

async function stampReported(db: SupabaseClient, userId: string, stamps: { sessionId: string; seq: number; columns: BridgeColumns }[]): Promise<number> {
  let stamped = 0;
  // Only the caller's own rows, and no more than a batch may write: a known session id can't restamp someone else's row.
  for (const { sessionId, seq, columns } of stamps.slice(0, MAX_STAMPS_PER_BATCH)) stamped += await stampReport(db, userId, { sessionId, seq }, columns);
  return stamped;
}

export async function POST(request: NextRequest) {
  if (!isFlagEnabled('clubhouse_signals', { skipTelemetry: true })) return new NextResponse(null, { status: 204 });

  if (!isSameSite(request)) return new NextResponse(null, { status: 204 });

  const ipLimit = await checkRateLimit(`ch-signal:ip:${clientIp(request)}`, SIGNAL_IP_LIMIT);
  if (!ipLimit.allowed) return tooMany(ipLimit.resetAt);
  // A per-instance count bounds nothing on serverless: in production, store nothing rather than trust it.
  if (!ipLimit.durable && shouldPersistAdminTables()) return new NextResponse(null, { status: 204 });

  // Clubhouse is signed in: an anonymous post writes no rows, sessions or counts (the server's user, never the client's).
  let user: { id: string; email?: string | null } | null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  } catch {
    user = null;
  }
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  // sendBeacon flushes can arrive empty or cut short: read text first so they cost a cheap answer, not a 500.
  const raw = await request.text();
  if (!raw.trim()) return new NextResponse(null, { status: 204 });
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'Batch too large' }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const batch = parseSignalBatch(body);
  if (!batch.ok) return NextResponse.json({ error: 'Invalid batch', reason: batch.reason }, { status: 400 });
  if (batch.signals.length === 0) return NextResponse.json({ accepted: 0, dropped: batch.dropped, persisted: false }, { status: 202 });

  const sessionIds = [...new Set(batch.signals.map((s) => s.sessionId))];
  if (sessionIds.length > MAX_SESSIONS_PER_BATCH) return NextResponse.json({ error: 'Invalid batch', reason: 'too-many-sessions' }, { status: 400 });
  const userLimit = await checkRateLimit(`ch-signal:user:${user.id}`, SIGNAL_USER_LIMIT);
  if (!userLimit.allowed) return tooMany(userLimit.resetAt);
  const globalLimit = await checkRateLimit('ch-signal:global', SIGNAL_GLOBAL_LIMIT);
  if (!globalLimit.allowed) return tooMany(globalLimit.resetAt);

  const accepted = batch.signals.length;
  // Off-prod runtimes hold production Supabase credentials: their signals must not land in the production Bridge.
  if (!shouldPersistAdminTables()) return NextResponse.json({ accepted, dropped: batch.dropped, persisted: false }, { status: 202 });

  try {
    const graph = loadBridgeGraph();
    if (!graph) {
      await logServerError('Clubhouse signal route: the Bridge graph is missing from this deploy', {
        action: 'clubhouse.signal.ingest',
        route: '/api/ch/signal',
        errorCode: 'bridge_graph_missing',
        skipSentry: false,
      });
      return NextResponse.json({ accepted, dropped: batch.dropped, persisted: false, reason: 'graph-missing' }, { status: 202 });
    }

    let redactionFailed = false;
    const onRedactionError = () => {
      redactionFailed = true;
    };
    const redact = (list: ChSignal[]) => list.map((s) => redactSignal(s, onRedactionError));
    const ingestInput = {
      signals: redact(batch.signals),
      context: redact(batch.context),
      ended: batch.ended,
      graph,
      userId: user.id,
      now: Date.now(),
      serverRelease: process.env.NEXT_PUBLIC_SENTRY_RELEASE || null,
    };
    let routes = tryRoutesAt(Date.now());
    let plan = buildIngest({ ...ingestInput, routes });
    if (redactionFailed) Sentry.captureMessage('Clubhouse signal route: redaction fell back to a placeholder', { level: 'warning', tags: { component: 'ch-signal-route' } });

    // The ingest function and admin_events don't share a transaction: counts are best-effort telemetry, a failure row
    // is the one store incidents read, and neither waits on the other.
    const db = createAdminClient() as unknown as SupabaseClient;
    // Failure rows first: they are the incident record, so a counts call the database rejects can't take them with it.
    const admin = await insertAdminRows(db, plan.adminRows, user);
    let held = false;
    for (let i = 0; i < plan.sessions.length; i += 1) {
      const fn = routes ? INGEST_V2 : INGEST_V1;
      const { error } = await db.rpc(fn, { p_batch: plan.sessions[i] });
      if (!error) continue;
      if (FUNCTION_MISSING.has((error as DbError)?.code ?? '') && routes) {
        // The route migration is held: the same batch, without screens, to the first function. A session v2 already
        // stored is not sent again (v2 stores a whole session or none of it).
        noteV2Missing(Date.now());
        routes = false;
        plan = buildIngest({ ...ingestInput, routes });
        i -= 1;
        continue;
      }
      if (FUNCTION_MISSING.has((error as DbError)?.code ?? '')) {
        held = true;
        break;
      }
      Sentry.captureException(error, { tags: { component: 'ch-signal-route', step: 'ingest' } });
    }

    const stamped = held || !admin.columns ? 0 : await stampReported(db, user.id, plan.stamps);

    return NextResponse.json(
      {
        accepted,
        dropped: batch.dropped,
        persisted: !held,
        failures: plan.adminRows.length,
        capped: plan.adminCapped,
        stamped,
      },
      { status: 202 },
    );
  } catch (error) {
    // This is an error pipe: a failure here has no Clubhouse-side logger to fall back on.
    console.error('[ch-signal route] Failed to store a signal batch', describeError(error));
    Sentry.captureException(error, { tags: { component: 'ch-signal-route' } });
    return NextResponse.json({ accepted, persisted: false }, { status: 500 });
  }
}
