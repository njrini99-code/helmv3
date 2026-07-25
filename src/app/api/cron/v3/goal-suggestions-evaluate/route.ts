/**
 * v3 goal-suggestion evaluator cron — GET/POST /api/cron/v3/goal-suggestions-evaluate
 *
 * Flips any pending/snoozed `golf_goal_suggestions` row whose `expires_at`
 * is in the past to `state='expired'`. Runs daily an hour after the
 * writer so freshly inserted rows aren't immediately considered for
 * expiry (their default TTL is 14 days).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: daily 04:20 UTC (configured in vercel.json).
 *
 * Spec: docs/v3-master-plan.md Part VI.5 ("Engine suggestions" — 14-day TTL).
 * Follow-up row: docs/v3-wave-sequence.md W19.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { runSuggestionEvaluator } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-goal-suggestions-evaluate', () => handle());
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-goal-suggestions-evaluate', () => handle());
}

async function handle(): Promise<NextResponse> {
  const supabase = createAdminClient();
  try {
    const result = await runSuggestionEvaluator(supabase);
    if (result.error) {
      await logServerError(`goal-suggestions-evaluate: ${result.error}`, {
        action: 'cron.v3.goal-suggestions-evaluate',
      });
      return NextResponse.json(result, { status: 200 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logServerError(`goal-suggestions-evaluate exception: ${msg}`, {
      action: 'cron.v3.goal-suggestions-evaluate',
    });
    return NextResponse.json(
      { expired: 0, duration_ms: 0, error: msg },
      { status: 500 },
    );
  }
}
