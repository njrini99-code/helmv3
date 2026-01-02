'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface CalendarEvent {
  id: string;
  team_id: string;
  title: string;
  event_type: string; // Accepts any event type string for flexibility across sports
  start_date: string;
  end_date: string | null;
  location?: string | null;
  description?: string | null;
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
          .gte('start_date', startDate.toISOString())
          .lte('start_date', endDate.toISOString())
          .order('start_date', { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        // Map database events to CalendarEvent format
        const mappedEvents = (data || []).map(event => ({
          ...event,
          start_time: event.start_date, // Temporary mapping for compatibility
          end_time: event.end_date || event.start_date,
          created_by_id: event.created_by || '',
          is_recurring: false,
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
