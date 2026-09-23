'use client';

/**
 * ============================================================================
 * Fairway · Calendar · ConflictCenter — S8 conflict center
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.8. A list of `ConflictGroup`s grouped by date, with
 * a Needs attention / Unverified filter (the Reviewed filter is gated behind
 * G2 — an acknowledgement table that does not exist yet — and is
 * DELIBERATELY absent, not merely hidden). Selecting a row opens
 * `ConflictDetail`: a drill-in `Sheet` under 1024px, a persistent right
 * `.inspector` panel at and above it (plan's own desktop rule — mirrors
 * CalendarClassDetail's `Sheet side` switch at the same breakpoint).
 *
 * The one non-obvious honesty rule this file owns: `timeZone` is a REQUIRED
 * prop, not read from the snapshot — `ConflictInboxSnapshot`
 * (src/app/golf/actions/conflict-inbox.ts) carries no `timeZone` field
 * (unlike `ScheduleSnapshot`), so a caller must thread the team's own
 * display zone through (`FairwayCalendar` already holds one — `teamTimezone`
 * — for the exact same reason the editor needs it). Grouping by LOCAL date
 * without it would silently mis-bucket an evening event into the wrong day.
 *
 * The other: every render that could look like "nothing to worry about" —
 * an empty list, a filtered-empty list — carries `snapshot.checkedAt`, and a
 * refresh that fails while a clean (zero-group) snapshot is showing renders
 * a visibly degraded banner instead of silently reaffirming that clean read
 * as current (`useConflictInbox`'s own contract; see its file for why a
 * naive version of this screen could otherwise render a stale all-clear as
 * fresh).
 * ========================================================================== */

import * as React from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button, EmptyState, InlineNotice, Segmented, Skeleton } from '@/components/fairway';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import type { ConflictGroup, ConflictInboxSnapshot } from '@/app/golf/actions/conflict-inbox';
import type { ScheduleProposal } from '@/lib/calendar/scheduling-contracts';
import { ConflictRow } from './ConflictRow';
import { ConflictDetail } from './ConflictDetail';
import surfaces from '../CalendarSurfaces.module.css';

type ConflictFilter = 'needsAttention' | 'unverified';

function needsAttention(group: ConflictGroup): boolean {
  return group.overlaps.length > 0;
}

function isUnverified(group: ConflictGroup): boolean {
  return group.unverifiedAttendeeIds.length > 0;
}

function dateKeyInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Formats the heading from the SAME instant that produced the bucket's own
 * `dateKey` (`dateKeyInZone(firstGroupStart, timeZone)`) — never by
 * re-parsing the plain `YYYY-MM-DD` key at an assumed UTC hour, which can
 * name a different calendar day than the key for a zone far enough from
 * UTC (e.g. `Pacific/Auckland`, UTC+13: noon UTC is already the next day
 * there). Keeping one source instant for both the key and the heading is
 * what keeps them from ever disagreeing. */
function dateHeading(firstGroupStart: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(firstGroupStart));
}

function checkedAtLabel(checkedAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(checkedAt));
}

function groupByDate(groups: ConflictGroup[], timeZone: string): Array<{ dateKey: string; groups: ConflictGroup[] }> {
  const sorted = [...groups].sort((a, b) => a.event.start.localeCompare(b.event.start));
  const buckets: Array<{ dateKey: string; groups: ConflictGroup[] }> = [];
  for (const group of sorted) {
    const key = dateKeyInZone(group.event.start, timeZone);
    const bucket = buckets.find((candidate) => candidate.dateKey === key);
    if (bucket) bucket.groups.push(group);
    else buckets.push({ dateKey: key, groups: [group] });
  }
  return buckets;
}

function RowSkeleton() {
  return <Skeleton className="h-[64px] w-full rounded-fw-lg" />;
}

export interface ConflictCenterProps {
  snapshot: ConflictInboxSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  timeZone: string;
  isOffline?: boolean;
  onReviewNewTime: (group: ConflictGroup, proposal: ScheduleProposal) => void;
  className?: string;
}

export function ConflictCenter({
  snapshot,
  loading,
  refreshing,
  error,
  onRefresh,
  timeZone,
  isOffline = false,
  onReviewNewTime,
  className,
}: ConflictCenterProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [filter, setFilter] = React.useState<ConflictFilter>('needsAttention');
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);

  const groups = React.useMemo(() => snapshot?.groups ?? [], [snapshot]);
  const needsAttentionGroups = React.useMemo(() => groups.filter(needsAttention), [groups]);
  const unverifiedGroups = React.useMemo(() => groups.filter(isUnverified), [groups]);
  const filteredGroups = filter === 'needsAttention' ? needsAttentionGroups : unverifiedGroups;
  const buckets = React.useMemo(() => groupByDate(filteredGroups, timeZone), [filteredGroups, timeZone]);

  const selectedGroup = groups.find((group) => group.event.id === selectedEventId) ?? null;
  const selectGroup = (group: ConflictGroup) => setSelectedEventId(group.event.id);
  const closeDetail = () => setSelectedEventId(null);

  const failedInitialLoad = Boolean(error) && !snapshot;
  const failedRefresh = Boolean(error) && Boolean(snapshot);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', surfaces.scope, className)}>
      <header className={cn('sticky top-0 z-20 flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-6', 'fw-glass-chrome')}>
        <div className="min-w-0">
          <h1 className="font-fw-display text-title font-semibold tracking-[-0.02em] text-text-primary">Conflicts</h1>
          {snapshot ? (
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
              Checked {checkedAtLabel(snapshot.checkedAt, timeZone)}
              {refreshing ? ' · refreshing…' : ''}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading || isOffline}
          leftIcon={<RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin motion-reduce:animate-none')} />}
        >
          Refresh
        </Button>
      </header>

      {isOffline ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <InlineNotice tone="info" title="You're offline" icon={WifiOff}>
            {snapshot ? `Showing what we last saw · checked ${checkedAtLabel(snapshot.checkedAt, timeZone)}.` : 'Reconnect to check for conflicts.'}
          </InlineNotice>
        </div>
      ) : failedRefresh ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <InlineNotice tone="warning" title="Couldn’t re-check" icon={AlertTriangle} action={<Button variant="secondary" size="sm" onClick={onRefresh}>Retry</Button>}>
            Last checked {checkedAtLabel(snapshot!.checkedAt, timeZone)}. This list may be out of date.
          </InlineNotice>
        </div>
      ) : null}

      <div className="shrink-0 border-b border-border-subtle px-4 py-3 sm:px-6">
        <Segmented
          aria-label="Filter conflicts"
          value={filter}
          onValueChange={(value) => setFilter(value as ConflictFilter)}
          options={[
            { value: 'needsAttention', label: `Needs attention (${needsAttentionGroups.length})` },
            { value: 'unverified', label: `Unverified (${unverifiedGroups.length})` },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading ? (
            <div role="status" aria-label="Loading conflicts" className="space-y-3">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : failedInitialLoad ? (
            <InlineNotice tone="danger" title="Conflicts could not be loaded" action={<Button variant="secondary" size="sm" onClick={onRefresh}>Retry</Button>}>
              {error}
            </InlineNotice>
          ) : buckets.length === 0 ? (
            groups.length === 0 ? (
              (isOffline || failedRefresh) && snapshot ? (
                // Never pair a "here's what we last saw" banner above with a
                // clean "No overlaps" headline below — that combination reads
                // as a fresh all-clear even though nothing was confirmed this
                // pass. State the uncertainty instead of the (unconfirmed)
                // absence of conflicts.
                <EmptyState
                  variant="subtle"
                  title="Couldn't confirm there are no conflicts"
                  description={`Last checked ${checkedAtLabel(snapshot.checkedAt, timeZone)}.`}
                />
              ) : (
                <EmptyState
                  variant="default"
                  title="No overlaps in the next 14 days"
                  description={snapshot ? `Checked ${checkedAtLabel(snapshot.checkedAt, timeZone)}.` : undefined}
                />
              )
            ) : (
              <EmptyState
                variant="subtle"
                title={filter === 'needsAttention' ? 'No conflicts need attention right now' : 'Nothing unverified right now'}
                description={
                  filter === 'needsAttention' && unverifiedGroups.length > 0
                    ? `${unverifiedGroups.length} ${unverifiedGroups.length === 1 ? 'event has' : 'events have'} unverified attendees — switch filters to review.`
                    : filter === 'unverified' && needsAttentionGroups.length > 0
                      ? `${needsAttentionGroups.length} ${needsAttentionGroups.length === 1 ? 'event needs' : 'events need'} attention — switch filters to review.`
                      : undefined
                }
              />
            )
          ) : (
            <div className="space-y-5">
              {buckets.map((bucket) => (
                <section key={bucket.dateKey} aria-labelledby={`conflict-date-${bucket.dateKey}`}>
                  <h2 id={`conflict-date-${bucket.dateKey}`} className="mb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                    {/* Every bucket is built with at least one group (groupByDate only ever pushes non-empty arrays) — safe to read [0] directly. */}
                    {dateHeading(bucket.groups[0]!.event.start, timeZone)}
                  </h2>
                  <div className="space-y-2">
                    {bucket.groups.map((group, index) => (
                      <ConflictRow
                        key={group.event.id}
                        enterIndex={index}
                        group={group}
                        timeZone={timeZone}
                        selected={group.event.id === selectedEventId}
                        onSelect={() => selectGroup(group)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {isDesktop ? (
          <aside className={cn('hidden w-[380px] shrink-0 overflow-y-auto lg:block', surfaces.inspector)}>
            {snapshot && selectedGroup ? (
              <ConflictDetail
                group={selectedGroup}
                timeZone={timeZone}
                checkedAt={snapshot.checkedAt}
                isOffline={isOffline}
                onReviewNewTime={(proposal) => onReviewNewTime(selectedGroup, proposal)}
                onClose={closeDetail}
              />
            ) : (
              <div className="p-6">
                <EmptyState variant="subtle" title="Select a conflict" description="Choose a row to see what overlaps and review a new time." />
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {!isDesktop ? (
        <Sheet
          open={Boolean(selectedGroup)}
          onOpenChange={(open) => { if (!open) closeDetail(); }}
          side="bottom"
          title={selectedGroup ? selectedGroup.event.title || 'Conflict' : 'Conflict'}
          hideTitle
        >
          {snapshot && selectedGroup ? (
            <ConflictDetail
              group={selectedGroup}
              timeZone={timeZone}
              checkedAt={snapshot.checkedAt}
              isOffline={isOffline}
              onReviewNewTime={(proposal) => onReviewNewTime(selectedGroup, proposal)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

export default ConflictCenter;
