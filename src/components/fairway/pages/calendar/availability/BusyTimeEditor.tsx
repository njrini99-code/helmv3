'use client';

/**
 * ============================================================================
 * Fairway · Calendar · BusyTimeEditor — S7 "My availability" add/edit form
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.7. Title, all-day, start/end via the SAME
 * `DateChooser`/`TimeChooser`/`SpanSummary` the event editor uses
 * (`EventWhenFields.tsx`, read-only import — not duplicated), weekly repeat
 * with weekday chips and an end rule, an optional private note, the
 * visibility line the coach-only backend actually supports, and one explicit
 * Save.
 *
 * Recurrence is serialized/parsed through `@/lib/golf/recurrence` (the SAME
 * pure RRULE-subset module `golf_events.recurrence_rule` uses) rather than a
 * bespoke format — `golf_coach_blocked_time.recurrence_rule` is documented as
 * "authoritative" in the plan and this keeps it in the one vocabulary the
 * rest of the calendar already reads.
 *
 * A recurring block is modeled as a single-day pattern (the row's own
 * start_date/end_date stay equal; the weekly weekdays carry the repetition) —
 * turning Repeat on collapses any multi-day end date back onto the start
 * date, because a differing end_date on a weekly-recurring row has no defined
 * meaning in `getUserBusyPeriodsWithStatus`'s expansion.
 * ========================================================================== */

import * as React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input, TextArea, Switch, Segmented, SelectablePill, InlineNotice } from '@/components/fairway';
import { DateChooser, TimeChooser, SpanSummary, toMinutes } from '../EventWhenFields';
import { parseRecurrenceRule, serializeRecurrenceRule, describeRecurrenceRule, type RecurrenceRule } from '@/lib/golf/recurrence';
import type { BlockedTimeInput, CoachBlockedTimeRow } from './useBlockedTime';
import styles from '../CalendarSurfaces.module.css';

const WEEKDAYS: ReadonlyArray<{ value: number; short: string; label: string }> = [
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
  { value: 0, short: 'S', label: 'Sunday' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface BusyTimeEditorProps {
  /** `null` creates a new block; otherwise the block being edited. */
  initial: CoachBlockedTimeRow | null;
  saving: boolean;
  deleting?: boolean;
  /** Save/delete failure from the caller — the plan's "failure with
   *  preserved input": this component never clears its own fields on error. */
  submitError: string | null;
  /** True while offline — Save/Delete disabled, fields stay editable so
   *  nothing already typed is lost. */
  disabled?: boolean;
  onSave: (data: BlockedTimeInput) => void;
  onCancel: () => void;
  /** Omit to hide Delete (there is nothing to delete while creating). */
  onDelete?: () => void;
  className?: string;
}

export function BusyTimeEditor({
  initial,
  saving,
  deleting,
  submitError,
  disabled,
  onSave,
  onCancel,
  onDelete,
  className,
}: BusyTimeEditorProps) {
  const initialRule = React.useMemo(() => parseRecurrenceRule(initial?.recurrence_rule ?? null), [initial]);
  const initialStart = initial?.start_date ?? todayIso();

  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [allDay, setAllDay] = React.useState(Boolean(initial?.all_day));
  const [startDate, setStartDate] = React.useState<string | null>(initialStart);
  const [endDate, setEndDate] = React.useState<string | null>(initial?.end_date ?? initialStart);
  const [startTime, setStartTime] = React.useState<string | null>(initial?.start_time ?? '09:00');
  const [endTime, setEndTime] = React.useState<string | null>(initial?.end_time ?? '10:00');
  const [repeatOn, setRepeatOn] = React.useState(Boolean(initialRule));
  const [weekdays, setWeekdays] = React.useState<number[]>(() => {
    if (initialRule?.weekdays?.length) return initialRule.weekdays;
    const parsed = new Date(`${initialStart}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? [1] : [parsed.getDay()];
  });
  const [repeatEnd, setRepeatEnd] = React.useState<'never' | 'on'>(initialRule?.until ? 'on' : 'never');
  const [repeatUntil, setRepeatUntil] = React.useState<string | null>(initialRule?.until ?? null);
  const [note, setNote] = React.useState(initial?.description ?? '');
  const [formError, setFormError] = React.useState<string | null>(null);
  const errorRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // Guarded call (not just optional-chained on the ref): jsdom's Element
    // has no `scrollIntoView` implementation at all, so `?.()` alone still
    // throws "is not a function" under the component test suite.
    if (formError && typeof errorRef.current?.scrollIntoView === 'function') {
      errorRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [formError]);

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  function handleRepeatToggle(next: boolean) {
    setRepeatOn(next);
    if (next) setEndDate(startDate);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setFormError('Add a title for this busy time.'); return; }
    if (!startDate) { setFormError('Pick a start date.'); return; }
    if (!allDay && (!startTime || !endTime)) { setFormError('Pick a start and end time, or mark this all day.'); return; }
    const sameDay = repeatOn || !endDate || endDate === startDate;
    if (!allDay && sameDay && startTime && endTime) {
      const startMin = toMinutes(startTime);
      const endMin = toMinutes(endTime);
      if (startMin !== null && endMin !== null && endMin <= startMin) {
        setFormError('End must be after start.');
        return;
      }
    }
    if (!repeatOn && endDate && endDate < startDate) { setFormError('End date is before the start date.'); return; }
    if (repeatOn && weekdays.length === 0) { setFormError('Pick at least one day to repeat.'); return; }
    if (repeatOn && repeatEnd === 'on' && !repeatUntil) { setFormError('Pick an end date for the repeat, or choose Never.'); return; }

    setFormError(null);

    const recurrenceRule = repeatOn
      ? serializeRecurrenceRule({
          frequency: 'weekly',
          weekdays,
          until: repeatEnd === 'on' ? repeatUntil ?? undefined : undefined,
        } satisfies RecurrenceRule)
      : '';

    onSave({
      title: trimmedTitle,
      startDate,
      endDate: repeatOn ? startDate : endDate ?? startDate,
      startTime: allDay ? undefined : startTime ?? undefined,
      endTime: allDay ? undefined : endTime ?? undefined,
      allDay,
      recurrenceRule,
      description: note.trim(),
    });
  }

  const busy = saving || Boolean(deleting);
  const repeatSummary = repeatOn
    ? describeRecurrenceRule({ frequency: 'weekly', weekdays, until: repeatEnd === 'on' ? repeatUntil ?? undefined : undefined })
    : null;

  return (
    <form onSubmit={handleSubmit} className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
        {formError ? (
          <div ref={errorRef} role="alert" className="rounded-fw-md border border-fw-danger/30 bg-fw-danger-bg px-3 py-2.5 font-fw-sans text-body-sm font-medium text-fw-danger-ink">
            {formError}
          </div>
        ) : null}
        {submitError ? <InlineNotice tone="danger" title="Couldn&rsquo;t save">{submitError}</InlineNotice> : null}
        {disabled ? <InlineNotice tone="warning" title="You&rsquo;re offline">Reconnect to save changes. Nothing you&rsquo;ve typed is lost.</InlineNotice> : null}

        <div>
          <span className="mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary">Title</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Class, appointment, travel"
            maxLength={200}
            disabled={disabled}
            aria-label="Busy time title"
          />
        </div>

        <Switch checked={allDay} onCheckedChange={setAllDay} label="All day" aria-label="All day" disabled={disabled} />

        <div className="grid grid-cols-2 gap-3">
          <DateChooser label="Start date" value={startDate} onChange={setStartDate} disabled={disabled} />
          {repeatOn ? (
            <div className="flex items-end pb-2.5">
              <p className="font-fw-sans text-caption text-text-tertiary">Repeats weekly — set below</p>
            </div>
          ) : (
            <DateChooser label="End date" value={endDate} onChange={setEndDate} disabled={disabled} />
          )}
        </div>

        {!allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <TimeChooser label="Start time" value={startTime} onChange={setStartTime} disabled={disabled} />
            <TimeChooser label="End time" value={endTime} onChange={setEndTime} disabled={disabled} durationFrom={startTime} />
          </div>
        ) : null}

        <SpanSummary
          startDate={startDate}
          endDate={repeatOn ? startDate : endDate}
          startTime={allDay ? null : startTime}
          endTime={allDay ? null : endTime}
          allDay={allDay}
        />

        <div className={cn('space-y-3 rounded-card p-4', styles.paper)}>
          <Switch checked={repeatOn} onCheckedChange={handleRepeatToggle} label="Repeat weekly" aria-label="Repeat weekly" disabled={disabled} />
          {repeatOn ? (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repeat on these days">
                {WEEKDAYS.map((day) => {
                  const isOn = weekdays.includes(day.value);
                  return (
                    <SelectablePill
                      key={day.value}
                      type="button"
                      active={isOn}
                      aria-pressed={isOn}
                      aria-label={day.label}
                      className="h-11 w-11 shrink-0"
                      disabled={disabled}
                      onClick={() => toggleWeekday(day.value)}
                    >
                      {day.short}
                    </SelectablePill>
                  );
                })}
              </div>
              <div>
                <span className="mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary">Ends</span>
                <Segmented<'never' | 'on'>
                  aria-label="Repeat ends"
                  size="sm"
                  options={[
                    { value: 'never', label: 'Never' },
                    { value: 'on', label: 'On a date' },
                  ]}
                  value={repeatEnd}
                  onValueChange={setRepeatEnd}
                />
              </div>
              {repeatEnd === 'on' ? (
                <DateChooser label="Repeat end date" value={repeatUntil} onChange={setRepeatUntil} disabled={disabled} />
              ) : null}
              {repeatSummary ? <p className="font-fw-sans text-caption text-text-tertiary">{repeatSummary}</p> : null}
            </>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary">Private note (optional)</span>
          <TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Visible only to you"
            maxLength={1000}
            disabled={disabled}
            rows={3}
            aria-label="Private note"
          />
        </div>

        <InlineNotice tone="info" icon={Lock} title="Visibility">
          Shown to your team as Busy only.
        </InlineNotice>
      </div>

      <div className={cn('flex shrink-0 items-center justify-between gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6', styles.dock)}>
        {initial && onDelete ? (
          <Button type="button" variant="ghost" size="sm" busy={deleting} disabled={disabled || saving} onClick={onDelete} className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink">
            Delete
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" busy={saving} disabled={disabled || deleting} className={styles.glow}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
