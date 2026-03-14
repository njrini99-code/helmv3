'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const [platformMetricsRes, engagementRes, aiRoundsRes, insightLogRes] =
      await Promise.all([
        // Last 30 daily snapshots
        (adminDb.from('golf_platform_metrics_daily' as never) as any)
          .select('*')
          .order('snapshot_date', { ascending: false })
          .limit(30) as unknown as { data: any[] | null; error: unknown },

        // Engagement summary for tier computation
        adminDb.rpc('get_user_engagement_summary' as never, { period_days: 30 } as never) as unknown as { data: any[] | null; error: unknown },

        // AI vs non-AI retention: get rounds with join to insight log
        adminDb
          .from('golf_rounds')
          .select('id, player_id, created_at')
          .gte('created_at', ago30d),

        // Insight generation log for action rate + AI user identification
        adminDb
          .from('golf_insight_generation_log')
          .select('id, player_id, insights_generated, created_at')
          .gte('created_at', ago30d),
      ]);

    // Parse platform metrics
    const platformMetrics: PlatformMetricsEntry[] = (
      (platformMetricsRes.data ?? []) as any[]
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
    const aiCoachIds = new Set(
      (insightLogRes.data ?? []).map((r: Record<string, unknown>) =>
        String(r.player_id ?? '')
      )
    );

    const rounds = aiRoundsRes.data ?? [];
    const roundsByUser = new Map<string, string[]>();
    for (const r of rounds) {
      const uid = String((r as Record<string, unknown>).player_id ?? '');
      const created = String((r as Record<string, unknown>).created_at ?? '');
      if (!roundsByUser.has(uid)) roundsByUser.set(uid, []);
      roundsByUser.get(uid)!.push(created);
    }

    // Simple D7 retention: users who submitted a round in both first 7 days and days 7-14
    let aiRetained = 0;
    let aiTotal = 0;
    let nonAiRetained = 0;
    let nonAiTotal = 0;

    const now = Date.now();
    for (const [uid, dates] of roundsByUser) {
      if (dates.length === 0) continue;
      const sortedDates = dates.map((d) => new Date(d).getTime()).sort();
      const firstRound = sortedDates[0]!;
      const daysSinceFirst = (now - firstRound) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst < 14) continue; // Need at least 14 days of history

      const hasDay0to7 = sortedDates.some(
        (d) => d - firstRound < 7 * 24 * 60 * 60 * 1000
      );
      const hasDay7to14 = sortedDates.some(
        (d) =>
          d - firstRound >= 7 * 24 * 60 * 60 * 1000 &&
          d - firstRound < 14 * 24 * 60 * 60 * 1000
      );

      const isAiUser = aiCoachIds.has(uid);

      if (isAiUser) {
        aiTotal += 1;
        if (hasDay0to7 && hasDay7to14) aiRetained += 1;
      } else {
        nonAiTotal += 1;
        if (hasDay0to7 && hasDay7to14) nonAiRetained += 1;
      }
    }

    const aiUserRetentionD7 = aiTotal > 0 ? aiRetained / aiTotal : null;
    const nonAiUserRetentionD7 =
      nonAiTotal > 0 ? nonAiRetained / nonAiTotal : null;
    const aiRetentionLift =
      aiUserRetentionD7 != null && nonAiUserRetentionD7 != null
        ? aiUserRetentionD7 - nonAiUserRetentionD7
        : null;

    // Insight action rate: ratio of insights that led to follow-up activity
    const totalInsights = (insightLogRes.data ?? []).reduce(
      (sum: number, r: Record<string, unknown>) =>
        sum + Number(r.insights_generated ?? 0),
      0
    );
    const insightActionRate =
      totalInsights > 0 ? Math.min(totalInsights / Math.max(aiTotal, 1), 1) : null;

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
        totalAdopters: aiCoachIds.size,
        stickinessRate:
          aiCoachIds.size > 0 ? weeklyAiUsers.size / aiCoachIds.size : 0,
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
    console.error('[admin-bi-data] Failed to fetch BI data:', error);
    return emptyBIData();
  }
}
