'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { computeD7Retention, type RoundForRetention } from '@/lib/admin/metrics';

// ============================================
// TYPES
// ============================================

export interface PlatformMetricsEntry {
  snapshotDate: string;
  dau: number;
  wau: number;
  mau: number;
  newSignups: number;
  roundsToday: number;
  avgEngagementScore: number | null;
  churnAtRiskCount: number;
}

export interface FeatureStickinessEntry {
  featureName: string;
  weeklyActiveUsers: number;
  totalAdopters: number;
  stickinessRate: number;
}

export interface EnhancedBIData {
  platformMetrics: PlatformMetricsEntry[];
  aiEffectiveness: {
    aiUserRetentionD7: number | null;
    nonAiUserRetentionD7: number | null;
    aiRetentionLift: number | null;
    insightActionRate: number | null;
  };
  engagementTiers: Record<string, number>;
  featureStickiness: FeatureStickinessEntry[];
}

// ============================================
// HELPERS
// ============================================

function emptyBIData(): EnhancedBIData {
  return {
    platformMetrics: [],
    aiEffectiveness: {
      aiUserRetentionD7: null,
      nonAiUserRetentionD7: null,
      aiRetentionLift: null,
      insightActionRate: null,
    },
    engagementTiers: {},
    featureStickiness: [],
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ============================================
// MAIN FETCH
// ============================================

export async function getEnhancedBIData(): Promise<EnhancedBIData> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((userData?.role as string) !== 'admin') throw new Error('Forbidden');

  // Use admin client (service role) for all data queries — bypasses RLS
  const adminDb = createAdminClient();
  const ago7d = daysAgo(7);
  const ago30d = daysAgo(30);

  try {
    const [platformMetricsRes, engagementRes, aiRoundsRes, insightLogRes, insightActionRes] =
      await Promise.all([
        // Last 30 daily snapshots
        (adminDb.from('golf_platform_metrics_daily' as never) as unknown as {
          select: (columns: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              limit: (count: number) => { data: Record<string, unknown>[] | null; error: unknown };
            };
          };
        })
          .select('*')
          .order('snapshot_date', { ascending: false })
          .limit(30) as unknown as { data: Record<string, unknown>[] | null; error: unknown },

        // Engagement summary for tier computation
        adminDb.rpc('get_user_engagement_summary' as never, { period_days: 30 } as never) as unknown as { data: Record<string, unknown>[] | null; error: unknown },

        // AI vs non-AI retention: get rounds with join to insight log
        adminDb
          .from('golf_rounds')
          .select('id, player_id, created_at')
          .gte('created_at', ago30d),

        // Insight generation log for AI user identification (who got an insight).
        adminDb
          .from('golf_insight_generation_log')
          .select('id, player_id, insights_generated, created_at')
          .gte('created_at', ago30d),

        // Insight action data: counts of insights actually addressed/resolved
        // vs total generated over the same 30d window. Drives the real
        // insightActionRate metric — not the old "insights per user" ratio.
        adminDb
          .from('golf_coach_insights')
          .select('id, lifecycle_state, addressed_at, resolved_at', { count: 'exact' })
          .gte('created_at', ago30d)
          .limit(1), // we only need the count; rows are ignored
      ]);

    // Parse platform metrics
    const platformMetrics: PlatformMetricsEntry[] = (
      (platformMetricsRes.data ?? []) as Record<string, unknown>[]
    ).map((row: Record<string, unknown>) => ({
      snapshotDate: String(row.snapshot_date ?? ''),
      dau: Number(row.dau ?? 0),
      wau: Number(row.wau ?? 0),
      mau: Number(row.mau ?? 0),
      newSignups: Number(row.new_signups ?? 0),
      roundsToday: Number(row.rounds_today ?? 0),
      avgEngagementScore:
        row.avg_engagement_score != null
          ? Number(row.avg_engagement_score)
          : null,
      churnAtRiskCount: Number(row.churn_at_risk_count ?? 0),
    }));

    // Compute AI vs non-AI retention
    const aiPlayerIds = new Set(
      (insightLogRes.data ?? []).map((r: Record<string, unknown>) =>
        String(r.player_id ?? '')
      )
    );

    // Normalize rounds for the shared D7 retention helper.
    //
    // Signup anchor strategy: prefer `golf_players.created_at` (when the
    // player profile was created, which happens during signup/onboarding) for
    // each player who has rounds in the window. Fall back to the player's
    // earliest round only when the player row can't be resolved — so D7
    // retention is anchored on real signup, not on "first round," which was
    // a known proxy that made retention look better than it is.
    const rounds = aiRoundsRes.data ?? [];
    const normalizedRounds: RoundForRetention[] = [];
    const firstRoundByUser = new Map<string, number>();
    const playerIdsInWindow = new Set<string>();
    for (const r of rounds) {
      const rec = r as Record<string, unknown>;
      const uid = String(rec.player_id ?? '');
      const createdRaw = String(rec.created_at ?? '');
      if (!uid || !createdRaw) continue;
      const ts = new Date(createdRaw).getTime();
      if (!Number.isFinite(ts)) continue;
      normalizedRounds.push({ player_id: uid, created_at: createdRaw });
      playerIdsInWindow.add(uid);
      const prior = firstRoundByUser.get(uid);
      if (prior === undefined || ts < prior) firstRoundByUser.set(uid, ts);
    }

    // Look up real signup timestamps from golf_players.created_at.
    const signupByPlayer = new Map<string, number>();
    if (playerIdsInWindow.size > 0) {
      const { data: playerRows } = await adminDb
        .from('golf_players')
        .select('id, created_at')
        .in('id', Array.from(playerIdsInWindow));
      for (const row of (playerRows ?? []) as Array<{ id: string; created_at: string | null }>) {
        if (!row.id || !row.created_at) continue;
        const ts = new Date(row.created_at).getTime();
        if (Number.isFinite(ts)) signupByPlayer.set(row.id, ts);
      }
    }

    // Split signupAt maps into AI vs non-AI cohorts, then call the shared
    // metrics helper for each. Real signup wins; first-round is the safety net.
    const aiSignupAt = new Map<string, string>();
    const nonAiSignupAt = new Map<string, string>();
    for (const uid of playerIdsInWindow) {
      const signupTs = signupByPlayer.get(uid) ?? firstRoundByUser.get(uid);
      if (signupTs === undefined) continue;
      const iso = new Date(signupTs).toISOString();
      if (aiPlayerIds.has(uid)) aiSignupAt.set(uid, iso);
      else nonAiSignupAt.set(uid, iso);
    }

    const aiUserRetentionD7 =
      aiSignupAt.size > 0
        ? computeD7Retention(normalizedRounds, aiSignupAt)
        : null;
    const nonAiUserRetentionD7 =
      nonAiSignupAt.size > 0
        ? computeD7Retention(normalizedRounds, nonAiSignupAt)
        : null;
    const aiRetentionLift =
      aiUserRetentionD7 != null && nonAiUserRetentionD7 != null
        ? aiUserRetentionD7 - nonAiUserRetentionD7
        : null;

    // Reconstruct roundsByUser only for downstream feature-stickiness math.
    const roundsByUser = new Map<string, string[]>();
    for (const r of rounds) {
      const uid = String((r as Record<string, unknown>).player_id ?? '');
      const created = String((r as Record<string, unknown>).created_at ?? '');
      if (!uid || !created) continue;
      const bucket = roundsByUser.get(uid);
      if (bucket) bucket.push(created);
      else roundsByUser.set(uid, [created]);
    }
    // Insight action rate: fraction of insights generated in the last 30 days
    // that have been addressed or resolved by a coach. Sourced from
    // golf_coach_insights lifecycle state — the same column the lifecycle cron
    // writes to when a coach acts on an alert. Returns null when there are no
    // insights in the window (avoids a fake 0% on empty data).
    const totalInsightsInWindow =
      (insightActionRes as unknown as { count: number | null }).count ?? 0;

    let actedOnCount = 0;
    if (totalInsightsInWindow > 0) {
      const actedRes = await adminDb
        .from('golf_coach_insights')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', ago30d)
        .or('lifecycle_state.in.(addressed,resolved),addressed_at.not.is.null,resolved_at.not.is.null');
      actedOnCount = (actedRes as unknown as { count: number | null }).count ?? 0;
    }

    const insightActionRate =
      totalInsightsInWindow > 0 ? actedOnCount / totalInsightsInWindow : null;

    // Compute engagement tiers from engagement summary
    const engagementTiers: Record<string, number> = {};
    for (const row of engagementRes.data ?? []) {
      const score = Number((row as Record<string, unknown>).engagement_score ?? 0);
      let tier: string;
      if (score >= 80) tier = 'power';
      else if (score >= 50) tier = 'active';
      else if (score >= 20) tier = 'casual';
      else if (score > 0) tier = 'low';
      else tier = 'dormant';
      engagementTiers[tier] = (engagementTiers[tier] ?? 0) + 1;
    }

    // Compute feature stickiness from weekly feature counts
    // Use recent platform metrics if available
    const latestMetrics = platformMetrics[0];
    const wau = latestMetrics?.wau ?? 0;

    // Estimate feature stickiness from round/engagement data
    const featureStickiness: FeatureStickinessEntry[] = [];
    if (wau > 0) {
      // Rounds feature
      const weeklyRoundUsers = new Set<string>();
      const oneWeekAgo = new Date(ago7d).getTime();
      for (const r of rounds) {
        const created = new Date(
          String((r as Record<string, unknown>).created_at ?? '')
        ).getTime();
        if (created >= oneWeekAgo) {
          weeklyRoundUsers.add(
            String((r as Record<string, unknown>).player_id ?? '')
          );
        }
      }
      featureStickiness.push({
        featureName: 'Round Tracking',
        weeklyActiveUsers: weeklyRoundUsers.size,
        totalAdopters: roundsByUser.size,
        stickinessRate:
          roundsByUser.size > 0
            ? weeklyRoundUsers.size / roundsByUser.size
            : 0,
      });

      // AI Insights feature
      const weeklyAiUsers = new Set<string>();
      for (const r of insightLogRes.data ?? []) {
        const created = new Date(
          String((r as Record<string, unknown>).created_at ?? '')
        ).getTime();
        if (created >= oneWeekAgo) {
          weeklyAiUsers.add(
            String((r as Record<string, unknown>).player_id ?? '')
          );
        }
      }
      featureStickiness.push({
        featureName: 'CoachHelm AI Insights',
        weeklyActiveUsers: weeklyAiUsers.size,
        totalAdopters: aiPlayerIds.size,
        stickinessRate:
          aiPlayerIds.size > 0 ? weeklyAiUsers.size / aiPlayerIds.size : 0,
      });
    }

    return {
      platformMetrics,
      aiEffectiveness: {
        aiUserRetentionD7,
        nonAiUserRetentionD7,
        aiRetentionLift,
        insightActionRate,
      },
      engagementTiers,
      featureStickiness,
    };
  } catch (error) {
    await logServerError(`[admin-bi-data] Failed to fetch BI data: ${error instanceof Error ? error.message : String(error)}`, { action: 'admin_bi_data.getEnhancedBIData' });
    return emptyBIData();
  }
}
