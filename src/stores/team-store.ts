'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Team {
  id: string;
  name: string;
  team_type: string;
  logo_url: string | null;
  primary_color: string | null;
  age_group: string | null;
  city: string | null;
  state: string | null;
  member_count?: number;
}

interface TeamState {
  teams: Team[];
  selectedTeamId: string | null;
  isLoading: boolean;
  setTeams: (teams: Team[]) => void;
  setSelectedTeamId: (teamId: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  getSelectedTeam: () => Team | null;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      teams: [],
      selectedTeamId: null,
      isLoading: false,
      setTeams: (teams) => {
        set({ teams });
        // Auto-select first team if none selected
        const state = get();
        const firstTeam = teams[0];
        if (!state.selectedTeamId && firstTeam) {
          set({ selectedTeamId: firstTeam.id });
        }
      },
      setSelectedTeamId: (teamId) => set({ selectedTeamId: teamId }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      getSelectedTeam: () => {
        const state = get();
        return state.teams.find((t) => t.id === state.selectedTeamId) || null;
      },
    }),
    {
      name: 'helm-team-store',
      partialize: (state) => ({ selectedTeamId: state.selectedTeamId }),
    }
  )
);
