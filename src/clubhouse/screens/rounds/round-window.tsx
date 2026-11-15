'use client';

import { ChevronDown } from 'lucide-react';
import { useChSessionState } from '../../lib/session-state';
import { Button } from '../../ui/Button';

/**
 * How many rounds a rounds list draws at first, and adds each time "Show earlier rounds" is pressed (production audit
 * 2026-11-15, MAC-01 and PMAC-02). A team's whole history drawn at once made the tap that left Rounds a 1.1 s task on a
 * phone (4.4 s at 4x CPU): the list unmounted every row in one commit. The newest two months show, at most this many
 * rows; older months wait for the press.
 */
export const ROUNDS_PAGE = 40;

/**
 * The first `rows` rounds, in display order, as whole groups and at most one cut short (its heading still counts and
 * averages every round in `group.rounds`); and how many are left out.
 */
export function windowGroups<T, G extends { rounds: readonly T[] }>(groups: readonly G[], rows: number): { shown: Array<{ group: G; rows: readonly T[] }>; hidden: number } {
  const shown: Array<{ group: G; rows: readonly T[] }> = [];
  let left = Math.max(0, rows);
  let hidden = 0;
  for (const group of groups) {
    const n = group.rounds.length;
    if (left <= 0) hidden += n;
    else if (n <= left) {
      shown.push({ group, rows: group.rounds });
      left -= n;
    } else {
      shown.push({ group, rows: group.rounds.slice(0, left) });
      hidden += n - left;
      left = 0;
    }
  }
  return { shown, hidden };
}

/** The first window: by month, the newest two months (at most a page of rows); any other grouping, a page of rows. */
export function firstWindow(groups: readonly { rounds: readonly unknown[] }[], byMonth: boolean): number {
  if (!byMonth) return ROUNDS_PAGE;
  const two = groups.slice(0, 2).reduce((n, g) => n + g.rounds.length, 0);
  return Math.max(1, Math.min(ROUNDS_PAGE, two));
}

/**
 * The window a rounds list shows, kept with the page (shell session state), so Back from a round's review comes back to
 * the same rows and its scroll place still exists.
 */
export function useRoundWindow<T, G extends { rounds: readonly T[] }>(groups: readonly G[], byMonth: boolean) {
  const [pages, setPages] = useChSessionState<number>('earlier', 0);
  const rows = firstWindow(groups, byMonth) + pages * ROUNDS_PAGE;
  const { shown, hidden } = windowGroups<T, G>(groups, rows);
  return { shown, hidden, more: () => setPages((p) => p + 1) };
}

/** The row at the end of a cut list: what is left, and the press that draws the next page of it. */
export function ShowEarlier({ hidden, onMore, className }: { hidden: number; onMore: () => void; className: string }) {
  if (hidden <= 0) return null;
  return (
    <div className={className}>
      <Button variant="secondary" size="sm" leftIcon={ChevronDown} onClick={onMore} aria={{ label: `Show earlier rounds, ${hidden} more` }}>
        Show earlier rounds
      </Button>
      <span className="ch-num" aria-hidden="true">
        {hidden} more
      </span>
    </div>
  );
}
