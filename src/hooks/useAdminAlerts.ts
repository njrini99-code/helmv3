'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAdminRealtime, type AdminEvent, type AdminEventSeverity } from './useAdminRealtime';

// ============================================
// TYPES
// ============================================

export interface AdminAlert {
  id: string;
  event: AdminEvent;
  isRead: boolean;
  createdAt: Date;
}

export interface UseAdminAlertsOptions {
  /** Minimum severity to create alerts for */
  minSeverity?: AdminEventSeverity;
  /** Maximum alerts to keep */
  maxAlerts?: number;
  /** Callback when a new alert is created */
  onNewAlert?: (alert: AdminAlert) => void;
  /** Enable toast notifications for alerts */
  enableToasts?: boolean;
}

export interface UseAdminAlertsReturn {
  /** All alerts (read and unread) */
  alerts: AdminAlert[];
  /** Unread alerts only */
  unreadAlerts: AdminAlert[];
  /** Count of unread alerts */
  unreadCount: number;
  /** Count by severity */
  severityCounts: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
  /** Mark an alert as read */
  markAsRead: (id: string) => void;
  /** Mark all alerts as read */
  markAllAsRead: () => void;
  /** Clear all alerts */
  clearAlerts: () => void;
  /** Remove a specific alert */
  removeAlert: (id: string) => void;
  /** Real-time connection status */
  isConnected: boolean;
  /** Connection error if any */
  error: Error | null;
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

export function useAdminAlerts(options: UseAdminAlertsOptions = {}): UseAdminAlertsReturn {
  const {
    minSeverity = 'warning', // Only create alerts for warning and above by default
    maxAlerts = 100,
    onNewAlert,
  } = options;

  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const processedEventsRef = useRef<Set<string>>(new Set());

  // Use the realtime hook to get events
  const { events, isConnected, error } = useAdminRealtime({
    maxEvents: maxAlerts,
    minSeverity: 'info', // Get all events, we'll filter for alerts
  });

  // Process new events and create alerts
  useEffect(() => {
    events.forEach((event) => {
      // Skip if already processed
      if (processedEventsRef.current.has(event.id)) {
        return;
      }

      // Skip if below minimum severity
      if (SEVERITY_LEVELS[event.severity] < SEVERITY_LEVELS[minSeverity]) {
        return;
      }

      processedEventsRef.current.add(event.id);

      const alert: AdminAlert = {
        id: event.id,
        event,
        isRead: false,
        createdAt: new Date(event.created_at),
      };

      setAlerts((prev) => {
        // Add to front and limit size
        const updated = [alert, ...prev].slice(0, maxAlerts);
        return updated;
      });

      // Trigger callback
      if (onNewAlert) {
        onNewAlert(alert);
      }
    });
  }, [events, minSeverity, maxAlerts, onNewAlert]);

  // Computed values
  const unreadAlerts = alerts.filter((a) => !a.isRead);
  const unreadCount = unreadAlerts.length;

  const severityCounts = {
    info: unreadAlerts.filter((a) => a.event.severity === 'info').length,
    warning: unreadAlerts.filter((a) => a.event.severity === 'warning').length,
    error: unreadAlerts.filter((a) => a.event.severity === 'error').length,
    critical: unreadAlerts.filter((a) => a.event.severity === 'critical').length,
  };

  // Actions
  const markAsRead = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    processedEventsRef.current.clear();
  }, []);

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    alerts,
    unreadAlerts,
    unreadCount,
    severityCounts,
    markAsRead,
    markAllAsRead,
    clearAlerts,
    removeAlert,
    isConnected,
    error,
  };
}

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Hook that combines useAdminAlerts with toast notifications
 * Must be used within AdminToastProvider
 */
export function useAdminAlertsWithToast(
  toastFn: {
    warning: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    critical: (title: string, message?: string) => void;
  },
  options: UseAdminAlertsOptions = {}
) {
  const alertsResult = useAdminAlerts({
    ...options,
    onNewAlert: (alert) => {
      // Trigger toast based on severity
      const { event } = alert;
      
      switch (event.severity) {
        case 'critical':
          toastFn.critical(
            event.title,
            event.message || 'A critical issue requires immediate attention'
          );
          break;
        case 'error':
          toastFn.error(
            event.title,
            event.message || undefined
          );
          break;
        case 'warning':
          toastFn.warning(
            event.title,
            event.message || undefined
          );
          break;
      }

      // Also call original callback
      options.onNewAlert?.(alert);
    },
  });

  return alertsResult;
}

/**
 * Get a human-readable description of the alert
 */
export function getAlertDescription(alert: AdminAlert): string {
  const { event } = alert;
  
  switch (event.event_type) {
    case 'client_error':
      return event.message || 'Client-side error occurred';
    case 'api_error':
      return event.message || 'API error occurred';
    case 'error':
      return event.message || 'An error occurred';
    case 'signup':
      return `New user signup: ${event.user_email || 'Unknown user'}`;
    case 'login':
      return `User login: ${event.user_email || 'Unknown user'}`;
    case 'round_submitted':
      return 'New round submitted';
    case 'ai_generation':
      return 'AI content generated';
    case 'feature_use':
      return event.message || 'Feature usage tracked';
    default:
      return event.message || event.title;
  }
}

/**
 * Get severity color classes
 */
export function getSeverityClasses(severity: AdminEventSeverity): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-200',
        dot: 'bg-red-600 animate-pulse',
      };
    case 'error':
      return {
        bg: 'bg-red-50',
        text: 'text-red-600',
        border: 'border-red-100',
        dot: 'bg-red-500',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-600',
        border: 'border-amber-100',
        dot: 'bg-amber-500',
      };
    case 'info':
    default:
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-100',
        dot: 'bg-blue-500',
      };
  }
}
