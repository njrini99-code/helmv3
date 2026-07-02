/**
 * v3 goal-suggestion writer cron — GET/POST /api/cron/v3/goal-suggestions-write
 *
 * Walks players with standing data and writes up to two `golf_goal_suggestions`
 * rows per player, targeting their weakest metrics that have drill coverage
 * and no pre-existing active goal / pending suggestion for the same metric.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: daily 03:30 UTC (configured in vercel.json) — runs before the
 * morning evaluator flips stale suggestions to 'expired'.
 *
 * Spec: docs/v3-master-plan.md Part VI.5 ("Engine suggestions").
 * Follow-up row: docs/v3-wave-sequence.md W19.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { runSuggestionWriter } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-goal-suggestions-write', () => handle());
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-goal-suggestions-write', () => handle());
}

async function handle(): Promise<NextResponse> {
  const supabase = createAdminClient();
  try {
    const result = await runSuggestionWriter(supabase);
    if (result.error) {
      await logServerError(`goal-suggestions-write: ${result.error}`, {
        action: 'cron.v3.goal-suggestions-write',
      });
      // Still return 200 with the structured payload so cron retries don't
      // double-write — the error is surfaced in the JSON body.
      return NextResponse.json(result, { status: 200 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logServerError(`goal-suggestions-write exception: ${msg}`, {
      action: 'cron.v3.goal-suggestions-write',
    });
    return NextResponse.json(
      {
        players_considered: 0,
        players_with_standings: 0,
        suggestions_inserted: 0,
        suggestions_expired: 0,
        per_player: [],
        duration_ms: 0,
        error: msg,
      },
      { status: 500 },
    );
  }
}
