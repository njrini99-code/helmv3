'use client';

import type { ChWindow } from '../../data/stats-common';
import { Segmented } from '../../ui/Segmented';

/** Each window in a sentence ("the figures shown are still the last 10 rounds"). */
export const WINDOW_WORDS: Record<ChWindow, string> = {
  last10: 'the last 10 rounds',
  season: 'the season',
  qualifiers: 'qualifier rounds',
};

export function WindowSwitch({ value, onChange }: { value: ChWindow; onChange: (v: ChWindow) => void }) {
  return (
    <Segmented<ChWindow>
      size="sm"
      label="Window"
      value={value}
      onChange={onChange}
      options={[
        { value: 'last10', label: 'Last 10' },
        { value: 'season', label: 'Season' },
        { value: 'qualifiers', label: 'Qualifiers' },
      ]}
    />
  );
}
