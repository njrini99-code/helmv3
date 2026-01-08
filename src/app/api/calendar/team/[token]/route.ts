/**
 * Team Calendar iCal Feed API Route
 *
 * GET /api/calendar/team/[token]
 * Returns iCal format calendar for a team
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateTeamCalendar, convertToICalEvent, type ICalEvent } from '@/lib/calendar/ical';
import { expandRecurringEvent } from '@/lib/calendar/recurrence';
import { addMonths, format } from 'date-fns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return new NextResponse('Missing token', { status: 400 });
    }

    const supabase = await createClient();

    // Find team by feed token
    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id, name, calendar_feed_enabled')
      .eq('calendar_feed_token', token)
      .single();

    if (teamError || !team) {
      return new NextResponse('Invalid or expired feed token', { status: 404 });
    }

    if (!team.calendar_feed_enabled) {
      return new NextResponse('Calendar feed is disabled', { status: 403 });
    }

    // Get team events (6 months range - 3 months past, 3 months future)
    const today = new Date();
    const startDate = addMonths(today, -3);
    const endDate = addMonths(today, 3);

    const { data: events, error: eventsError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('team_id', team.id)
      .gte('start_date', format(startDate, 'yyyy-MM-dd'))
      .lte('start_date', format(endDate, 'yyyy-MM-dd'))
      .order('start_date', { ascending: true });

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return new NextResponse('Error fetching events', { status: 500 });
    }

    // Convert events to iCal format and expand recurring events
    const iCalEvents: ICalEvent[] = [];

    for (const event of events || []) {
      if (event.recurrence_rule) {
        // Expand recurring event
        const expandedEvents = expandRecurringEvent(
          {
            id: event.id,
            title: event.title,
            eventType: event.event_type,
            startDate: new Date(event.start_date),
            endDate: event.end_date ? new Date(event.end_date) : null,
            startTime: event.start_time,
            endTime: event.end_time,
            recurrenceRule: event.recurrence_rule,
            recurrenceParentId: event.recurrence_parent_id,
            originalStartDate: event.original_start_date ? new Date(event.original_start_date) : null,
            isException: event.is_exception || false,
          },
          startDate,
          endDate,
          [], // No exclusions for iCal export
          [] // No academic exclusions for iCal export
        );

        // Convert each instance
        for (const expandedEvent of expandedEvents) {
          iCalEvents.push(convertToICalEvent({
            ...event,
            id: expandedEvent.id,
            start_date: format(expandedEvent.startDate, 'yyyy-MM-dd'),
            end_date: expandedEvent.endDate ? format(expandedEvent.endDate, 'yyyy-MM-dd') : null,
          }));
        }
      } else {
        // Regular event
        iCalEvents.push(convertToICalEvent(event));
      }
    }

    // Generate iCal content
    const icalContent = generateTeamCalendar(team.name, iCalEvents);

    // Log access (optional)
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';

    await supabase
      .from('golf_calendar_feed_access')
      .insert({
        feed_token: token,
        feed_type: 'team',
        user_agent: userAgent,
        ip_address: ip,
      });

    // Return iCal file
    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${team.name.replace(/[^a-z0-9]/gi, '_')}_calendar.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating team calendar:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
