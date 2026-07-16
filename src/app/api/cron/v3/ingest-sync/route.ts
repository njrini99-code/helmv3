/**
 * v3 auto-ingest sync cron — GET/POST /api/cron/v3/ingest-sync
 *
 * Walks every active connection across all providers and asks the
 * registered adapter to sync. Writes one golf_ingest_sync_log row
 * per attempt and updates connection.state per the result.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 *
 * Adapters report `isConfigured()=false` when their provider env vars
 * are missing — the cron logs that as a 0-row "skipped" entry rather
 * than an error so the sync log stays honest.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { getAdapter } from '@/lib/coachhelm/v3/ingest/registry';
import { nextConnectionState, INGEST_PROVIDERS } from '@/lib/coachhelm/v3/ingest/types';
import type { IngestConnection, IngestProvider } from '@/lib/coachhelm/v3/ingest/types';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface CronSummary {
  connections_considered: number;
  synced: number;
  skipped_unconfigured: number;
  errors: number;
  shots_inserted: number;
  rounds_inserted: number;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-ingest-sync', () => handle());
}
export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-ingest-sync', () => handle());
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const sb = createAdminClient();
  const summary: CronSummary = {
    connections_considered: 0,
    synced: 0,
    skipped_unconfigured: 0,
    errors: 0,
    shots_inserted: 0,
    rounds_inserted: 0,
    duration_ms: 0,
  };

  const { data: connections, error: connectionsErr } = await sb
    .from('golf_ingest_connections')
    .select('player_id, provider, access_token_encrypted, refresh_token_encrypted, expires_at, last_synced_at, state')
    .eq('state', 'active');
  if (connectionsErr) {
    // Not logged here: this route is wrapped in recordJobRun (job-log.ts),
    // which already writes a "Cron failed" Bridge event for any >=400
    // response — logging again here would double-write error_logs/
    // admin_events/Sentry for the same failure.
    return NextResponse.json(
      { success: false, error: connectionsErr.message, duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
  const rows = (connections ?? []) as Array<IngestConnection>;
  summary.connections_considered = rows.length;

  for (const conn of rows) {
    if (!INGEST_PROVIDERS.includes(conn.provider as IngestProvider)) continue;
    const adapter = getAdapter(conn.provider as IngestProvider);
    if (!adapter.isConfigured()) {
      summary.skipped_unconfigured += 1;
      await sb.from('golf_ingest_sync_log').insert({
        player_id: conn.player_id,
        provider: conn.provider,
        shots_inserted: 0,
        rounds_inserted: 0,
        errors_count: 0,
        error_detail: 'provider env unset — adapter skipped',
      });
      continue;
    }
    try {
      const result = await adapter.sync(conn);
      await sb.from('golf_ingest_sync_log').insert({
        player_id: conn.player_id,
        provider: conn.provider,
        shots_inserted: result.shots_inserted,
        rounds_inserted: result.rounds_inserted,
        errors_count: result.errors_count,
        error_detail: result.error_detail ?? null,
      });
      summary.shots_inserted += result.shots_inserted;
      summary.rounds_inserted += result.rounds_inserted;
      summary.errors += result.errors_count;
      summary.synced += 1;
      // Persist next state + last_synced_at.
      const nextState = nextConnectionState(conn.state, result);
      await sb
        .from('golf_ingest_connections')
        .update({
          state: nextState,
          last_synced_at: new Date().toISOString(),
        })
        .eq('player_id', conn.player_id)
        .eq('provider', conn.provider);
    } catch (err) {
      summary.errors += 1;
      await logServerError(
        `ingest-sync ${conn.provider}/${conn.player_id}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.v3.ingest-sync', source: 'cron' },
      );
      await sb.from('golf_ingest_sync_log').insert({
        player_id: conn.player_id,
        provider: conn.provider,
        shots_inserted: 0,
        rounds_inserted: 0,
        errors_count: 1,
        error_detail: err instanceof Error ? err.message : String(err),
      });
      await sb
        .from('golf_ingest_connections')
        .update({ state: 'error' })
        .eq('player_id', conn.player_id)
        .eq('provider', conn.provider);
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}
