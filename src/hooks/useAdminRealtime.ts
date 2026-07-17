'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export type AdminEventType = 
  | 'error' 
  | 'signup' 
  | 'round_submitted' 
  | 'ai_generation' 
  | 'login' 
  | 'feature_use'
  | 'client_error'
  | 'api_error';

export type AdminEventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AdminEvent {
  id: string;
  event_type: AdminEventType;
  severity: AdminEventSeverity;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  url: string | null;
  stack_trace: string | null;
  browser_info: Record<string, unknown> | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface UseAdminRealtimeOptions {
  /** Maximum events to keep in state */
  maxEvents?: number;
  /** Filter by event types */
  eventTypes?: AdminEventType[];
  /** Filter by minimum severity */
  minSeverity?: AdminEventSeverity;
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
}

export interface UseAdminRealtimeReturn {
  /** Recent events (most recent first) */
  events: AdminEvent[];
  /** Whether connected to realtime */
  isConnected: boolean;
  /** Connection error, if any */
  error: Error | null;
  /** Connection state */
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Clear all events */
  clearEvents: () => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Event counts by severity */
  counts: {
    total: number;
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
}

// Severity levels for filtering
const SEVERITY_LEVELS: Record<AdminEventSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

// ============================================
// HOOK
// ============================================

export function useAdminRealtime(options: UseAdminRealtimeOptions = {}): UseAdminRealtimeReturn {
  const {
    maxEvents = 50,
    eventTypes,
    minSeverity = 'info',
    autoReconnect = true,
  } = options;

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [error, setError] = useState<Error | null>(null);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);
  // Monotonic per-connect() counter, suffixed onto the channel topic so a
  // fresh channel never shares its name with one whose async removeChannel()
  // leave (phx_leave over the socket) hasn't completed yet — reusing the
  // static topic name here is what let a channel already in 'joined' state
  // receive a late .on() call and throw "cannot add postgres_changes
  // callbacks after subscribe()" in prod.
  const channelIdRef = useRef(0);
  const [supabase] = useState(() => createClient());

  // Calculate event counts by severity
  const counts = {
    total: events.length,
    info: events.filter(e => e.severity === 'info').length,
    warning: events.filter(e => e.severity === 'warning').length,
    error: events.filter(e => e.severity === 'error').length,
    critical: events.filter(e => e.severity === 'critical').length,
  };

  // Check if an event passes the filters
  const shouldIncludeEvent = useCallback((event: AdminEvent): boolean => {
    // Check event type filter
    if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(event.event_type)) {
      return false;
    }
    
    // Check severity filter
    if (SEVERITY_LEVELS[event.severity] < SEVERITY_LEVELS[minSeverity]) {
      return false;
    }
    
    return true;
  }, [eventTypes, minSeverity]);

  // Handle new event from realtime
  const handleNewEvent = useCallback((payload: RealtimePostgresChangesPayload<AdminEvent>) => {
    const newEvent = payload.new as AdminEvent;
    
    if (!shouldIncludeEvent(newEvent)) {
      return;
    }

    setEvents(prev => {
      // Avoid duplicates
      if (prev.some(e => e.id === newEvent.id)) {
        return prev;
      }
      // Add to front and limit size
      return [newEvent, ...prev].slice(0, maxEvents);
    });
  }, [shouldIncludeEvent, maxEvents]);

  // Clear all events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Connect to realtime channel
  const connect = useCallback(() => {
    try {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Clean up existing channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {
          // Ignore cleanup errors
        });
        channelRef.current = null;
      }

      setConnectionState('connecting');
      setError(null);
      setIsConnected(false);
      isConnectedRef.current = false;

      channelIdRef.current += 1;
      const channelName = `admin-realtime-events-${channelIdRef.current}`;

      // Create channel for admin_events table (primary) + fallback to admin_client_errors
      const channel = supabase
        .channel(channelName, {
          config: {
            presence: { key: 'admin-dashboard' },
          },
        })
        // Listen for admin_events if table exists
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_events',
          },
          handleNewEvent
        )
        // NOTE: admin_client_errors was a prior-architecture table for client
        // error capture, superseded when the client-error path was
        // consolidated into error_logs + admin_events (the same pair the
        // server-side logger writes to — see server-error-logger.ts and
        // src/app/api/log-error/route.ts). Nothing writes to
        // admin_client_errors anymore, so the realtime fallback subscription
        // that used to live here was permanently inert; removed rather than
        // kept as dead weight a future on-call could mistake for a live path.
        // Listen for API errors
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_api_perf_log',
            filter: 'status=eq.error',
          },
          (payload) => {
            const apiError = payload.new as {
              id: string;
              action_name: string;
              error_message: string | null;
              duration_ms: number;
              user_id: string | null;
              metadata: Record<string, unknown> | null;
              created_at: string;
            };

            const event: AdminEvent = {
              id: apiError.id,
              event_type: 'api_error',
              severity: 'error',
              title: `API Error: ${apiError.action_name}`,
              message: apiError.error_message,
              metadata: { ...apiError.metadata, duration_ms: apiError.duration_ms },
              user_id: apiError.user_id,
              user_email: null,
              url: null,
              stack_trace: null,
              browser_info: null,
              resolved: false,
              resolved_at: null,
              resolved_by: null,
              created_at: apiError.created_at,
            };

            if (shouldIncludeEvent(event)) {
              setEvents(prev => [event, ...prev].slice(0, maxEvents));
            }
          }
        );

      channelRef.current = channel;

      channel.subscribe((status) => {
        if (channelRef.current !== channel) {
          return;
        }

        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          isConnectedRef.current = true;
          setConnectionState('connected');
          setError(null);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          isConnectedRef.current = false;
          setConnectionState(status === 'CHANNEL_ERROR' ? 'error' : 'disconnected');
          
          // Auto-reconnect on error
          if (autoReconnect && status === 'CHANNEL_ERROR') {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 5000);
          }
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false);
          isConnectedRef.current = false;
          setConnectionState('error');
          setError(new Error('Connection timed out'));
          
          if (autoReconnect) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 3000);
          }
        }
      });

    } catch (err) {
      console.error('Failed to connect to realtime channel:', err);
      setConnectionState('error');
      setError(err instanceof Error ? err : new Error('Failed to connect'));
      setIsConnected(false);
      isConnectedRef.current = false;
    }
  }, [supabase, handleNewEvent, shouldIncludeEvent, maxEvents, autoReconnect]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    connect();
  }, [connect]);

  // Initialize connection
  useEffect(() => {
    connect();

    // Handle visibility change - reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnectedRef.current) {
        reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {
          // Ignore cleanup errors
        });
        channelRef.current = null;
      }
    };
  }, [connect, reconnect, supabase]);

  return {
    events,
    isConnected,
    error,
    connectionState,
    clearEvents,
    reconnect,
    counts,
  };
}
