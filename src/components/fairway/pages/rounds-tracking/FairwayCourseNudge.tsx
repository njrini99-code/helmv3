'use client';

/**
 * Fairway · Rounds · Tracking — the course nudge (CoachHelm supercharge
 * Slice 8b, design 01 row 10).
 *
 * A round with no linked course (the player typed a name the course library
 * did not resolve) cannot feed a course plan, hole history or a same-day
 * field read. One compact row, "Link this round to a course", with a Link
 * button that opens the existing course picker and a Skip. Never blocking:
 * the screen's primary action is untouched. The pick links the course only;
 * the round's pars and yardages stay as entered. The picker is loaded on the
 * first tap, so a round that never shows the row never downloads it.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/fairway/controls/button';
import type { TeeRoundDefaults } from '@/app/golf/actions/course-library';
import type { CourseNudgeView } from './useCourseNudge';

const FairwayCoursePicker = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayCoursePicker').then((m) => m.FairwayCoursePicker),
  { ssr: false },
);

export function FairwayCourseNudge({ nudge }: { nudge: CourseNudgeView | null }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoaded, setPickerLoaded] = useState(false);
  if (!nudge) return null;
  const { linkedName, courseName } = nudge;
  const open = () => {
    setPickerLoaded(true);
    setPickerOpen(true);
  };
  return (
    <section
      aria-label="Link this round to a course"
      data-slot="course-nudge"
      className="mb-3 rounded-fw-md border border-border-subtle bg-surface px-4 py-3 shadow-flat"
    >
      {linkedName === null ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 font-fw-sans text-sm font-medium text-text-primary">
              Link this round to a course
            </p>
            <Button variant="ghost" size="sm" onClick={nudge.onSkip} aria-label="Skip linking a course">
              Skip
            </Button>
          </div>
          <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
            {courseName ? `"${courseName}" isn't in the course library yet. ` : ''}
            Linked rounds build your hole history and course plans.
          </p>
          <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={open}>
            Pick the course
          </Button>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="min-w-0 font-fw-sans text-sm text-text-primary">
            Linked to <span className="font-medium">{linkedName}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={open}>
            Change
          </Button>
        </div>
      )}
      {pickerLoaded && (
        <FairwayCoursePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={(defaults: TeeRoundDefaults) => nudge.onLink({ courseId: defaults.courseId, courseName: defaults.courseName })}
        />
      )}
    </section>
  );
}
