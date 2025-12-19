'use client';

import { PlayerPeekPanel } from './PlayerPeekPanel';
import { SchoolPeekPanel } from './SchoolPeekPanel';
import { usePeekPanelStore } from '@/stores/peek-panel-store';

export function PeekPanelRoot() {
  const { panelType } = usePeekPanelStore();

  return (
    <>
      {panelType === 'player' && <PlayerPeekPanel />}
      {panelType === 'school' && <SchoolPeekPanel />}
    </>
  );
}
