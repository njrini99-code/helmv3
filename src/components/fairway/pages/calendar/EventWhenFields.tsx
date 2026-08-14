'use client';

/**
 * ============================================================================
 * Fairway · Calendar · "When" controls for the event editor
 * ----------------------------------------------------------------------------
 * An event is a SPAN OF TIME. The editor used to make a coach assemble that
 * span out of four disconnected controls — two native <input type="date"> and
 * two native <input type="time"> — and then never showed the span itself. The
 * OS widgets also arrived unstyled inside a fully tokenized modal, which is the
 * single loudest "unfinished" signal on the screen.
 *
 * These are Fairway controls built on primitives that already existed and were
 * simply never adopted here: PopoverPanel, CalendarSurface, Segmented,
 * SelectablePill.
 *
 * THE ONE IDEA: the end-time list is duration-aware. Every option is labelled
 * with its length from the chosen start — "10:30 AM · 1 hr 30" — so picking an
 * end IS picking a duration. That is how Cron, Notion Calendar and Fantastical
 * all behave, and it is the visible half of the start/end relationship the
 * editor now enforces in code (moving the start carries the end with it).
 * It encodes the content rather than decorating it.
 * ========================================================================== */

import * as React from 'react';
import { Clock, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button as UiButton } from '@/components/ui/button';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { DatePicker } from '@/components/fairway/calendar/date-picker';

/** Minutes between offered times. 15 is the granularity every calendar app
 *  converged on: fine enough for a 45-minute lift, coarse enough to scan. */
const STEP_MIN = 15;

export function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function fromMinutes(total: number): string {
  const w = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
}

/** 24h "HH:MM" -> "9:05 AM". */
export function formatClock(hhmm: string | null): string {
  const mins = toMinutes(hhmm);
  if (mins === null) return '--:--';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** 150 -> "2 hr 30". Compact on purpose: this sits inside a list row. */
export function formatDuration(mins: number): string {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m}`;
}

/** "2026-08-14" -> "Fri, Aug 14". Split rather than `new Date()` — a plain
 *  calendar date parsed as a Date resolves midnight UTC and renders as the
 *  previous day for anyone west of Greenwich. */
export function formatDateLabel(iso: string | null): string {
  if (!iso) return 'Pick a date';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const triggerCls =
  'inline-flex w-full items-center justify-between gap-2 rounded-fw-md border border-border-subtle ' +
  'bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-primary transition-colors ' +
  'hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

// ---------------------------------------------------------------------------

export function DateChooser({
  value,
  onChange,
  label,
  disabled,
  placeholder = 'Pick a date',
  labelIcon,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  label: string;
  disabled?: boolean;
  placeholder?: string;
  labelIcon?: React.ReactNode;
}) {
  const selected = React.useMemo(() => {
    if (!value) return undefined;
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : undefined;
  }, [value]);

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 font-fw-sans text-caption font-medium text-text-secondary">
        {labelIcon}
        {label}
      </span>
      {/* Fairway's own anchored date field — it already owns the glass popover,
          focus trap, scroll-lock, Escape and ARIA wiring. Hand-rolling a second
          one nested a card inside the popover's card and left a dead gutter. */}
      <DatePicker
        mode="single"
        value={selected}
        onValueChange={(d) => {
          if (!d) {
            onChange(null);
            return;
          }
          // Built from LOCAL parts: toISOString() here shifts the day for
          // anyone behind UTC.
          onChange(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          );
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        renderLabel={(v) => (v ? formatDateLabel(value) : placeholder)}
        className={triggerCls}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TimeChooser({
  value,
  onChange,
  label,
  disabled,
  /** When set, each option is labelled with its duration from this start —
   *  the end chooser's whole reason for existing. */
  durationFrom,
  labelIcon,
}: {
  value: string | null;
  onChange: (hhmm: string | null) => void;
  label: string;
  disabled?: boolean;
  durationFrom?: string | null;
  labelIcon?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const startMin = toMinutes(durationFrom ?? null);

  const options = React.useMemo(() => {
    const out: Array<{ value: string; clock: string; duration: string }> = [];
    for (let m = 0; m < 1440; m += STEP_MIN) {
      const hhmm = fromMinutes(m);
      out.push({
        value: hhmm,
        clock: formatClock(hhmm),
        // Forward-going duration, so an end past midnight reads as a real
        // length rather than a negative one.
        duration: startMin === null ? '' : formatDuration((m - startMin + 1440) % 1440),
      });
    }
    return out;
  }, [startMin]);

  // Scroll the current value into view when the list opens — a 96-row list that
  // always starts at midnight is a list you have to fight.
  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 font-fw-sans text-caption font-medium text-text-secondary">
        {labelIcon}
        {label}
      </span>
      <PopoverPanel
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        align="start"
        trigger={
          <UiButton variant="ghost" type="button" className={triggerCls} disabled={disabled} aria-label={label}>
            <span className="flex min-w-0 items-center gap-2">
              <Clock size={15} className="shrink-0 text-text-tertiary" aria-hidden />
              <span className={cn('truncate', !value && 'text-text-tertiary')}>
                {value ? formatClock(value) : 'Pick a time'}
              </span>
            </span>
            <ChevronDown size={15} className="shrink-0 text-text-tertiary" aria-hidden />
          </UiButton>
        }
      >
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="max-h-[17rem] w-[13rem] overflow-y-auto p-1"
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <UiButton
                key={o.value}
                variant="ghost"
                type="button"
                role="option"
                aria-selected={isSelected}
                data-selected={isSelected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex h-auto w-full items-baseline justify-between gap-3 rounded-fw-sm px-2.5 py-1.5 text-left font-fw-sans text-body-sm transition-colors',
                  isSelected
                    ? 'bg-accent-500/12 font-medium text-text-primary'
                    : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                )}
              >
                <span>{o.clock}</span>
                {o.duration ? (
                  <span className="font-fw-mono text-caption text-text-tertiary">{o.duration}</span>
                ) : null}
              </UiButton>
            );
          })}
        </div>
      </PopoverPanel>
    </div>
  );
}

/**
 * The span, stated once in plain language: "Fri, Aug 14 · 9:00 AM → 11:00 AM ·
 * 2 hr". The editor previously never showed the thing being created, only the
 * fields it was assembled from.
 */
export function SpanSummary({
  startDate,
  endDate,
  startTime,
  endTime,
  allDay,
  timezoneLabel,
}: {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  timezoneLabel?: string | null | undefined;
}) {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  const duration = s !== null && e !== null ? formatDuration((e - s + 1440) % 1440) : '';

  return (
    <p className="font-fw-sans text-caption text-text-secondary">
      <span className="text-text-primary">{formatDateLabel(startDate)}</span>
      {endDate && endDate !== startDate ? (
        <>
          {' → '}
          <span className="text-text-primary">{formatDateLabel(endDate)}</span>
        </>
      ) : null}
      {allDay ? (
        <> · All day</>
      ) : startTime ? (
        <>
          {' · '}
          {formatClock(startTime)}
          {endTime ? ` → ${formatClock(endTime)}` : ''}
          {duration ? <span className="text-text-tertiary"> · {duration}</span> : null}
        </>
      ) : null}
      {timezoneLabel ? <span className="text-text-tertiary"> · {timezoneLabel}</span> : null}
    </p>
  );
}
