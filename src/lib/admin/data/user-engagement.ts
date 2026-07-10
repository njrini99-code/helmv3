import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type EngagementBand = 'strong' | 'steady' | 'fading' | 'dormant';

export interface EngagementInputs {
  lastActivityIso: string | null;
  rounds30d: number;
  insightsEngaged30d: number;
  reviewsViewed30d: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Pure, unit-tested 0–100 engagement score.
 *
 * Weights (sum to 100):
 *   - recency   40 pts, linear decay to 0 over 30 days since last activity
 *               (no last activity at all → 0 of this bucket, never fabricated).
 *   - rounds    30 pts, 6 pts/round logged in the last 30 days, capped at 5.
 *   - insights  15 pts, 5 pts/insight engaged (delivered-to or acted-on) in
 *               the last 30 days, capped at 3.
 *   - reviews   15 pts, 5 pts/round review viewed/published in the last 30
 *               days, capped at 3.
 */
export function computeEngagementScore(input: EngagementInputs, now: Date = new Date()): number {
  let recencyScore = 0;
  if (input.lastActivityIso) {
    const ageDays = (now.getTime() - new Date(input.lastActivityIso).getTime()) / 86400_000;
    recencyScore = clamp(40 - (ageDays / 30) * 40, 0, 40);
  }
  const roundsScore = clamp(input.rounds30d, 0, 5) * 6;
  const insightsScore = clamp(input.insightsEngaged30d, 0, 3) * 5;
  const reviewsScore = clamp(input.reviewsViewed30d, 0, 3) * 5;
  return Math.round(recencyScore + roundsScore + insightsScore + reviewsScore);
}

/** Pure, unit-tested banding for the ring label + StatusPill tone. */
export function engagementBand(score: number): EngagementBand {
  if (score >= 75) return 'strong';
  if (score >= 45) return 'steady';
  if (score >= 20) return 'fading';
  return 'dormant';
}

export interface UserEngagementActivityItem {
  id: string;
  kind: 'round' | 'insight' | 'review';
  at: string;
  label: string;
}

export interface UserEngagementDetail {
  score: number;
  band: EngagementBand;
  rounds30d: number;
  insightsEngaged30d: number;
  reviewsViewed30d: number;
  lastActivity: string | null;
  recentActivity: UserEngagementActivityItem[];
}

type RoundRow = { id: string; created_at: string | null; course_name: string | null };
type InsightRow = { id: string; created_at: string | null; title: string };
type ReviewRow = { id: string; created_at: string | null; primary_takeaway: string | null };

function mergeRecent(
  rounds: RoundRow[],
  insights: InsightRow[],
  reviews: ReviewRow[],
): UserEngagementActivityItem[] {
  const items: UserEngagementActivityItem[] = [
    ...rounds.map((r) => ({
      id: r.id,
      kind: 'round' as const,
      at: r.created_at ?? '',
      label: r.course_name ? `Round at ${r.course_name}` : 'Round logged',
    })),
    ...insights.map((i) => ({
      id: i.id,
      kind: 'insight' as const,
      at: i.created_at ?? '',
      label: i.title,
    })),
    ...reviews.map((r) => ({
      id: r.id,
      kind: 'review' as const,
      at: r.created_at ?? '',
      label: r.primary_takeaway ?? 'Round review',
    })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
}

/**
 * CALLER must have passed requireSuperAdmin().
 *
 * Returns null when the user has neither a golf_players nor golf_coaches row
 * — engagement scoring is golf-specific for now and there's nothing honest
 * to show for a baseball-only or bare account (an honest "not applicable",
 * not a fabricated 0).
 *
 * QUERY DISCIPLINE: every query is scoped to ONE user's resolved player/coach
 * id, counts use `head: true`, and the recent-activity lists are capped at 5
 * rows each (merged + sliced to 8) — no N+1, no unbounded scans.
 */
export async function fetchUserEngagement(userId: string): Promise<UserEngagementDetail | null> {
  const admin = createAdminClient();
  const now = new Date();
  const ago30d = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [userRes, playerRes, coachRes] = await Promise.all([
    admin.from('users').select('last_seen').eq('id', userId).maybeSingle(),
    admin.from('golf_players').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('golf_coaches').select('id').eq('user_id', userId).maybeSingle(),
  ]);

  const lastActivity = (userRes.data as { last_seen: string | null } | null)?.last_seen ?? null;
  const playerId = (playerRes.data as { id: string } | null)?.id ?? null;
  const coachId = (coachRes.data as { id: string } | null)?.id ?? null;

  if (!playerId && !coachId) return null;

  let rounds30d = 0;
  let insightsEngaged30d = 0;
  let reviewsViewed30d = 0;
  let recentActivity: UserEngagementActivityItem[] = [];

  if (playerId) {
    const [roundsCountRes, insightsCountRes, reviewsCountRes, roundsRes, insightsRes, reviewsRes] =
      await Promise.all([
        admin
          .from('golf_rounds')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .gte('created_at', ago30d),
        admin
          .from('golf_coach_insights')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .gte('created_at', ago30d),
        admin
          .from('golf_round_reviews')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .not('player_viewed_at', 'is', null)
          .gte('created_at', ago30d),
        admin
          .from('golf_rounds')
          .select('id, created_at, course_name')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false })
          .limit(5),
        admin
          .from('golf_coach_insights')
          .select('id, created_at, title')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false })
          .limit(5),
        admin
          .from('golf_round_reviews')
          .select('id, created_at, primary_takeaway')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

    rounds30d = roundsCountRes.count ?? 0;
    insightsEngaged30d = insightsCountRes.count ?? 0;
    reviewsViewed30d = reviewsCountRes.count ?? 0;
    recentActivity = mergeRecent(
      (roundsRes.data ?? []) as RoundRow[],
      (insightsRes.data ?? []) as InsightRow[],
      (reviewsRes.data ?? []) as ReviewRow[],
    );
  } else if (coachId) {
    const staffRes = await admin.from('golf_team_coach_staff').select('team_id').eq('coach_id', coachId).limit(20);
    const teamIds = ((staffRes.data ?? []) as Array<{ team_id: string }>).map((r) => r.team_id);

    const [roundsCountRes, insightsCountRes, reviewsCountRes, insightsRes, reviewsRes] = await Promise.all([
      teamIds.length > 0
        ? admin
            .from('golf_rounds')
            .select('id', { count: 'exact', head: true })
            .in('team_id', teamIds)
            .gte('created_at', ago30d)
        : Promise.resolve({ count: 0 }),
      admin
        .from('golf_coach_insights')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .gte('created_at', ago30d),
      admin
        .from('golf_round_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('published_by', coachId)
        .gte('created_at', ago30d),
      admin
        .from('golf_coach_insights')
        .select('id, created_at, title')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(5),
      admin
        .from('golf_round_reviews')
        .select('id, created_at, primary_takeaway')
        .eq('published_by', coachId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    rounds30d = roundsCountRes.count ?? 0;
    insightsEngaged30d = insightsCountRes.count ?? 0;
    reviewsViewed30d = reviewsCountRes.count ?? 0;
    recentActivity = mergeRecent(
      [],
      (insightsRes.data ?? []) as InsightRow[],
      (reviewsRes.data ?? []) as ReviewRow[],
    );
  }

  const score = computeEngagementScore({ lastActivityIso: lastActivity, rounds30d, insightsEngaged30d, reviewsViewed30d }, now);

  return {
    score,
    band: engagementBand(score),
    rounds30d,
    insightsEngaged30d,
    reviewsViewed30d,
    lastActivity,
    recentActivity,
  };
}
