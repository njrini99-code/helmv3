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

import { formatEventTime, zonedMidnight } from '@/lib/calendar/timezone';
import type { ScheduleOverlay } from './FairwayMonthGrid';

export interface FairwayAvailabilityListProps {
  overlays: ScheduleOverlay[];
  rangeStart: Date;
  rangeEnd: Date;
  nowRef?: Date;
  /**
   * Team's canonical IANA timezone — anchors the bucket day + the time
   * badges so they agree with the Agenda row / month grid / detail drawer
   * for the SAME instant (audit W1: cal-tz). This surface only ever mounts
   * after a coach picks a player (never part of the initial SSR render), so
   * this isn't itself a hydration-mismatch source, but the previous raw
   * `format(new Date(iso), 'h:mm a')` still rendered the WRONG wall-clock
   * time whenever the viewer's own device zone differed from the team's.
   */
  timezone?: string | null;
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
  timezone,
}: FairwayAvailabilityListProps) {
  const buckets = React.useMemo(() => {
    const startMs = rangeStart.getTime();
    const endMs = rangeEnd.getTime() + 24 * 60 * 60 * 1000 - 1;
    const map = new Map<string, { date: Date; items: ScheduleOverlay[] }>();
    for (const o of overlays) {
      if (!o.start) continue;
      const t = new Date(o.start).getTime();
      if (Number.isNaN(t) || t < startMs || t > endMs) continue;
      // `zonedMidnight` (explicit `timezone`) — not the implicit-local
      // `new Date(o.start).getFullYear()/...` this used to bucket with — so
      // a late-evening period lands on the SAME day here as it does in the
      // month grid / agenda for the SAME team.
      const date = zonedMidnight(o.start, timezone);
      const key = format(date, 'yyyy-MM-dd');
      const bucket = map.get(key);
      if (bucket) bucket.items.push(o);
      else map.set(key, { date, items: [o] });
    }
    const arr = [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const b of arr) b.items.sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
    return arr;
  }, [overlays, rangeStart, rangeEnd, timezone]);

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
              const hasEnd = Boolean(o.end && o.end !== o.start);
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
                        {/* `formatEventTime` (explicit `timezone`), not the
                            previous `format(new Date(o.start), 'h:mm a')`
                            (implicit-local) + `suppressHydrationWarning`
                            band-aid — the exact anti-pattern the W1 audit
                            fixed for the Agenda/month grid. This surface only
                            mounts post-interaction so it was never an actual
                            SSR/CSR mismatch, but the old code still showed
                            the WRONG wall-clock time whenever the viewer's
                            device zone differed from the team's. */}
                        <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                          {formatEventTime(o.start, timezone)}
                        </span>
                        {hasEnd && o.end ? (
                          <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                            {formatEventTime(o.end, timezone)}
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
