/**
 * Standing dirty pass — GET/POST /api/cron/v3/standing-refresh-dirty (Clubhouse A+ rows 105 and 121).
 *
 * The nightly /api/cron/v3/standing-refresh refreshes the stalest teams once a day. A saved round marks its player's teams dirty
 * (`markTeamStandingDirty`, round-submit.ts); this pass, every five minutes, refreshes only those teams' season Standing
 * (`refresh_player_standing_season`), once each has been quiet for STANDING_DIRTY_QUIET_SECONDS (or dirty for
 * STANDING_DIRTY_MAX_WAIT_SECONDS), then clears the marks it covered. A round saved during the refresh keeps its team dirty:
 * a mark is cleared only if it was not renewed after this run read it.
 *
 * It does no more than that: no lifetime `golf_player_standing` refresh, no percentile notifications, no weekly digest and no goal
 * progress (all Fairway-visible, and the nightly run's). The season RPC takes a transaction advisory lock, so this pass and the
 * nightly run queue behind each other instead of deadlocking (40P01).
 *
 * An idle tick is one read. Until the held migrations are applied (20261024150000 for the queue, 20261024151000 for the season
 * RPC) the pass answers 200 and does nothing; marks stay in place until the season RPC exists.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. Schedule: vercel.json and src/lib/admin/cron-registry.ts.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { TEAMS_PER_CHUNK } from '@/lib/coachhelm/v3/standing/refresh';
import { isStandingQueueMissing, STANDING_DIRTY_MAX_WAIT_SECONDS, STANDING_DIRTY_QUIET_SECONDS } from '@/lib/coachhelm/v3/standing/refresh-queue';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface DirtyPassSummary {
  teams_in_chunk: number;
  team_ids: string[];
  rpc_rows: Array<{ metric_id: string; rows_upserted: number }>;
  marks_cleared: number;
  /** Why the pass did nothing: a held migration is not applied yet. */
  skipped?: 'queue-not-applied' | 'season-not-applied';
  duration_ms: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-standing-refresh-dirty', () => handle());
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-standing-refresh-dirty', () => handle());
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const summary = (rest: Partial<DirtyPassSummary>, status = 200) =>
    NextResponse.json({ teams_in_chunk: 0, team_ids: [], rpc_rows: [], marks_cleared: 0, ...rest, duration_ms: Date.now() - startedAt } satisfies DirtyPassSummary, { status });
  const supabase = createAdminClient();

  let dirty: Array<{ team_id: string; marked_at: string }>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the held migration's RPC is not in the generated types yet
    const res = await (supabase as any).rpc('select_dirty_standing_teams', {
      p_limit: TEAMS_PER_CHUNK,
      p_quiet_seconds: STANDING_DIRTY_QUIET_SECONDS,
      p_max_wait_seconds: STANDING_DIRTY_MAX_WAIT_SECONDS,
    });
    if (res.error) {
      if (isStandingQueueMissing(res.error)) return summary({ skipped: 'queue-not-applied' });
      await logServerError(`standing-refresh-dirty select: ${res.error.message ?? 'unknown'}`, { action: 'cron.v3.standing-refresh-dirty.select' });
      return summary({ error: 'select failed' }, 500);
    }
    dirty = (res.data ?? []) as Array<{ team_id: string; marked_at: string }>;
  } catch (err) {
    await logServerError(`standing-refresh-dirty select exception: ${describeError(err)}`, { action: 'cron.v3.standing-refresh-dirty.select' });
    return summary({ error: 'select exception' }, 500);
  }
  if (dirty.length === 0) return summary({});

  const teamIds = dirty.map((d) => d.team_id);
  let rpcRows: DirtyPassSummary['rpc_rows'];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the held migration's RPC is not in the generated types yet
    const res = await (supabase as any).rpc('refresh_player_standing_season', { p_team_ids: teamIds });
    if (res.error) {
      // The marks stay: the next tick (or, failing that, the nightly run) covers these teams.
      if (isStandingQueueMissing(res.error)) return summary({ teams_in_chunk: teamIds.length, team_ids: teamIds, skipped: 'season-not-applied' });
      await logServerError(`standing-refresh-dirty season RPC: ${res.error.message ?? 'unknown'}`, { action: 'cron.v3.standing-refresh-dirty.rpc' });
      return summary({ teams_in_chunk: teamIds.length, team_ids: teamIds, error: res.error.message ?? 'rpc-error' }, 500);
    }
    rpcRows = ((res.data ?? []) as Array<{ out_metric_id: string; out_rows_upserted: number }>).map((r) => ({ metric_id: r.out_metric_id, rows_upserted: r.out_rows_upserted }));
  } catch (err) {
    await logServerError(`standing-refresh-dirty season RPC exception: ${describeError(err)}`, { action: 'cron.v3.standing-refresh-dirty.rpc' });
    return summary({ teams_in_chunk: teamIds.length, team_ids: teamIds, error: describeError(err) }, 500);
  }

  let cleared = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the held migration's RPC is not in the generated types yet
    const res = await (supabase as any).rpc('clear_dirty_standing_teams', {
      p_team_ids: teamIds,
      p_marked_ats: dirty.map((d) => d.marked_at),
    });
    if (res.error) {
      // Standing is fresh; an uncleared mark only means one more refresh of the same teams.
      await logServerError(`standing-refresh-dirty clear: ${res.error.message ?? 'unknown'}`, { action: 'cron.v3.standing-refresh-dirty.clear' }, 'warning');
    } else if (typeof res.data === 'number') {
      cleared = res.data;
    }
  } catch (err) {
    await logServerError(`standing-refresh-dirty clear exception: ${describeError(err)}`, { action: 'cron.v3.standing-refresh-dirty.clear' }, 'warning');
  }

  return summary({ teams_in_chunk: teamIds.length, team_ids: teamIds, rpc_rows: rpcRows, marks_cleared: cleared });
}
