'use client';

/**
 * ============================================================================
 * Fairway · Calendar · CalendarPeoplePicker — a searchable, deliberate roster
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.3 (S3). Replaces "toggle an avatar in place" with a
 * real listbox: search, select-shown/clear, and (in `mode="compare"`) a
 * client-only Required/Optional flag per selected row — client-only because
 * `golf_event_attendance` has no such column yet (gate G3), so it never
 * leaves this component's state.
 *
 * One escalation, two shells: `PopoverPanel` anchored to `trigger` at
 * ≥1024px, a full-height `ModalShell` under that — the same responsive split
 * `Sheet` uses via `mobileSide`, done by hand here because a `PopoverPanel`
 * and a `ModalShell` are different primitives, not two sides of one Sheet.
 * Both wrap the exact same body, so behavior never forks by viewport, only
 * chrome does.
 *
 * Cancel — Escape, scrim click, or the Cancel button — never applies a
 * partial edit: `usePeopleSelection` only commits to local state, and
 * `onApply` only fires from the Done button. The next open re-seeds from
 * whatever the caller's `selectedIds` still is.
 * ========================================================================== */

import * as React from 'react';
import { Check, Search, Users as UsersIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { Button, Input, EmptyState, Avatar, Segmented, Skeleton } from '@/components/fairway';
import { fwHaptic } from '@/lib/fairway/haptics';
import { usePeopleSelection, type PeoplePickerPerson } from './usePeopleSelection';
import surfaces from '../CalendarSurfaces.module.css';

export type { PeoplePickerPerson } from './usePeopleSelection';

export interface CalendarPeoplePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opens the picker — required so the desktop popover has
   * something to anchor to; also rendered (uncontrolled-trigger style) for
   * the mobile `ModalShell`, so callers render exactly one visible button. */
  trigger: React.ReactNode;
  people: PeoplePickerPerson[];
  selectedIds: string[];
  /** `invite`: editor attendee grid. `compare`: rail schedule comparison —
   * the only mode that shows the per-row Required/Optional toggle. */
  mode?: 'invite' | 'compare';
  requiredIds?: string[];
  title: string;
  /** Footer confirm label — "Apply attendees" from the editor, "Compare
   * selected" from the rail. */
  doneLabel: string;
  onApply: (selectedIds: string[], meta: { requiredIds: string[] }) => void;
  /** Roster still hydrating — renders a fixed-height skeleton, matching the
   * geometry of a populated list so nothing reflows once it arrives. */
  loading?: boolean;
  /** Shown when `people` is empty and not loading. */
  emptyMessage?: string;
  className?: string;
}

const ROW_HEIGHT_CLASS = 'min-h-11';

function PickerBody({
  people,
  selectedIds,
  requiredIds,
  mode,
  doneLabel,
  loading,
  emptyMessage,
  onApply,
  onCancel,
  resetKey,
}: {
  people: PeoplePickerPerson[];
  selectedIds: string[];
  requiredIds: string[];
  mode: 'invite' | 'compare';
  doneLabel: string;
  loading: boolean;
  emptyMessage: string;
  onApply: (ids: string[], meta: { requiredIds: string[] }) => void;
  onCancel: () => void;
  resetKey: boolean;
}) {
  const selection = usePeopleSelection({
    people,
    initialSelectedIds: selectedIds,
    initialRequiredIds: requiredIds,
    resetKey,
  });
  const listRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [announceCount, setAnnounceCount] = React.useState(selection.filtered.length);

  React.useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, selection.filtered.length - 1)));
  }, [selection.filtered.length]);

  // Throttled live-region update (§2.3 accessibility: "announced via a
  // throttled live region"), not one announcement per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setAnnounceCount(selection.filtered.length), 350);
    return () => clearTimeout(timer);
  }, [selection.filtered.length]);

  const focusRow = (index: number) => {
    const person = selection.filtered[index];
    if (!person) return;
    setActiveIndex(index);
    rowRefs.current.get(person.id)?.focus();
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (selection.filtered.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow((activeIndex + 1) % selection.filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow((activeIndex - 1 + selection.filtered.length) % selection.filtered.length);
    } else if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      const person = selection.filtered[activeIndex];
      if (person) {
        selection.toggle(person.id);
        fwHaptic('selection');
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onApply(selection.selectedIds, { requiredIds: selection.requiredIds });
    }
  };

  const toggleRow = (id: string) => {
    selection.toggle(id);
    fwHaptic('selection');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('sticky top-0 z-10 shrink-0 border-b px-4 py-3 sm:px-5', surfaces.chrome)}>
        <Input
          type="search"
          aria-label="Search people"
          placeholder="Search people"
          value={selection.query}
          onChange={(event) => selection.setQuery(event.target.value)}
          leading={<Search className="h-4 w-4" aria-hidden />}
          className="rounded-full bg-surface-sunken"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="font-fw-mono text-caption font-semibold tabular-nums text-text-secondary">
            {selection.selectedIds.length} selected
          </span>
          {selection.filtered.length > 0 ? (
            <Button
              variant="ghost"
              className="h-auto min-h-0 w-auto p-0 font-fw-sans text-caption font-medium text-accent-700 hover:bg-transparent"
              onClick={selection.allShownSelected ? selection.clearShown : selection.selectShown}
            >
              {selection.allShownSelected ? 'Clear shown' : 'Select shown'}
            </Button>
          ) : null}
        </div>
        <div aria-live="polite" className="sr-only">{announceCount} people match</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {loading ? (
          <div role="status" aria-label="Loading roster" className="space-y-1.5 p-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 rounded-fw-md" />
            ))}
          </div>
        ) : people.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" aria-hidden />}
            title="No one to show"
            description={emptyMessage}
          />
        ) : selection.filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="font-fw-sans text-body-sm text-text-secondary">No one matches “{selection.query}”.</p>
            <Button variant="ghost" onClick={() => selection.setQuery('')}>Clear search</Button>
          </div>
        ) : (
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-multiselectable="true"
            aria-label="People"
            onKeyDown={handleListKeyDown}
            className="space-y-0.5"
          >
            {selection.filtered.map((person, index) => {
              const selected = selection.isSelected(person.id);
              return (
                <div key={person.id} className={cn('rounded-fw-md', selected && 'bg-accent-50/60 ring-1 ring-accent-600/40')}>
                  <Button
                    type="button"
                    variant="ghost"
                    role="option"
                    aria-selected={selected}
                    tabIndex={index === activeIndex ? 0 : -1}
                    ref={(el) => { if (el) rowRefs.current.set(person.id, el); else rowRefs.current.delete(person.id); }}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => toggleRow(person.id)}
                    className={cn(
                      'flex h-auto w-full items-center justify-start gap-3 rounded-fw-md px-2 py-1.5 text-left font-normal',
                      ROW_HEIGHT_CLASS,
                      surfaces.press,
                      'hover:bg-surface-sunken',
                    )}
                  >
                    <Avatar src={person.avatarUrl ?? undefined} name={person.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
                        {person.name}{person.isViewer ? ' (You)' : ''}
                      </span>
                      {person.role ? (
                        <span className="block truncate font-fw-sans text-caption text-text-tertiary">{person.role}</span>
                      ) : null}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                        selected ? cn('border-transparent', surfaces.check) : 'border-border-strong text-transparent',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </Button>
                  {mode === 'compare' && selected ? (
                    <div className="flex items-center justify-end px-2 pb-2">
                      <Segmented
                        size="sm"
                        aria-label={`${person.name} priority`}
                        value={selection.isRequired(person.id) ? 'required' : 'optional'}
                        onValueChange={(value) => selection.setRequired(person.id, value === 'required')}
                        options={[
                          { value: 'optional', label: 'Optional' },
                          { value: 'required', label: 'Required' },
                        ]}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={cn('flex shrink-0 items-center justify-end gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5', surfaces.dock)}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button className={surfaces.glow} onClick={() => onApply(selection.selectedIds, { requiredIds: selection.requiredIds })}>{doneLabel}</Button>
      </div>
    </div>
  );
}

export function CalendarPeoplePicker({
  open,
  onOpenChange,
  trigger,
  people,
  selectedIds,
  mode = 'invite',
  requiredIds = [],
  title,
  doneLabel,
  onApply,
  loading = false,
  emptyMessage = 'No one is on this roster yet.',
  className,
}: CalendarPeoplePickerProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const handleApply = React.useCallback((ids: string[], meta: { requiredIds: string[] }) => {
    onApply(ids, meta);
    onOpenChange(false);
  }, [onApply, onOpenChange]);

  const handleCancel = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  const body = (
    <PickerBody
      people={people}
      selectedIds={selectedIds}
      requiredIds={requiredIds}
      mode={mode}
      doneLabel={doneLabel}
      loading={loading}
      emptyMessage={emptyMessage}
      onApply={handleApply}
      onCancel={handleCancel}
      resetKey={open}
    />
  );

  if (isDesktop) {
    return (
      <PopoverPanel
        open={open}
        onOpenChange={onOpenChange}
        trigger={trigger}
        surface="matte"
        align="start"
        width="lg"
        ariaLabel={title}
        className={cn('flex h-[480px] w-80 flex-col p-0', className)}
      >
        {body}
      </PopoverPanel>
    );
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={title}
      size="lg"
      className={cn('flex h-[min(88dvh,720px)] flex-col', surfaces.scope, surfaces.panel, className)}
    >
      {body}
    </ModalShell>
  );
}
