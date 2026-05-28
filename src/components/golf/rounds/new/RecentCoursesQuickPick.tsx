'use client';

/**
 * RecentCoursesQuickPick — quick-pick tile grid that lets a player jump
 * straight into a new round at a course they've played before.
 *
 * Lives at the very top of the New Round setup step, ABOVE the manual
 * course-search / new-course form. A tap on any tile opens a vaul-backed
 * confirmation drawer ("Start a new round at {course}?") with a primary
 * "Start round" CTA. Confirming hands the selected course back to the
 * parent so the existing setup flow can pre-fill itself with that course.
 *
 * The tile grid is suppressed entirely when the player has no recent
 * courses — never render an empty section.
 *
 * Visual recipe:
 *   - 2 cols on mobile, 3 cols at sm:, 4 cols at md:
 *   - surface-matte plinth + surface-tile-hover for the lift/border-glow
 *   - editorial Eyebrow ("RECENT") with primary accent dot
 *   - small Geist sans title beneath: "Pick up where you left off"
 */

import { useState, useCallback } from 'react';
import { Eyebrow } from '@/components/ui/page-header';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { IconMapPin, IconArrowRight } from '@/components/icons';
import type { RecentPlayedCourse } from '@/app/golf/actions/golf';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface RecentCoursesQuickPickProps {
  /** The player's recent courses, already enriched with round counts. Empty array hides the section. */
  courses: RecentPlayedCourse[];
  /** Called when the player confirms a course in the drawer. Parent should pre-fill setup state. */
  onConfirmCourse: (course: RecentPlayedCourse) => void;
}

export function RecentCoursesQuickPick({
  courses,
  onConfirmCourse,
}: RecentCoursesQuickPickProps) {
  const [pendingCourse, setPendingCourse] = useState<RecentPlayedCourse | null>(null);

  // Cap at 8 so the grid stays scannable. The action already caps to 8 by default,
  // but the slice here is defensive — never blow past the design grid.
  const visible = courses.slice(0, 8);

  const handleTileTap = useCallback((course: RecentPlayedCourse) => {
    triggerHaptic('light');
    setPendingCourse(course);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!pendingCourse) return;
    triggerHaptic('medium');
    const course = pendingCourse;
    // Close the drawer first so the unmount-anim can run before the parent
    // tears down this section by transitioning to the next step.
    setPendingCourse(null);
    onConfirmCourse(course);
  }, [pendingCourse, onConfirmCourse]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Recently played courses"
      className="rounded-3xl surface-matte p-5 sm:p-6"
    >
      {/* Editorial header */}
      <header className="mb-4">
        <Eyebrow accent="primary">Recent</Eyebrow>
        <h2 className="mt-2 font-serif text-h3 sm:text-h2 font-medium tracking-[-0.015em] text-warm-900">
          Pick up where you left off
        </h2>
        <p className="mt-1 text-body-sm text-warm-500">
          Tap a course to start a new round there.
        </p>
      </header>

      {/* Tile grid */}
      <ul
        role="list"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4"
      >
        {visible.map((course) => {
          const location = formatLocation(course);
          return (
            <li key={course.id}>
              <button
                type="button"
                onClick={() => handleTileTap(course)}
                aria-label={`Start new round at ${course.courseName}`}
                className="surface-matte surface-tile-hover group relative flex h-full w-full flex-col items-start gap-1 overflow-hidden rounded-2xl border border-warm-200/45 p-3.5 text-left active-scale focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                {/* Round-count badge — top-right corner */}
                {course.roundCount > 0 && (
                  <span
                    className="absolute right-2.5 top-2.5 inline-flex items-center rounded-full bg-warm-100/85 px-1.5 py-0.5 text-eyebrow font-medium tabular-nums tracking-tight text-warm-600 group-hover:bg-primary-50 group-hover:text-primary-700"
                    aria-label={`${course.roundCount} rounds played`}
                  >
                    {course.roundCount}{' '}
                    <span className="ml-0.5 text-warm-400 group-hover:text-primary-500">
                      {course.roundCount === 1 ? 'round' : 'rounds'}
                    </span>
                  </span>
                )}

                {/* Course name */}
                <p className="mt-0.5 line-clamp-2 max-w-[90%] text-body-sm font-medium leading-tight tracking-[-0.005em] text-warm-900">
                  {course.courseName}
                </p>

                {/* Location */}
                {location && (
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-caption leading-tight text-warm-500">
                    <IconMapPin
                      size={11}
                      className="flex-shrink-0 text-warm-400"
                    />
                    <span className="truncate">{location}</span>
                  </span>
                )}
                {!location && (
                  <span className="mt-auto pt-2 text-caption text-warm-400">
                    {course.teesPlayed ? `${course.teesPlayed} tees` : '—'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Confirmation drawer — "Start a new round at {course}?" */}
      <Drawer
        open={pendingCourse !== null}
        onOpenChange={(next) => {
          if (!next) setPendingCourse(null);
        }}
      >
        <DrawerContent className="sm:mx-auto sm:max-w-md sm:rounded-3xl">
          {pendingCourse && (
            <>
              <DrawerHeader>
                <DrawerTitle>
                  Start a new round at {pendingCourse.courseName}?
                </DrawerTitle>
                <DrawerDescription>
                  {buildSubtitle(pendingCourse)}
                </DrawerDescription>
              </DrawerHeader>

              <div className="px-6 pb-2">
                {/* Quick stats strip — shows what we'll pre-fill */}
                <dl className="grid grid-cols-3 gap-3 rounded-2xl border border-warm-200/45 bg-cream-100/65 px-4 py-3 text-center">
                  <div>
                    <dt className="text-eyebrow uppercase tracking-[0.12em] text-warm-400">
                      Tees
                    </dt>
                    <dd className="mt-1 text-body-sm font-medium text-warm-900">
                      {pendingCourse.teesPlayed ?? '—'}
                    </dd>
                  </div>
                  <div className="border-x border-warm-200/45">
                    <dt className="text-eyebrow uppercase tracking-[0.12em] text-warm-400">
                      Holes
                    </dt>
                    <dd className="mt-1 text-body-sm font-medium text-warm-900">
                      {pendingCourse.holesPerRound}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-eyebrow uppercase tracking-[0.12em] text-warm-400">
                      Played
                    </dt>
                    <dd className="mt-1 text-body-sm font-medium text-warm-900 tabular-nums">
                      {pendingCourse.roundCount > 0
                        ? `${pendingCourse.roundCount}×`
                        : 'New'}
                    </dd>
                  </div>
                </dl>
              </div>

              <DrawerFooter>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-body font-medium text-white shadow-sm transition-colors duration-150 hover:bg-primary-700 active:bg-primary-800 active-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                >
                  Start round
                  <IconArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingCourse(null)}
                  className="w-full rounded-xl px-4 py-2.5 text-body-sm font-medium text-warm-500 transition-colors hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                >
                  Cancel
                </button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function formatLocation(course: RecentPlayedCourse): string {
  const parts = [course.courseCity, course.courseState].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.join(', ');
}

function buildSubtitle(course: RecentPlayedCourse): string {
  const location = formatLocation(course);
  const playedFragment =
    course.roundCount > 0
      ? `played ${course.roundCount} time${course.roundCount === 1 ? '' : 's'}`
      : 'first round here';
  if (location) {
    return `${location} · ${playedFragment}`;
  }
  return playedFragment.charAt(0).toUpperCase() + playedFragment.slice(1);
}
