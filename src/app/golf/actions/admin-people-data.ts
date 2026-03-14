'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// TYPES
// ============================================

export interface UserEngagement {
  userId: string;
  email: string;
  role: string;
  roundsInPeriod: number;
  reviewsInPeriod: number;
  messagesInPeriod: number;
  engagementScore: number;
  lifecycleStage: string;
  lastActiveAt: string | null;
  daysSinceSignup: number;
}

export interface TeamHealthEntry {
  teamId: string;
  teamName: string;
  orgName: string | null;
  memberCount: number;
  active7d: number;
  active30d: number;
  rounds30d: number;
  avgRoundsPerPlayer: number;
  healthScore: number;
  healthTier: string;
  hasAiPhilosophy: boolean;
}

export interface CoachEffectivenessEntry {
  coachId: string;
  coachName: string;
  teamCount: number;
  playerCount: number;
  reviewsPublished: number;
  avgReviewTimeHours: number | null;
  hasPhilosophy: boolean;
  effectivenessScore: number;
}

export interface OnboardingStep {
  stepName: string;
  stepOrder: number;
  totalCount: number;
  completedCount: number;
  completionRate: number;
}

export interface PeopleTabData {
  engagementSummary: UserEngagement[];
  teamHealth: TeamHealthEntry[];
  coachEffectiveness: CoachEffectivenessEntry[];
  onboardingFunnel: OnboardingStep[];
  lifecycleBreakdown: Record<string, number>;
}

// ============================================
// HELPERS
// ============================================

function emptyPeopleTabData(): PeopleTabData {
  return {
    engagementSummary: [],
    teamHealth: [],
    coachEffectiveness: [],
    onboardingFunnel: [],
    lifecycleBreakdown: {},
  };
}

// ============================================
// MAIN FETCH
// ============================================

export async function getPeopleTabData(): Promise<PeopleTabData> {
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

  try {
    const [engagementRes, teamHealthRes, coachEffectivenessRes, onboardingRes] =
      await Promise.all([
        adminDb.rpc('get_user_engagement_summary' as never, { period_days: 30 } as never) as unknown as { data: any[] | null; error: unknown },
        adminDb.rpc('get_team_health_dashboard' as never) as unknown as { data: any[] | null; error: unknown },
        adminDb.rpc('get_coach_effectiveness_metrics' as never) as unknown as { data: any[] | null; error: unknown },
        adminDb.rpc('get_onboarding_funnel_analysis' as never) as unknown as { data: any[] | null; error: unknown },
      ]);

    // Parse engagement summary
    const engagementSummary: UserEngagement[] = (engagementRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        userId: String(row.user_id ?? ''),
        email: String(row.email ?? ''),
        role: String(row.role ?? ''),
        roundsInPeriod: Number(row.rounds_in_period ?? 0),
        reviewsInPeriod: Number(row.reviews_in_period ?? 0),
        messagesInPeriod: Number(row.messages_in_period ?? 0),
        engagementScore: Number(row.engagement_score ?? 0),
        lifecycleStage: String(row.lifecycle_stage ?? 'unknown'),
        lastActiveAt: row.last_active_at ? String(row.last_active_at) : null,
        daysSinceSignup: Number(row.days_since_signup ?? 0),
      })
    );

    // Parse team health
    const teamHealth: TeamHealthEntry[] = (teamHealthRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        teamId: String(row.team_id ?? ''),
        teamName: String(row.team_name ?? ''),
        orgName: row.org_name ? String(row.org_name) : null,
        memberCount: Number(row.member_count ?? 0),
        active7d: Number(row.active_7d ?? 0),
        active30d: Number(row.active_30d ?? 0),
        rounds30d: Number(row.rounds_30d ?? 0),
        avgRoundsPerPlayer: Number(row.avg_rounds_per_player ?? 0),
        healthScore: Number(row.health_score ?? 0),
        healthTier: String(row.health_tier ?? 'unknown'),
        hasAiPhilosophy: Boolean(row.has_ai_philosophy),
      })
    );

    // Parse coach effectiveness
    const coachEffectiveness: CoachEffectivenessEntry[] = (
      coachEffectivenessRes.data ?? []
    ).map((row: Record<string, unknown>) => ({
      coachId: String(row.coach_id ?? ''),
      coachName: String(row.coach_name ?? ''),
      teamCount: Number(row.team_count ?? 0),
      playerCount: Number(row.player_count ?? 0),
      reviewsPublished: Number(row.reviews_published ?? 0),
      avgReviewTimeHours:
        row.avg_review_time_hours != null
          ? Number(row.avg_review_time_hours)
          : null,
      hasPhilosophy: Boolean(row.has_philosophy),
      effectivenessScore: Number(row.effectiveness_score ?? 0),
    }));

    // Parse onboarding funnel
    const onboardingFunnel: OnboardingStep[] = (onboardingRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        stepName: String(row.step_name ?? ''),
        stepOrder: Number(row.step_order ?? 0),
        totalCount: Number(row.total_count ?? 0),
        completedCount: Number(row.completed_count ?? 0),
        completionRate: Number(row.completion_rate ?? 0),
      })
    );

    // Compute lifecycle breakdown from engagement summary
    const lifecycleBreakdown: Record<string, number> = {};
    for (const entry of engagementSummary) {
      const stage = entry.lifecycleStage;
      lifecycleBreakdown[stage] = (lifecycleBreakdown[stage] ?? 0) + 1;
    }

    return {
      engagementSummary,
      teamHealth,
      coachEffectiveness,
      onboardingFunnel,
      lifecycleBreakdown,
    };
  } catch (error) {
    console.error('[admin-people-data] Failed to fetch people tab data:', error);
    return emptyPeopleTabData();
  }
}
