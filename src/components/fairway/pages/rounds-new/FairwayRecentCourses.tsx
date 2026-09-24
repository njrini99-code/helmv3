'use client';

/**
 * ============================================================================
 * Fairway · Rounds-new · FairwayRecentCourses — quick-pick recent-course rail
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy RecentCoursesQuickPick. Sits just under the
 * dark cockpit band on the New Round setup step and lets a player jump straight
 * back into a course they've played. Deliberately the LIGHTEST element on the
 * page (a quiet shortcut, not a form section): a borderless horizontal rail of
 * compact tiles on the cream canvas — no heavy plinth competing with the lifted
 * form cards below it. Green-on-hover ties into the green-as-structure system.
 *
 * Tapping a tile opens a Fairway bottom Sheet ("Start a new round at {course}?")
 * with a sunken stats well (what we'll pre-fill) + Start/Cancel. Confirming
 * hands the course back to the parent verbatim — same contract + haptics as the
 * legacy component, so the setup flow pre-fills exactly as before.
 *
 * Presentation only; suppressed entirely when the player has no recent courses.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, ArrowRight } from 'lucide-react';

import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Inset } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { formatCourseName } from '@/components/golf/courses/CourseImage';
import type { RecentPlayedCourse } from '@/app/golf/actions/golf';

export interface FairwayRecentCoursesProps {
  /** Recent courses, already enriched with round counts. Empty array hides the rail. */
  courses: RecentPlayedCourse[];
  /** Called when the player confirms a course in the sheet. Parent pre-fills setup. */
  onConfirmCourse: (course: RecentPlayedCourse) => void;
}

/**
 * How long the confirm sheet takes to leave: vaul's exit slide (~500ms,
 * `cubic-bezier(0.32, 0.72, 0, 1)`). The parent's confirm handler advances the
 * round step, which unmounts this whole setup screen — sheet included — so it
 * must not run until the sheet is gone, or the sheet vanishes mid-slide and the
 * tracking screen hard-cuts in. Under reduced motion the global CSS collapses
 * vaul's transition to ~0, so the hand-off is immediate.
 */
export const QUICK_PICK_EXIT_MS = 500;

function fmtLoc(c: RecentPlayedCourse): string {
  return [c.courseCity, c.courseState].filter((p): p is string => Boolean(p && p.trim())).join(', ');
}

function subtitle(c: RecentPlayedCourse): string {
  const loc = fmtLoc(c);
  const played =
    c.roundCount > 0 ? `played ${c.roundCount} time${c.roundCount === 1 ? '' : 's'}` : 'first round here';
  return loc ? `${loc} · ${played}` : played.charAt(0).toUpperCase() + played.slice(1);
}

export function FairwayRecentCourses({ courses, onConfirmCourse }: FairwayRecentCoursesProps) {
  const reduceMotion = useReducedMotionGuard();
  const [pending, setPending] = useState<RecentPlayedCourse | null>(null);
  // The course the sheet last showed. `open` follows `pending`, but the title
  // and body render from this so the closing sheet keeps its content for the
  // whole exit instead of collapsing to an empty "Start a new round?" shell.
  const [shown, setShown] = useState<RecentPlayedCourse | null>(null);
  // Set between "Start round" and the deferred hand-off: blocks a double tap
  // and a rail tap that would reopen a sheet about to be torn down.
  const confirmingRef = useRef(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onConfirmRef = useRef(onConfirmCourse);
  useEffect(() => {
    onConfirmRef.current = onConfirmCourse;
  }, [onConfirmCourse]);

  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  }, []);

  // Cap at 8 to keep the rail scannable (the action already caps; this is defensive).
  const visible = courses.slice(0, 8);

  const onTap = useCallback((c: RecentPlayedCourse) => {
    if (confirmingRef.current) return;
    triggerHaptic('light');
    setShown(c);
    setPending(c);
  }, []);

  const onConfirm = useCallback(() => {
    const c = pending;
    if (!c || confirmingRef.current) return;
    confirmingRef.current = true;
    triggerHaptic('medium');
    // Close first. The parent is called from the handler (never from inside a
    // state updater) and only after the sheet's exit has finished.
    setPending(null);
    confirmTimerRef.current = setTimeout(() => {
      confirmTimerRef.current = null;
      confirmingRef.current = false;
      onConfirmRef.current(c);
    }, reduceMotion ? 0 : QUICK_PICK_EXIT_MS);
  }, [pending, reduceMotion]);

  if (visible.length === 0) return null;

  return (
    <section aria-label="Recently played courses" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-0.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-500" />
        <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-text-tertiary">
          Pick up where you left off
        </p>
      </div>

      <ul className="scrollbar-hide -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {visible.map((c) => {
          const loc = fmtLoc(c);
          return (
            <li key={c.id} className="flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onTap(c)}
                aria-label={`Start new round at ${formatCourseName(c.courseName)}`}
                className="group block h-full min-h-0 w-[190px] rounded-fw-md border border-border-subtle bg-surface p-3.5 text-left font-normal shadow-flat transition-colors hover:border-accent-500 hover:bg-accent-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
              >
                <span className="flex h-full w-full flex-col gap-2">
                  <span className="flex items-start justify-between gap-2">
                    <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-surface-sunken text-text-tertiary transition-colors group-hover:bg-accent-100 group-hover:text-accent-700">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    {c.roundCount > 0 && (
                      <span className="truncate font-fw-mono text-eyebrow tabular-nums text-text-tertiary transition-colors group-hover:text-accent-700">
                        {c.roundCount} {c.roundCount === 1 ? 'round' : 'rounds'}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 block font-fw-sans text-body-sm font-medium leading-tight text-text-primary">
                    {formatCourseName(c.courseName)}
                  </span>
                  <span className="mt-auto flex items-center gap-1 truncate font-fw-sans text-caption text-text-tertiary">
                    {loc ? (
                      <>
                        <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden />
                        <span className="truncate">{loc}</span>
                      </>
                    ) : (
                      <span>{c.teesPlayed ? `${c.teesPlayed} tees` : '—'}</span>
                    )}
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={shown ? `Start a new round at ${formatCourseName(shown.courseName)}?` : 'Start a new round?'}
        description={shown ? subtitle(shown) : undefined}
      >
        {shown && (
          <>
            <Sheet.Body>
              <Inset padding="md">
                <dl className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">Tees</dt>
                    <dd className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary">
                      {shown.teesPlayed ?? '—'}
                    </dd>
                  </div>
                  <div className="border-x border-border-subtle">
                    <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">Holes</dt>
                    <dd className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary">
                      {shown.holesPerRound}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">Played</dt>
                    <dd className="mt-1 font-fw-sans text-body-sm font-medium tabular-nums text-text-primary">
                      {shown.roundCount > 0 ? `${shown.roundCount}×` : 'New'}
                    </dd>
                  </div>
                </dl>
              </Inset>
            </Sheet.Body>
            <Sheet.Footer>
              <Button variant="secondary" type="button" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={onConfirm}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Start round
              </Button>
            </Sheet.Footer>
          </>
        )}
      </Sheet>
    </section>
  );
}
