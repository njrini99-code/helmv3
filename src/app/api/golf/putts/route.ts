import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const puttDetailsSchema = z.object({
  shotId: z.string().uuid(),
  missTags: z.array(z.enum(['short', 'low', 'high'])),
  breakDirection: z.enum(['left_to_right', 'right_to_left', 'straight']).optional(),
  estimatedBreakInches: z.number().int().min(0).max(36).optional(),
  distanceFeet: z.number().min(0).max(100).optional(),
  made: z.boolean()
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const result = puttDetailsSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id')
      .eq('id', result.data.shotId)
      .single();

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .eq('id', shot.round_id)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id, user_id')
      .eq('id', round.player_id)
      .single();

    if (playerError || !player || player.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('putt_details')
      .upsert({
        shot_id: result.data.shotId,
        miss_tags: result.data.missTags,
        break_direction: result.data.breakDirection,
        estimated_break_inches: result.data.estimatedBreakInches,
        distance_feet: result.data.distanceFeet,
        made: result.data.made
      }, {
        onConflict: 'shot_id'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
