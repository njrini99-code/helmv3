'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { IconStar, IconSearch, IconX, IconClock, IconChevronDown, IconChevronUp, IconFileText, IconAlertCircle, IconLoader, IconBookmark, IconFilter, IconUser } from '@/components/icons';
import type { CoachStatus } from '../crm-config';
import { SaveSegmentDialog } from './segments/SaveSegmentDialog';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export interface Filters {
  status: CoachStatus | 'all';
  // Mirrors the full ncaa_division DB enum (D1/D2/D3/NAIA/JUCO plus the
  // JUCO_D1/JUCO_D2/JUCO_D3/CCCAA sub-divisions) — not just the 5-value
  // Division app type — so every coach in the table is reachable by an
  // exact-match division filter.
  division: 'all' | 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO' | 'JUCO_D1' | 'JUCO_D2' | 'JUCO_D3' | 'CCCAA';
  conference: string;
  program: 'all' | 'mens' | 'womens' | 'both';
  priority: string;
  search: string;
  followUpDue: boolean;
  starred: boolean;
  hasNotes: boolean;
  noContact30Days: boolean;
  primaryOnly?: boolean;
  // Outreach-queue state (from sequence enrollment): queued = not emailed yet,
  // sent = in sequence, done = sequence complete.
  queueStatus?: 'all' | 'queued' | 'sent' | 'done';
}

interface CoachFiltersProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  conferences: string[];
  statusConfig: Record<CoachStatus, { label: string; icon: React.ReactNode }>;
}

// All real division values present on the Filters type. "all" is intentionally
// absent from the chooser — an unset division is simply the ABSENCE of a chip.
// Includes the JUCO_D1/JUCO_D2/JUCO_D3/CCCAA sub-divisions that actually exist
// in crm_coaches.division (a bare 'JUCO' chip alone never matches those rows).
const DIVISION_OPTIONS: ReadonlyArray<{ value: Exclude<Filters['division'], 'all'>; label: string }> = [
  { value: 'D1', label: 'D1' },
  { value: 'D2', label: 'D2' },
  { value: 'D3', label: 'D3' },
  { value: 'NAIA', label: 'NAIA' },
  { value: 'JUCO', label: 'JUCO' },
  { value: 'JUCO_D1', label: 'JUCO D1' },
  { value: 'JUCO_D2', label: 'JUCO D2' },
  { value: 'JUCO_D3', label: 'JUCO D3' },
  { value: 'CCCAA', label: 'CCCAA' },
];

const PROGRAM_OPTIONS: ReadonlyArray<{ value: Exclude<Filters['program'], 'all'>; label: string }> = [
  { value: 'mens', label: "Men's" },
  { value: 'womens', label: "Women's" },
  { value: 'both', label: 'Both' },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '0', label: 'Normal' },
  { value: '1', label: 'High' },
  { value: '2', label: 'Hot' },
];

const QUEUE_OPTIONS: ReadonlyArray<{ value: NonNullable<Filters['queueStatus']>; label: string }> = [
  { value: 'queued', label: 'Queued (not emailed)' },
  { value: 'sent', label: 'In sequence (sent)' },
  { value: 'done', label: 'Done' },
];

// Soft selected state per the design system: bg-primary-50 / text-primary-700 /
// ring-primary-200. Reserved kelly-green fills are for ACTION buttons only.
const SOFT_SELECTED = 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200';
const SOFT_IDLE = 'bg-white/60 text-warm-600 ring-1 ring-inset ring-warm-200/60 hover:bg-warm-50 hover:text-warm-700';

/** A compact soft chip used inside the popover facet rows. ≥44px touch target. */
function FacetChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 min-h-[44px] sm:min-h-0 sm:py-2 rounded-full',
        'text-xs font-medium whitespace-nowrap transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        selected ? SOFT_SELECTED : SOFT_IDLE,
      )}
    >
      {children}
    </Button>
  );
}

/** A removable active-filter chip shown in row 1's chip strip. */
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className={cn('inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium', SOFT_SELECTED)}>
      {label}
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        className="h-5 w-5 min-h-0 rounded-full text-primary-500 hover:text-primary-700 hover:bg-primary-100"
      >
        <IconX size={12} />
      </IconButton>
    </span>
  );
}

export function CoachFilters({
  filters,
  setFilters,
  conferences,
  statusConfig,
}: CoachFiltersProps) {
  const [showMore, setShowMore] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Debounce search input — 300ms delay before updating parent filter
  useEffect(() => {
    if (localSearch === filters.search) {
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);
    const timeout = setTimeout(() => {
      setFilters(f => ({ ...f, search: localSearch }));
      setIsDebouncing(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [localSearch, filters.search, setFilters]);

  // Sync local search when parent clears filters
  // Only reset if parent search transitioned from non-empty to empty (explicit clear),
  // not when it's still empty because the debounce hasn't fired yet
  const prevParentSearchRef = useRef(filters.search);
  useEffect(() => {
    const prev = prevParentSearchRef.current;
    prevParentSearchRef.current = filters.search;
    if (prev !== '' && filters.search === '') {
      setLocalSearch('');
    }
  }, [filters.search]);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!showMore) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMore(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showMore]);

  const queueActive = filters.queueStatus !== undefined && filters.queueStatus !== 'all';

  const activeFilterCount = [
    filters.status !== 'all',
    filters.division !== 'all',
    filters.conference !== 'all',
    filters.program !== 'all',
    filters.priority !== 'all',
    filters.followUpDue,
    filters.starred,
    filters.hasNotes,
    filters.noContact30Days,
    filters.primaryOnly,
    queueActive,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setLocalSearch('');
    setFilters({
      status: 'all', division: 'all', conference: 'all', program: 'all', priority: 'all',
      search: '', followUpDue: false, starred: false, hasNotes: false, noContact30Days: false,
      primaryOnly: false, queueStatus: 'all',
    });
  };

  // ---- Active-chip descriptors (label + the reset that removes just that facet) ----
  const priorityLabel = PRIORITY_OPTIONS.find(p => p.value === filters.priority)?.label ?? filters.priority;
  const queueLabel = QUEUE_OPTIONS.find(q => q.value === filters.queueStatus)?.label ?? '';
  const programLabel = PROGRAM_OPTIONS.find(p => p.value === filters.program)?.label ?? '';

  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filters.division !== 'all') activeChips.push({ key: 'division', label: DIVISION_OPTIONS.find(d => d.value === filters.division)?.label ?? filters.division, onRemove: () => setFilters(f => ({ ...f, division: 'all' })) });
  if (filters.program !== 'all') activeChips.push({ key: 'program', label: programLabel, onRemove: () => setFilters(f => ({ ...f, program: 'all' })) });
  if (filters.status !== 'all') activeChips.push({ key: 'status', label: statusConfig[filters.status as CoachStatus]?.label ?? String(filters.status), onRemove: () => setFilters(f => ({ ...f, status: 'all' })) });
  if (filters.conference !== 'all') activeChips.push({ key: 'conference', label: filters.conference, onRemove: () => setFilters(f => ({ ...f, conference: 'all' })) });
  if (filters.priority !== 'all') activeChips.push({ key: 'priority', label: priorityLabel, onRemove: () => setFilters(f => ({ ...f, priority: 'all' })) });
  if (queueActive) activeChips.push({ key: 'queue', label: queueLabel, onRemove: () => setFilters(f => ({ ...f, queueStatus: 'all' })) });
  if (filters.followUpDue) activeChips.push({ key: 'followUpDue', label: 'Follow-ups Due', onRemove: () => setFilters(f => ({ ...f, followUpDue: false })) });
  if (filters.starred) activeChips.push({ key: 'starred', label: 'Starred', onRemove: () => setFilters(f => ({ ...f, starred: false })) });
  if (filters.hasNotes) activeChips.push({ key: 'hasNotes', label: 'Has Notes', onRemove: () => setFilters(f => ({ ...f, hasNotes: false })) });
  if (filters.noContact30Days) activeChips.push({ key: 'noContact30Days', label: 'No Contact 30d', onRemove: () => setFilters(f => ({ ...f, noContact30Days: false })) });
  if (filters.primaryOnly) activeChips.push({ key: 'primaryOnly', label: 'Primary Only', onRemove: () => setFilters(f => ({ ...f, primaryOnly: false })) });

  const selectClass = (active: boolean) => cn(
    'w-full min-h-[44px] rounded-lg text-xs font-medium',
    'bg-cream-50 text-warm-700',
    active ? 'border-primary-300 bg-primary-50/70 text-primary-700' : 'border-warm-200/60',
  );

  const statusOptions = [
    { value: 'all', label: 'Any status' },
    ...(Object.keys(statusConfig) as CoachStatus[]).map(s => ({ value: s, label: statusConfig[s].label })),
  ];
  const conferenceOptions = [
    { value: 'all', label: 'Any conference' },
    ...conferences.map(conf => ({ value: conf, label: conf })),
  ];
  const priorityOptions = [
    { value: 'all', label: 'Any priority' },
    ...PRIORITY_OPTIONS,
  ];
  const queueOptions = [
    { value: 'all', label: 'Any queue status' },
    ...QUEUE_OPTIONS,
  ];

  return (
    <div className="glass-standard rounded-2xl p-4 space-y-3">
      {/* Row 1: Search + single Filters trigger + Save + Clear */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Input
            type="text"
            placeholder="Search coaches, schools, conferences..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            clearable
            onClear={() => { setLocalSearch(''); setFilters(f => ({ ...f, search: '' })); }}
            leftIcon={isDebouncing ? (
              <IconLoader size={16} className="animate-spin" />
            ) : (
              <IconSearch size={16} />
            )}
            className={cn(
              'min-h-[44px] rounded-lg text-sm',
              'bg-cream-50 border border-warm-200/60',
              'text-warm-900 placeholder:text-warm-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400',
              'transition-all duration-200',
            )}
          />
        </div>

        {/* Single Filters (n) trigger — opens the facet popover */}
        <Button
          type="button"
          variant="ghost"
          aria-expanded={showMore}
          aria-haspopup="dialog"
          onClick={() => setShowMore(s => !s)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full text-xs font-medium',
            'transition-colors duration-200 whitespace-nowrap',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
            showMore || activeFilterCount > 0 ? SOFT_SELECTED : SOFT_IDLE,
          )}
        >
          <IconFilter size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-primary-600 text-white text-caption font-bold rounded-full leading-none">
              {activeFilterCount}
            </span>
          )}
          {showMore ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </Button>

        {/* Spacer pushes the action group to the right when present */}
        {activeFilterCount > 0 && <div className="flex-1" />}

        {/* Save as segment — an ACTION, so it earns a kelly-green fill */}
        {activeFilterCount > 0 && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<IconBookmark size={14} />}
            onClick={() => setSaveSegmentOpen(true)}
            className="rounded-full whitespace-nowrap"
            title="Save current filters as a reusable segment"
          >
            Save segment
          </Button>
        )}

        {/* Clear all */}
        {activeFilterCount > 0 && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<IconX size={14} />}
            onClick={clearFilters}
            className="rounded-full whitespace-nowrap"
          >
            Clear {activeFilterCount}
          </Button>
        )}
      </div>

      {/* Active filter chips — each removable. Absent facet = no chip. */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map(chip => (
            <ActiveChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </div>
      )}

      {/* Save segment dialog (rendered as a portal-style overlay) */}
      <SaveSegmentDialog
        open={saveSegmentOpen}
        onOpenChange={setSaveSegmentOpen}
        filters={filters}
      />

      {/* Facet popover — opened by "Filters (n)". Compact labeled controls; soft chips. */}
      {showMore && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Filter coaches"
          className="rounded-xl glass-prominent p-4 space-y-4"
        >
          {/* Division — soft chips, no "All" */}
          <fieldset className="space-y-1.5">
            <legend className="text-caption font-semibold uppercase tracking-wide text-warm-500">Division</legend>
            <div className="flex flex-wrap gap-1.5">
              {DIVISION_OPTIONS.map(opt => {
                const selected = filters.division === opt.value;
                return (
                  <FacetChip
                    key={opt.value}
                    selected={selected}
                    onClick={() => setFilters(f => ({ ...f, division: selected ? 'all' : opt.value }))}
                  >
                    {opt.label}
                  </FacetChip>
                );
              })}
            </div>
          </fieldset>

          {/* Program — soft chips, no "All" */}
          <fieldset className="space-y-1.5">
            <legend className="text-caption font-semibold uppercase tracking-wide text-warm-500">Program</legend>
            <div className="flex flex-wrap gap-1.5">
              {PROGRAM_OPTIONS.map(opt => {
                const selected = filters.program === opt.value;
                return (
                  <FacetChip
                    key={opt.value}
                    selected={selected}
                    onClick={() => setFilters(f => ({ ...f, program: selected ? 'all' : opt.value }))}
                  >
                    {opt.label}
                  </FacetChip>
                );
              })}
            </div>
          </fieldset>

          {/* Compact labeled dropdowns: Status / Conference / Priority / Queue */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <span className="block text-caption font-semibold uppercase tracking-wide text-warm-500">Status</span>
              <Select
                options={statusOptions}
                value={filters.status}
                onChange={(value) => setFilters(f => ({ ...f, status: value as Filters['status'] }))}
                className={selectClass(filters.status !== 'all')}
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-caption font-semibold uppercase tracking-wide text-warm-500">Conference</span>
              <Select
                options={conferenceOptions}
                value={filters.conference}
                onChange={(value) => setFilters(f => ({ ...f, conference: value }))}
                className={selectClass(filters.conference !== 'all')}
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-caption font-semibold uppercase tracking-wide text-warm-500">Priority</span>
              <Select
                options={priorityOptions}
                value={filters.priority}
                onChange={(value) => setFilters(f => ({ ...f, priority: value }))}
                className={selectClass(filters.priority !== 'all')}
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-caption font-semibold uppercase tracking-wide text-warm-500">Queue status</span>
              <Select
                options={queueOptions}
                value={filters.queueStatus ?? 'all'}
                onChange={(value) => setFilters(f => ({ ...f, queueStatus: value as Filters['queueStatus'] }))}
                className={selectClass(queueActive)}
              />
            </div>
          </div>

          {/* Boolean toggles — soft chips with leading icons */}
          <fieldset className="space-y-1.5">
            <legend className="text-caption font-semibold uppercase tracking-wide text-warm-500">Quick filters</legend>
            <div className="flex flex-wrap gap-1.5">
              <FacetChip selected={filters.followUpDue} onClick={() => setFilters(f => ({ ...f, followUpDue: !f.followUpDue }))}>
                <IconClock size={12} /> Follow-ups Due
              </FacetChip>
              <FacetChip selected={filters.starred} onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}>
                <IconStar size={12} /> Starred
              </FacetChip>
              <FacetChip selected={filters.hasNotes} onClick={() => setFilters(f => ({ ...f, hasNotes: !f.hasNotes }))}>
                <IconFileText size={12} /> Has Notes
              </FacetChip>
              <FacetChip selected={filters.noContact30Days} onClick={() => setFilters(f => ({ ...f, noContact30Days: !f.noContact30Days }))}>
                <IconAlertCircle size={12} /> No Contact 30 Days
              </FacetChip>
              <FacetChip selected={Boolean(filters.primaryOnly)} onClick={() => setFilters(f => ({ ...f, primaryOnly: !f.primaryOnly }))}>
                <IconUser size={12} /> Primary Contacts Only
              </FacetChip>
            </div>
          </fieldset>

          {/* Popover footer actions */}
          <div className="flex items-center justify-between pt-1 border-t border-warm-100/60">
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-warm-600">
                Clear all
              </Button>
            ) : (
              <span className="text-xs text-warm-400">No filters applied</span>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowMore(false)} className="rounded-full">
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
