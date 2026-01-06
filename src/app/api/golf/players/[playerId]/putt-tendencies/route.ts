import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { PlayerPuttTendencies } from '@/lib/types/golf';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('player_putt_tendencies')
      .select('*')
      .eq('player_id', playerId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        playerId: playerId,
        fullName: 'Unknown',
        totalMissedPutts: 0,
        missByType: {
          low: 0,
          high: 0,
          short: 0,
          long: 0,
          pull: 0,
          push: 0,
        },
        percentages: {
          lowMissPct: 0,
          highMissPct: 0,
          underReadTendency: 50,
          leaveShortTendency: 50,
        },
        byDistance: {
          inside5ft: { attempts: 0, made: 0, pct: 0 },
          fiveTo10ft: { attempts: 0, made: 0, pct: 0 },
          outside10ft: { attempts: 0, made: 0, pct: 0 },
        },
      } as PlayerPuttTendencies);
    }

    // Transform database result to PlayerPuttTendencies format
    const tendencies: PlayerPuttTendencies = {
      playerId: data.player_id,
      fullName: data.full_name || 'Unknown',
      totalMissedPutts: data.total_missed_putts || 0,
      missByType: {
        low: data.low_misses || 0,
        high: data.high_misses || 0,
        short: data.short_misses || 0,
        long: data.long_misses || 0,
        pull: data.pull_misses || 0,
        push: data.push_misses || 0,
      },
      percentages: {
        lowMissPct: data.low_miss_pct || 0,
        highMissPct: data.high_miss_pct || 0,
        underReadTendency: data.under_read_tendency || 50,
        leaveShortTendency: data.leave_short_tendency || 50,
      },
      byDistance: {
        inside5ft: {
          attempts: (data.misses_inside_5ft || 0) + (data.made_inside_5ft || 0),
          made: data.made_inside_5ft || 0,
          pct: (data.misses_inside_5ft || 0) + (data.made_inside_5ft || 0) > 0
            ? Math.round(((data.made_inside_5ft || 0) / ((data.misses_inside_5ft || 0) + (data.made_inside_5ft || 0))) * 100)
            : 0,
        },
        fiveTo10ft: {
          attempts: (data.misses_5_to_10ft || 0) + (data.made_5_to_10ft || 0),
          made: data.made_5_to_10ft || 0,
          pct: (data.misses_5_to_10ft || 0) + (data.made_5_to_10ft || 0) > 0
            ? Math.round(((data.made_5_to_10ft || 0) / ((data.misses_5_to_10ft || 0) + (data.made_5_to_10ft || 0))) * 100)
            : 0,
        },
        outside10ft: {
          attempts: (data.misses_outside_10ft || 0) + (data.made_outside_10ft || 0),
          made: data.made_outside_10ft || 0,
          pct: (data.misses_outside_10ft || 0) + (data.made_outside_10ft || 0) > 0
            ? Math.round(((data.made_outside_10ft || 0) / ((data.misses_outside_10ft || 0) + (data.made_outside_10ft || 0))) * 100)
            : 0,
        },
      },
    };

    return NextResponse.json(tendencies);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
