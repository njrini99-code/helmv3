'use client';

/**
 * ============================================================================
 * Fairway · Toolbar — the one quiet triage row (search + filters + actions)
 * ----------------------------------------------------------------------------
 * ONE composed control row that replaces the 3 competing filter mechanisms on
 * the Insights page (DESIGN-SYSTEM.md §6 "Toolbar": "sticky glass top bar …
 * holds search + filters + primary action; one quiet row").
 *
 * Composes EXISTING Fairway primitives only — NO new headless dependency:
 *   • SearchField  (command/)          — the inline search half
 *   • FilterPill   (controls/)         — toggleable filter pills
 *   • PopoverPanel (overlays/)         — the "More filters" overflow panel
 *   • Segmented    (controls/)         — the view-toggle (table | grouped | …)
 *   • Button / IconButton (controls/)  — primary action + bulk actions
 *   • StatusPill / Chip / Badge        — selection count + applied-filter chips
 *
 * ── Material (§4.3 glass allow-list) ─────────────────────────────────────────
 * Matte AT REST: a warm `bg-surface` row with a single hairline (border OR
 * shadow, never both). Restrained warm-CREAM glass ONLY while STUCK — when the
 * row is `sticky` and an IntersectionObserver sentinel scrolls out of view, the
 * row earns the "sticky page header" glass slot (allow-list #1) via
 * `backdrop-blur-glass` over the warm `--fw-glass-bg` tint. Self-contained: the
 * glass recipe is built from the locked `--fw-glass-*` tokens inline, so the
 * controls group never depends on the overlays CSS module being loaded.
 *
 * The bulk-action bar (slot: `bulkActions`) is "transient floating chrome"
 * (allow-list #5 — the "X selected" bar): it materializes in place of the row's
 * controls when `selectedCount > 0`, on the same warm glass, and is what the
 * Signals surface wires to the (currently dead-coded) alerts.ts bulk actions.
 *
 * Slots:  search · filters · viewToggle · primaryAction · bulkActions
 * Accessible: role="toolbar" + aria-label, an aria-live count on the bulk bar,
 * keyboardable throughout (every child primitive ships its own focus ring).
 *
 * ADDITIVE ONLY — imported by nothing existing. Renders correctly inside a
 * `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import {
  type ReactNode,
  type CSSProperties,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import { Button, IconButton } from './button';
import { Segmented, type SegmentedOption } from './segmented';
import { FilterPill } from './filter-pill';
import { StatusPill } from './status-pill';
import { PopoverPanel } from '../overlays/PopoverPanel';

/* ───────────────────────────────────────────────────────────────────────────
 * Warm cream-glass recipe (self-contained, built from locked --fw-glass-* tokens)
 * Used ONLY when the row is sticky-stuck or hosting the bulk bar (the two
 * §4.3-approved chrome slots). Matte at rest never touches this.
 * ─────────────────────────────────────────────────────────────────────────── */
const STUCK_GLASS_STYLE: CSSProperties = {
  backgroundColor: 'var(--fw-glass-bg)',
  backdropFilter: 'saturate(var(--fw-glass-saturate))',
  WebkitBackdropFilter: 'saturate(var(--fw-glass-saturate))',
  borderColor: 'var(--fw-glass-border)',
};

/* ───────────────────────────────────────────────────────────────────────────
 * Public types
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ToolbarProps {
  /** The inline search slot (typically a <SearchField />). */
  search?: ReactNode;
  /**
   * The filter slot — FilterPill(s) and/or a <Toolbar.FilterMenu />. Rendered as
   * a wrapping, horizontally-scrollable group so a long filter set never breaks
   * the row.
   */
  filters?: ReactNode;
  /** The view-toggle slot (typically a <Segmented /> or <Toolbar.ViewToggle />). */
  viewToggle?: ReactNode;
  /** The single primary action (typically a primary <Button />). Sits far-right. */
  primaryAction?: ReactNode;
  /**
   * Applied-filter chips rendered on a second quiet line BELOW the row (the
   * "what's currently filtering" recall). Pass `<Chip onRemove=… />`s. Omit when
   * nothing is applied.
   */
  appliedChips?: ReactNode;
  /**
   * The bulk-action cluster (Button/IconButton row). When `selectedCount > 0`
   * this slot REPLACES the row's controls with the floating "X selected" chrome
   * bar. This is the slot the Signals surface wires to the dead-coded alerts.ts
   * bulk actions.
   */
  bulkActions?: ReactNode;
  /** Number of currently-selected rows. >0 swaps in the bulk-action bar. */
  selectedCount?: number;
  /** Label for the bulk bar's leading count (e.g. "signal"). Default "selected". */
  selectionNoun?: string;
  /** Called when the bulk bar's "Clear" affordance is pressed. */
  onClearSelection?: () => void;
  /**
   * Make the row stick to the top of its scroll container and earn the cream
   * glass once content scrolls under it. Default `false` (static matte row).
   */
  sticky?: boolean;
  /** Top offset (px) when `sticky` — clears a fixed app/header above. Default 0. */
  stickyTop?: number;
  /** Accessible label for the toolbar landmark. Default "Filters and actions". */
  'aria-label'?: string;
  /** Extra classes merged (last-wins) onto the row. */
  className?: string;
  'data-slot'?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Toolbar (root)
 * ─────────────────────────────────────────────────────────────────────────── */

const ToolbarRoot = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  {
    search,
    filters,
    viewToggle,
    primaryAction,
    appliedChips,
    bulkActions,
    selectedCount = 0,
    selectionNoun = 'selected',
    onClearSelection,
    sticky = false,
    stickyTop = 0,
    'aria-label': ariaLabel = 'Filters and actions',
    className,
    'data-slot': dataSlot = 'fw-toolbar',
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const hasSelection = selectedCount > 0;
  // Premium scroll-edge fade for the (horizontally scrollable) filter cluster —
  // a long filter set bleeds off-edge instead of hard-cutting at the hidden bar.
  const { ref: filtersFadeRef, fadeStyle: filtersFadeStyle } = useScrollFade<HTMLDivElement>('x');

  // Detect "stuck" via a zero-height sentinel just above the sticky row. When it
  // scrolls out of view the row is pinned → earn the cream glass. No scroll
  // listener (IntersectionObserver is cheap + jank-free).
  useEffect(() => {
    if (!sticky) {
      setStuck(false);
      return;
    }
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry) setStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: `-${stickyTop + 1}px 0px 0px 0px` },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [sticky, stickyTop]);

  // The row carries the warm glass when STUCK (sticky slot) OR while the bulk
  // bar is up (transient chrome slot). Otherwise it stays fully matte.
  const onGlass = (sticky && stuck) || hasSelection;

  // One merged style: sticky offset/z-index (always when sticky) + the warm
  // glass tint/edge tokens (only when on-glass). Matte at rest carries no inline
  // style so the `border-border-subtle` class wins.
  const rowStyle: CSSProperties | undefined =
    sticky || onGlass
      ? {
          ...(sticky ? { top: stickyTop, zIndex: 10 } : {}),
          ...(onGlass ? STUCK_GLASS_STYLE : {}),
        }
      : undefined;

  return (
    <>
      {sticky ? <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" /> : null}

      <div
        ref={ref}
        role="toolbar"
        aria-label={ariaLabel}
        data-slot={dataSlot}
        data-stuck={sticky && stuck ? '' : undefined}
        data-selecting={hasSelection ? '' : undefined}
        style={rowStyle}
        className={cn(
          'rounded-card border',
          'transition-[background-color,border-color,box-shadow] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none',
          sticky && 'sticky',
          onGlass
            ? // Restrained warm cream glass (sticky-stuck or hosting the bulk bar).
              // Tint/edge come from STUCK_GLASS_STYLE tokens; only the blur + soft
              // lift are class-driven here.
              'backdrop-blur-glass shadow-soft'
            : // Matte at rest — single hairline, no shadow (border OR shadow, never both)
              'bg-surface border-border-subtle shadow-flat',
          className,
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          {hasSelection ? (
            <motion.div
              key="bulk"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}
              className="flex min-h-[44px] flex-wrap items-center gap-3 px-3 py-2"
            >
              <StatusPill tone="accent" dot={false} size="md" className="font-fw-mono tabular-nums">
                {/* aria-live so SR users hear the selection count change */}
                <span aria-live="polite" aria-atomic="true">
                  {selectedCount} {pluralize(selectionNoun, selectedCount)}
                </span>
              </StatusPill>

              <div className="flex flex-1 flex-wrap items-center gap-2">{bulkActions}</div>

              {onClearSelection ? (
                <Button variant="ghost" size="sm" onClick={onClearSelection} className="ml-auto">
                  Clear
                </Button>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="controls"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
              className="flex min-h-[44px] flex-wrap items-center gap-3 px-3 py-2"
            >
              {/* search — grows to absorb slack so the row reads as one quiet field+controls */}
              {search ? <div className="min-w-[180px] flex-1 sm:max-w-sm">{search}</div> : null}

              {/* filters — horizontally scrollable so a long set never breaks the row */}
              {filters ? (
                <div
                  ref={filtersFadeRef}
                  style={filtersFadeStyle}
                  className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {filters}
                </div>
              ) : null}

              {/* trailing cluster — view toggle + primary action, always far-right */}
              {(viewToggle || primaryAction) && (
                <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                  {viewToggle}
                  {primaryAction}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Applied-filter chips — quiet recall line below the row (only when set) */}
        {appliedChips && !hasSelection ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2">
            <span className="font-fw-sans text-caption text-text-tertiary">Filtering by</span>
            {appliedChips}
          </div>
        ) : null}
      </div>
    </>
  );
});
ToolbarRoot.displayName = 'Toolbar';

/* ───────────────────────────────────────────────────────────────────────────
 * Toolbar.ViewToggle — thin Segmented alias (the view-toggle slot)
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ToolbarViewToggleProps<T extends string = string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name. Default "View". */
  'aria-label'?: string;
  className?: string;
}

function ToolbarViewToggle<T extends string = string>({
  options,
  value,
  onValueChange,
  'aria-label': ariaLabel = 'View',
  className,
}: ToolbarViewToggleProps<T>) {
  return (
    <Segmented
      size="sm"
      options={options}
      value={value}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
ToolbarViewToggle.displayName = 'Toolbar.ViewToggle';

/* ───────────────────────────────────────────────────────────────────────────
 * Toolbar.FilterMenu — overflow filter group hosted in a PopoverPanel
 * ----------------------------------------------------------------------------
 * The "More filters" affordance: a quiet trigger pill that opens a PopoverPanel
 * of FilterPill rows (or any custom filter UI). Keeps the inline row to the
 * highest-value pills while the long tail lives in the panel. SignalsToolbar
 * composes this to fold severity/status/type filters behind one trigger.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ToolbarFilterOption {
  value: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ToolbarFilterMenuProps {
  /** Trigger label. Default "Filters". */
  label?: ReactNode;
  /** Leading icon on the trigger (e.g. a lucide <SlidersHorizontal/>). */
  icon?: ReactNode;
  /** Options rendered as toggleable FilterPills inside the panel. */
  options?: ReadonlyArray<ToolbarFilterOption>;
  /** Currently-selected option values (multi-select). */
  selected?: ReadonlyArray<string>;
  /** Toggle handler for an option value. */
  onToggle?: (value: string) => void;
  /** Optional "Clear all" inside the panel; rendered when >0 selected. */
  onClear?: () => void;
  /**
   * Custom panel body. When provided, `options` are ignored and you own the
   * panel's contents entirely (e.g. nested Comboboxes, a date range).
   */
  children?: ReactNode;
  /** Optional small heading inside the panel. */
  heading?: ReactNode;
  /** Panel width preset. Default `sm`. */
  width?: 'auto' | 'sm' | 'md' | 'lg';
  className?: string;
}

function ToolbarFilterMenu({
  label = 'Filters',
  icon,
  options,
  selected = [],
  onToggle,
  onClear,
  children,
  heading,
  width = 'sm',
  className,
}: ToolbarFilterMenuProps) {
  const activeCount = selected.length;

  return (
    <PopoverPanel
      surface="matte"
      width={width}
      align="start"
      ariaLabel={typeof label === 'string' ? label : 'Filters'}
      trigger={
        <FilterPill
          selected={activeCount > 0}
          showCheck={false}
          icon={icon}
          count={activeCount > 0 ? activeCount : undefined}
          className={className}
        >
          {label}
        </FilterPill>
      }
    >
      {heading ? <PopoverPanel.Header>{heading}</PopoverPanel.Header> : null}

      {children ?? (
        <div className="flex flex-col gap-1.5 p-1">
          {options?.map((opt) => (
            <FilterPill
              key={opt.value}
              selected={selected.includes(opt.value)}
              size="sm"
              icon={opt.icon}
              count={opt.count}
              disabled={opt.disabled}
              onClick={() => onToggle?.(opt.value)}
              className="w-full justify-start"
            >
              {opt.label}
            </FilterPill>
          ))}
        </div>
      )}

      {onClear && activeCount > 0 ? (
        <>
          <PopoverPanel.Separator />
          <div className="px-1 pb-0.5">
            <Button variant="ghost" size="sm" fullWidth onClick={onClear}>
              Clear filters
            </Button>
          </div>
        </>
      ) : null}
    </PopoverPanel>
  );
}
ToolbarFilterMenu.displayName = 'Toolbar.FilterMenu';

/* ───────────────────────────────────────────────────────────────────────────
 * Compound export
 * ─────────────────────────────────────────────────────────────────────────── */

type ToolbarComponent = typeof ToolbarRoot & {
  ViewToggle: typeof ToolbarViewToggle;
  FilterMenu: typeof ToolbarFilterMenu;
};

export const Toolbar = ToolbarRoot as ToolbarComponent;
Toolbar.ViewToggle = ToolbarViewToggle;
Toolbar.FilterMenu = ToolbarFilterMenu;

/* re-export the icon-only bulk-action helper so Signals can drop it inline */
export { IconButton as ToolbarIconButton };

/* ───────────────────────────────────────────────────────────────────────────
 * local utils
 * ─────────────────────────────────────────────────────────────────────────── */

function pluralize(noun: string, n: number): string {
  if (n === 1 || noun === 'selected') return noun;
  return /[sxz]$|[cs]h$/.test(noun) ? `${noun}es` : `${noun}s`;
}
