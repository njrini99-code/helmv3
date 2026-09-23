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
 *
 * `commonFreeWindows` (optional) surfaces `computeCommonFreeTime`'s ALL-FREE
 * track — the windows where every selected player is open — as a small callout
 * above the per-player buckets, so the coach doesn't have to eyeball the tracks
 * below to find one. Still presentation-only: the parent computes the windows
 * from the same `getPlayerAvailability` data these buckets are built from.
 * ========================================================================== */

import * as React from 'react';
import { format, isSameDay, addDays } from 'date-fns';
import { CalendarCheck, Users } from 'lucide-react';

import { formatEventTime, zonedMidnight } from '@/lib/calendar/timezone';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import type { ScheduleOverlay } from './FairwayMonthGrid';
import type { FreeWindow } from '@/lib/golf/common-free-time';

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
  /**
   * Windows where every selected player is free — `computeCommonFreeTime`'s
   * `allFreeWindows`. Only meaningful with 2+ players selected (with one
   * player "common" is just their own free time); the parent gates on that.
   * Omitted or empty renders nothing extra.
   */
  commonFreeWindows?: FreeWindow[];
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
  commonFreeWindows,
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

  // "Common free time" — the windows where every selected player is open,
  // above the per-player buckets so the coach doesn't have to read the
  // tracks below to find one. Presentation only: `commonFreeWindows` is
  // `computeCommonFreeTime`'s `allFreeWindows`, computed by the parent from
  // the same availability data.
  const commonSection =
    commonFreeWindows && commonFreeWindows.length > 0 ? (
      <section className="flex flex-col gap-2.5">
        <h3 className="flex items-center gap-1.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Common free time
        </h3>
        <div className="flex flex-col gap-2">
          {commonFreeWindows.map((w) => (
            <div
              key={`${w.dayIso}:${w.startIso}`}
              className="flex items-center gap-3 rounded-card border border-fw-success/30 bg-fw-success-bg px-4 py-3"
            >
              <CalendarCheck className="h-4 w-4 flex-shrink-0 text-fw-success-ink" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <p className="font-fw-sans text-body-sm font-medium text-fw-success-ink">
                  {dayLabel(zonedMidnight(w.startIso, timezone), nowRef)}
                </p>
                <p className="font-fw-mono text-caption tabular-nums text-fw-success-ink">
                  {formatEventTime(w.startIso, timezone)} – {formatEventTime(w.endIso, timezone)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {commonSection}
        <EmptyState
          variant="subtle"
          icon={CalendarCheck}
          title="No scheduled time"
          description="The selected players have nothing on the books in this window — likely all free."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {commonSection}
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
                  className="flex items-stretch gap-4 overflow-hidden rounded-card border border-border-subtle bg-surface p-4 shadow-flat"
                >
                  {/* Time block — color identity is the owner dot below, not a rail. */}
                  <div className="flex w-[68px] flex-shrink-0 flex-col items-start justify-center md:w-[84px]">
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
