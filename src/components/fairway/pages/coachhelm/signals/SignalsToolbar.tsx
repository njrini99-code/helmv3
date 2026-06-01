'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · Signals · SignalsToolbar (helper)
 * ----------------------------------------------------------------------------
 * The ONE quiet triage row for the Signals surface — composes the shared
 * `Toolbar` primitive (search + filters + view-toggle + primary action +
 * bulk-action slot) so alerts / insights / patterns finally share ONE filter
 * system instead of the three competing mechanisms the legacy Insights page
 * stacked (lifecycle chips + category chips + a filters panel).
 *
 * It composes EXISTING Fairway primitives only — `Toolbar`, `SearchField`,
 * `Toolbar.FilterMenu` (PopoverPanel-backed), `Toolbar.ViewToggle` (Segmented),
 * `Button` — and owns NO data: every value is controlled by the parent
 * `FairwayCoachHelmSignals`, which holds the URL-as-state model ported from
 * `InsightsPageContent`. The `bulkActions` slot is where the parent wires the
 * (previously dead-coded) alerts.ts bulk actions; the toolbar simply swaps in
 * the floating "N selected" bar when `selectedCount > 0`.
 *
 * Presentation only — no server action import here.
 * ========================================================================== */

import { type ReactNode } from 'react';
import { Download } from 'lucide-react';
import {
  Toolbar,
  type ToolbarFilterOption,
} from '@/components/fairway/controls/Toolbar';
import { SearchField } from '@/components/fairway/command/search-field';
import { Button } from '@/components/fairway/controls/button';
import { Chip } from '@/components/fairway/controls/badge';
import type { SegmentedOption } from '@/components/fairway/controls/segmented';

/** A single applied-filter recall chip (label + the value that clears it). */
export interface AppliedFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface SignalsToolbarProps<V extends string = string> {
  /* search */
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;

  /* severity (priority) — multi-select pills behind one "Severity" menu */
  severityOptions: ReadonlyArray<ToolbarFilterOption>;
  selectedSeverity: ReadonlyArray<string>;
  onToggleSeverity: (value: string) => void;
  onClearSeverity?: () => void;

  /* lifecycle / status — multi-select behind one "Status" menu */
  statusOptions: ReadonlyArray<ToolbarFilterOption>;
  selectedStatus: ReadonlyArray<string>;
  onToggleStatus: (value: string) => void;
  onClearStatus?: () => void;

  /* category / type — multi-select behind one "Category" menu (optional) */
  categoryOptions?: ReadonlyArray<ToolbarFilterOption>;
  selectedCategory?: ReadonlyArray<string>;
  onToggleCategory?: (value: string) => void;
  onClearCategory?: () => void;

  /* view toggle (feed | table | grouped) */
  viewOptions?: ReadonlyArray<SegmentedOption<V>>;
  view?: V;
  onViewChange?: (v: V) => void;

  /* applied-filter recall chips (quiet line below the row) */
  appliedChips?: AppliedFilterChip[];

  /* primary action — e.g. the ScanTeamControl, passed by the parent */
  primaryAction?: ReactNode;

  /* export — wires insight-management.ts#exportInsights via the parent */
  onExport?: () => void;

  /* bulk-action bar (swaps in when a selection exists) */
  selectedCount?: number;
  bulkActions?: ReactNode;
  onClearSelection?: () => void;

  /** Sticky toolbar that earns the cream glass once content scrolls under. */
  sticky?: boolean;
  stickyTop?: number;
}

export function SignalsToolbar<V extends string = string>({
  query,
  onQueryChange,
  searchPlaceholder = 'Search signals by title or detail…',
  severityOptions,
  selectedSeverity,
  onToggleSeverity,
  onClearSeverity,
  statusOptions,
  selectedStatus,
  onToggleStatus,
  onClearStatus,
  categoryOptions,
  selectedCategory,
  onToggleCategory,
  onClearCategory,
  viewOptions,
  view,
  onViewChange,
  appliedChips,
  primaryAction,
  onExport,
  selectedCount = 0,
  bulkActions,
  onClearSelection,
  sticky = true,
  stickyTop = 0,
}: SignalsToolbarProps<V>) {
  const filters = (
    <>
      <Toolbar.FilterMenu
        label="Severity"
        heading="Severity"
        options={severityOptions}
        selected={selectedSeverity}
        onToggle={onToggleSeverity}
        onClear={onClearSeverity}
      />
      <Toolbar.FilterMenu
        label="Status"
        heading="Status"
        options={statusOptions}
        selected={selectedStatus}
        onToggle={onToggleStatus}
        onClear={onClearStatus}
      />
      {categoryOptions && categoryOptions.length > 0 && onToggleCategory ? (
        <Toolbar.FilterMenu
          label="Category"
          heading="Category"
          options={categoryOptions}
          selected={selectedCategory ?? []}
          onToggle={onToggleCategory}
          onClear={onClearCategory}
        />
      ) : null}
    </>
  );

  const trailing = (
    <>
      {onExport ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Download className="h-4 w-4" strokeWidth={2} aria-hidden />}
          onClick={onExport}
        >
          <span className="hidden sm:inline">Export</span>
        </Button>
      ) : null}
      {primaryAction}
    </>
  );

  return (
    <Toolbar
      aria-label="Signal triage filters and actions"
      sticky={sticky}
      stickyTop={stickyTop}
      search={
        <SearchField
          size="sm"
          value={query}
          onChange={(e) => onQueryChange(e.currentTarget.value)}
          onClear={() => onQueryChange('')}
          placeholder={searchPlaceholder}
          aria-label="Search signals"
        />
      }
      filters={filters}
      viewToggle={
        viewOptions && view && onViewChange ? (
          <Toolbar.ViewToggle<V>
            options={viewOptions}
            value={view}
            onValueChange={onViewChange}
            aria-label="Signal view"
          />
        ) : undefined
      }
      primaryAction={trailing}
      appliedChips={
        appliedChips && appliedChips.length > 0
          ? appliedChips.map((c) => (
              <Chip key={c.key} size="sm" tone="accent" onRemove={c.onRemove}>
                {c.label}
              </Chip>
            ))
          : undefined
      }
      selectedCount={selectedCount}
      selectionNoun="signal"
      bulkActions={bulkActions}
      onClearSelection={onClearSelection}
    />
  );
}
