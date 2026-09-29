'use client';

import type { ChWindow } from '../../data/stats-common';
import { Segmented } from '../../ui/Segmented';

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
