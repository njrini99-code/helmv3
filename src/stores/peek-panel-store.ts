import { create } from 'zustand';

export type PeekPanelType = 'player' | 'school' | null;

interface PeekPanelState {
  isOpen: boolean;
  panelType: PeekPanelType;
  selectedId: string | null;
  openPlayerPanel: (playerId: string) => void;
  openSchoolPanel: (schoolId: string) => void;
  closePanel: () => void;
}

export const usePeekPanelStore = create<PeekPanelState>((set) => ({
  isOpen: false,
  panelType: null,
  selectedId: null,
  openPlayerPanel: (playerId: string) =>
    set({ isOpen: true, panelType: 'player', selectedId: playerId }),
  openSchoolPanel: (schoolId: string) =>
    set({ isOpen: true, panelType: 'school', selectedId: schoolId }),
  closePanel: () => set({ isOpen: false, panelType: null, selectedId: null }),
}));
