'use client';

import { memo } from 'react';
import { USStateMap } from '@/components/recruiting/USStateMap';

interface StateData {
  name: string;
  count: number;
}

interface USAMapProps {
  stateData: Record<string, StateData>;
  onStateClick?: (state: string) => void;
  onClearStates?: () => void;
  selectedStates?: string[];
  className?: string;
  /** Display mode - affects labels (players vs teams) */
  mode?: 'players' | 'teams';
}

// Wrapper component that adapts the interface to USStateMap
export const USAMap = memo(function USAMap({
  stateData,
  onStateClick,
  onClearStates,
  selectedStates = [],
  className,
  mode = 'players',
}: USAMapProps) {
  // Convert stateData to playersByState format
  const playersByState: Record<string, number> = {};
  Object.entries(stateData).forEach(([code, data]) => {
    playersByState[code] = data.count;
  });

  return (
    <USStateMap
      playersByState={playersByState}
      selectedStates={selectedStates}
      onStateClick={onStateClick}
      onClearSelection={onClearStates}
      className={className}
      multiSelect={true}
      mode={mode}
    />
  );
});
