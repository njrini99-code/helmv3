'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useCallback, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { useRovingRows } from '../lib/roving';
import { Icon } from './Icon';

/**
 * One column of a DataTable. `cell` draws the row’s value; `sortKey` makes the header a button that sorts by it, in the
 * direction the column reads best (`sortDirection`: a scoring average sorts low first, rounds high first).
 */
export interface DataColumn<T, K extends string = string> {
  id: string;
  header: ReactNode;
  /** The header’s words for a screen reader, when the visible header is an abbreviation or hidden. */
  headerLabel?: string;
  sortKey?: K;
  sortDirection?: 'ascending' | 'descending';
  /** Figures sit on the right edge, under a right-aligned header. */
  align?: 'start' | 'end';
  /** Extra classes on the header cell and on each body cell (a screen’s own column styling). */
  headClassName?: string;
  className?: string | ((row: T) => string);
  cell: (row: T) => ReactNode;
}

/** A row’s own handlers and data attributes (a right-click menu, a press hold, an anchor). */
export type DataRowProps = HTMLAttributes<HTMLDivElement> & { [data: `data-${string}`]: string | undefined };

const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ') || undefined;

/**
 * A dense desk table (premium plan §3.8, research 4.14 D8; Linear’s lists, Stripe’s tables): a header that stays under
 * the top bar as the page scrolls, columns that sort from their header (`aria-sort` and an arrow the way it runs), and
 * rows walked from the keyboard.
 *
 * Keys (B11; WAI-ARIA APG, sortable table and grid navigation): the table is one Tab stop, on the selected row
 * (`aria-current`) or the first. Up and Down, or J and K, move between rows; Home and End go to the ends. With
 * `onSelect` the selection follows the keyboard, as Mail’s message list does, so an inspector beside the table shows the
 * row the keys are on. A pointer selects by its own click (the row’s primary control), never by hover.
 *
 * It owns structure and behaviour only: a screen passes its own classes (`classNames`), so its stylesheet keeps the
 * look. The sticky header and the row anchors are `.ch-dt` rules in ui.css.
 */
export function DataTable<T, K extends string = string>({
  label,
  columns,
  rows,
  rowKey,
  primary,
  sort,
  onSort,
  selected = null,
  onSelect,
  rowProps,
  classNames = {},
  rootRef,
}: {
  /** Names the table (“Roster”). */
  label: string;
  columns: readonly DataColumn<T, K>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** The selector of each row’s one focusable control (its name button): the keys walk these. */
  primary: string;
  sort?: K;
  onSort?: (key: K) => void;
  selected?: string | null;
  /** The keyboard moved to a row: show it. Never toggles. */
  onSelect?: (key: string) => void;
  rowProps?: (row: T) => DataRowProps;
  classNames?: { table?: string; head?: string; row?: (row: T) => string; sort?: string; sortArrow?: string };
  /** The table element, for a caller that also tracks it (a sideways scroller’s edge fade, ui/use-hscroll.ts). */
  rootRef?: (el: HTMLDivElement | null) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      rootRef?.(el);
    },
    [rootRef],
  );
  useRovingRows(root, primary, true, { letters: true });
  return (
    <div ref={setRoot} role="table" aria-label={label} className={join('ch-dt', classNames.table)}>
      <div role="row" className={join('ch-dt__head', classNames.head)}>
        {columns.map((c) => {
          const cls = join(c.align === 'end' && 'r', c.headClassName);
          if (!c.sortKey || !onSort) {
            return (
              <span key={c.id} role="columnheader" className={cls} aria-label={c.headerLabel}>
                {c.header}
              </span>
            );
          }
          const on = sort === c.sortKey;
          const dir = c.sortDirection ?? 'ascending';
          const key = c.sortKey;
          return (
            <span key={c.id} role="columnheader" className={cls} aria-sort={on ? dir : 'none'}>
              <button type="button" className={join('ch-dt__sort', classNames.sort, on && 'is-on')} aria-label={c.headerLabel} onClick={() => onSort(key)}>
                {c.header}
                {/* The arrow’s room is kept on every sortable header, so a right-aligned label doesn’t move when it is chosen. */}
                <span className={join('ch-dt__arrow', classNames.sortArrow)} aria-hidden="true">
                  <Icon icon={dir === 'ascending' ? ArrowUp : ArrowDown} size={12} />
                </span>
              </button>
            </span>
          );
        })}
      </div>
      {rows.map((row) => {
        const key = rowKey(row);
        const own = rowProps?.(row) ?? {};
        const isSel = selected === key;
        return (
          <div
            key={key}
            role="row"
            aria-current={isSel ? 'true' : undefined}
            {...own}
            className={join('ch-dt__row', classNames.row?.(row), own.className)}
            onFocus={(e) => {
              own.onFocus?.(e);
              // Only a move the keyboard made: a click selects through the control’s own handler.
              const t = e.target as HTMLElement;
              if (onSelect && !isSel && t.matches(primary) && t.matches(':focus-visible')) onSelect(key);
            }}
          >
            {columns.map((c) => (
              <span key={c.id} role="cell" className={join(c.align === 'end' && 'r', typeof c.className === 'function' ? c.className(row) : c.className)}>
                {c.cell(row)}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
