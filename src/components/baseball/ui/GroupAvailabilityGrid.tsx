'use client';

/**
 * GroupAvailabilityGrid — data-agnostic heatmap primitive.
 *
 * Rows = players, columns = time-block slots. Each cell is filled by the
 * player's availability status for that slot:
 *
 *   available   → green (primary-500)
 *   class       → amber (amber-400)
 *   practice    → clay/orange (orange-400)
 *   game        → graphite (warm-700)
 *   unavailable → red (red-500)
 *   unknown     → muted cream (warm-200)
 *
 * Accessibility contract:
 *   - role=grid on the grid container (aria-rowcount / aria-colcount)
 *   - role=row on every row (display:contents — layout-transparent)
 *   - role=columnheader on slot header cells
 *   - role=rowheader on player name cells (aria-selected reflects selection)
 *   - role=gridcell on every status cell (aria-label = "Name, Slot: Status")
 *   - Roving tabindex: one cell owns tabIndex=0 at a time; arrow keys move focus
 *   - Enter/Space on a rowheader fires onTogglePlayer (when wired)
 *   - Min 44 px height on every interactive row element (iOS HIG touch targets)
 *
 * Reduced-motion: entrance animation is skipped (initial=false / y=0); no
 * cell hover transitions are applied.
 *
 * Peer dependency: GroupAvailabilityCell is OWNED and EXPORTED by
 *   src/lib/baseball/exercise-conflict.ts (conflict-engine agent).
 *   This file imports it with `import type` only.
 */

import { useCallback, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconCalendar } from '@/components/icons';
import type { GroupAvailabilityCell } from '@/lib/baseball/exercise-conflict';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupAvailabilityGridProps {
  /** One entry per player — each carries their per-slot blocks. */
  cells: GroupAvailabilityCell[];
  /** Ordered list of time-block labels (column headers). */
  slots: string[];
  /** Player IDs that are currently selected in the parent. */
  selectedPlayerIds?: Set<string>;
  /** Called when the user clicks/activates a player row header. */
  onTogglePlayer?: (id: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

type CellStatus = GroupAvailabilityCell['blocks'][number]['status'];

interface StatusCfg {
  /** Human-readable label used in the legend and aria-labels. */
  label: string;
  /** Tailwind bg class for the filled cell. */
  bg: string;
  /** Tailwind text class for the abbreviation inside the cell. */
  fg: string;
}

const STATUS_CFG: Record<CellStatus, StatusCfg> = {
  available:   { label: 'Available',   bg: 'bg-primary-500',  fg: 'text-white'     },
  class:       { label: 'Class',       bg: 'bg-amber-400',    fg: 'text-white'     },
  practice:    { label: 'Practice',    bg: 'bg-orange-400',   fg: 'text-white'     },
  game:        { label: 'Game',        bg: 'bg-warm-700',     fg: 'text-warm-100'  },
  unavailable: { label: 'Unavailable', bg: 'bg-red-500',      fg: 'text-white'     },
  unknown:     { label: 'Unknown',     bg: 'bg-warm-200',     fg: 'text-warm-600'  },
};

/**
 * Short glyph displayed inside each cell (aria-hidden — the aria-label on the
 * gridcell carries the full status text for screen readers).
 */
const STATUS_ABBR: Record<CellStatus, string> = {
  available:   '✓',
  class:       'CL',
  practice:    'PR',
  game:        'GM',
  unavailable: '✕',
  unknown:     '—',
};

/** Canonical display order for the legend. */
const LEGEND_ORDER: CellStatus[] = [
  'available',
  'class',
  'practice',
  'game',
  'unavailable',
  'unknown',
];

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function GridLegend() {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3"
      aria-label="Availability status legend"
      role="list"
    >
      {LEGEND_ORDER.map((status) => {
        const cfg = STATUS_CFG[status];
        return (
          <span
            key={status}
            role="listitem"
            className="flex items-center gap-1.5 text-xs text-warm-600"
          >
            <span
              aria-hidden="true"
              className={cn('w-3 h-3 rounded-sm flex-shrink-0', cfg.bg)}
            />
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupAvailabilityGrid
// ---------------------------------------------------------------------------

/**
 * Presentational heatmap grid — no data-fetching, no server actions.
 * Consumers own the data and provide cells + slots. Selection state is lifted.
 */
export function GroupAvailabilityGrid({
  cells,
  slots,
  selectedPlayerIds,
  onTogglePlayer,
  className,
}: GroupAvailabilityGridProps) {
  const prefersReducedMotion = useReducedMotion();

  /**
   * Roving-tabindex state: [rowIndex, colIndex].
   * rowIndex is 0-based (0 = first player row).
   * colIndex is 0-based: 0 = rowheader (player name), 1+ = slot cells.
   */
  const [focusedCell, setFocusedCell] = useState<[number, number]>([0, 0]);
  const gridRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Arrow-key navigation across the grid
  // ------------------------------------------------------------------
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const [row, col] = focusedCell;
      const numRows = cells.length;
      // colCount = 1 rowheader + N slot cells
      const numCols = slots.length + 1;

      let nextRow = row;
      let nextCol = col;
      let moved = false;

      switch (e.key) {
        case 'ArrowDown':
          nextRow = Math.min(row + 1, numRows - 1);
          moved = true;
          break;
        case 'ArrowUp':
          nextRow = Math.max(row - 1, 0);
          moved = true;
          break;
        case 'ArrowRight':
          nextCol = Math.min(col + 1, numCols - 1);
          moved = true;
          break;
        case 'ArrowLeft':
          nextCol = Math.max(col - 1, 0);
          moved = true;
          break;
        case 'Home':
          nextCol = 0;
          moved = true;
          break;
        case 'End':
          nextCol = numCols - 1;
          moved = true;
          break;
        default:
          break;
      }

      if (!moved) return;
      e.preventDefault();

      setFocusedCell([nextRow, nextCol]);
      const sel = `[data-grid-cell="${nextRow}-${nextCol}"]`;
      const el = gridRef.current?.querySelector<HTMLElement>(sel);
      el?.focus();
    },
    [focusedCell, cells.length, slots.length],
  );

  // ------------------------------------------------------------------
  // Empty state
  // ------------------------------------------------------------------
  if (cells.length === 0 || slots.length === 0) {
    return (
      <Card
        variant="flat"
        padding="none"
        className={cn('overflow-hidden', className)}
      >
        <EmptyState
          variant="minimal"
          icon={<IconCalendar size={28} />}
          title="No availability to display"
          description="Add players and define schedule slots to see the heatmap."
        />
        <div className="border-t border-warm-100 bg-warm-50">
          <GridLegend />
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------------
  // Grid column template:
  //   160 px sticky player-name column + equal-width slot columns
  // ------------------------------------------------------------------
  const PLAYER_COL = '160px';
  const SLOT_COL   = '1fr';   // flexible slots that share remaining space
  const MIN_SLOT   = '72px';  // minimum width so text fits on mobile
  const gridTemplateColumns = [
    PLAYER_COL,
    ...slots.map(() => `minmax(${MIN_SLOT}, ${SLOT_COL})`),
  ].join(' ');

  return (
    <m.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
      className={cn('overflow-x-auto', className)}
    >
      <Card variant="flat" padding="none" className="overflow-hidden">
        {/* ----------------------------------------------------------------
            ARIA grid — using display:grid with role="row" + display:contents
            so the CSS grid layout governs positioning while ARIA semantics
            are preserved in the accessibility tree.
        ---------------------------------------------------------------- */}
        <div
          ref={gridRef}
          role="grid"
          aria-label="Player schedule availability"
          aria-rowcount={cells.length + 1}
          aria-colcount={slots.length + 1}
          tabIndex={-1}
          onKeyDown={handleGridKeyDown}
          className="min-w-max w-full"
          style={{ display: 'grid', gridTemplateColumns }}
        >
          {/* ---- Column headers ---- */}
          <div
            role="row"
            aria-rowindex={1}
            style={{ display: 'contents' }}
          >
            {/* Corner — empty cell above player names */}
            <div
              role="columnheader"
              aria-colindex={1}
              className={cn(
                'sticky left-0 z-10',
                'flex items-center px-4',
                'min-h-[44px]',
                'bg-warm-50 border-b border-r border-warm-200',
                'text-xs font-semibold text-warm-500 uppercase tracking-wide',
              )}
            >
              Player
            </div>

            {slots.map((slot, slotIdx) => (
              <div
                key={slot}
                role="columnheader"
                aria-colindex={slotIdx + 2}
                className={cn(
                  'flex items-center justify-center px-2 py-2',
                  'min-h-[44px]',
                  'bg-warm-50 border-b border-warm-200',
                  slotIdx < slots.length - 1 && 'border-r border-warm-100',
                  'text-xs font-medium text-warm-600 text-center leading-tight',
                )}
              >
                {slot}
              </div>
            ))}
          </div>

          {/* ---- Player rows ---- */}
          {cells.map((cell, rowIdx) => {
            const isSelected = selectedPlayerIds?.has(cell.playerId) ?? false;
            const isLastRow = rowIdx === cells.length - 1;
            // O(1) slot → status lookup
            const blockBySlot = new Map<string, CellStatus>(
              cell.blocks.map((b) => [b.slot, b.status]),
            );

            return (
              <div
                key={cell.playerId}
                role="row"
                aria-rowindex={rowIdx + 2}
                aria-selected={isSelected}
                style={{ display: 'contents' }}
              >
                {/* -- Row header: player name + optional selection toggle -- */}
                <div
                  role="rowheader"
                  aria-colindex={1}
                  aria-selected={isSelected}
                  data-grid-cell={`${rowIdx}-0`}
                  tabIndex={
                    focusedCell[0] === rowIdx && focusedCell[1] === 0 ? 0 : -1
                  }
                  onFocus={() => setFocusedCell([rowIdx, 0])}
                  onClick={
                    onTogglePlayer
                      ? () => onTogglePlayer(cell.playerId)
                      : undefined
                  }
                  onKeyDown={(e) => {
                    if (
                      onTogglePlayer &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      e.preventDefault();
                      onTogglePlayer(cell.playerId);
                    }
                    // Arrow keys handled by the parent grid's onKeyDown via bubbling
                  }}
                  className={cn(
                    'sticky left-0 z-10',
                    'flex items-center gap-2 px-4',
                    'min-h-[44px]',
                    'border-r border-warm-200/60',
                    !isLastRow && 'border-b border-warm-100',
                    'text-sm font-medium truncate',
                    // Selection colors
                    isSelected
                      ? 'bg-primary-50 text-primary-900'
                      : 'bg-cream-50 text-warm-900 hover:bg-warm-50',
                    // Interactive affordance
                    onTogglePlayer
                      ? 'cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50'
                      : 'cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-warm-300/60',
                    'transition-colors duration-100',
                  )}
                >
                  {/* Selection radio indicator — only when toggle is wired */}
                  {onTogglePlayer && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 transition-colors duration-100',
                        isSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'bg-cream-50 border-warm-300',
                      )}
                    />
                  )}
                  <span className="truncate">{cell.playerName}</span>
                </div>

                {/* -- Slot cells -- */}
                {slots.map((slot, colIdx) => {
                  const status: CellStatus = blockBySlot.get(slot) ?? 'unknown';
                  const cfg = STATUS_CFG[status];
                  const abbr = STATUS_ABBR[status];
                  const isFocused =
                    focusedCell[0] === rowIdx && focusedCell[1] === colIdx + 1;

                  return (
                    <div
                      key={`${cell.playerId}-${slot}`}
                      role="gridcell"
                      aria-colindex={colIdx + 2}
                      aria-label={`${cell.playerName}, ${slot}: ${cfg.label}`}
                      data-grid-cell={`${rowIdx}-${colIdx + 1}`}
                      tabIndex={isFocused ? 0 : -1}
                      onFocus={() => setFocusedCell([rowIdx, colIdx + 1])}
                      className={cn(
                        'flex items-center justify-center',
                        'min-h-[44px]',
                        !isLastRow && 'border-b border-warm-100/60',
                        colIdx < slots.length - 1 && 'border-r border-warm-100/60',
                        cfg.bg,
                        cfg.fg,
                        // Focus ring for keyboard navigation
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-700/70',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="text-xs font-semibold select-none tracking-wide"
                      >
                        {abbr}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="border-t border-warm-100 bg-warm-50">
          <GridLegend />
        </div>
      </Card>
    </m.div>
  );
}
