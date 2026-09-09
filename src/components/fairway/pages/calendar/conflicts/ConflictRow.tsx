'use client';

/**
 * ============================================================================
 * Fairway · Calendar · ConflictRow — S8 conflict center row
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.8. One row per `ConflictGroup` (a team event, plus
 * every one of its attendees whose OWN schedule overlaps it, or that
 * couldn't be checked this pass). Rendered as a single button with a full
 * sentence `aria-label` — "Practice, Thursday 3–5 PM, 2 overlaps, 1
 * unverified" — per the plan's Accessibility note; the visible content below
 * is a compact restatement of the same facts, never additional ones.
 *
 * Honesty: this row NEVER renders a green "verified" affirmation — a group
 * only exists here because `checkEventConflicts` found a real overlap, a
 * partial read, or both (src/app/golf/actions/conflict-inbox.ts's own
 * module doc). "Checked" (neutral) means every overlap it reports is
 * confirmed; "Partially checked" (hatched) means at least one attendee's own
 * schedule could not be read this pass — never folded into "checked".
 * ========================================================================== */

import { AlertTriangle, ChevronRight, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/fairway';
import type { ConflictGroup } from '@/app/golf/actions/conflict-inbox';
import surfaces from '../CalendarSurfaces.module.css';
import { enterStyle } from '../motion';

const MAX_AVATARS = 3;

function timeRange(startIso: string, endIso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
}

function weekdayTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(startIso));
  return `${weekday} ${timeRange(startIso, endIso, timeZone)}`;
}

/** Minutes of real overlap between the base event and one conflicting
 * interval — clipped to a non-negative amount so a malformed pair (should
 * never happen; `checkEventConflicts` only returns actual overlaps) can
 * never render a negative number. */
function overlapMinutes(group: ConflictGroup, overlap: ConflictGroup['overlaps'][number]): number {
  const start = Math.max(Date.parse(group.event.start), Date.parse(overlap.conflictingEvent.start));
  const end = Math.min(Date.parse(group.event.end), Date.parse(overlap.conflictingEvent.end));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

function totalOverlapMinutes(group: ConflictGroup): number {
  return group.overlaps.reduce((sum, overlap) => sum + overlapMinutes(group, overlap), 0);
}

export function conflictRowLabel(group: ConflictGroup, timeZone: string): string {
  const when = weekdayTimeRange(group.event.start, group.event.end, timeZone);
  const overlapCount = group.overlaps.length;
  const unverifiedCount = group.unverifiedAttendeeIds.length;
  const parts = [group.event.title || 'Event', when];
  if (overlapCount > 0) parts.push(`${overlapCount} ${overlapCount === 1 ? 'overlap' : 'overlaps'}`);
  if (unverifiedCount > 0) parts.push(`${unverifiedCount} unverified`);
  return parts.join(', ');
}

export interface ConflictRowProps {
  group: ConflictGroup;
  timeZone: string;
  selected?: boolean;
  onSelect: () => void;
  /** Position in the list for the staggered `.enter` reveal. */
  enterIndex?: number;
}

export function ConflictRow({ group, timeZone, selected = false, onSelect, enterIndex }: ConflictRowProps) {
  const overlapCount = group.overlaps.length;
  const unverifiedCount = group.unverifiedAttendeeIds.length;
  const minutes = totalOverlapMinutes(group);
  const shownAvatars = group.overlaps.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, group.overlaps.length - MAX_AVATARS);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={conflictRowLabel(group, timeZone)}
      className={cn(
        'flex w-full min-h-[64px] items-center gap-3 rounded-fw-lg p-3 text-left',
        surfaces.paper,
        surfaces.press,
        enterIndex !== undefined && surfaces.enter,
        selected && 'ring-2 ring-accent-500',
      )}
      style={enterStyle(enterIndex)}
    >
      <div className="w-16 shrink-0 text-right">
        <p className="font-fw-mono text-caption font-semibold tabular-nums text-text-primary">
          {timeRange(group.event.start, group.event.end, timeZone)}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-fw-sans text-body-sm font-semibold text-text-primary">
          {group.event.title || 'Event'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {overlapCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-fw-warning-bg px-2 py-0.5 font-fw-sans text-microbadge font-semibold text-fw-warning-ink">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {overlapCount} {overlapCount === 1 ? 'overlap' : 'overlaps'}{minutes > 0 ? ` · ${minutes} min` : ''}
            </span>
          ) : null}
          {unverifiedCount > 0 ? (
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 font-fw-sans text-microbadge font-semibold', surfaces.hatch)}>
              {unverifiedCount} unverified
            </span>
          ) : null}
          <span className="font-fw-sans text-microbadge font-medium uppercase tracking-[0.08em] text-text-tertiary">
            {group.verification === 'partial' ? 'Partially checked' : 'Checked'}
          </span>
        </div>
      </div>

      {shownAvatars.length > 0 ? (
        <div className="flex shrink-0 -space-x-2" aria-hidden="true">
          {shownAvatars.map((overlap) => (
            <Avatar
              key={overlap.playerId || overlap.name}
              src={overlap.avatarUrl ?? undefined}
              name={overlap.avatarUrl ? overlap.name : null}
              alt=""
              fallback={<UserRound className="h-3.5 w-3.5" />}
              size="xs"
              className="ring-2 ring-surface"
            />
          ))}
          {overflow > 0 ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-sunken font-fw-sans text-microbadge font-semibold text-text-secondary ring-2 ring-surface">
              +{overflow}
            </span>
          ) : null}
        </div>
      ) : null}

      <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />
    </button>
  );
}

export default ConflictRow;
