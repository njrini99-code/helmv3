'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePresenceState, User } from '@supabase/supabase-js';

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
  /** Presence key (used for tracking) */
  presence_ref: string;
}

export interface UseAdminPresenceOptions {
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
  const [currentTab, setCurrentTab] = useState('command');

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  // Get current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
  }, [supabase]);

  // Extract admins from presence state
  const extractAdmins = useCallback((state: RealtimePresenceState<AdminPresenceInfo>): AdminPresenceInfo[] => {
    const admins: AdminPresenceInfo[] = [];
    
    Object.values(state).forEach((presences) => {
      presences.forEach((presence: AdminPresenceInfo) => {
        // Avoid duplicates by user ID
        if (!admins.some(a => a.id === presence.id)) {
          admins.push(presence);
        }
      });
    });

    // Sort by join time
    return admins.sort((a, b) => 
      new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );
  }, []);

  // Update presence info
  const updatePresence = useCallback((tab: string) => {
    setCurrentTab(tab);
    
    if (!channelRef.current || !currentUser) return;

    const presenceInfo: Partial<AdminPresenceInfo> = {
      id: currentUser.id,
      email: currentUser.email ?? null,
      name: currentUser.user_metadata?.full_name ?? currentUser.email?.split('@')[0] ?? null,
      avatar_url: currentUser.user_metadata?.avatar_url ?? null,
      currentTab: tab,
      last_active: new Date().toISOString(),
    };

    channelRef.current.track(presenceInfo).catch((err) => {
      console.debug('[Presence] Failed to track:', err);
    });
  }, [currentUser]);

  // Connect to presence channel
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
        console.debug('[Presence] Joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.debug('[Presence] Left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);

          // Track our own presence
          try {
            const presenceInfo: Partial<AdminPresenceInfo> = {
              id: currentUser.id,
              email: currentUser.email ?? null,
              name: currentUser.user_metadata?.full_name ?? currentUser.email?.split('@')[0] ?? null,
              avatar_url: currentUser.user_metadata?.avatar_url ?? null,
              currentTab: currentTab,
              joined_at: new Date().toISOString(),
              last_active: new Date().toISOString(),
            };

            await channel.track(presenceInfo);
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

    // Periodic sync to keep presence alive
    const syncId = setInterval(() => {
      if (channelRef.current && currentUser) {
        const presenceInfo: Partial<AdminPresenceInfo> = {
          id: currentUser.id,
          email: currentUser.email ?? null,
          name: currentUser.user_metadata?.full_name ?? currentUser.email?.split('@')[0] ?? null,
          avatar_url: currentUser.user_metadata?.avatar_url ?? null,
          currentTab: currentTab,
          last_active: new Date().toISOString(),
        };

        channelRef.current.track(presenceInfo).catch(() => {
          // Silent fail - will retry on next interval
        });
      }
    }, syncInterval);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && channelRef.current && currentUser) {
        updatePresence(currentTab);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(syncId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, [currentUser, channelName, syncInterval, supabase, extractAdmins, currentTab, updatePresence]);

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
    'bg-emerald-500',
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
