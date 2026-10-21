'use client';

import { isFiltered, isWindowChange, type ChFilter, type ChRange } from '../../data/stats-filter';
import { Segmented } from '../../ui/Segmented';

/** Each window in a sentence ("the figures shown are still the last 10 rounds"). */
export function windowWords(f: ChFilter): string {
  return f.window === 'last10' ? `the last ${f.last} rounds` : f.window === 'season' ? 'the season' : 'qualifier rounds';
}

type Shown = ChRange | 'custom';

/**
 * The range, counted in rounds (decision Q5): Last 5, 10 and 20, then the season and qualifier rounds. While a custom date range is
 * on it is the time, so no range is chosen: another, already-selected "Custom" stands for it (choosing a range clears the dates).
 */
export function WindowSwitch({ value, onChange, custom = false }: { value: ChRange; onChange: (v: ChRange) => void; custom?: boolean }) {
  return (
    <Segmented<Shown>
      size="sm"
      label="Window"
      value={custom ? 'custom' : value}
      onChange={(v) => v !== 'custom' && onChange(v)}
      options={[
        ...([5, 10, 20] as const).map((n) => ({
          value: `last${n}` as const,
          // The phone drops "Last" (`.ch-sw-last`) so five choices and the filter fit one row; the name stays whole for a screen reader.
          label: (
            <>
              <span className="ch-sw-last">Last </span>
              {n}
            </>
          ),
          aria: `Last ${n}`,
        })),
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
  const still = isFiltered(from) ? 'The figures shown are still the rounds you had.' : `The figures shown are still ${windowWords(from)}.`;
  if (isWindowChange(from, to)) {
    return { slow: `Still loading ${windowWords(to)}…`, offline: `Couldn’t open ${windowWords(to)}: you’re offline`, still };
  }
  return { slow: 'Still loading the filtered rounds…', offline: 'Couldn’t apply the filter: you’re offline', still };
}

/** What a change in flight says it is showing and loading ("Showing the season, loading the last 10 rounds"). */
export function updatingWords(from: ChFilter, to: ChFilter): string {
  const showing = isFiltered(from) ? 'the rounds you had' : windowWords(from);
  return isWindowChange(from, to) ? `Showing ${showing}, loading ${windowWords(to)}` : `Showing ${showing}, applying the filter`;
}

/**
 * The note for a window or filter change that has not landed yet (CH-4903, CH-5903). The figures stay on screen, dimmed, and this
 * names which ones they are, so the switch (which has already moved to the new choice) never labels the old figures with the new
 * period. Fixed, so it moves nothing; it fades in after a beat, so a change that lands at once never shows it.
 */
export function UpdatingNote({ from, to, code }: { from: ChFilter; to: ChFilter | null; code: string }) {
  if (!to) return null;
  return (
    <p className="ch-st-updating" role="status" data-ch-code={code}>
      {updatingWords(from, to)}
    </p>
  );
}
