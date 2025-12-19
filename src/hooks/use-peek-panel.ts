'use client';

import { usePeekPanelStore } from '@/stores/peek-panel-store';

/**
 * Hook to interact with the peek panel system
 *
 * Usage:
 * ```tsx
 * const { openPlayer, openSchool, close, isOpen } = usePeekPanel();
 *
 * // Open player panel
 * <button onClick={() => openPlayer(playerId)}>View Player</button>
 *
 * // Open school panel
 * <button onClick={() => openSchool(schoolId)}>View School</button>
 * ```
 */
export function usePeekPanel() {
  const { isOpen, panelType, selectedId, openPlayerPanel, openSchoolPanel, closePanel } = usePeekPanelStore();

  return {
    isOpen,
    panelType,
    selectedId,
    openPlayer: openPlayerPanel,
    openSchool: openSchoolPanel,
    close: closePanel,
  };
}
