import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Coach, Player } from '@/lib/types';
import { DEV_ACCOUNTS, type DevAccountType } from '@/lib/dev-mode';

interface AuthState {
  user: User | null;
  coach: Coach | null;
  player: Player | null;
  loading: boolean;
  isDevMode: boolean;
  setUser: (user: User | null) => void;
  setCoach: (coach: Coach | null) => void;
  setPlayer: (player: Player | null) => void;
  setLoading: (loading: boolean) => void;
  setDevUser: (devData: { id: string; email: string; role: 'coach' | 'player' }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
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
        const accountKey = (Object.keys(DEV_ACCOUNTS) as DevAccountType[]).find(
          (key) => DEV_ACCOUNTS[key].id === devData.id
        );

        if (accountKey) {
          const account = DEV_ACCOUNTS[accountKey];

          set({
            user: {
              id: account.id,
              email: account.email,
              role: account.role,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as User,
            coach: 'coachProfile' in account ? (account.coachProfile as unknown as Coach) : null,
            player: 'playerProfile' in account ? (account.playerProfile as unknown as Player) : null,
            isDevMode: true,
            loading: false,
          });
        }
      },
      clear: () => set({ user: null, coach: null, player: null, isDevMode: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        coach: state.coach,
        player: state.player,
        isDevMode: state.isDevMode,
      }),
    }
  )
);
