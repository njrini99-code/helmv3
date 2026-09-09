'use client';

/**
 * Schedule-verification panel — extraction of the block that used to live
 * inline in `FairwayEventEditor.tsx` (SCREEN-BUILD-PLAN.md §2.1's
 * `editor/EventVerificationPanel.tsx`).
 *
 * This is a byte-for-byte move of the JSX and copy that were already load-
 * bearing for `__tests__/FairwayEventEditor.test.tsx` — every string here
 * ("Checking Helm schedules…", "No conflicts found in checked Helm
 * schedules.", "Schedules partially checked. Some availability is not
 * verified.", "Schedules not verified. The check could not finish.", the
 * "N overlaps · M people affected" line, "Show all N overlaps (4 shown)",
 * "Try …" suggestion chips) must not change, or the existing suite breaks.
 *
 * `data-state` exposes the plan's typed vocabulary (`idle | checking |
 * verified | partial | conflicts | failed`) for anything that wants to key
 * off it (motion, future tests) without touching the rendered text.
 */

import * as React from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { Button as UiButton } from '@/components/ui/button';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { cn } from '@/lib/utils';
import surfaces from '../CalendarSurfaces.module.css';
import { localDayIso } from '@/lib/golf/local-day';
import { fwHaptic } from '@/lib/fairway/haptics';

export type VerificationStatus = 'idle' | 'checking' | 'ready' | 'error';

/** The plan's typed vocabulary (§2.1), derived from `status` + `conflicts`. */
export type VerificationState = 'idle' | 'checking' | 'verified' | 'partial' | 'conflicts' | 'failed';

export interface ConflictRow {
  userId: string;
  userName: string;
  playerId?: string;
  conflictingEvent: { id?: string; title: string; type: 'event' | 'class' | 'blocked'; start: string; end: string };
}

export interface ConflictData {
  hasConflict: boolean;
  partial?: boolean;
  conflicts: ConflictRow[];
  suggestions: Array<{ start: Date; end: Date }>;
}

export interface EventVerificationPanelProps {
  status: VerificationStatus;
  conflicts: ConflictData | null;
  /** True when the attendee-hydration fetch itself failed — retrying that
   *  (not the conflict check) is what "Check again" should do in that case. */
  attendeeHydrationError: boolean;
  onRetryAttendees: () => void;
  onRetryConflicts: () => void;
  onSelectSuggestion: (slot: { start: Date; end: Date }) => void;
}

/**
 * "2026-06-15T14:00:00Z" + "…T15:00:00Z" -> "Jun 15 · 2:00 PM – 3:00 PM"
 * (or "Jun 15 · 2:00 PM – Jun 16 · 12:30 AM" across midnight).
 */
function formatConflictInterval(startValue: string, endValue: string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Time unavailable';
  const date = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endDate = localDayIso(start) === localDayIso(end) ? '' : `${end.toLocaleDateString([], { month: 'short', day: 'numeric' })} · `;
  return `${date} · ${startTime} – ${endDate}${endTime}`;
}

export function deriveVerificationState(status: VerificationStatus, conflicts: ConflictData | null): VerificationState {
  if (status === 'idle') return 'idle';
  if (status === 'checking') return 'checking';
  if (status === 'error') return 'failed';
  if (conflicts?.partial) return 'partial';
  if (conflicts?.hasConflict) return 'conflicts';
  return 'verified';
}

export function EventVerificationPanel({
  status,
  conflicts,
  attendeeHydrationError,
  onRetryAttendees,
  onRetryConflicts,
  onSelectSuggestion,
}: EventVerificationPanelProps) {
  const [showAllConflicts, setShowAllConflicts] = React.useState(false);
  const state = deriveVerificationState(status, conflicts);

  // One light tap when a check lands clean — never on partial/conflict/failed,
  // and never repeated while the panel re-renders in the same state.
  const previousState = React.useRef<VerificationState>(state);
  React.useEffect(() => {
    if (previousState.current === 'checking' && state === 'verified') fwHaptic('light');
    previousState.current = state;
  }, [state]);

  if (status === 'idle') return null;

  const isAttention = state === 'partial' || state === 'failed';
  const isConflicts = state === 'conflicts';
  const headline =
    state === 'checking' ? 'Checking Helm schedules…'
      : state === 'failed' ? 'Schedules not verified. The check could not finish.'
      : state === 'partial' ? 'Schedules partially checked. Some availability is not verified.'
      : state === 'conflicts' ? 'Schedule conflicts'
      : 'Everyone is available';

  return (
    <div
      data-state={state}
      className={cn(
        'flex flex-col gap-3 rounded-card p-3 font-fw-sans text-caption',
        isAttention ? surfaces.attention : surfaces.paper,
        !isAttention && (isConflicts ? 'text-fw-warning-ink' : 'text-text-secondary'),
      )}
    >
      <div className="flex items-center gap-3">
        {state === 'checking' ? (
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        ) : (
          <span
            aria-hidden
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-full',
              state === 'verified' ? surfaces.check : surfaces.rowIcon,
            )}
            style={
              state === 'verified'
                ? undefined
                : ({ '--row-tint': 'var(--fw-color-warning-ink)', '--row-tint-bg': 'var(--fw-color-warning-bg)' } as React.CSSProperties)
            }
          >
            {state === 'verified' ? <Check className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p role="status" className={cn('font-semibold', state === 'verified' ? 'text-text-primary' : undefined)}>
            {headline}
          </p>
          {state === 'verified' ? (
            <p className="mt-0.5 text-text-tertiary">No conflicts found in checked Helm schedules.</p>
          ) : null}
        </div>
        {isAttention ? (
          <UiButton
            variant="ghost"
            type="button"
            onClick={() => {
              if (attendeeHydrationError) onRetryAttendees();
              else onRetryConflicts();
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-fw-warning-ring bg-surface px-3.5 text-caption font-semibold text-fw-warning-ink hover:bg-surface-tint"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Check again
          </UiButton>
        ) : null}
      </div>
      {state === 'checking' ? (
        <div className="flex flex-col gap-1.5" aria-hidden>
          <Skeleton className="h-3 w-3/4 rounded-full" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
      ) : null}
      {conflicts && conflicts.conflicts.length > 0 ? (
        <>
          <p className="font-medium">{conflicts.conflicts.length} overlaps · {new Set(conflicts.conflicts.map((conflict) => conflict.userId)).size} people affected</p>
          <ul className="flex flex-col gap-2">
            {(showAllConflicts ? conflicts.conflicts : conflicts.conflicts.slice(0, 4)).map((conflict, index) => (
              <li key={`${conflict.userId}-${index}`} className={cn('rounded-fw-md px-3 py-2', surfaces.overlap)}>
                <p className="font-medium">{conflict.userName} — {conflict.conflictingEvent.title}</p>
                <p className="mt-0.5 font-fw-mono tabular-nums">{formatConflictInterval(conflict.conflictingEvent.start, conflict.conflictingEvent.end)} · {conflict.conflictingEvent.type === 'class' ? 'Class' : conflict.conflictingEvent.type === 'blocked' ? 'Blocked time' : 'Event'}</p>
              </li>
            ))}
          </ul>
          {conflicts.conflicts.length > 4 ? (
            <UiButton variant="ghost" type="button" aria-expanded={showAllConflicts} onClick={() => setShowAllConflicts((value) => !value)} className="min-h-11 self-start px-0 text-caption font-medium text-fw-warning-ink underline underline-offset-2">
              {showAllConflicts ? 'Show fewer overlaps' : `Show all ${conflicts.conflicts.length} overlaps (4 shown)`}
            </UiButton>
          ) : null}
        </>
      ) : null}
      {conflicts?.hasConflict && !conflicts.partial && conflicts.suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {conflicts.suggestions.slice(0, 3).map((slot, index) => (
            <UiButton key={index} variant="ghost" type="button" onClick={() => onSelectSuggestion(slot)} className={cn('min-h-11 rounded-full px-3.5 font-fw-mono text-caption tabular-nums text-text-primary', surfaces.float, surfaces.press)}>
              Try {slot.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </UiButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
