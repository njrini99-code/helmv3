'use client';

/**
 * ============================================================================
 * Fairway · Calendar · CalendarClassDetail — S4, class detail for a player
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.4. Renders on a single rule this file structurally
 * enforces, not just documents: a title, instructor, or location NEVER
 * renders unless the resolved result is `access: 'detail'`. The `free_busy`
 * branch below only ever has a `ClassFreeBusyDetail` in scope (`eventId`,
 * `date`, `start`, `end` — no name/instructor/location fields exist on that
 * type at all), and the `loading` / `none` (not-found) / failed branches
 * never see class data of any kind. The `offline` branch DOES render a
 * title, instructor, and location — but only because its `data` is a
 * `ClassOccurrenceDetail`, a payload the caller can only ever be holding as
 * the result of a PRIOR `access: 'detail'` read (see `ClassOccurrenceOfflineView`
 * in `./types`); the invariant holds by construction, not by a runtime check
 * in this file, so the caller composing that view must never build it from a
 * `free_busy` or `none` result.
 *
 * One overlay, two shells: `Sheet side="bottom"` on phones, `side="right"`
 * (360px) on desktop, switched by hand at the plan's 1024px boundary rather
 * than `Sheet`'s own `mobileSide` (which flips at 768px — the plan's §2
 * shared rule keeps the mobile drill-in through 1023px).
 *
 * `result` is fully resolved server state, plus the two client-only states
 * (`loading`, `offline`) it can be in without a fresh read backing the
 * screen — this component does not fetch, and does not itself decide when a
 * read has gone offline; see `ClassOccurrenceOfflineView` in `./types`. The
 * server (`getClassOccurrenceDetail`, `src/app/golf/actions/class-detail.ts`)
 * has no notion of "excluded" or "unsynced" as separate access levels; both
 * are refinements INSIDE a `detail`-access `ClassOccurrenceDetail` — `synced:
 * false` (no calendar-event row backs this occurrence yet) and
 * `status.state` (an academic-exclusion lookup: `scheduled` / `excluded` /
 * `unknown` when that lookup itself failed). This component derives its own
 * eight-way render state from that shape below (`meetingKind` plus the
 * `offline` banner layered on top of the same `detail` body).
 * ========================================================================== */

import * as React from 'react';
import { BookOpen, Building2, Clock, GraduationCap, MapPin, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Button, Skeleton, InlineNotice } from '@/components/fairway';
import { fwHaptic } from '@/lib/fairway/haptics';
import { ClassOccurrenceStatus } from './ClassOccurrenceStatus';
import { parseClassName } from './parseClassName';
import type { ClassDetailViewer, ClassOccurrenceDetail, ClassOccurrenceView } from './types';
import surfaces from '../CalendarSurfaces.module.css';

export interface CalendarClassDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ClassOccurrenceView;
  viewer: ClassDetailViewer;
  /** The team's display timezone. The action returns instants (`start`/
   * `end`) and separate wall-clock strings (`startTime`/`endTime`) but no
   * timezone of its own — the caller already threads this through today
   * (`ScheduleSnapshot.timeZone` in `CalendarPersonDialog`). */
  timeZone: string;
  onRetry?: () => void;
  /** Player owner's primary action — deep-links to the Classes page. */
  onEditClass?: (classId: string) => void;
  /** Coach's primary action — seeds Find a time with this player and date. */
  onCompareSchedules?: () => void;
}

function formatWallClock(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmmss;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

/** This occurrence's time: from the synced instants when a calendar event
 * backs it, otherwise from the class's own wall-clock start/end — an
 * unsynced occurrence has no `start`/`end` at all (see the action's doc). */
function occurrenceTimeLabel(data: ClassOccurrenceDetail, timeZone: string): string {
  if (data.start && data.end) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
    return `${fmt.format(new Date(data.start))} – ${fmt.format(new Date(data.end))}`;
  }
  if (data.startTime && data.endTime) {
    return `${formatWallClock(data.startTime)} – ${formatWallClock(data.endTime)}`;
  }
  return 'Time not set';
}

function occurrenceDateTimeAriaLabel(data: ClassOccurrenceDetail, timeZone: string): string {
  if (data.start && data.end) {
    const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' });
    return `${dateFmt.format(new Date(data.start))}, ${occurrenceTimeLabel(data, timeZone)}`;
  }
  return occurrenceTimeLabel(data, timeZone);
}

function timeRange(startIso: string, endIso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
}

/** "Checked at" label for the offline snapshot banner — the wall-clock time
 * of the last successful read, in the team's display timezone. */
function checkedAtLabel(checkedAt: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return fmt.format(new Date(checkedAt));
}

function locationLine(data: Pick<ClassOccurrenceDetail, 'building' | 'room'>): string | null {
  if (data.building && data.room) return `${data.building} ${data.room}`;
  return data.building || data.room || null;
}

function HeaderSkeleton() {
  return (
    <div role="status" aria-label="Loading class" className="space-y-4 px-4 py-4 sm:px-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-56" />
      <div className="space-y-2 pt-2">
        <Skeleton className="h-14 w-full rounded-fw-md" />
        <Skeleton className="h-14 w-full rounded-fw-md" />
      </div>
    </div>
  );
}

function DetailSections({ data }: { data: ClassOccurrenceDetail }) {
  const location = locationLine(data);
  return (
    <div className="space-y-3">
      {location ? (
        <div className={cn('flex items-start gap-3 rounded-fw-md p-3', surfaces.paper)}>
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', surfaces.rowIcon)}>
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">Location</p>
            <p className="font-fw-sans text-body-sm text-text-primary">{location}</p>
          </div>
        </div>
      ) : null}
      {data.instructor ? (
        <div className={cn('flex items-start gap-3 rounded-fw-md p-3', surfaces.paper)}>
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', surfaces.rowIcon)}>
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">Instructor</p>
            <p className="font-fw-sans text-body-sm text-text-primary">{data.instructor}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CalendarClassDetail({
  open,
  onOpenChange,
  result,
  viewer,
  timeZone,
  onRetry,
  onEditClass,
  onCompareSchedules,
}: CalendarClassDetailProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const openedRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      fwHaptic('light');
    } else if (!open) {
      openedRef.current = false;
    }
  }, [open]);

  // `ClassOccurrenceView` is `{ kind: 'loading' } | ClassOccurrenceOfflineView`
  // (the two client-only states) unioned with the server's own result shape,
  // which has no `kind` field on any of its members — `'kind' in result` is
  // what lets each ternary below narrow straight through to the real server
  // result without an intermediate cast.
  const isLoading = 'kind' in result && result.kind === 'loading';
  const offlineView = 'kind' in result && result.kind === 'offline' ? result : null;
  // An offline snapshot already cleared server-side detail access when it
  // loaded — it renders through the exact same `data`-driven body as a live
  // `detail` result, plus its own "checked at" banner below.
  const data: ClassOccurrenceDetail | null = offlineView
    ? offlineView.data
    : !('kind' in result) && result.success && result.access === 'detail' ? result.data : null;
  const freeBusyData = !('kind' in result) && result.success && result.access === 'free_busy' ? result.data : null;
  const notFound = !('kind' in result) && result.success && result.access === 'none';
  const failedError = !('kind' in result) && !result.success ? result.error : null;

  // The server's own status only ever says scheduled/excluded/unknown — an
  // unsynced occurrence (no calendar-event row yet) is a SEPARATE, more
  // fundamental fact this component surfaces ahead of exclusion status.
  const meetingKind: 'scheduled' | 'excluded' | 'unknown' | 'unsynced' | null = data
    ? (!data.synced ? 'unsynced' : data.status.state)
    : null;

  const { code, name } = data ? parseClassName(data.className) : { code: '', name: '' };
  const headingId = 'calendar-class-detail-heading';

  const primaryAction = (() => {
    if (!data) return null;
    if (viewer === 'owner' && onEditClass) {
      return <Button size="lg" fullWidth className={surfaces.glow} onClick={() => onEditClass(data.classId)}>Edit class</Button>;
    }
    if (viewer === 'coach' && onCompareSchedules) {
      return <Button size="lg" fullWidth className={surfaces.glow} onClick={onCompareSchedules}>Compare schedules</Button>;
    }
    return null;
  })();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={isDesktop ? 'right' : 'bottom'}
      title={data ? `${code ? `${code} — ` : ''}${name}` : 'Class'}
      hideTitle
      className={cn(surfaces.scope, surfaces.panel, isDesktop && 'w-[360px]')}
    >
      <div className="flex h-full min-h-0 flex-col">
        {isLoading ? <HeaderSkeleton /> : null}

        {data && meetingKind ? (
          <>
            <header className={cn('flex shrink-0 items-start gap-3 border-b px-4 py-4 sm:px-5', surfaces.chrome)}>
              <span className={cn('mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full', surfaces.class)}>
                <BookOpen className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                  {code || 'Class'}{data.semester ? ` · ${data.semester}` : ''}
                </p>
                <h2 id={headingId} className="mt-0.5 font-fw-display text-title font-semibold tracking-[-0.02em] text-text-primary">
                  {name}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 font-fw-mono text-caption tabular-nums text-text-secondary">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span aria-label={occurrenceDateTimeAriaLabel(data, timeZone)}>
                    {occurrenceTimeLabel(data, timeZone)}
                  </span>
                </p>
                {data.days && data.days.length > 0 ? (
                  <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{data.days.join(' · ')}</p>
                ) : null}
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              {offlineView ? (
                <InlineNotice tone="info" title="You're offline" icon={WifiOff}>
                  Checked at {checkedAtLabel(offlineView.checkedAt, timeZone)}. Showing what we last saw.
                </InlineNotice>
              ) : null}
              <ClassOccurrenceStatus
                kind={meetingKind}
                exclusion={meetingKind === 'excluded' ? data.status : undefined}
              />
              <DetailSections data={data} />
              <p className="flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                From your Helm class list
              </p>
            </div>

            {primaryAction ? (
              <footer className={cn('shrink-0 rounded-t-fw-lg border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5', surfaces.dock)}>{primaryAction}</footer>
            ) : null}
          </>
        ) : null}

        {freeBusyData ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-8 text-center sm:px-5">
            <p role="status" aria-label="Busy, class details are private" className="font-fw-display text-title font-semibold text-text-primary">
              Busy · Class
            </p>
            <p className="mt-1 font-fw-mono text-caption tabular-nums text-text-secondary">
              {timeRange(freeBusyData.start, freeBusyData.end, timeZone)}
            </p>
            <p className="mx-auto mt-3 max-w-[26ch] font-fw-sans text-caption text-text-tertiary">
              You don’t have access to this class’s details.
            </p>
          </div>
        ) : null}

        {notFound ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center sm:px-5">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-sunken text-text-tertiary">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <p className="font-fw-display text-body-lg font-semibold text-text-primary">This class is no longer in Helm</p>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : null}

        {failedError ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center sm:px-5">
            <InlineNotice tone="danger" title="Couldn’t load this class">{failedError}</InlineNotice>
            {onRetry ? <Button variant="secondary" onClick={onRetry}>Retry</Button> : null}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
