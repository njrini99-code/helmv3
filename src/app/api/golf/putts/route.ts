import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const puttDetailsSchema = z.object({
  shotId: z.string().uuid(),
  missTags: z.array(z.enum(['low', 'high', 'short', 'long', 'pull', 'push'])),
  breakDirection: z.enum(['left_to_right', 'right_to_left', 'straight']).optional(),
  estimatedBreakInches: z.number().int().min(0).max(36).optional(),
  distanceFeet: z.number().min(0).max(100).optional(),
  made: z.boolean()
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const body = await request.json();
    const result = puttDetailsSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
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
