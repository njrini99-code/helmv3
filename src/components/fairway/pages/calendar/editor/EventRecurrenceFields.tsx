'use client';

/**
 * Recurrence pattern block — extraction of the "Repeat"/"Series pattern"
 * `FormSection` that used to live inline in `FairwayEventEditor.tsx`
 * (SCREEN-BUILD-PLAN.md §2.1's `editor/` module list).
 *
 * Byte-for-byte move of the JSX and copy: the pill row, weekday chips, the
 * `Segmented` end-mode control, and every string are unchanged from the
 * version `__tests__/FairwayEventEditor.test.tsx` and
 * `FairwayEventEditor.scope.test.tsx` already pin.
 */

import * as React from 'react';
import { Repeat } from 'lucide-react';
import { Button as UiButton } from '@/components/ui/button';
import { Input as UiInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FormSection } from '@/components/fairway/forms/FormSection';
import { sectionCardCls, sectionTitle } from './sectionChrome';
import { Segmented } from '@/components/fairway/controls/segmented';
import { DateChooser } from '@/components/fairway/pages/calendar/EventWhenFields';
import type { GolfEventFormData, RecurrenceFrequency } from '@/components/golf/calendar/EventDetailModal';
import {
  WEEKDAY_OPTIONS,
  MIN_RECURRENCE_COUNT,
  MAX_RECURRENCE_COUNT,
  type RecurrenceEndMode,
} from '@/components/golf/calendar/event-form-helpers';
import { fieldCls, labelCls } from './fieldStyles';

const RECURRENCE_OPTIONS: ReadonlyArray<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

export interface EventRecurrenceFieldsProps {
  formData: GolfEventFormData;
  onChange: React.Dispatch<React.SetStateAction<GolfEventFormData>>;
  disabled: boolean;
  isSeriesRoot: boolean;
  recurrencePreview: string | null;
}

export function EventRecurrenceFields({
  formData,
  onChange,
  disabled,
  isSeriesRoot,
  recurrencePreview,
}: EventRecurrenceFieldsProps) {
  const toggleRecurrenceWeekday = (day: number) => {
    onChange((prev) => {
      const current = prev.recurrenceWeekdays ?? [];
      return {
        ...prev,
        recurrenceWeekdays: current.includes(day)
          ? current.filter((d) => d !== day)
          : [...current, day].sort((a, b) => a - b),
      };
    });
  };

  return (
    <FormSection
      title={sectionTitle(Repeat, isSeriesRoot ? 'Series pattern' : 'Repeat')}
      className={sectionCardCls}
    >
      {/* Visible chips, not a dropdown. The whole pattern is legible
          at a glance and it matches the two pill rows this modal
          already uses (event type above, weekdays below) — a coach
          shouldn't have to open a menu to see how a practice
          repeats. Wraps on mobile, where a 5-up segmented track
          would not fit.
          A series root can't be flipped back to a one-off here —
          that's a delete-with-scope, not a pattern change. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Recurrence">
        {RECURRENCE_OPTIONS.filter((o) => !isSeriesRoot || o.value !== 'none').map((o) => {
          const active = formData.recurrence === o.value;
          return (
            <UiButton
              key={o.value}
              variant="ghost"
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, recurrence: o.value }))}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1.5 font-fw-sans text-caption font-medium transition-colors',
                'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                active
                  ? 'bg-accent-650 text-text-on-accent shadow-flat'
                  : 'border border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint',
              )}
            >
              {o.label}
            </UiButton>
          );
        })}
      </div>

      {(formData.recurrence === 'weekly' || formData.recurrence === 'biweekly') && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5" role="group" aria-label="Repeat on days">
            {WEEKDAY_OPTIONS.map((day) => {
              const selected = (formData.recurrenceWeekdays ?? []).includes(day.value);
              return (
                <UiButton
                  key={day.value}
                  variant="ghost"
                  type="button"
                  onClick={() => toggleRecurrenceWeekday(day.value)}
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={day.long}
                  className={cn(
                    'relative grid h-8 w-8 place-items-center rounded-full font-fw-sans text-caption font-medium transition-colors disabled:opacity-50',
                    // Invisible hit-slop expands the 32px visual chip to the
                    // 44px WCAG 2.2 AA touch-target floor without growing seven
                    // circles past the modal's mobile content width — same
                    // technique as ModalShell's close button (CLOSE_BUTTON_CLASS).
                    "before:absolute before:-inset-1.5 before:content-['']",
                    'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                    selected
                      ? 'bg-accent-650 text-text-on-accent shadow-flat'
                      : 'border border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint',
                  )}
                >
                  {day.short}
                </UiButton>
              );
            })}
          </div>
          {(formData.recurrenceWeekdays ?? []).length === 0 ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              No days picked — repeats on the start date&apos;s weekday.
            </p>
          ) : null}
        </div>
      )}

      {formData.recurrence !== 'none' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Two mutually exclusive modes — a segmented track shows
              both at once where a dropdown hid one behind a click. */}
          <div>
            <span className={labelCls}>Series ends</span>
            {/* Segmented takes no `disabled` — gate the wrapper so a
                cancelled event's pattern still reads clearly. */}
            <div className={cn(disabled && 'pointer-events-none opacity-50')}>
              <Segmented
                value={formData.recurrenceEndMode ?? 'count'}
                onValueChange={(v) =>
                  onChange((prev) => ({ ...prev, recurrenceEndMode: v as RecurrenceEndMode }))
                }
                size="sm"
                fullWidth
                aria-label="Series ends"
                options={[
                  { value: 'count', label: 'After N events' },
                  { value: 'until', label: 'On a date' },
                ]}
              />
            </div>
          </div>
          {(formData.recurrenceEndMode ?? 'count') === 'count' ? (
            <div>
              <label htmlFor="ev-recurrence-count" className={labelCls}>Occurrences</label>
              <UiInput
                id="ev-recurrence-count"
                type="number"
                min={MIN_RECURRENCE_COUNT}
                max={MAX_RECURRENCE_COUNT}
                inputMode="numeric"
                value={formData.recurrenceCount}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    recurrenceCount: Math.max(
                      MIN_RECURRENCE_COUNT,
                      Math.min(MAX_RECURRENCE_COUNT, parseInt(e.target.value, 10) || 10),
                    ),
                  }))
                }
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                disabled={disabled}
                className={cn(fieldCls, 'bg-surface')}
              />
            </div>
          ) : (
            <DateChooser
              label="Repeat until"
              value={formData.recurrenceUntil ?? null}
              onChange={(iso) => onChange((prev) => ({ ...prev, recurrenceUntil: iso }))}
              disabled={disabled}
              placeholder="Pick an end date"
            />
          )}
        </div>
      )}

      {recurrencePreview ? (
        <p className="font-fw-sans text-caption text-text-tertiary">{recurrencePreview}</p>
      ) : null}

      {isSeriesRoot ? (
        <p className="font-fw-sans text-caption text-text-tertiary">
          Raising the count or pushing the end date later extends this series with new occurrences.
        </p>
      ) : null}
    </FormSection>
  );
}
