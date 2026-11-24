import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { type AdminFailure, buildIngest, type BridgeColumns } from '@/lib/admin/clubhouse/ingest';
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
 * 2. holds two durable limits (Upstash through checkRateLimit): 30 batches a minute per IP, and 12 a minute per session,
 *    which at the client's 20 per flush is the plan's 240 envelopes a minute;
 * 3. parses the batch, dropping and counting what doesn't fit (signal.ts), and redacts free text as /api/log-error does;
 * 4. resolves each envelope against the graph this deploy was built with and builds one ingest call per session
 *    (ingest.ts), sent to `clubhouse_ingest_signals` through the service role;
 * 5. writes a failure nobody reported yet as an `admin_events` row, and stamps the Bridge columns on the row a failure
 *    `chReport` already wrote.
 *
 * Until the held migration 20261124090000 is applied, the ingest function doesn't exist: the route says
 * `persisted: false` and still writes failures to `admin_events` without the new columns.
 *
 * Sending never fails a tap: the client never awaits this, and it ignores the answer.
 */
export const dynamic = 'force-dynamic';

const SIGNAL_IP_LIMIT = { maxAttempts: 30, windowMs: 60_000 };
const SIGNAL_SESSION_LIMIT = { maxAttempts: 12, windowMs: 60_000 };
/** A batch is at most 50 envelopes plus 50 of context, each a few hundred bytes; sendBeacon itself stops at 64 KB. */
const MAX_BODY_BYTES = 256 * 1024;
/** One batch is one tab's; more sessions than this in one post is not a Clubhouse page. */
const MAX_SESSIONS_PER_BATCH = 3;
/** How far back a stamp looks for the row `chReport` wrote. */
const STAMP_WINDOW_MS = 15 * 60_000;

// PostgREST: the function isn't in the schema cache (the migration is held); a column isn't (same).
const FUNCTION_MISSING = 'PGRST202';
const COLUMN_MISSING = new Set(['PGRST204', '42703']);

type DbError = { code?: string; message?: string } | null;

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
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

async function stampReported(db: SupabaseClient, stamps: { sessionId: string; seq: number; columns: BridgeColumns }[]): Promise<number> {
  const since = new Date(Date.now() - STAMP_WINDOW_MS).toISOString();
  let stamped = 0;
  for (const { sessionId, seq, columns } of stamps) {
    const { error, count } = await db
      .from('admin_events')
      .update(columns, { count: 'exact' })
      .eq('source', 'client')
      .eq('metadata->context->chSignal->>sessionId', sessionId)
      .eq('metadata->context->chSignal->>seq', String(seq))
      .is('ch_code', null)
      .gte('created_at', since);
    if (error) throw error;
    stamped += count ?? 0;
  }
  return stamped;
}

export async function POST(request: NextRequest) {
  if (!isFlagEnabled('clubhouse_signals', { skipTelemetry: true })) return new NextResponse(null, { status: 204 });

  const ipLimit = await checkRateLimit(`ch-signal:ip:${clientIp(request)}`, SIGNAL_IP_LIMIT);
  if (!ipLimit.allowed) return tooMany(ipLimit.resetAt);

  // sendBeacon flushes can arrive empty or cut short: read text first so they cost a cheap answer, not a 500.
  const raw = await request.text();
  if (!raw.trim()) return new NextResponse(null, { status: 204 });
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Batch too large' }, { status: 413 });

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
  for (const sid of sessionIds) {
    const limit = await checkRateLimit(`ch-signal:session:${sid}`, SIGNAL_SESSION_LIMIT);
    if (!limit.allowed) return tooMany(limit.resetAt);
  }

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

    let user: { id: string; email?: string | null } | null = null;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      user = data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    } catch {
      user = null;
    }

    let redactionFailed = false;
    const onRedactionError = () => {
      redactionFailed = true;
    };
    const redact = (list: ChSignal[]) => list.map((s) => redactSignal(s, onRedactionError));
    const plan = buildIngest({
      signals: redact(batch.signals),
      context: redact(batch.context),
      ended: batch.ended,
      graph,
      userId: user?.id ?? null,
      now: Date.now(),
    });
    if (redactionFailed) Sentry.captureMessage('Clubhouse signal route: redaction fell back to a placeholder', { level: 'warning', tags: { component: 'ch-signal-route' } });

    // The ingest function and admin_events don't share a transaction: counts are best-effort telemetry, a failure row
    // is the one store incidents read, and neither waits on the other.
    const db = createAdminClient() as unknown as SupabaseClient;
    let held = false;
    for (const session of plan.sessions) {
      const { error } = await db.rpc('clubhouse_ingest_signals', { p_batch: session });
      if (!error) continue;
      if ((error as DbError)?.code === FUNCTION_MISSING) {
        held = true;
        break;
      }
      throw error;
    }

    const admin = await insertAdminRows(db, plan.adminRows, user);
    const stamped = held || !admin.columns ? 0 : await stampReported(db, plan.stamps);

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
