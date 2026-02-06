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

export async function POST(request: NextRequest) {
  try {
    const { roundId } = await request.json();

    if (!roundId) {
      return NextResponse.json({ error: 'Round ID required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: round } = await supabase
      .from('golf_rounds')
      .select('player_id, golf_players!inner(user_id)')
      .eq('id', roundId)
      .single();

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

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
      return NextResponse.json(
        { error: 'Insufficient data for review generation' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      review: null, // V1 review not generated (deprecated)
      v2Review,
      isV2: true
    });
  } catch (error) {
    console.error('Generate review error:', error);
    return NextResponse.json(
      { error: 'Failed to generate review' },
      { status: 500 }
    );
  }
}
