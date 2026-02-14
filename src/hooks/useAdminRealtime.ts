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

export interface UseAdminRealtimeOptions {
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
  const supabase = createClient();

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
    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    setConnectionState('connecting');
    setError(null);

    // Create channel for admin_events table (primary) + fallback to admin_client_errors
    const channel = supabase
      .channel('admin-realtime-events', {
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
      // Also listen for client errors as fallback
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_client_errors',
        },
        (payload) => {
          // Transform client error to AdminEvent format
          const clientError = payload.new as {
            id: string;
            error_message: string;
            error_stack: string | null;
            page_url: string | null;
            user_id: string | null;
            user_agent: string | null;
            metadata: Record<string, unknown> | null;
            created_at: string;
          };

          const event: AdminEvent = {
            id: clientError.id,
            event_type: 'client_error',
            severity: 'error',
            title: 'Client Error',
            message: clientError.error_message,
            metadata: clientError.metadata,
            user_id: clientError.user_id,
            user_email: null,
            url: clientError.page_url,
            stack_trace: clientError.error_stack,
            browser_info: clientError.user_agent ? { userAgent: clientError.user_agent } : null,
            resolved: false,
            resolved_at: null,
            resolved_by: null,
            created_at: clientError.created_at,
          };

          if (shouldIncludeEvent(event)) {
            setEvents(prev => [event, ...prev].slice(0, maxEvents));
          }
        }
      )
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
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setConnectionState('connected');
          setError(null);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setConnectionState(status === 'CHANNEL_ERROR' ? 'error' : 'disconnected');
          
          // Auto-reconnect on error
          if (autoReconnect && status === 'CHANNEL_ERROR') {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 5000);
          }
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false);
          setConnectionState('error');
          setError(new Error('Connection timed out'));
          
          if (autoReconnect) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, 3000);
          }
        }
      });

    channelRef.current = channel;
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
      if (document.visibilityState === 'visible' && !isConnected) {
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
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [connect, reconnect, isConnected, supabase]);

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
