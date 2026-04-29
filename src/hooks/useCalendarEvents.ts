'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface CalendarEvent {
  id: string;
  team_id: string;
  title: string;
  event_type: string; // Accepts any event type string for flexibility across sports
  start_date: string; // Mapped from start_time (timestamptz)
  end_date: string | null; // Mapped from end_time (timestamptz)
  start_time: string | null; // Raw start_time from DB
  end_time: string | null; // Raw end_time from DB
  location?: string | null;
  description?: string | null;
  status?: string;
  all_day?: boolean;
  recurring?: boolean;
  created_by?: string | null;
  requires_rsvp?: boolean;
  rsvp_deadline?: string | null;
  max_attendees?: number | null;
  rsvp_confirmed_count?: number;
  rsvp_maybe_count?: number;
  rsvp_declined_count?: number;
  rsvp_pending_count?: number;
  rsvp_total_count?: number;
  // Recurring-series identity. Series root has recurrence_rule populated and
  // parent_event_id null; sibling occurrences carry parent_event_id pointing
  // back to the root.
  parent_event_id?: string | null;
  recurrence_rule?: string | null;
}

interface UseCalendarEventsOptions {
  teamId: string | null;
  startDate: Date;
  endDate: Date;
}

export function useCalendarEvents({ teamId, startDate, endDate }: UseCalendarEventsOptions) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    async function fetchEvents() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        const { data, error: fetchError } = await supabase
          .from('golf_events')
          .select('*')
          .eq('team_id', teamId!)
          .gte('start_time', startDate.toISOString())
          .lte('start_time', endDate.toISOString())
          .order('start_time', { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        // Map database events to CalendarEvent format
        // For all-day events, normalize dates to prevent timezone shift
        const mappedEvents = (data || []).map(event => {
          let startDateVal = event.start_time;
          let endDateVal = event.end_time || event.start_time;
          if (event.all_day) {
            const normalize = (d: string) => `${d.slice(0, 10)}T00:00:00`;
            startDateVal = normalize(startDateVal);
            endDateVal = normalize(endDateVal);
          }
          return {
            ...event,
            start_date: startDateVal,
            end_date: endDateVal,
          } as CalendarEvent;
        });

        setEvents(mappedEvents);
      } catch (err) {
        console.error('Error fetching calendar events:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, [teamId, startDate, endDate]);

  return { events, loading, error };
}
