'use server';

/**
 * Server actions powering the CRM coach engagement Hot/Warm/Cold badges.
 *
 * Reads from the `crm_coach_engagement` materialized view (refreshed every
 * 5 min by /api/cron/refresh-engagement). The view aggregates the last 90
 * days of email_events with a 14-day-half-life exponential decay; see
 * supabase/migrations/20260428T6_coach_engagement_view.sql for the formula.
 *
 * Auth: every action enforces admin role before querying. The view is read
 * via the service-role client because materialized views in Supabase don't
 * carry table-level RLS the same way regular tables do — admin gating is
 * therefore done in code, mirroring the pattern in resend-activity.ts.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type {
  CoachEngagement,
  CoachTemperature,
} from '@/app/golf/admin/crm/types/foundations';

// ---------------------------------------------------------------------------
// Auth helper — admin role required, mirrors resend-activity.ts:121
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden');
  }
}

// ---------------------------------------------------------------------------
// Internal row shape returned by Supabase from the materialized view
// ---------------------------------------------------------------------------
interface EngagementRow {
  coach_id: string;
  score: number;
  temperature: CoachTemperature;
  opens_90d: number;
  clicks_90d: number;
  last_event_at: string | null;
}

interface LeaderboardJoinRow extends EngagementRow {
  crm_coaches: {
    name: string | null;
    school: string | null;
    status: string | null;
  } | null;
}

// Max coach_ids per PostgREST `.in()` batch. The CRM page can pass ~2,300
// UUIDs in one call; a single `.in('coach_id', coachIds)` query for that
// many ids blows the request URL past ~85KB and the query dies with an
// empty-message PostgrestError, degrading the whole page to {}. Chunking
// keeps each request URL well under any practical limit.
const ENGAGEMENT_BATCH_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// ---------------------------------------------------------------------------
// getCoachEngagement — batch lookup keyed by coach_id, mirrors signature of
// getCoachLastEmailActivity at resend-activity.ts:345.
// ---------------------------------------------------------------------------
export async function getCoachEngagement(
  coachIds: string[],
): Promise<Record<string, CoachEngagement>> {
  if (!coachIds.length) return {};

  await requireAdmin();

  // Resilience: a flaky read of the crm_coach_engagement matview (a resolved
  // PostgrestError OR a thrown/rejected client call — e.g. the admin client
  // failing to construct, a network blip) must never take down the CRM page
  // render. Every caller (page.tsx, coach/[id]/page.tsx,
  // EngagementDetailDrawer.tsx) treats a missing/empty map as "no engagement
  // data yet", so degrading to {} here is always safe.
  try {
    const admin = createAdminClient();
    const batches = chunk(coachIds, ENGAGEMENT_BATCH_SIZE);

    // Batch failures are collected rather than logged individually inside
    // the map — a systemic cause (e.g. the matview missing) fails every
    // batch independently, and logging per-batch would fire up to
    // batches.length separate logServerError/Sentry writes for one root
    // cause on a single page load. One summary log per invocation instead.
    const batchErrors: Array<{ batchIndex: number; error: { code?: string; hint?: string; details?: string; message?: string } }> = [];

    const batchResults = await Promise.all(
      batches.map(async (batchIds, batchIndex) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (admin as any)
          .from('crm_coach_engagement')
          .select('coach_id, score, temperature, opens_90d, clicks_90d, last_event_at')
          .in('coach_id', batchIds);

        if (error) {
          // error is a Supabase PostgrestError — a plain object, not an
          // Error instance. describeError() (used below) extracts
          // code/message/details/hint instead of collapsing it to
          // "[object Object]" via String(error). A single failed batch
          // must not discard the other batches' results, so we record it
          // and return empty for this batch only rather than throwing.
          batchErrors.push({ batchIndex, error });
          return [] as EngagementRow[];
        }

        return (data ?? []) as EngagementRow[];
      }),
    );

    if (batchErrors.length > 0) {
      const first = batchErrors[0]!;
      await logServerError(
        `[crm-engagement] getCoachEngagement: ${batchErrors.length}/${batches.length} batch(es) failed: ${describeError(first.error)}`,
        {
          action: 'crm_engagement.getCoachEngagement',
          errorCode: first.error.code,
          errorHint: first.error.hint,
          errorDetails: first.error.details,
          metadata: {
            batchCount: batches.length,
            failedBatchCount: batchErrors.length,
            failedBatchIndexes: batchErrors.map((b) => b.batchIndex),
          },
        },
      );
    }

    const out: Record<string, CoachEngagement> = {};
    for (const rows of batchResults) {
      for (const row of rows) {
        out[row.coach_id] = {
          coach_id: row.coach_id,
          score: row.score,
          temperature: row.temperature,
          opens_90d: row.opens_90d,
          clicks_90d: row.clicks_90d,
          last_event_at: row.last_event_at,
        };
      }
    }
    return out;
  } catch (err) {
    await logServerError(
      `[crm-engagement] getCoachEngagement threw: ${describeError(err)}`,
      { action: 'crm_engagement.getCoachEngagement' },
    );
    return {};
  }
}

// ---------------------------------------------------------------------------
// getEngagementLeaderboard — top-scoring coaches, optionally filtered to a
// single temperature bucket. Joins crm_coaches for denormalized display data.
// ---------------------------------------------------------------------------
export interface EngagementLeaderboardEntry extends CoachEngagement {
  coach_name: string;
  coach_school: string;
  coach_status: string;
}

export async function getEngagementLeaderboard(
  opts: { temperature?: CoachTemperature; limit?: number } = {},
): Promise<EngagementLeaderboardEntry[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('crm_coach_engagement')
    .select(
      'coach_id, score, temperature, opens_90d, clicks_90d, last_event_at, crm_coaches!inner(name, school, status)',
    )
    .order('score', { ascending: false })
    .limit(limit);

  if (opts.temperature) {
    query = query.eq('temperature', opts.temperature);
  }

  const { data, error } = await query;

  if (error) {
    await logServerError(
      `[crm-engagement] getEngagementLeaderboard failed: ${describeError(error)}`,
      {
        action: 'crm_engagement.getEngagementLeaderboard',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
      },
    );
    return [];
  }

  return ((data ?? []) as LeaderboardJoinRow[]).map((row) => ({
    coach_id: row.coach_id,
    score: row.score,
    temperature: row.temperature,
    opens_90d: row.opens_90d,
    clicks_90d: row.clicks_90d,
    last_event_at: row.last_event_at,
    coach_name: row.crm_coaches?.name ?? '',
    coach_school: row.crm_coaches?.school ?? '',
    coach_status: row.crm_coaches?.status ?? '',
  }));
}
