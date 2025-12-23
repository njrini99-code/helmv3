import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Coach, Player } from '@/lib/types';

export type CoachMode = 'recruiting' | 'team';

interface AuthState {
  user: User | null;
  coach: Coach | null;
  player: Player | null;
  loading: boolean;
  coachMode: CoachMode;
  setUser: (user: User | null) => void;
  setCoach: (coach: Coach | null) => void;
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
      loading: true,
      coachMode: 'recruiting',
      setUser: (user) => set({ user }),
      setCoach: (coach) => set({ coach }),
      setPlayer: (player) => set({ player }),
      setLoading: (loading) => set({ loading }),
      setCoachMode: (mode) => set({ coachMode: mode }),
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
    }
  )
);
