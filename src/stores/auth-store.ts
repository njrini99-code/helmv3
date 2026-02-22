import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, CoachWithOrganization, Player } from '@/lib/types';

export type CoachMode = 'recruiting' | 'team';

/**
 * Sync coach mode to a cookie for middleware access
 * The middleware reads from cookies since it runs on the server
 */
function syncModeToCookie(mode: CoachMode) {
  if (typeof document !== 'undefined') {
    document.cookie = `coach_mode=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }
}

interface AuthState {
  user: User | null;
  coach: CoachWithOrganization | null;
  player: Player | null;
  loading: boolean;
  coachMode: CoachMode;
  setUser: (user: User | null) => void;
  setCoach: (coach: CoachWithOrganization | null) => void;
  setPlayer: (player: Player | null) => void;
  setLoading: (loading: boolean) => void;
  setCoachMode: (mode: CoachMode) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      coach: null,
      player: null,
      loading: false,
      coachMode: 'recruiting',
      setUser: (user) => set({ user }),
      setCoach: (coach) => set({ coach }),
      setPlayer: (player) => set({ player }),
      setLoading: (loading) => set({ loading }),
      setCoachMode: (mode) => {
        syncModeToCookie(mode);
        set({ coachMode: mode });
      },
      clear: () => set({ user: null, coach: null, player: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        coach: state.coach,
        player: state.player,
        coachMode: state.coachMode,
      }),
      // Sync cookie on rehydration
      onRehydrateStorage: () => (state) => {
        if (state?.coachMode) {
          syncModeToCookie(state.coachMode);
        }
      },
    }
  )
);
