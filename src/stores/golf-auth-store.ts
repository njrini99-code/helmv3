import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GolfCoach, GolfPlayer } from '@/lib/types/golf';

interface GolfUser {
  id: string;
  email: string;
  role: 'coach' | 'player';
}

interface GolfAuthState {
  user: GolfUser | null;
  coach: GolfCoach | null;
  player: GolfPlayer | null;
  loading: boolean;
  setUser: (user: GolfUser | null) => void;
  setCoach: (coach: GolfCoach | null) => void;
  setPlayer: (player: GolfPlayer | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useGolfAuthStore = create<GolfAuthState>()(
  persist(
    (set) => ({
      user: null,
      coach: null,
      player: null,
      loading: true,
      setUser: (user) => set({ user }),
      setCoach: (coach) => set({ coach }),
      setPlayer: (player) => set({ player }),
      setLoading: (loading) => set({ loading }),
      clear: () => set({ user: null, coach: null, player: null }),
    }),
    {
      name: 'golf-auth-storage',
      partialize: (state) => ({
        user: state.user,
        coach: state.coach,
        player: state.player,
      }),
    }
  )
);
