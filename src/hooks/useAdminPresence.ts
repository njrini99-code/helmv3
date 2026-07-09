'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePresenceState, User } from '@supabase/supabase-js';
import { useVisibilityAwareInterval } from './useVisibilityAwareInterval';

// ============================================
// TYPES
// ============================================

export interface AdminPresenceInfo {
  /** User ID */
  id: string;
  /** User email */
  email: string | null;
  /** Display name */
  name: string | null;
  /** Avatar URL */
  avatar_url: string | null;
  /** Current tab/section */
  currentTab: string;
  /** Joined at timestamp */
  joined_at: string;
  /** Last activity timestamp */
  last_active: string;
  /** Online-at timestamp updated each heartbeat (used to age out stale presences) */
  online_at: string;
  /** Presence key (used for tracking) */
  presence_ref: string;
}

interface UseAdminPresenceOptions {
  /** Channel name for presence */
  channelName?: string;
  /** How often to sync presence state */
  syncInterval?: number;
}

export interface UseAdminPresenceReturn {
  /** List of currently active admins */
  activeAdmins: AdminPresenceInfo[];
  /** Total count of active admins */
  onlineCount: number;
  /** Whether presence is connected */
  isConnected: boolean;
  /** Raw presence state from Supabase */
  presenceState: RealtimePresenceState<AdminPresenceInfo>;
  /** Update your own presence info */
  updatePresence: (tab: string) => void;
  /** Error if any */
  error: Error | null;
}

// ============================================
// HOOK
// ============================================

export function useAdminPresence(options: UseAdminPresenceOptions = {}): UseAdminPresenceReturn {
  const {
    channelName = 'admin-presence',
    syncInterval = 30000, // 30 seconds
  } = options;

  const [activeAdmins, setActiveAdmins] = useState<AdminPresenceInfo[]>([]);
  const [presenceState, setPresenceState] = useState<RealtimePresenceState<AdminPresenceInfo>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Refs avoid forcing the connection effect to re-run when tab/user metadata
  // changes. The previous implementation listed `currentTab` and the
  // `updatePresence` callback as deps, which tore down and rebuilt the channel
  // every time the admin clicked a tab — Supabase never had time to settle on
  // a `SUBSCRIBED` state, so `presenceState` always came back empty and the
  // sidebar showed `Active Sessions: 0` even with an admin online.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentTabRef = useRef<string>('command');
  const currentUserRef = useRef<User | null>(null);

  // Memoize to avoid thrashing a fresh client ref on every parent re-render.
  const [supabase] = useState(() => createClient());

  // Get current user on mount
  useEffect(() => {
    let cancelled = false;
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      currentUserRef.current = user;
      setCurrentUser(user);
    };
    void getUser();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Extract admins from presence state. Each admin id may have multiple
  // presence entries if they have several tabs open — we de-dupe by id and
  // keep the most recent `online_at` so the list reflects the latest tick.
  const extractAdmins = useCallback((state: RealtimePresenceState<AdminPresenceInfo>): AdminPresenceInfo[] => {
    const byId = new Map<string, AdminPresenceInfo>();
    Object.values(state).forEach((presences) => {
      presences.forEach((presence) => {
        const existing = byId.get(presence.id);
        if (!existing) {
          byId.set(presence.id, presence);
          return;
        }
        const newTs = Date.parse(presence.online_at ?? presence.last_active ?? '');
        const oldTs = Date.parse(existing.online_at ?? existing.last_active ?? '');
        if (Number.isFinite(newTs) && newTs > (Number.isFinite(oldTs) ? oldTs : 0)) {
          byId.set(presence.id, presence);
        }
      });
    });
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
    );
  }, []);

  // Build the payload Supabase Realtime tracks for this client. `online_at`
  // moves on every heartbeat so other clients can detect liveness even if
  // the underlying realtime sync event hasn't refired.
  const buildPresence = useCallback((tab: string): Partial<AdminPresenceInfo> => {
    const user = currentUserRef.current;
    if (!user) return {};
    const now = new Date().toISOString();
    return {
      id: user.id,
      email: user.email ?? null,
      name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      currentTab: tab,
      last_active: now,
      online_at: now,
    };
  }, []);

  // Update presence info — exposed to the consumer so AdminRealtimeProvider
  // can push the new tab name on every tab change without resubscribing.
  const updatePresence = useCallback((tab: string) => {
    currentTabRef.current = tab;
    if (!channelRef.current || !currentUserRef.current) return;
    const payload = buildPresence(tab);
    if (Object.keys(payload).length === 0) return;
    channelRef.current.track(payload).catch((err) => {
      console.debug('[Presence] Failed to track:', err);
    });
  }, [buildPresence]);

  // Connect to presence channel. Deps deliberately exclude `currentTab` and
  // `updatePresence` — the channel is opened once per user and reused.
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<AdminPresenceInfo>();
        setPresenceState(state);
        setActiveAdmins(extractAdmins(state));
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Presence] Joined:', newPresences);
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Presence] Left:', leftPresences);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);

          // Track our own presence on initial subscribe. `joined_at` is set
          // exactly once per session; subsequent heartbeats only update
          // `online_at` / `last_active`.
          try {
            const payload: Partial<AdminPresenceInfo> = {
              ...buildPresence(currentTabRef.current),
              joined_at: new Date().toISOString(),
            };
            await channel.track(payload);
          } catch (err) {
            console.error('Failed to track presence:', err);
          }
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError(new Error('Presence channel error'));
        } else if (status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Push a fresh presence update the moment the admin returns to the tab
    // so they aren't stuck showing as "away".
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && channelRef.current) {
        const payload = buildPresence(currentTabRef.current);
        if (Object.keys(payload).length === 0) return;
        channelRef.current.track(payload).catch(() => {
          /* silent — heartbeat will retry */
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Best-effort untrack on tab close so admins drop off the list quickly.
    const handlePageHide = () => {
      if (channelRef.current) {
        channelRef.current.untrack().catch(() => undefined);
      }
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);

      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        ch.untrack().catch(() => undefined);
        supabase.removeChannel(ch).catch(() => undefined);
      }
    };
  }, [currentUser, channelName, supabase, extractAdmins, buildPresence]);

  // Periodic sync to keep presence alive. Pauses when the tab is hidden so
  // we aren't hammering the realtime channel for admins who left the
  // dashboard open in a background tab.
  const heartbeat = useCallback(() => {
    if (!channelRef.current || !currentUserRef.current) return;
    const payload = buildPresence(currentTabRef.current);
    if (Object.keys(payload).length === 0) return;
    channelRef.current.track(payload).catch(() => {
      // Silent fail — will retry on next interval
    });
  }, [buildPresence]);
  useVisibilityAwareInterval(heartbeat, currentUser ? syncInterval : null);

  return {
    activeAdmins,
    onlineCount: activeAdmins.length,
    isConnected,
    presenceState,
    updatePresence,
    error,
  };
}

/**
 * Get initials from a name or email
 */
export function getAdminInitials(admin: AdminPresenceInfo): string {
  if (admin.name) {
    const parts = admin.name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    }
    return admin.name.slice(0, 2).toUpperCase();
  }

  if (admin.email) {
    return admin.email.slice(0, 2).toUpperCase();
  }

  return '??';
}

/**
 * Get a color for an admin avatar based on their ID
 */
export function getAdminColor(id: string): string {
  const colors = [
    'bg-primary-500',
    'bg-blue-500',
    'bg-purple-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-orange-500',
  ];

  // Simple hash of ID to pick color
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length]!;
}
