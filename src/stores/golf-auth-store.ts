import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GolfCoach, GolfPlayer } from '@/lib/types/golf';
import { GOLF_DEV_ACCOUNTS, type GolfDevAccountType } from '@/lib/golf-dev-mode';

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
  isDevMode: boolean;
  setUser: (user: GolfUser | null) => void;
  setCoach: (coach: GolfCoach | null) => void;
  setPlayer: (player: GolfPlayer | null) => void;
  setLoading: (loading: boolean) => void;
  setDevUser: (devData: { id: string; email: string; role: 'coach' | 'player' }) => void;
  clear: () => void;
}

export const useGolfAuthStore = create<GolfAuthState>()(
  persist(
    (set) => ({
      user: null,
      coach: null,
      player: null,
      loading: true,
      isDevMode: false,
      setUser: (user) => set({ user }),
      setCoach: (coach) => set({ coach }),
      setPlayer: (player) => set({ player }),
      setLoading: (loading) => set({ loading }),
      setDevUser: (devData) => {
        const accountKey = (Object.keys(GOLF_DEV_ACCOUNTS) as GolfDevAccountType[]).find(
          (key) => GOLF_DEV_ACCOUNTS[key].id === devData.id
        );

        if (accountKey) {
          const account = GOLF_DEV_ACCOUNTS[accountKey];

          set({
            user: {
              id: account.id,
              email: account.email,
              role: account.role,
            },
            coach: 'coachProfile' in account ? account.coachProfile : null,
            player: 'playerProfile' in account ? account.playerProfile : null,
            isDevMode: true,
            loading: false,
          });
        }
      },
      clear: () => set({ user: null, coach: null, player: null, isDevMode: false }),
    }),
    {
      name: 'golf-auth-storage',
      partialize: (state) => ({
        user: state.user,
        coach: state.coach,
        player: state.player,
        isDevMode: state.isDevMode,
      }),
    }
  )
);
