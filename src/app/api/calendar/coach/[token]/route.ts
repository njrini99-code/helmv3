/**
 * Coach Calendar iCal Feed API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCoachCalendar, convertToICalEvent } from '@/lib/calendar/ical';
import { addMonths, format } from 'date-fns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    // Find coach by feed token
    // Note: golf_coaches uses full_name instead of first_name/last_name
    const { data: coach, error } = await supabase
      .from('golf_coaches')
      .select('id, full_name, team_id')
      .eq('calendar_feed_token', token)
      .single();

    // For now, calendar_feed_enabled is not in the schema, so we just check if coach exists
    if (error || !coach) {
      return new NextResponse('Invalid or disabled feed', { status: 404 });
    }

    // Get events coach created (6 months range)
    const today = new Date();
    const startDate = addMonths(today, -3);
    const endDate = addMonths(today, 3);

    const { data: events } = await supabase
      .from('golf_events')
      .select('*')
      .or(`created_by.eq.${coach.id},team_id.eq.${coach.team_id}`)
      .gte('start_date', format(startDate, 'yyyy-MM-dd'))
      .lte('start_date', format(endDate, 'yyyy-MM-dd'))
      .order('start_date', { ascending: true });

    const iCalEvents = (events || []).map(convertToICalEvent);
    const coachName = coach.full_name || 'Coach';
    const icalContent = generateCoachCalendar(coachName, iCalEvents);

    // Log access
    await supabase.from('golf_calendar_feed_access').insert({
      feed_token: token,
      feed_type: 'coach',
      user_agent: request.headers.get('user-agent') || 'unknown',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
    });

    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${coachName.replace(/[^a-z0-9]/gi, '_')}_calendar.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating coach calendar:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
