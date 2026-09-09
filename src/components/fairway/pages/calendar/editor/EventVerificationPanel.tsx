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
import { AlertTriangle, Check, LoaderCircle } from 'lucide-react';
import { Button as UiButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

  return (
    <div
      data-state={state}
      className={cn(
        'rounded-fw-md border p-3 font-fw-sans text-caption',
        conflicts?.hasConflict || conflicts?.partial || status === 'error'
          ? 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink'
          : 'border-border-subtle bg-surface-sunken text-text-secondary',
      )}
    >
      <p role="status" className="flex items-center gap-2 font-medium">
        {status === 'checking' ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> :
          conflicts?.hasConflict || conflicts?.partial || status === 'error'
            ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        {status === 'checking' ? 'Checking Helm schedules…' :
          status === 'error' ? 'Schedules not verified. The check could not finish.' :
          conflicts?.partial ? 'Schedules partially checked. Some availability is not verified.' :
          conflicts?.hasConflict ? 'Schedule conflicts' : 'No conflicts found in checked Helm schedules.'}
      </p>
      {status === 'error' || conflicts?.partial ? (
        <UiButton
          variant="ghost"
          type="button"
          onClick={() => {
            if (attendeeHydrationError) onRetryAttendees();
            else onRetryConflicts();
          }}
          className="mt-1 min-h-11 px-0 text-caption font-medium text-fw-warning-ink underline underline-offset-2"
        >
          Check again
        </UiButton>
      ) : null}
      {conflicts && conflicts.conflicts.length > 0 ? (
        <>
          <p className="mt-2">{conflicts.conflicts.length} overlaps · {new Set(conflicts.conflicts.map((conflict) => conflict.userId)).size} people affected</p>
          <ul className="mt-2 flex flex-col gap-2">
            {(showAllConflicts ? conflicts.conflicts : conflicts.conflicts.slice(0, 4)).map((conflict, index) => (
              <li key={`${conflict.userId}-${index}`}>
                <p className="font-medium">{conflict.userName} — {conflict.conflictingEvent.title}</p>
                <p className="mt-0.5 tabular-nums">{formatConflictInterval(conflict.conflictingEvent.start, conflict.conflictingEvent.end)} · {conflict.conflictingEvent.type === 'class' ? 'Class' : conflict.conflictingEvent.type === 'blocked' ? 'Blocked time' : 'Event'}</p>
              </li>
            ))}
          </ul>
          {conflicts.conflicts.length > 4 ? (
            <UiButton variant="ghost" type="button" aria-expanded={showAllConflicts} onClick={() => setShowAllConflicts((value) => !value)} className="mt-1 min-h-11 px-0 text-caption font-medium text-fw-warning-ink underline underline-offset-2">
              {showAllConflicts ? 'Show fewer overlaps' : `Show all ${conflicts.conflicts.length} overlaps (4 shown)`}
            </UiButton>
          ) : null}
        </>
      ) : null}
      {conflicts?.hasConflict && !conflicts.partial && conflicts.suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {conflicts.suggestions.slice(0, 3).map((slot, index) => (
            <UiButton key={index} variant="ghost" type="button" onClick={() => onSelectSuggestion(slot)} className="min-h-11 rounded-fw-sm border border-border-subtle bg-surface px-3 font-fw-mono text-caption tabular-nums text-text-secondary">
              Try {slot.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </UiButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
