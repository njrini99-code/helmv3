/**
 * v3 genome one-shot backfill — GET/POST /api/cron/v3/genome-backfill
 *
 * Runs the orchestrator for EVERY active team player in a single
 * invocation. Used once after the schema lands to seed the vector for
 * everyone; the nightly cron handles ongoing refresh after that.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { computeGenomeForPlayer } from '@/lib/coachhelm/v3/genome/orchestrator';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface BackfillSummary {
  total_players: number;
  computed: number;
  null_only: number;
  errors: number;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-genome-backfill-oneshot', () => handle());
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-genome-backfill-oneshot', () => handle());
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  const { data: members, error: membersErr } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('status', 'active');
  if (membersErr) {
    // Not logged here: this route is wrapped in recordJobRun (job-log.ts),
    // which already writes a "Cron failed" Bridge event for any >=400
    // response — logging again here would double-write error_logs/
    // admin_events/Sentry for the same failure.
    return NextResponse.json(
      { error: membersErr.message, duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
  const playerIds = Array.from(new Set((members ?? []).map((m) => m.player_id)));

  let computed = 0;
  let nullOnly = 0;
  let errors = 0;
  for (const pid of playerIds) {
    try {
      const r = await computeGenomeForPlayer(pid);
      if (r.errors > 0) errors += r.errors;
      if (r.dimensions_computed > 0) computed += 1;
      else nullOnly += 1;
    } catch (err) {
      errors += 1;
      await logServerError(
        `genome-backfill exception for ${pid}: ${describeError(err)}`,
        { action: 'cron.v3.genome-backfill', source: 'cron' },
      );
    }
  }

  const body = {
    total_players: playerIds.length,
    computed,
    null_only: nullOnly,
    errors,
    duration_ms: Date.now() - startedAt,
  } satisfies BackfillSummary;

  // Total failure: every player errored and nothing computed. A partial
  // failure (some computed, some errored) still returns 200 — the summary
  // body carries the error count for the caller to inspect.
  if (playerIds.length > 0 && errors > 0 && computed === 0) {
    // Not logged here: this route is wrapped in recordJobRun (job-log.ts),
    // which already writes a "Cron failed" Bridge event for any >=400
    // response — logging again here would double-write error_logs/
    // admin_events/Sentry for the same failure. Per-player exceptions are
    // still logged individually above, in the loop.
    return NextResponse.json(body, { status: 500 });
  }

  return NextResponse.json(body);
}
