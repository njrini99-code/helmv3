/**
 * Player Calendar iCal Feed API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePlayerCalendar, convertToICalEvent } from '@/lib/calendar/ical';
import { addMonths, format } from 'date-fns';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;
    const supabase = await createClient();

    // Find player by feed token
    const { data: player, error } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, team_id, calendar_feed_enabled')
      .eq('calendar_feed_token', token)
      .single();

    if (error || !player || !player.calendar_feed_enabled) {
      return new NextResponse('Invalid or disabled feed', { status: 404 });
    }

    // Get events player is involved in (6 months range)
    const today = new Date();
    const startDate = addMonths(today, -3);
    const endDate = addMonths(today, 3);

    const { data: events } = await supabase
      .from('golf_events')
      .select('*')
      .eq('team_id', player.team_id)
      .gte('start_date', format(startDate, 'yyyy-MM-dd'))
      .lte('start_date', format(endDate, 'yyyy-MM-dd'))
      .order('start_date', { ascending: true });

    const iCalEvents = (events || []).map(convertToICalEvent);
    const playerName = `${player.first_name} ${player.last_name}`;
    const icalContent = generatePlayerCalendar(playerName, iCalEvents);

    // Log access
    await supabase.from('golf_calendar_feed_access').insert({
      feed_token: token,
      feed_type: 'player',
      user_agent: request.headers.get('user-agent') || 'unknown',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
    });

    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${playerName.replace(/[^a-z0-9]/gi, '_')}_calendar.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating player calendar:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
