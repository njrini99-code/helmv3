'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Attendance status types (based on golf_event_attendance.status)
 */
export type AttendanceStatus = 'confirmed' | 'maybe' | 'declined' | 'pending' | string;

/**
 * Individual attendance/RSVP record
 * Based on golf_event_attendance table schema
 */
export interface EventAttendance {
  id: string;
  event_id: string;
  player_id: string;
  player_name: string;
  status: AttendanceStatus | null;
  rsvp_at: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  notes: string | null;
  created_at: string | null;
}

/**
 * Attendance counts summary
 */
export interface AttendanceCounts {
  confirmed: number;
  maybe: number;
  declined: number;
  pending: number;
  checked_in: number;
  total: number;
}

/**
 * Event with attendance data
 */
export interface EventWithAttendance {
  id: string;
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  status: string | null;
  attendance_counts: AttendanceCounts;
  attendance: EventAttendance[];
}

interface UseAttendanceRealtimeResult {
  event: EventWithAttendance | null;
  attendance: EventAttendance[];
  counts: AttendanceCounts;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for real-time attendance/RSVP count updates
 *
 * Subscribes to:
 * - golf_event_attendance: For RSVP response and check-in changes
 * - golf_events: For event updates
 *
 * @param eventId - The event ID to subscribe to
 */
export function useAttendanceRealtime(eventId: string | null): UseAttendanceRealtimeResult {
  const [event, setEvent] = useState<EventWithAttendance | null>(null);
  const [attendance, setAttendance] = useState<EventAttendance[]>([]);
  const [counts, setCounts] = useState<AttendanceCounts>({
    confirmed: 0,
    maybe: 0,
    declined: 0,
    pending: 0,
    checked_in: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchEventAttendance = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setAttendance([]);
      setCounts({ confirmed: 0, maybe: 0, declined: 0, pending: 0, checked_in: 0, total: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from('golf_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;

      // Fetch attendance records with player info
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('golf_event_attendance')
        .select(`
          *,
          player:golf_players(id, first_name, last_name)
        `)
        .eq('event_id', eventId)
        .order('rsvp_at', { ascending: false, nullsFirst: true });

      if (attendanceError) throw attendanceError;

      // Transform attendance to include player name
      const transformedAttendance: EventAttendance[] = (attendanceData || []).map((record) => {
        const player = record.player as { id: string; first_name: string | null; last_name: string | null } | null;
        return {
          id: record.id,
          event_id: record.event_id,
          player_id: record.player_id,
          player_name: player
            ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player'
            : 'Unknown Player',
          status: record.status,
          rsvp_at: record.rsvp_at,
          checked_in: record.checked_in ?? false,
          checked_in_at: record.checked_in_at,
          notes: record.notes,
          created_at: record.created_at,
        };
      });

      setAttendance(transformedAttendance);

      // Calculate counts from attendance records
      const calculatedCounts: AttendanceCounts = {
        confirmed: transformedAttendance.filter(r => r.status === 'confirmed').length,
        maybe: transformedAttendance.filter(r => r.status === 'maybe').length,
        declined: transformedAttendance.filter(r => r.status === 'declined').length,
        pending: transformedAttendance.filter(r => r.status === 'pending' || !r.status).length,
        checked_in: transformedAttendance.filter(r => r.checked_in).length,
        total: transformedAttendance.length,
      };

      setCounts(calculatedCounts);

      // Set full event with attendance data
      setEvent({
        id: eventData.id,
        team_id: eventData.team_id,
        title: eventData.title,
        event_type: eventData.event_type,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        location: eventData.location,
        status: eventData.status,
        attendance_counts: calculatedCounts,
        attendance: transformedAttendance,
      });
    } catch (err) {
      console.error('Error fetching event attendance:', err);
      setError(err instanceof Error ? err.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEventAttendance();

    if (!eventId) return;

    // Set up real-time subscription
    const channel = supabase
      .channel(`attendance-${eventId}`)
      // Listen for attendance changes (RSVP updates, check-ins)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_event_attendance',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Refetch to get updated counts and attendance list
          fetchEventAttendance();
        }
      )
      // Listen for event updates
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_events',
          filter: `id=eq.${eventId}`,
        },
        () => {
          fetchEventAttendance();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, fetchEventAttendance]);

  return {
    event,
    attendance,
    counts,
    loading,
    error,
    refetch: fetchEventAttendance,
  };
}

// Export alias for backwards compatibility
export const useRSVPRealtime = useAttendanceRealtime;

/**
 * Hook for real-time attendance updates across all events for a team
 * Useful for calendar views showing attendance status on multiple events
 *
 * @param teamId - The team ID to get events for
 * @param options - Filter options for events
 */
export function useTeamEventsAttendanceRealtime(
  teamId: string | null,
  options?: {
    startDate?: string;
    endDate?: string;
  }
) {
  const [events, setEvents] = useState<EventWithAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchEvents = useCallback(async () => {
    if (!teamId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('golf_events')
        .select('*')
        .eq('team_id', teamId);

      if (options?.startDate) {
        query = query.gte('start_time', options.startDate);
      }
      if (options?.endDate) {
        query = query.lte('start_time', options.endDate);
      }

      const { data: eventsData, error: eventsError } = await query
        .order('start_time', { ascending: true });

      if (eventsError) throw eventsError;

      // Get event IDs for batch attendance fetch
      const eventIds = (eventsData || []).map(e => e.id);

      // Fetch all attendance records for these events
      let attendanceByEvent = new Map<string, AttendanceCounts>();

      if (eventIds.length > 0) {
        const { data: allAttendance, error: attendanceError } = await supabase
          .from('golf_event_attendance')
          .select('event_id, status, checked_in')
          .in('event_id', eventIds);

        if (attendanceError) throw attendanceError;

        // Group and count by event
        (allAttendance || []).forEach(record => {
          const existing = attendanceByEvent.get(record.event_id) || {
            confirmed: 0,
            maybe: 0,
            declined: 0,
            pending: 0,
            checked_in: 0,
            total: 0,
          };

          if (record.status === 'confirmed') existing.confirmed++;
          else if (record.status === 'maybe') existing.maybe++;
          else if (record.status === 'declined') existing.declined++;
          else existing.pending++;

          if (record.checked_in) existing.checked_in++;
          existing.total++;

          attendanceByEvent.set(record.event_id, existing);
        });
      }

      // Transform events with attendance counts
      const transformedEvents: EventWithAttendance[] = (eventsData || []).map((event) => ({
        id: event.id,
        team_id: event.team_id,
        title: event.title,
        event_type: event.event_type,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
        status: event.status,
        attendance_counts: attendanceByEvent.get(event.id) || {
          confirmed: 0,
          maybe: 0,
          declined: 0,
          pending: 0,
          checked_in: 0,
          total: 0,
        },
        attendance: [], // Not loading individual attendance for list view
      }));

      setEvents(transformedEvents);
    } catch (err) {
      console.error('Error fetching team events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [teamId, options?.startDate, options?.endDate]);

  useEffect(() => {
    fetchEvents();

    if (!teamId) return;

    const channel = supabase
      .channel(`team-events-attendance-${teamId}`)
      // Listen for event changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_events',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          fetchEvents();
        }
      )
      // Listen for attendance changes (will refetch to update counts)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_event_attendance',
        },
        () => {
          // Refetch to update attendance counts
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, fetchEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchEvents,
  };
}

// Export alias for backwards compatibility
export const useTeamEventsRSVPRealtime = useTeamEventsAttendanceRealtime;
