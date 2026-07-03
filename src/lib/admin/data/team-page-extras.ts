import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Bridge V2 /admin/teams/[id] — small supplement to the pinned
 * `fetchTeamDetail` (`@/lib/admin/data/team-detail`) for three fields the
 * team spec calls for that the data-lane module doesn't carry:
 *
 *   1. `organizationName` — team-detail only returns `organizationId`.
 *   2. `roundScoresByPlayer` — team-detail's shared rounds query selects
 *      only `player_id, created_at` (it needs just the timestamp for
 *      activity/trend math); the roster table also needs the last
 *      completed round's `total_score`/`score_to_par`.
 *   3. `errors7d` / `coachhelmInsights` — team-detail's `errors` are
 *      fingerprint-clusters over an unbounded-by-time 300-row window (right
 *      for a "recent errors" list, wrong for a strict "last 7 days" count),
 *      and CoachHelm usage there is calls/cost/budget only, no insight
 *      volume or acknowledgement rate.
 *
 * Every query here is scoped to the one team_id (or its already-resolved
 * coach ids) and bounded — no unscoped scans, no N+1.
 */

export interface TeamPageExtras {
  organizationName: string | null;
  errors7d: number;
  roundScoresByPlayer: Map<string, { score: number | null; toPar: number | null }>;
  coachhelmInsights: { insights30d: number; acknowledgedPct: number | null } | null;
}

type ScoreRow = { player_id: string; total_score: number | null; score_to_par: number | null; created_at: string | null };

/** Pure, unit-tested: reduces an already-fetched, already-scoped,
 *  newest-first `golf_rounds` slice into "this player's last completed
 *  round's score" — first hit per player_id wins (mirrors the same
 *  desc-order reduction team-detail.ts uses for `lastRoundAt`). */
export function buildLastRoundScoreByPlayer(
  rows: readonly ScoreRow[],
): Map<string, { score: number | null; toPar: number | null }> {
  const map = new Map<string, { score: number | null; toPar: number | null }>();
  for (const r of rows) {
    if (!map.has(r.player_id)) {
      map.set(r.player_id, { score: r.total_score, toPar: r.score_to_par });
    }
  }
  return map;
}

const TEAM_ROUNDS_SCORE_LIMIT = 1000;

/** CALLER must have passed requireSuperAdmin(). Each field fails soft to an
 *  honest empty/null on its own query error — one broken lookup here never
 *  blanks the rest of the team page. */
export async function fetchTeamPageExtras(input: {
  teamId: string;
  organizationId: string | null;
  coachIds: readonly string[];
}): Promise<TeamPageExtras> {
  const admin = createAdminClient();
  const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const ago30d = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [orgResult, errors7dResult, scoresResult, insightsTotalResult, insightsAckResult] = await Promise.allSettled([
    input.organizationId
      ? admin.from('organizations').select('name').eq('id', input.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', input.teamId)
      .eq('event_type', 'error')
      .gte('created_at', ago7d),
    admin
      .from('golf_rounds')
      .select('player_id, total_score, score_to_par, created_at')
      .eq('team_id', input.teamId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(TEAM_ROUNDS_SCORE_LIMIT),
    input.coachIds.length > 0
      ? admin
          .from('golf_coach_insights')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', input.teamId)
          .gte('created_at', ago30d)
      : Promise.resolve({ count: 0 }),
    input.coachIds.length > 0
      ? admin
          .from('golf_coach_insights')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', input.teamId)
          .not('acknowledged_at', 'is', null)
          .gte('created_at', ago30d)
      : Promise.resolve({ count: 0 }),
  ]);

  const organizationName =
    orgResult.status === 'fulfilled' ? ((orgResult.value.data as { name: string } | null)?.name ?? null) : null;

  const errors7d = errors7dResult.status === 'fulfilled' ? (errors7dResult.value.count ?? 0) : 0;

  const roundScoresByPlayer =
    scoresResult.status === 'fulfilled'
      ? buildLastRoundScoreByPlayer((scoresResult.value.data ?? []) as ScoreRow[])
      : new Map<string, { score: number | null; toPar: number | null }>();

  let coachhelmInsights: TeamPageExtras['coachhelmInsights'] = null;
  if (input.coachIds.length > 0) {
    const total = insightsTotalResult.status === 'fulfilled' ? (insightsTotalResult.value.count ?? 0) : 0;
    const acknowledged = insightsAckResult.status === 'fulfilled' ? (insightsAckResult.value.count ?? 0) : 0;
    coachhelmInsights = {
      insights30d: total,
      acknowledgedPct: total > 0 ? acknowledged / total : null,
    };
  }

  return { organizationName, errors7d, roundScoresByPlayer, coachhelmInsights };
}
