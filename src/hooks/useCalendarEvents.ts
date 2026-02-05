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
}

export interface UseCalendarEventsOptions {
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
        const mappedEvents = (data || []).map(event => ({
          ...event,
          start_date: event.start_time, // Map start_time to start_date for interface compatibility
          end_date: event.end_time || event.start_time,
        } as CalendarEvent));

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
