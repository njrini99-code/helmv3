import { create } from 'zustand';

export type PeekPanelType = 'player' | 'school' | 'performance' | null;

interface PeekPanelState {
  isOpen: boolean;
  panelType: PeekPanelType;
  selectedId: string | null;
  openPlayerPanel: (playerId: string) => void;
  openSchoolPanel: (schoolId: string) => void;
  /** Opens the Performance Command Center player inspector for the given player. */
  openPerformancePanel: (playerId: string) => void;
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
  openPerformancePanel: (playerId: string) =>
    set({ isOpen: true, panelType: 'performance', selectedId: playerId }),
  closePanel: () => set({ isOpen: false, panelType: null, selectedId: null }),
}));
