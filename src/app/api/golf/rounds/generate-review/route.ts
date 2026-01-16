// ============================================================================
// ROUND REVIEW GENERATION API - V2 ONLY
// ============================================================================
//
// This endpoint now uses ONLY the V2 intelligence engine.
// V1 (round-review-generator.ts) is deprecated and no longer used here.
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

    // Verify user owns this round
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

    // Type assertion for the joined data
    const playerData = round.golf_players as unknown as { user_id: string };
    if (playerData.user_id !== user.id) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
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
