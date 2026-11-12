'use client';

import { isFiltered, isWindowChange, withScope, withSpan, type ChFilter, type ChRange } from '../../data/stats-filter';
import type { ChSpan } from '../../data/span';
import { Segmented } from '../../ui/Segmented';

/** Each window in a sentence ("the figures shown are still the last 10 rounds"). */
export function windowWords(f: ChFilter): string {
  if (f.span === 'all') return 'all time';
  return f.window === 'last10' ? `the last ${f.last} rounds` : f.window === 'season' ? 'the season' : 'qualifier rounds';
}

/** Which rounds the figures rest on, as one choice: a window of this season, or all time. */
export type ChScope = ChRange | 'all';
type Shown = ChScope | 'custom';

/** The filter after a choice in the one row: All time keeps the window the address names; a window is this season's. */
export function withPick(f: ChFilter, pick: ChScope): ChFilter {
  return pick === 'all' ? withSpan(f, 'all') : withScope(withSpan(f, 'season'), pick);
}

/**
 * The range, counted in rounds (decision Q5): Last 5, 10 and 20, then the season and qualifier rounds. While a custom date range is
 * on it is the time, so no range is chosen: another, already-selected "Custom" stands for it (choosing a range clears the dates).
 *
 * With `onScope` it is the page's one answer to "which rounds": the same row ends in All time (data/span.ts), which is no window, so
 * choosing it leaves the windows unlit and choosing a window comes back to the season. One control, one row, one thing chosen.
 */
export function WindowSwitch({
  value,
  onChange,
  custom = false,
  hook,
  span = 'season',
  onScope,
}: {
  value: ChRange;
  onChange?: (v: ChRange) => void;
  custom?: boolean;
  /** The capture hook on each segment, with the redesign's flag only. */
  hook?: string;
  /** The span the figures are on; read only with `onScope`. */
  span?: ChSpan;
  /** The page's switch: every choice, All time among them, comes here (`withPick` turns it into a filter). */
  onScope?: (v: ChScope) => void;
}) {
  const all = !!onScope && span === 'all';
  return (
    <Segmented<Shown> weight="filter"
      size="sm"
      label={onScope ? 'Rounds shown' : 'Window'}
      hook={hook}
      value={all ? 'all' : custom ? 'custom' : value}
      onChange={(v) => {
        if (v === 'custom') return;
        if (onScope) onScope(v);
        else if (v !== 'all') onChange?.(v);
      }}
      options={[
        ...([5, 10, 20] as const).map((n) => ({
          value: `last${n}` as const,
          // The phone drops "Last" (`.ch-sw-last`) so five choices and the filter fit one row; the name stays whole for a screen reader.
          // One child, so the key's own gap never opens a space inside a word.
          label: (
            <span>
              <span className="ch-sw-last">Last </span>
              {n}
            </span>
          ),
          aria: `Last ${n}`,
        })),
        { value: 'season', label: 'Season' },
        {
          value: 'qualifiers',
          // With All time in the row the phone says "Quals", the team's own word, so six choices of at least 44pt and the filter fit a
          // 375pt phone without scrolling; a wider screen and a screen reader keep the whole word.
          label: onScope ? (
            <span>
              Qual<span className="ch-sw-last">ifier</span>s
            </span>
          ) : (
            'Qualifiers'
          ),
          aria: 'Qualifiers',
        },
        ...(custom ? [{ value: 'custom' as const, label: 'Custom' }] : []),
        ...(onScope
          ? [
              {
                value: 'all' as const,
                // The phone says "All" (`.ch-sw-last` again), so six choices and the filter still fit one row.
                label: (
                  <span>
                    All<span className="ch-sw-last"> time</span>
                  </span>
                ),
                aria: 'All time',
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * What a change of window or filter says while it is refused offline or slow (CH-4901, CH-4902, CH-5901, CH-5902):
 * a plain window change keeps its own words, anything else talks about the filter.
 */
/** The switch between This season and All time changes the basis the way a window change does, so it says the same kind of thing. */
const spanChange = (from: ChFilter, to: ChFilter): boolean => (from.span ?? 'season') !== (to.span ?? 'season');

export function changeWords(from: ChFilter, to: ChFilter): { slow: string; offline: string; still: string } {
  const still = isFiltered(from) ? 'The figures shown are still the rounds you had.' : `The figures shown are still ${windowWords(from)}.`;
  if (isWindowChange(from, to) || spanChange(from, to)) {
    return { slow: `Still loading ${windowWords(to)}…`, offline: `Couldn’t open ${windowWords(to)}: you’re offline`, still };
  }
  return { slow: 'Still loading the filtered rounds…', offline: 'Couldn’t apply the filter: you’re offline', still };
}

/** What a change in flight says it is showing and loading ("Showing the season, loading the last 10 rounds"). */
export function updatingWords(from: ChFilter, to: ChFilter): string {
  const showing = isFiltered(from) ? 'the rounds you had' : windowWords(from);
  return isWindowChange(from, to) || spanChange(from, to) ? `Showing ${showing}, loading ${windowWords(to)}` : `Showing ${showing}, applying the filter`;
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
