'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as Sentry from '@sentry/nextjs';
import type { User, CoachWithOrganization, Player } from '@/lib/types';

type CoachMode = 'recruiting' | 'team';

// Sentry identity is wired here (rather than in each consuming hook) so ANY
// caller of this shared store gets equivalent user/role/sport tagging —
// baseball's use-auth.ts today, golf if/when it adopts the store. `user` is
// the generic `users` row (shared across both apps), so sport can't be
// inferred from which sport-specific table a coach/player came from — it's
// resolved from the current pathname instead, same heuristic
// instrumentation-client.ts uses for event tagging. Calling Sentry.setUser
// again with the same id (e.g. use-auth.ts's own setUser call right after
// this store's) is idempotent — last call wins, no conflicting state.
function currentSportTag(): 'golf' | 'baseball' | 'shared' {
  if (typeof window === 'undefined') return 'shared';
  const path = window.location.pathname;
  if (path.startsWith('/golf')) return 'golf';
  if (path.startsWith('/baseball')) return 'baseball';
  return 'shared';
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
      setUser: (user) => {
        set({ user });
        if (user) {
          // Email intentionally omitted — id is enough for triage without
          // shipping personal contact info to Sentry.
          Sentry.setUser({ id: user.id });
          Sentry.setTag('sport', currentSportTag());
        }
      },
      setCoach: (coach) => {
        set({ coach });
        if (coach) {
          Sentry.setTag('user_role', 'coach');
          if (coach.organization?.id) {
            Sentry.setTag('org_id', coach.organization.id);
            Sentry.setTag('org_name', coach.organization.name);
          }
        }
      },
      setPlayer: (player) => {
        set({ player });
        if (player) Sentry.setTag('user_role', 'player');
      },
      setLoading: (loading) => set({ loading }),
      setCoachMode: (mode) => {
        set({ coachMode: mode });
      },
      clear: () => {
        set({ user: null, coach: null, player: null });
        Sentry.setUser(null);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        coachMode: state.coachMode,
      }),
    }
  )
);
