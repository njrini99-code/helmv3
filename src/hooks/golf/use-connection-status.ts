'use client';

/**
 * Connection Status Hook for Golf Shot Tracking
 *
 * Monitors network connectivity with advanced detection including:
 * - Online/offline status from navigator.onLine
 * - Actual connectivity testing via fetch
 * - Slow connection detection
 * - Connection quality metrics
 *
 * Features:
 * - Real-time online/offline detection
 * - Periodic connectivity verification
 * - Slow connection detection using Network Information API
 * - Last online timestamp tracking
 * - Connection quality classification
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

export interface ConnectionStatus {
  /** Whether the device reports being online */
  isOnline: boolean;
  /** Whether actual network requests succeed */
  isConnected: boolean;
  /** Whether the connection is slow (high latency or low bandwidth) */
  isSlowConnection: boolean;
  /** Timestamp of last confirmed online status */
  lastOnline: Date | null;
  /** Timestamp of last connectivity check */
  lastCheck: Date | null;
  /** Connection quality classification */
  quality: ConnectionQuality;
  /** Estimated round-trip time in ms (if available) */
  rtt: number | null;
  /** Effective connection type (4g, 3g, 2g, slow-2g) */
  effectiveType: string | null;
  /** Whether currently checking connectivity */
  isChecking: boolean;
  /** Error message from last connectivity check */
  error: string | null;
}

export interface UseConnectionStatusOptions {
  /** URL to ping for connectivity check (default: /api/health or a small resource) */
  pingUrl?: string;
  /** Interval between connectivity checks in ms (default: 30000 = 30s) */
  checkInterval?: number;
  /** Timeout for connectivity check in ms (default: 5000 = 5s) */
  checkTimeout?: number;
  /** Whether to automatically check connectivity (default: true) */
  autoCheck?: boolean;
  /** Callback when online status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** RTT threshold for slow connection in ms (default: 500) */
  slowConnectionThreshold?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PING_URL = '/api/health';
const DEFAULT_CHECK_INTERVAL = 30000; // 30 seconds
const DEFAULT_CHECK_TIMEOUT = 5000; // 5 seconds
const DEFAULT_SLOW_THRESHOLD = 500; // 500ms RTT

// ============================================================================
// HOOK
// ============================================================================

export function useConnectionStatus(options: UseConnectionStatusOptions = {}): ConnectionStatus & {
  checkNow: () => Promise<void>;
  retry: () => Promise<void>;
} {
  const {
    pingUrl = DEFAULT_PING_URL,
    checkInterval = DEFAULT_CHECK_INTERVAL,
    checkTimeout = DEFAULT_CHECK_TIMEOUT,
    autoCheck = true,
    onStatusChange,
    slowConnectionThreshold = DEFAULT_SLOW_THRESHOLD,
  } = options;

  // State
  const [status, setStatus] = useState<ConnectionStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isConnected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSlowConnection: false,
    lastOnline: null,
    lastCheck: null,
    quality: 'good',
    rtt: null,
    effectiveType: null,
    isChecking: false,
    error: null,
  });

  // Refs
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousOnlineRef = useRef<boolean>(status.isOnline);
  const onStatusChangeRef = useRef(onStatusChange);
  // Use ref for lastOnline to avoid circular dependency in checkConnectivity
  const lastOnlineRef = useRef<Date | null>(status.lastOnline);

  // Keep callback ref updated
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  /**
   * Get Network Information API data if available
   */
  const getNetworkInfo = useCallback(() => {
    if (typeof navigator === 'undefined') {
      return { rtt: null, effectiveType: null, isSlowConnection: false };
    }

    // Network Information API (experimental, not available in all browsers)
    const connection = (navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        rtt?: number;
        downlink?: number;
        saveData?: boolean;
      };
    }).connection;

    if (!connection) {
      return { rtt: null, effectiveType: null, isSlowConnection: false };
    }

    const rtt = connection.rtt || null;
    const effectiveType = connection.effectiveType || null;
    const isSlowConnection =
      rtt !== null && rtt > slowConnectionThreshold ||
      effectiveType === 'slow-2g' ||
      effectiveType === '2g' ||
      connection.saveData === true;

    return { rtt, effectiveType, isSlowConnection };
  }, [slowConnectionThreshold]);

  /**
   * Determine connection quality based on metrics
   */
  const determineQuality = useCallback((
    isOnline: boolean,
    isConnected: boolean,
    rtt: number | null,
    effectiveType: string | null
  ): ConnectionQuality => {
    if (!isOnline || !isConnected) {
      return 'offline';
    }

    // Use effective type if available
    if (effectiveType) {
      switch (effectiveType) {
        case '4g':
          return rtt !== null && rtt < 100 ? 'excellent' : 'good';
        case '3g':
          return 'fair';
        case '2g':
        case 'slow-2g':
          return 'poor';
      }
    }

    // Fall back to RTT-based classification
    if (rtt !== null) {
      if (rtt < 100) return 'excellent';
      if (rtt < 300) return 'good';
      if (rtt < 500) return 'fair';
      return 'poor';
    }

    // Default to good if online but no metrics
    return 'good';
  }, []);

  /**
   * Check actual connectivity by making a request
   */
  const checkConnectivity = useCallback(async (): Promise<void> => {
    setStatus(prev => ({ ...prev, isChecking: true, error: null }));

    const startTime = Date.now();
    let isConnected = false;
    let measuredRtt: number | null = null;

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), checkTimeout);

      // Make a lightweight request
      const response = await fetch(pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      isConnected = response.ok;
      measuredRtt = Date.now() - startTime;

    } catch (error) {
      // Check if it was an abort
      if (error instanceof Error && error.name === 'AbortError') {
        // Timeout - might still be connected but slow
        isConnected = false;
      } else {
        // Network error
        isConnected = false;
      }
    }

    const networkInfo = getNetworkInfo();
    const finalRtt = measuredRtt || networkInfo.rtt;
    const isSlowConnection = networkInfo.isSlowConnection ||
      (measuredRtt !== null && measuredRtt > slowConnectionThreshold);

    const newLastOnline = isConnected ? new Date() : lastOnlineRef.current;
    if (isConnected) lastOnlineRef.current = newLastOnline;

    const newStatus: ConnectionStatus = {
      isOnline: navigator.onLine,
      isConnected,
      isSlowConnection,
      lastOnline: newLastOnline,
      lastCheck: new Date(),
      quality: determineQuality(navigator.onLine, isConnected, finalRtt, networkInfo.effectiveType),
      rtt: finalRtt,
      effectiveType: networkInfo.effectiveType,
      isChecking: false,
      error: isConnected ? null : 'Unable to reach server',
    };

    setStatus(newStatus);

    // Notify callback if status changed
    if (previousOnlineRef.current !== newStatus.isConnected) {
      previousOnlineRef.current = newStatus.isConnected;
      onStatusChangeRef.current?.(newStatus);
    }
  }, [pingUrl, checkTimeout, slowConnectionThreshold, getNetworkInfo, determineQuality]);

  /**
   * Handle online event
   */
  const handleOnline = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      isOnline: true,
      lastOnline: new Date(),
    }));

    // Verify actual connectivity
    checkConnectivity();
  }, [checkConnectivity]);

  /**
   * Handle offline event
   */
  const handleOffline = useCallback(() => {
    setStatus(prev => {
      const newStatus: ConnectionStatus = {
        ...prev,
        isOnline: false,
        isConnected: false,
        quality: 'offline',
        error: 'Device is offline',
      };
      onStatusChangeRef.current?.(newStatus);
      return newStatus;
    });
  }, []);

  /**
   * Handle Network Information API change
   */
  const handleConnectionChange = useCallback(() => {
    const networkInfo = getNetworkInfo();

    setStatus(prev => {
      const newStatus = {
        ...prev,
        rtt: networkInfo.rtt,
        effectiveType: networkInfo.effectiveType,
        isSlowConnection: networkInfo.isSlowConnection,
        quality: determineQuality(prev.isOnline, prev.isConnected, networkInfo.rtt, networkInfo.effectiveType),
      };

      // Notify if quality changed significantly
      if (prev.quality !== newStatus.quality) {
        onStatusChangeRef.current?.(newStatus);
      }

      return newStatus;
    });
  }, [getNetworkInfo, determineQuality]);

  // Set up event listeners
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Network Information API change event
    const connection = (navigator as Navigator & {
      connection?: EventTarget & {
        addEventListener: (event: string, handler: () => void) => void;
        removeEventListener: (event: string, handler: () => void) => void;
      };
    }).connection;

    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [handleOnline, handleOffline, handleConnectionChange]);

  // Set up periodic connectivity check
  useEffect(() => {
    if (!autoCheck || typeof window === 'undefined') {
      return;
    }

    // Initial check
    checkConnectivity();

    // Set up interval
    checkIntervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        checkConnectivity();
      }
    }, checkInterval);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [autoCheck, checkInterval, checkConnectivity]);

  // Public methods
  const checkNow = useCallback(async () => {
    await checkConnectivity();
  }, [checkConnectivity]);

  const retry = useCallback(async () => {
    // Reset error and try again
    setStatus(prev => ({ ...prev, error: null }));
    await checkConnectivity();
  }, [checkConnectivity]);

  return {
    ...status,
    checkNow,
    retry,
  };
}

// ============================================================================
// SIMPLIFIED HOOK FOR BASIC ONLINE/OFFLINE DETECTION
// ============================================================================

/**
 * Simple hook that just tracks navigator.onLine status
 * Use this when you don't need connectivity verification
 */
export function useOnlineStatus(): {
  isOnline: boolean;
  lastOnline: Date | null;
} {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastOnline, setLastOnline] = useState<Date | null>(
    typeof navigator !== 'undefined' && navigator.onLine ? new Date() : null
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      setIsOnline(true);
      setLastOnline(new Date());
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, lastOnline };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are already exported at definition, no need to re-export
