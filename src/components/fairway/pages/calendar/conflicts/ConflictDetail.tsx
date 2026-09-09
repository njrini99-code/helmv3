'use client';

/**
 * ============================================================================
 * Fairway · Calendar · ConflictDetail — S8 conflict detail
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.8. Explains one `ConflictGroup`: the event, who it
 * overlaps for, and — when there is anything concrete to compare — the
 * shortest timeline that shows it, via `SchedulingWorkspace` with a static
 * "Current" `referenceInterval` drawn at the event's own original time.
 *
 * Data available vs. data this component pretends to have (read this before
 * changing what gets rendered):
 *
 * `getConflictInbox` (src/app/golf/actions/conflict-inbox.ts) returns, per
 * group, only the attendees whose OWN schedule produced a conflict
 * (`overlaps`, each with a name, an avatar, and their one conflicting
 * interval) plus a bare COUNT of attendees who could not be checked
 * (`unverifiedAttendeeIds` — ids only, no name, no avatar; rule 1 in that
 * module's own doc). It does NOT return the event's full attendee roster or
 * their availability — an attendee who was checked and found free is never
 * mentioned at all. So the `ScheduleSnapshot` built below can only ever
 * contain the people in `overlaps`: never a fabricated "Unknown player" row
 * for an unverified id (no name exists to show), and never a row implying a
 * clean attendee was checked here (no data says so). The unverified count
 * renders as a plain notice, never as a participant.
 *
 * A consequence: `SchedulingWorkspace`'s own "Everyone is available" /
 * canChoose reasoning here answers "does this fix the people who had a
 * problem", not "is this event's full roster free" — the latter is what the
 * full editor's own verification panel re-checks when this screen's primary
 * action opens it (existing `onChoose` path, `FairwayCalendar.tsx:1272`).
 * This component's CTA is deliberately named "Review new time", not "Use
 * this time", to keep that distinction honest at the label.
 * ========================================================================== */

import * as React from 'react';
import { AlertTriangle, ArrowLeft, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, InlineNotice } from '@/components/fairway';
import { wallClockInZone } from '@/lib/golf/timezone';
import { SchedulingWorkspace } from '../scheduling/SchedulingWorkspace';
import type { ConflictGroup } from '@/app/golf/actions/conflict-inbox';
import type { ScheduleInterval, ScheduleParticipant, ScheduleProposal, ScheduleSnapshot } from '@/lib/calendar/scheduling-contracts';
import surfaces from '../CalendarSurfaces.module.css';

function calendarDateInZone(iso: string, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** The full local calendar day (00:00 to next 00:00, in `timeZone`) that
 * `iso` falls on — same convention `getScheduleWindow` uses
 * (src/app/golf/actions/scheduling.ts), reusing the same DST-safe
 * `wallClockInZone` helper rather than re-deriving zone math here. */
function dayWindow(iso: string, timeZone: string): { start: string; end: string } {
  const { y, m, d } = calendarDateInZone(iso, timeZone);
  const day = new Date(y, m - 1, d);
  const nextDay = new Date(y, m - 1, d + 1);
  return {
    start: wallClockInZone(day, '00:00', timeZone).toISOString(),
    end: wallClockInZone(nextDay, '00:00', timeZone).toISOString(),
  };
}

function overlapInterval(overlap: ConflictGroup['overlaps'][number]): ScheduleInterval {
  const event = overlap.conflictingEvent;
  return {
    id: event.id ?? `${overlap.playerId || overlap.name}-overlap`,
    start: event.start,
    end: event.end,
    type: event.type,
    // Never forward a title alongside `access: 'free_busy'`, and never
    // fabricate one when the server sent neither (shouldn't happen, but the
    // fallback stays type-keyed rather than guessed either way).
    ...(event.access === 'free_busy' ? { access: 'free_busy' as const } : event.title ? { title: event.title } : {}),
  };
}

function buildOverlapParticipants(group: ConflictGroup): ScheduleParticipant[] {
  return group.overlaps
    .filter((overlap) => Boolean(overlap.playerId))
    .map((overlap) => ({
      id: overlap.playerId,
      kind: 'player' as const,
      name: overlap.name,
      avatarUrl: overlap.avatarUrl,
      isViewer: false,
      required: true,
      verification: 'complete' as const,
      intervals: [overlapInterval(overlap)],
    }));
}

function timeRange(startIso: string, endIso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
}

function checkedAtLabel(checkedAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(checkedAt));
}

function dayLine(startIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(startIso));
}

function clockLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

function hourLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric' }).format(new Date(ms));
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const HOUR_MS = 60 * 60 * 1000;
const CHART_HOUR_PX = 48;
const MAX_CHART_COLUMNS = 3;

/** The chart window: the event ±1h, snapped outward to whole hours so the
 * axis labels land on round times. Uses the event's own instants — never a
 * re-derived local day — so DST edges can't shift the band. */
function chartRange(startIso: string, endIso: string): { start: number; end: number } {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const from = Math.floor((start - HOUR_MS) / HOUR_MS) * HOUR_MS;
  const to = Math.ceil((end + HOUR_MS) / HOUR_MS) * HOUR_MS;
  return { start: from, end: Math.max(to, from + HOUR_MS) };
}

function bandStyle(startIso: string, endIso: string, range: { start: number; end: number }): React.CSSProperties | null {
  const start = Math.max(Date.parse(startIso), range.start);
  const end = Math.min(Date.parse(endIso), range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const total = range.end - range.start;
  return {
    top: `${((start - range.start) / total) * 100}%`,
    height: `${((end - start) / total) * 100}%`,
  };
}

export interface ConflictDetailProps {
  group: ConflictGroup;
  timeZone: string;
  /** The inbox snapshot's own `checkedAt` — never a `Date.now()` stand-in;
   * this component performs no read of its own. */
  checkedAt: string;
  isOffline?: boolean;
  onReviewNewTime: (proposal: ScheduleProposal) => void;
  /** Rendered as a back/close affordance when embedded without its own
   * overlay chrome (the desktop inspector). Omit inside a `Sheet`, which
   * already provides one. */
  onClose?: () => void;
}

export function ConflictDetail({ group, timeZone, checkedAt, isOffline = false, onReviewNewTime, onClose }: ConflictDetailProps) {
  const [expanded, setExpanded] = React.useState(false);
  const participants = React.useMemo(() => buildOverlapParticipants(group), [group]);
  const snapshot: ScheduleSnapshot = React.useMemo(() => ({
    teamId: group.event.id, // unused by SchedulingWorkspace's rendering; kept non-empty for type shape only.
    timeZone,
    window: dayWindow(group.event.start, timeZone),
    checkedAt,
    participants,
  }), [checkedAt, group, participants, timeZone]);

  const unverifiedCount = group.unverifiedAttendeeIds.length;
  const namedOverlaps = group.overlaps.filter((overlap) => overlap.playerId);
  const visibleOverlaps = expanded ? namedOverlaps : namedOverlaps.slice(0, 3);
  const hiddenCount = namedOverlaps.length - visibleOverlaps.length;

  const range = React.useMemo(() => chartRange(group.event.start, group.event.end), [group.event.end, group.event.start]);
  const hourTicks = React.useMemo(() => {
    const ticks: number[] = [];
    for (let t = range.start; t <= range.end; t += HOUR_MS) ticks.push(t);
    return ticks;
  }, [range]);
  const chartOverlaps = namedOverlaps.slice(0, MAX_CHART_COLUMNS);
  const chartHiddenCount = namedOverlaps.length - chartOverlaps.length;
  const eventBand = bandStyle(group.event.start, group.event.end, range);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={cn('sticky top-0 z-20 flex shrink-0 items-start gap-3 border-b px-4 py-4 sm:px-5', 'fw-glass-chrome')}>
        {onClose ? (
          <Button variant="ghost" size="sm" aria-label="Close conflict detail" onClick={onClose} className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-fw-warning-ink">Resolve conflict</p>
          <h2 className="mt-0.5 truncate font-fw-display text-title font-semibold tracking-[-0.02em] text-text-primary">
            {group.event.title || 'Event'}
          </h2>
          <p className="mt-1 font-fw-mono text-caption tabular-nums text-text-secondary">
            {dayLine(group.event.start, timeZone)} · {timeRange(group.event.start, group.event.end, timeZone)}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {isOffline ? (
          <InlineNotice tone="info" title="You're offline" icon={WifiOff}>
            Checked at {checkedAtLabel(checkedAt, timeZone)}. Showing what we last saw.
          </InlineNotice>
        ) : null}

        {/* The event card — what is being moved. */}
        <div className={cn('flex items-center gap-3 rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]', surfaces.enter)}>
          <span
            aria-hidden="true"
            className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', 'bg-surface-sunken text-text-secondary')}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-fw-sans text-body-sm font-semibold text-text-primary">{group.event.title || 'Event'}</p>
            <p className="mt-0.5 font-fw-sans text-caption text-text-secondary">
              {namedOverlaps.length > 0
                ? `${namedOverlaps.length} ${namedOverlaps.length === 1 ? 'overlap' : 'overlaps'}`
                : 'No confirmed overlap'}
              {unverifiedCount > 0 ? ` · ${unverifiedCount} unverified` : ''}
            </p>
          </div>
        </div>

        {namedOverlaps.length > 0 ? (
          <section aria-labelledby="conflict-affected-heading">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id="conflict-affected-heading" className="font-fw-sans text-body-sm font-semibold text-text-primary">
                Affected people
              </h3>
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{namedOverlaps.length}</span>
            </div>
            <ul className="space-y-2">
              {visibleOverlaps.map((overlap) => (
                <li
                  key={overlap.playerId}
                  className={cn('flex items-center gap-3 rounded-fw-md py-2.5 pl-4 pr-3', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-fw-sans text-body-sm font-semibold text-text-primary">{overlap.name}</p>
                    <p className="mt-0.5 font-fw-sans text-caption text-text-secondary">
                      {overlap.conflictingEvent.access === 'free_busy'
                        ? `Busy · ${timeRange(overlap.conflictingEvent.start, overlap.conflictingEvent.end, timeZone)}`
                        : `${overlap.conflictingEvent.title || (overlap.conflictingEvent.type === 'class' ? 'Class' : 'Busy')} · ${timeRange(overlap.conflictingEvent.start, overlap.conflictingEvent.end, timeZone)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {hiddenCount > 0 ? (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExpanded(true)}>
                Show {hiddenCount} more
              </Button>
            ) : expanded && namedOverlaps.length > 3 ? (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExpanded(false)}>
                Show less
              </Button>
            ) : null}
          </section>
        ) : null}

        {unverifiedCount > 0 ? (
          <InlineNotice tone="warning" title="Not fully checked" icon={AlertTriangle}>
            {unverifiedCount} {unverifiedCount === 1 ? 'attendee' : 'attendees'} could not be checked this pass.
            This is not a confirmed conflict, but their availability isn’t confirmed either.
          </InlineNotice>
        ) : null}

        {/* The overlap chart — the event's own band on the left, each
            affected person's conflicting interval on the right, on one
            vertical hour axis (the event ±1h). Purely presentational: the
            same facts as the list above, drawn once, never a new claim. */}
        {chartOverlaps.length > 0 && eventBand ? (
          <div className={cn('rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">Scheduling conflict</h3>
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                {hourLabel(range.start, timeZone)} – {hourLabel(range.end, timeZone)}
              </span>
            </div>
            <div className="flex gap-2" aria-hidden="true">
              <div className="relative w-12 shrink-0" style={{ height: `${(hourTicks.length - 1) * CHART_HOUR_PX}px` }}>
                {hourTicks.map((tick, index) => (
                  <span
                    key={tick}
                    className="absolute right-0 -translate-y-1/2 font-fw-mono text-microbadge tabular-nums text-text-tertiary"
                    style={{ top: `${(index / (hourTicks.length - 1)) * 100}%` }}
                  >
                    {hourLabel(tick, timeZone)}
                  </span>
                ))}
              </div>
              <div
                className="relative flex flex-1 gap-1.5 overflow-hidden rounded-fw-md"
                style={{
                  height: `${(hourTicks.length - 1) * CHART_HOUR_PX}px`,
                  backgroundImage: `repeating-linear-gradient(180deg, var(--cal-grid-line) 0 1px, transparent 1px ${CHART_HOUR_PX}px)`,
                }}
              >
                <div className="relative flex-1">
                  <div
                    className={cn('absolute inset-x-0 flex flex-col justify-center rounded-fw-sm px-2 py-1', surfaces.team)}
                    style={eventBand}
                  >
                    <span className="truncate font-fw-sans text-caption font-semibold">{group.event.title || 'Event'}</span>
                    <span className="truncate font-fw-mono text-microbadge tabular-nums opacity-80">
                      {timeRange(group.event.start, group.event.end, timeZone)}
                    </span>
                  </div>
                </div>
                <div className="relative flex flex-1 gap-1">
                  {chartOverlaps.map((overlap) => {
                    const band = bandStyle(overlap.conflictingEvent.start, overlap.conflictingEvent.end, range);
                    const what = overlap.conflictingEvent.access === 'free_busy'
                      ? 'Busy'
                      : overlap.conflictingEvent.title || (overlap.conflictingEvent.type === 'class' ? 'Class' : 'Busy');
                    return (
                      <div key={overlap.playerId} className="relative min-w-0 flex-1">
                        {band ? (
                          <div
                            className={cn('absolute inset-x-0 flex flex-col justify-center rounded-fw-sm px-2 py-1', surfaces.overlap)}
                            style={band}
                          >
                            <span className="truncate font-fw-sans text-caption font-semibold">{firstName(overlap.name)}</span>
                            <span className="truncate font-fw-sans text-microbadge">
                              {what} until {clockLabel(Date.parse(overlap.conflictingEvent.end), timeZone)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="sr-only">
              {chartOverlaps.map((overlap) => (
                `${firstName(overlap.name)} · ${overlap.conflictingEvent.access === 'free_busy' ? 'Busy' : overlap.conflictingEvent.title || 'Busy'} until ${clockLabel(Date.parse(overlap.conflictingEvent.end), timeZone)}`
              )).join('; ')}
            </p>
            {chartHiddenCount > 0 ? (
              <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
                +{chartHiddenCount} more in the list above.
              </p>
            ) : null}
          </div>
        ) : null}

        {participants.length > 0 ? (
          // A plain rounded/bordered frame — NOT `.inspector` (that class is
          // the desktop right-PANEL's own slide-in entrance, and would
          // replay its animation on every group change or filter toggle,
          // not once per screen).
          <div className="overflow-hidden rounded-card border border-border-subtle">
            <SchedulingWorkspace
              snapshot={snapshot}
              onChoose={onReviewNewTime}
              onClose={() => {}}
              onDateChange={() => {}}
              referenceInterval={{ start: group.event.start, end: group.event.end, label: 'Current' }}
              showDatePicker={false}
              primaryActionLabel="Review new time"
              disablePrimaryAction={isOffline}
              embedded
            />
          </div>
        ) : (
          <div className={cn('space-y-3 rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">No confirmed overlap to compare.</p>
            <p className="font-fw-sans text-caption text-text-secondary">
              {unverifiedCount > 0
                ? "This event has no confirmed conflict, but some attendees' schedules could not be checked."
                : 'Nothing to compare here yet.'}
            </p>
            <Button
              variant="primary"
              disabled={isOffline}
              onClick={() => onReviewNewTime({ start: group.event.start, end: group.event.end })}
            >
              Open Find a time
            </Button>
          </div>
        )}
        {/* No attendee count is returned by getConflictInbox (only the
            overlapping people and a bare unverified count), so no
            "N attendees will be notified" caption is asserted here. */}
      </div>
    </div>
  );
}

export default ConflictDetail;
