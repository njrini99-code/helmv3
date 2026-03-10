'use client';

import { useState, useEffect, useCallback } from 'react';
import { respondToEvent, getPendingInvitations, getEventRSVP, getPlayerEventRSVP } from '@/app/golf/actions/golf';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type RSVPStatus = 'pending' | 'accepted' | 'declined' | 'tentative';

export interface EventInvitation {
  eventId: string;
  eventTitle: string;
  eventType: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  requiresRsvp: boolean;
  rsvpDeadline: string | null;
  createdBy: string | null;
  status: RSVPStatus;
}

export interface RSVPSummary {
  accepted: number;
  declined: number;
  tentative: number;
  pending: number;
  total: number;
  attendees: Array<{
    playerId: string;
    playerName: string;
    avatarUrl: string | null;
    status: RSVPStatus;
    respondedAt: string | null;
  }>;
}

interface UseRSVPOptions {
  eventId?: string; // For coach view - get RSVP summary for an event
  enabled?: boolean;
}

interface UseRSVPResult {
  invitations: EventInvitation[];
  rsvpSummary: RSVPSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  respond: (eventId: string, status: RSVPStatus) => Promise<{ success: boolean; error?: string }>;
}

interface PlayerEventRSVPResult {
  status: RSVPStatus | null;
  respondedAt: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  respond: (status: RSVPStatus) => Promise<{ success: boolean; error?: string }>;
}

// ============================================================================
// HOOK - PLAYER VIEW (Pending Invitations)
// ============================================================================

/**
 * Hook to manage RSVP invitations for players
 *
 * @example
 * ```tsx
 * // Player view - get pending invitations
 * const { invitations, isLoading, respond } = useRSVP();
 *
 * // Respond to invitation
 * await respond(eventId, 'accepted');
 * ```
 */
export function useRSVP({
  eventId,
  enabled = true,
}: UseRSVPOptions = {}): UseRSVPResult {
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [rsvpSummary, setRsvpSummary] = useState<RSVPSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pending invitations (player view)
  const fetchInvitations = useCallback(async () => {
    if (!enabled || eventId) return; // Skip if fetching event summary instead

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPendingInvitations();

      if (result.success) {
        setInvitations(result.data);
      } else {
        setError(result.error);
        setInvitations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setInvitations([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, eventId]);

  // Fetch RSVP summary (coach view)
  const fetchRSVPSummary = useCallback(async () => {
    if (!enabled || !eventId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getEventRSVP(eventId);

      if (result.success) {
        // Map RSVPStats to local RSVPSummary format
        const mappedSummary: RSVPSummary = {
          accepted: result.data.summary.accepted,
          declined: result.data.summary.declined,
          tentative: result.data.summary.tentative,
          pending: result.data.summary.pending,
          total: result.data.summary.total,
          attendees: result.data.summary.attendees,
        };
        setRsvpSummary(mappedSummary);
      } else {
        setError(result.error);
        setRsvpSummary(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setRsvpSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, eventId]);

  // Respond to invitation
  const respond = useCallback(async (
    targetEventId: string,
    status: RSVPStatus
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await respondToEvent(targetEventId, status);

      if (result.success) {
        // Optimistically update local state
        if (!eventId) {
          // Player view - update invitations list
          setInvitations(prev =>
            prev.map(inv =>
              inv.eventId === targetEventId ? { ...inv, status } : inv
            )
          );
        } else {
          // Coach view - refetch summary to get updated counts
          await fetchRSVPSummary();
        }
      }

      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'An error occurred',
      };
    }
  }, [eventId, fetchRSVPSummary]);

  // Initial fetch
  useEffect(() => {
    if (eventId) {
      fetchRSVPSummary();
    } else {
      fetchInvitations();
    }
  }, [eventId, fetchInvitations, fetchRSVPSummary]);

  // Real-time subscription for RSVP updates (coach view)
  useEffect(() => {
    if (!enabled || !eventId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`rsvp-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_event_attendance',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Refetch when attendance changes
          fetchRSVPSummary();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, eventId, fetchRSVPSummary]);

  return {
    invitations,
    rsvpSummary,
    isLoading,
    error,
    refetch: eventId ? fetchRSVPSummary : fetchInvitations,
    respond,
  };
}

// ============================================================================
// SIMPLIFIED HOOKS FOR SPECIFIC USE CASES
// ============================================================================

/**
 * Hook specifically for player pending invitations
 */
function usePendingInvitations() {
  return useRSVP();
}

/**
 * Hook specifically for event RSVP summary (coach view)
 */
export function useEventRSVP(eventId: string) {
  return useRSVP({ eventId });
}

/**
 * Hook for the current player's RSVP status on a specific event
 */
export function usePlayerEventRSVP(
  eventId?: string,
  enabled: boolean = true
): PlayerEventRSVPResult {
  const [status, setStatus] = useState<RSVPStatus | null>(null);
  const [respondedAt, setRespondedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!enabled || !eventId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPlayerEventRSVP(eventId);

      if (result.success) {
        setStatus(result.data?.status ?? null);
        setRespondedAt(result.data?.respondedAt ?? null);
      } else {
        setError(result.error);
        setStatus(null);
        setRespondedAt(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus(null);
      setRespondedAt(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, eventId]);

  const respond = useCallback(async (
    nextStatus: RSVPStatus
  ): Promise<{ success: boolean; error?: string }> => {
    if (!eventId) {
      return { success: false, error: 'Missing event id' };
    }

    const result = await respondToEvent(eventId, nextStatus);

    if (result.success) {
      setStatus(nextStatus);
      setRespondedAt(new Date().toISOString());
    } else if (result.error) {
      setError(result.error);
    }

    return result;
  }, [eventId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Real-time subscription for player's RSVP status
  useEffect(() => {
    if (!enabled || !eventId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`player-rsvp-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_event_attendance',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Refetch when attendance changes
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, eventId, fetchStatus]);

  return {
    status,
    respondedAt,
    isLoading,
    error,
    refetch: fetchStatus,
    respond,
  };
}
