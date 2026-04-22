// ============================================================================
// ROUND REVIEW GENERATION API - V2 ONLY
// ============================================================================
//
// This endpoint now uses ONLY the V2 intelligence engine.
// V1 (round-review-generator.ts) is deprecated and no longer used here.
//
// Supports both player (own round) and coach (team member round) access.
//
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  coachHelmIntelligence,
  isCoachHelmEnabledForPlayer
} from '@/lib/coachhelm/v2';
import { logAIGeneration } from '@/lib/admin-logger';
import { logServerError } from '@/lib/server-error-logger';

export async function POST(request: NextRequest) {
  let roundId: string | null = null;
  let userId: string | null = null;
  let userEmail: string | null = null;
  let playerId: string | null = null;

  try {
    const payload = await request.json();
    roundId = typeof payload?.roundId === 'string' ? payload.roundId : null;

    if (!roundId) {
      return NextResponse.json({ error: 'Round ID required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email ?? null;

    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('player_id, golf_players!inner(user_id)')
      .eq('id', roundId)
      .maybeSingle();

    if (roundError) {
      await logServerError(`Generate review round lookup failed: ${roundError.message}`, {
        action: 'generateRoundReviewApi.roundLookup',
        source: 'route_handler',
        featureArea: 'coachhelm_ai',
        route: request.nextUrl.pathname,
        url: request.url,
        roundId,
        userId,
        userEmail,
        errorCode: roundError.code,
        errorHint: roundError.hint,
        errorDetails: roundError.details,
      }, 'critical');
      return NextResponse.json({ error: 'Failed to load round' }, { status: 500 });
    }

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }
    playerId = round.player_id;

    // Check access: player owns the round OR coach has team access
    const playerData = round.golf_players as unknown as { user_id: string };
    let hasAccess = playerData.user_id === user.id;

    if (!hasAccess) {
      // Check if user is a coach with access to this player
      const { data: coachData } = await supabase
        .from('golf_coaches')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (coachData?.organization_id) {
        const { data: orgTeam } = await supabase
          .from('golf_teams')
          .select('id')
          .eq('organization_id', coachData.organization_id)
          .maybeSingle();

        if (orgTeam?.id) {
          const { data: teamMember } = await supabase
            .from('golf_team_members')
            .select('id')
            .eq('team_id', orgTeam.id)
            .eq('player_id', round.player_id)
            .maybeSingle();

          hasAccess = !!teamMember;
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Check if CoachHelm V2 is enabled for this player
    const v2Status = await isCoachHelmEnabledForPlayer(round.player_id);
    if (!v2Status.effectivelyEnabled) {
      return NextResponse.json(
        { error: v2Status.disabledReason || 'CoachHelm is disabled for this player' },
        { status: 403 }
      );
    }

    // Generate V2 review
    const v2Review = await coachHelmIntelligence.generateRoundReview(
      roundId,
      round.player_id
    );

    if (!v2Review) {
      // Log failed AI generation (fire-and-forget)
      logAIGeneration(playerData.user_id, '', 'round_review', false, {
        roundId,
        reason: 'insufficient_data',
      }).catch(() => {});

      return NextResponse.json(
        { error: 'Insufficient data for review generation' },
        { status: 422 }
      );
    }

    // Log successful AI generation (fire-and-forget)
    logAIGeneration(playerData.user_id, '', 'round_review', true, {
      roundId,
      reviewId: v2Review.roundId,
    }).catch(() => {});

    // Log to insight generation log for admin dashboard metrics (fire-and-forget)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from('golf_insight_generation_log').insert({
      player_id: round.player_id,
      insight_type: 'round_review',
      insights_generated: 1 + v2Review.patternsApplied.length + v2Review.causalInsights.length,
      engine_version: 'v2',
    });

    return NextResponse.json({
      review: null, // V1 review not generated (deprecated)
      v2Review,
      isV2: true
    });
  } catch (error) {
    await logServerError(`Generate review error: ${error instanceof Error ? error.message : String(error)}`, { action: 'route.POST' });

    await logServerError(`Generate review route failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generateRoundReviewApi',
      source: 'route_handler',
      featureArea: 'coachhelm_ai',
      route: request.nextUrl.pathname,
      url: request.url,
      roundId,
      playerId,
      userId,
      userEmail,
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
      },
    }, 'critical');

    // Log AI generation error (fire-and-forget)
    logAIGeneration('', '', 'round_review', false, {
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {});

    return NextResponse.json(
      { error: 'Failed to generate review' },
      { status: 500 }
    );
  }
}
