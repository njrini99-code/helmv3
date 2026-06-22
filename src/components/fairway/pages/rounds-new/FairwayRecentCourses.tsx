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

import { useCallback, useState } from 'react';
import { MapPin, ArrowRight } from 'lucide-react';

import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Inset } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { triggerHaptic } from '@/lib/utils/capacitor';
import type { RecentPlayedCourse } from '@/app/golf/actions/golf';

export interface FairwayRecentCoursesProps {
  /** Recent courses, already enriched with round counts. Empty array hides the rail. */
  courses: RecentPlayedCourse[];
  /** Called when the player confirms a course in the sheet. Parent pre-fills setup. */
  onConfirmCourse: (course: RecentPlayedCourse) => void;
}

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
  const [pending, setPending] = useState<RecentPlayedCourse | null>(null);

  // Cap at 8 to keep the rail scannable (the action already caps; this is defensive).
  const visible = courses.slice(0, 8);

  const onTap = useCallback((c: RecentPlayedCourse) => {
    triggerHaptic('light');
    setPending(c);
  }, []);

  const onConfirm = useCallback(() => {
    setPending((c) => {
      if (c) {
        triggerHaptic('medium');
        // Close first so the unmount-anim runs before the parent transitions step.
        onConfirmCourse(c);
      }
      return null;
    });
  }, [onConfirmCourse]);

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
              <button
                type="button"
                onClick={() => onTap(c)}
                aria-label={`Start new round at ${c.courseName}`}
                className="group flex h-full w-[190px] flex-col gap-2 rounded-fw-md border border-border-subtle bg-surface p-3.5 text-left shadow-flat transition-colors hover:border-accent-500 hover:bg-accent-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-surface-sunken text-text-tertiary transition-colors group-hover:bg-accent-100 group-hover:text-accent-700">
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  {c.roundCount > 0 && (
                    <span className="truncate font-fw-mono text-eyebrow tabular-nums text-text-tertiary transition-colors group-hover:text-accent-700">
                      {c.roundCount} {c.roundCount === 1 ? 'round' : 'rounds'}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 font-fw-sans text-body-sm font-medium leading-tight text-text-primary">
                  {c.courseName}
                </p>
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
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={pending ? `Start a new round at ${pending.courseName}?` : 'Start a new round?'}
        description={pending ? subtitle(pending) : undefined}
      >
        {pending && (
          <>
            <Sheet.Body>
              <Inset padding="md">
                <dl className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">Tees</dt>
                    <dd className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary">
                      {pending.teesPlayed ?? '—'}
                    </dd>
                  </div>
                  <div className="border-x border-border-subtle">
                    <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">Holes</dt>
                    <dd className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary">
                      {pending.holesPerRound}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">Played</dt>
                    <dd className="mt-1 font-fw-sans text-body-sm font-medium tabular-nums text-text-primary">
                      {pending.roundCount > 0 ? `${pending.roundCount}×` : 'New'}
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

export default FairwayRecentCourses;
