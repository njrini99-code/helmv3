'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const HEARTBEAT_INTERVAL = 60000; // 1 minute

/**
 * Hook to track user online presence
 * Sends periodic heartbeats to update last_seen timestamp
 */
export function usePresence() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  useEffect(() => {
    // Send initial heartbeat
    const sendHeartbeat = async () => {
      try {
        await supabase.rpc('heartbeat');
      } catch (error) {
        // Silently fail - presence is non-critical
        console.debug('[Presence] Heartbeat failed:', error);
      }
    };

    // Send heartbeat immediately
    sendHeartbeat();

    // Set up interval for periodic heartbeats
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Also send heartbeat on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [supabase]);
}

/**
 * Check if a user is considered online
 * @param lastSeen - The user's last_seen timestamp
 * @param thresholdMinutes - How many minutes of inactivity before considered offline (default: 5)
 */
export function isUserOnline(lastSeen: string | null, thresholdMinutes: number = 5): boolean {
  if (!lastSeen) return false;

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);

  return diffMinutes < thresholdMinutes;
}
