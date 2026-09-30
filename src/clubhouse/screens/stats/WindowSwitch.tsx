'use client';

import type { ChWindow } from '../../data/stats-common';
import { isFiltered, isWindowChange, type ChFilter } from '../../data/stats-filter';
import { Segmented } from '../../ui/Segmented';

/** Each window in a sentence ("the figures shown are still the last 10 rounds"). */
export const WINDOW_WORDS: Record<ChWindow, string> = {
  last10: 'the last 10 rounds',
  season: 'the season',
  qualifiers: 'qualifier rounds',
};

type Shown = ChWindow | 'custom';

/**
 * The three windows. While a custom date range is on it is the time, so no window is chosen: a fourth,
 * already-selected "Custom" stands for it (choosing a window clears the range).
 */
export function WindowSwitch({ value, onChange, custom = false }: { value: ChWindow; onChange: (v: ChWindow) => void; custom?: boolean }) {
  return (
    <Segmented<Shown>
      size="sm"
      label="Window"
      value={custom ? 'custom' : value}
      onChange={(v) => v !== 'custom' && onChange(v)}
      options={[
        { value: 'last10', label: 'Last 10' },
        { value: 'season', label: 'Season' },
        { value: 'qualifiers', label: 'Qualifiers' },
        ...(custom ? [{ value: 'custom' as const, label: 'Custom' }] : []),
      ]}
    />
  );
}

/**
 * What a change of window or filter says while it is refused offline or slow (CH-4901, CH-4902, CH-5901, CH-5902):
 * a plain window change keeps its own words, anything else talks about the filter.
 */
export function changeWords(from: ChFilter, to: ChFilter): { slow: string; offline: string; still: string } {
  const still = isFiltered(from) ? 'The figures shown are still the rounds you had.' : `The figures shown are still ${WINDOW_WORDS[from.window]}.`;
  if (isWindowChange(from, to)) {
    return { slow: `Still loading ${WINDOW_WORDS[to.window]}…`, offline: `Couldn't open ${WINDOW_WORDS[to.window]}: you're offline`, still };
  }
  return { slow: 'Still loading the filtered rounds…', offline: "Couldn't apply the filter: you're offline", still };
}
