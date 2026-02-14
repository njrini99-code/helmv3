'use client';

import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { AdminToastProvider, useAdminToast } from './AdminToast';
import { useAdminRealtime, type UseAdminRealtimeReturn } from '@/hooks/useAdminRealtime';
import { useAdminPresence, type UseAdminPresenceReturn } from '@/hooks/useAdminPresence';
import { useAdminAlerts, type UseAdminAlertsReturn, type AdminAlert } from '@/hooks/useAdminAlerts';

// ============================================
// TYPES
// ============================================

export interface AdminRealtimeContextValue {
  /** Real-time event stream */
  realtime: UseAdminRealtimeReturn;
  /** Admin presence tracking */
  presence: UseAdminPresenceReturn;
  /** Alert management */
  alerts: UseAdminAlertsReturn;
  /** Current user ID */
  currentUserId: string | null;
}

// ============================================
// CONTEXT
// ============================================

const AdminRealtimeContext = createContext<AdminRealtimeContextValue | null>(null);

// ============================================
// INNER PROVIDER (uses toast context)
// ============================================

interface AdminRealtimeInnerProviderProps {
  children: React.ReactNode;
  currentUserId: string | null;
  currentTab: string;
}

function AdminRealtimeInnerProvider({
  children,
  currentUserId,
  currentTab,
}: AdminRealtimeInnerProviderProps) {
  const toast = useAdminToast();

  // Real-time event stream
  const realtime = useAdminRealtime({
    maxEvents: 50,
    autoReconnect: true,
  });

  // Presence tracking
  const presence = useAdminPresence();

  // Update presence when tab changes
  useEffect(() => {
    presence.updatePresence(currentTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we only want to update when tab changes
  }, [currentTab]);

  // Alert handler with toast integration
  const handleNewAlert = useCallback((alert: AdminAlert) => {
    const { event } = alert;

    switch (event.severity) {
      case 'critical':
        toast.critical(
          event.title,
          event.message || 'A critical issue requires immediate attention'
        );
        break;
      case 'error':
        toast.error(
          event.title,
          event.message || undefined
        );
        break;
      case 'warning':
        toast.warning(
          event.title,
          event.message || undefined
        );
        break;
      // Don't toast for info level
    }
  }, [toast]);

  // Alerts with toast integration
  const alerts = useAdminAlerts({
    minSeverity: 'warning',
    maxAlerts: 100,
    onNewAlert: handleNewAlert,
  });

  const value: AdminRealtimeContextValue = {
    realtime,
    presence,
    alerts,
    currentUserId,
  };

  return (
    <AdminRealtimeContext.Provider value={value}>
      {children}
    </AdminRealtimeContext.Provider>
  );
}

// ============================================
// MAIN PROVIDER
// ============================================

interface AdminRealtimeProviderProps {
  children: React.ReactNode;
  currentUserId: string | null;
  currentTab: string;
}

export function AdminRealtimeProvider({
  children,
  currentUserId,
  currentTab,
}: AdminRealtimeProviderProps) {
  return (
    <AdminToastProvider position="top-right" maxToasts={5} soundEnabled>
      <AdminRealtimeInnerProvider
        currentUserId={currentUserId}
        currentTab={currentTab}
      >
        {children}
      </AdminRealtimeInnerProvider>
    </AdminToastProvider>
  );
}

// ============================================
// HOOK
// ============================================

export function useAdminRealtimeContext(): AdminRealtimeContextValue {
  const context = useContext(AdminRealtimeContext);
  if (!context) {
    throw new Error('useAdminRealtimeContext must be used within AdminRealtimeProvider');
  }
  return context;
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

export { useAdminToast } from './AdminToast';
