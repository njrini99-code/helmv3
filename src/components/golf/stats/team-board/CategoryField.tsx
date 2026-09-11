'use client';

/**
 * ============================================================================
 * CategoryField — the team-stats stage
 * ----------------------------------------------------------------------------
 * One instrument, two registers, ONE column grid.
 *
 * The top register is the team: one signed bar per strokes-gained category,
 * drawn off a shared zero rule that IS the Tour baseline. The bottom register
 * is the roster: one row per player, one ramp-shaded rank per column. Because
 * the columns are the same columns, the eye falls down the amber column and
 * lands on the players who own it. That relationship is the architecture of
 * this page — the previous composition put the team's strokes gained two
 * screens below the roster board and made the coach hold the leak in their
 * head while scrolling.
 *
 * Every bar states its own value in mono directly above it. There is no
 * per-row rail and no distant axis to measure against: a mark a reader has to
 * carry across the page to a legend is a handle on a slider, not a reading.
 *
 * The identity column is the only flexible track; the five category columns
 * are fixed, so the swatches line up as a field rather than reflowing as a
 * table. Below `md` the fixed tracks plus a legible identity floor exceed a
 * phone's width, so the field scrolls inside its own container and the page
 * body never scrolls sideways.
 *
 * Column headers are sort controls, not decoration, and the wide/short label
 * switch is two spans gated by one CSS breakpoint — `hidden` / `inline`, so
 * exactly one of the pair is in the accessibility tree at any width. It must
 * not be "simplified" to `sr-only`, which keeps both in the tree and makes a
 * screen reader announce "Approach App".
 *
 * PAGE-LOCAL by design, with review-agnostic props so it can be promoted
 * later. Not exported from `modules/`, not in `modules/types.ts`, not in
 * `registry.ts`.
 *
 * HYDRATION: no clock, no measurement pass, no breakpoint read at runtime.
 * The server renders the default sort and every responsive branch is CSS.
 * ========================================================================== */

import Link from 'next/link';
import { MicroBar, RankCell } from '@/components/fairway/modules';
import { PressTarget } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { RankInfo } from './buildTeamBoardViewModel';

/**
 * The shared track definition, declared once and applied to the header row,
 * the team register and every player row so a column line runs unbroken from
 * the team bar to the last player.
 *
 * The identity floor below `md` is what makes the spec's "scroll inside the
 * Surface" real: five 3.25rem tracks leave roughly 66px for a name inside a
 * 390px phone, which clips the one cell that identifies the row. The floor
 * plus the container's own `min-w` trades a short sideways scroll for names
 * that stay whole. From `md` up there is room, so the identity track relaxes
 * to `minmax(0,1fr)` exactly as specified.
 */
const GRID = 'grid grid-cols-[minmax(9.5rem,1fr)_repeat(5,3.25rem)] md:grid-cols-[minmax(0,1fr)_repeat(5,4.5rem)]';
/** 9.5rem + 5 × 3.25rem. Keeps every row the same width inside the scroller. */
const FIELD_MIN_W = 'min-w-[25.75rem]';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

export interface CategoryFieldCol {
  key: string;
  /** Full-word label, shown from 940px up. */
  headerWide: string;
  /** Abbreviated label, shown below 940px. Equal to `headerWide` when the word
   *  is already short enough that a switch would be noise. */
  headerShort: string;
}

export interface CategoryFieldTeamCell {
  key: string;
  /**
   * The signed reading. `null` is ABSENT and renders a dash; `0` is a real
   * measurement (exactly at the baseline) and renders the rail with its zero
   * tick and no fill. A zero-length bar for an absent reading would claim a
   * measurement nobody took.
   */
  value: number | null;
  /** What to print above the bar, e.g. "+0.4" or a plain scoring average. */
  display: string;
  /** Whether this column has a baseline to draw a signed bar off at all. */
  bar: boolean;
  /** The reading stated in words, for the bar's accessible name. */
  label: string;
}

export interface CategoryFieldPlayerRow {
  id: string;
  name: string;
  /** The secondary identity line, e.g. "'27 · 14 rds · 73.2". */
  meta: string;
  href: string;
  /** One entry per column, in `cols` order. */
  ranks: Array<RankInfo | null>;
}

export interface CategoryFieldProps {
  cols: CategoryFieldCol[];
  /** Identity text for the team register's own row. */
  teamName: string;
  teamMeta: string;
  teamCells: CategoryFieldTeamCell[];
  /**
   * Replaces the bar cells with one sentence spanning them. Used for the cold
   * start, where there is nothing to draw and a reason to say so.
   */
  teamNotice?: string;
  /** How many of `teamCells` the notice spans, from the left. */
  teamNoticeSpan?: number;
  /** Shared scale ceiling — one figure across every bar on the page, so a
   *  −0.1 leak never renders the same size as a −3.2 leak. */
  domain: number;
  playerRows: CategoryFieldPlayerRow[];
  /** Column key the register is sorted by, or `null` when sorted by name. */
  sort: string | null;
  onSortChange: (key: string) => void;
  /** Rows shown before "Show all N". */
  visibleRows: number;
  onShowAll: () => void;
  ariaLabel: string;
}

function TeamCell({ cell, domain }: { cell: CategoryFieldTeamCell; domain: number }) {
  if (cell.value === null) {
    return (
      <div role="cell" className="flex flex-col items-center justify-end gap-1.5 px-1 py-2">
        <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{cell.display}</span>
      </div>
    );
  }
  return (
    <div role="cell" className="flex flex-col items-center justify-end gap-1.5 px-1 py-2">
      {/* The value sits ON the mark. A coach never has to measure a 36px bar
          against anything to read it; the bar is there to compare the five
          columns with each other at a glance. */}
      <span className="font-fw-mono text-caption font-medium tabular-nums text-text-primary">{cell.display}</span>
      {cell.bar ? <MicroBar value={cell.value} domain={domain} goodDirection="high" width={36} height={6} label={cell.label} /> : <span aria-hidden="true" className="h-1.5" />}
    </div>
  );
}

export function CategoryField({
  cols,
  teamName,
  teamMeta,
  teamCells,
  teamNotice,
  teamNoticeSpan = 4,
  domain,
  playerRows,
  sort,
  onSortChange,
  visibleRows,
  onShowAll,
  ariaLabel,
}: CategoryFieldProps) {
  const shown = playerRows.slice(0, visibleRows);
  const hidden = playerRows.length - shown.length;
  const noticeCells = teamNotice ? teamCells.slice(teamNoticeSpan) : teamCells;

  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-x-visible md:px-0">
      <div role="table" aria-label={ariaLabel} className={cn('flex flex-col', FIELD_MIN_W)}>
        {/* ── Column headers, each a sort control ───────────────────────── */}
        <div role="row" className={cn(GRID, 'items-end border-b border-border-subtle')}>
          <span role="columnheader" className={cn(OVERLINE, 'pb-1.5 pr-3')}>
            Player
          </span>
          {cols.map((col) => {
            const active = sort === col.key;
            return (
              <span key={col.key} role="columnheader" aria-sort={active ? 'ascending' : 'none'} className="flex justify-center">
                <PressTarget
                  onClick={() => onSortChange(col.key)}
                  aria-label={`Sort by ${col.headerWide}`}
                  className={cn(
                    'flex w-full min-h-11 items-end justify-center px-1 pb-1.5 font-fw-sans text-eyebrow uppercase tracking-[0.07em] transition-colors',
                    active ? 'font-semibold text-accent-700' : 'text-text-tertiary hover:text-text-secondary',
                  )}
                >
                  {/* Two spans, one CSS breakpoint. `display:none` removes the
                      hidden one from the accessibility tree, so exactly one
                      label is ever announced. Never `sr-only` here. */}
                  {col.headerWide === col.headerShort ? (
                    <span>{col.headerWide}</span>
                  ) : (
                    <>
                      <span className="hidden min-[940px]:inline">{col.headerWide}</span>
                      <span className="min-[940px]:hidden">{col.headerShort}</span>
                    </>
                  )}
                </PressTarget>
              </span>
            );
          })}
        </div>

        {/* ── Team register ─────────────────────────────────────────────── */}
        <div role="row" className={cn(GRID, 'items-end border-b border-border-strong')}>
          <div role="rowheader" className="min-w-0 py-2 pr-3">
            <b className="block truncate font-fw-sans text-body-sm font-semibold text-text-primary">{teamName}</b>
            <span className="block truncate font-fw-sans text-caption text-text-tertiary">{teamMeta}</span>
          </div>
          {teamNotice ? (
            <div
              role="cell"
              className="col-span-4 flex items-end px-1 py-2"
            >
              <p className="font-fw-sans text-caption leading-snug text-text-tertiary">{teamNotice}</p>
            </div>
          ) : null}
          {noticeCells.map((cell) => (
            <TeamCell key={cell.key} cell={cell} domain={domain} />
          ))}
        </div>

        {/* ── Player register ───────────────────────────────────────────── */}
        {shown.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            role="row"
            className={cn(GRID, 'items-center border-b border-border-subtle transition-colors duration-150 last:border-b-0 hover:bg-surface-hover')}
          >
            <span role="rowheader" className="min-w-0 py-2 pr-3">
              <b className="block truncate font-fw-sans text-body-sm font-semibold text-text-primary">{row.name}</b>
              <span className="block truncate font-fw-sans text-caption text-text-tertiary">{row.meta}</span>
            </span>
            {row.ranks.map((rank, i) => (
              <span key={cols[i]?.key ?? i} role="cell" className="flex items-center justify-center py-2">
                {rank ? (
                  <RankCell rank={rank.rank} of={rank.of} />
                ) : (
                  <span className="grid h-[26px] w-[34px] place-items-center font-fw-mono text-caption text-text-tertiary">–</span>
                )}
              </span>
            ))}
          </Link>
        ))}
      </div>

      {/* The cap is stated, never silent. A roster truncated without saying so
          is a lie about how many players there are. */}
      {hidden > 0 ? (
        <PressTarget
          onClick={onShowAll}
          className="mt-3 inline-flex min-h-11 items-center font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
        >
          Show all {playerRows.length} players
        </PressTarget>
      ) : null}
    </div>
  );
}
