import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateRoundReview } from '@/lib/coachhelm/round-review-generator';
import { 
  coachHelmIntelligence, 
  isCoachHelmEnabledForPlayer 
} from '@/lib/coachhelm/v2';

export async function POST(request: NextRequest) {
  try {
    const { roundId, useV2 } = await request.json();

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

    // Check if V2 is enabled for this player
    const v2Status = await isCoachHelmEnabledForPlayer(round.player_id);
    const shouldUseV2 = useV2 !== false && v2Status.effectivelyEnabled;

    if (shouldUseV2) {
      try {
        // Generate V2 review
        const v2Review = await coachHelmIntelligence.generateRoundReview(
          roundId,
          round.player_id
        );

        if (v2Review) {
          return NextResponse.json({ 
            review: null, // V1 review not generated
            v2Review,
            isV2: true 
          });
        }
        // If V2 fails, fall through to V1
      } catch (v2Error) {
        console.warn('V2 review generation failed, falling back to V1:', v2Error);
      }
    }

    // Generate V1 review
    const review = await generateRoundReview({
      roundId,
      playerId: round.player_id,
    });

    return NextResponse.json({ review, isV2: false });
  } catch (error) {
    console.error('Generate review error:', error);
    return NextResponse.json(
      { error: 'Failed to generate review' },
      { status: 500 }
    );
  }
}
