/**
 * Coach Calendar iCal Feed API Route
 *
 * Generates iCal feed for coach's calendar events with proper timezone handling.
 * Timezone is fetched from the team's settings (golf_team_settings).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCoachCalendar, convertToICalEvent } from '@/lib/calendar/ical';
import { getValidTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';
import { addMonths, format } from 'date-fns';

/**
 * Get timezone for a coach's team from golf_team_settings
 */
async function getCoachTeamTimezone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string | null
): Promise<string> {
  if (!organizationId) return DEFAULT_TIMEZONE;

  // Get team via organization
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!team?.id) return DEFAULT_TIMEZONE;

  // Get team settings with timezone
  const { data: settings } = await supabase
    .from('golf_team_settings')
    .select('timezone')
    .eq('team_id', team.id)
    .maybeSingle();

  return getValidTimezone(settings?.timezone);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Note: token validation not implemented yet - would need calendar_feed_token column on golf_coaches
    const { token: _token } = await params;
    const supabase = await createClient();

    // Find coach by feed token
    // Note: golf_coaches uses full_name instead of first_name/last_name
    // Note: calendar_feed_token and calendar_feed_enabled not currently in golf_coaches schema
    const { data: coach, error } = await supabase
      .from('golf_coaches')
      .select('id, full_name, organization_id')
      .single();

    if (error || !coach) {
      return new NextResponse('Invalid or disabled feed', { status: 404 });
    }

    // Get team timezone for proper calendar display
    const teamTimezone = await getCoachTeamTimezone(supabase, coach.organization_id);

    // Get events coach created (6 months range)
    const today = new Date();
    const startDate = addMonths(today, -3);
    const endDate = addMonths(today, 3);

    const { data: events } = await supabase
      .from('golf_events')
      .select('*')
      .eq('created_by', coach.id)
      .gte('start_time', format(startDate, 'yyyy-MM-dd'))
      .lte('start_time', format(endDate, 'yyyy-MM-dd'))
      .order('start_time', { ascending: true });

    // Map golf_events fields to CalendarEventRow format expected by convertToICalEvent
    const iCalEvents = (events || []).map((event) => convertToICalEvent({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      course_name: null, // golf_events doesn't have course_name, use location instead
      start_date: event.start_time, // start_time is the date/datetime string
      end_date: event.end_time, // end_time is the date/datetime string
      start_time: null, // Already encoded in start_date
      end_time: null, // Already encoded in end_date
      all_day: event.all_day,
      recurrence_rule: event.recurrence_rule,
      created_at: event.created_at,
      updated_at: event.updated_at,
    }));
    const coachName = coach.full_name || 'Coach';

    // Generate calendar with team timezone
    const icalContent = generateCoachCalendar(coachName, iCalEvents, teamTimezone);

    // Note: calendar feed access logging table doesn't exist yet
    // Could be added in future migration if needed

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
