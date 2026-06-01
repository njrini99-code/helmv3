'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayAvailabilityList — coach availability (list)
 * ----------------------------------------------------------------------------
 * The non-month rendering for the coach availability overlay: the selected
 * players' busy periods (team events + classes + blocked) grouped by day and
 * color-coded per player, so the coach can read each player's schedule and spot
 * common free time. Presentation-only; the data comes from getPlayerAvailability
 * via the parent. Colors are the legacy PLAYER_COLORS (inline-styled hex).
 * ========================================================================== */

import * as React from 'react';
import { format, isSameDay, addDays } from 'date-fns';

import type { ScheduleOverlay } from './FairwayMonthGrid';

export interface FairwayAvailabilityListProps {
  overlays: ScheduleOverlay[];
  rangeStart: Date;
  rangeEnd: Date;
  nowRef?: Date;
}

const KIND_LABEL: Record<ScheduleOverlay['kind'], string> = {
  event: 'Event',
  class: 'Class',
  blocked: 'Busy',
};

function dayLabel(date: Date, nowRef?: Date): string {
  if (nowRef) {
    if (isSameDay(date, nowRef)) return 'Today';
    if (isSameDay(date, addDays(nowRef, 1))) return 'Tomorrow';
  }
  return format(date, 'EEEE, MMMM d');
}

export function FairwayAvailabilityList({
  overlays,
  rangeStart,
  rangeEnd,
  nowRef,
}: FairwayAvailabilityListProps) {
  const buckets = React.useMemo(() => {
    const startMs = rangeStart.getTime();
    const endMs = rangeEnd.getTime() + 24 * 60 * 60 * 1000 - 1;
    const map = new Map<string, { date: Date; items: ScheduleOverlay[] }>();
    for (const o of overlays) {
      if (!o.start) continue;
      const d = new Date(o.start);
      const t = d.getTime();
      if (t < startMs || t > endMs) continue;
      const key = format(d, 'yyyy-MM-dd');
      const bucket = map.get(key);
      if (bucket) bucket.items.push(o);
      else map.set(key, { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [o] });
    }
    const arr = [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const b of arr) b.items.sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
    return arr;
  }, [overlays, rangeStart, rangeEnd]);

  if (buckets.length === 0) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface px-6 py-12 text-center shadow-flat">
        <p className="font-fw-display text-body-lg font-medium text-text-primary">No scheduled time</p>
        <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
          The selected players have nothing on the books in this window — likely all free.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {buckets.map(({ date, items }) => (
        <section key={format(date, 'yyyy-MM-dd')} className="flex flex-col gap-2.5">
          <h3 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            {dayLabel(date, nowRef)}
          </h3>
          <div className="flex flex-col gap-2">
            {items.map((o) => {
              const end = o.end && o.end !== o.start ? new Date(o.end) : null;
              return (
                <div
                  key={o.id}
                  className="relative flex items-stretch gap-4 overflow-hidden rounded-card border border-border-subtle bg-surface p-4 shadow-flat"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: o.color.bg }} />
                  {/* Time block */}
                  <div className="flex w-[68px] flex-shrink-0 flex-col items-start justify-center pl-1.5 md:w-[84px]">
                    {o.kind === 'blocked' ? (
                      <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">Busy</span>
                    ) : (
                      <>
                        <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary" suppressHydrationWarning>
                          {format(new Date(o.start), 'h:mm a')}
                        </span>
                        {end ? (
                          <span className="font-fw-mono text-caption tabular-nums text-text-tertiary" suppressHydrationWarning>
                            {format(end, 'h:mm a')}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  {/* Title + owner */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{o.title}</p>
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex items-center gap-1.5 font-fw-sans text-caption font-medium"
                        style={{ color: o.color.bg }}
                      >
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: o.color.bg }} />
                        {o.playerName}
                      </span>
                      <span className="font-fw-sans text-caption text-text-tertiary">· {KIND_LABEL[o.kind]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default FairwayAvailabilityList;
