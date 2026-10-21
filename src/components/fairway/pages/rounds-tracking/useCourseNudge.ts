'use client';

/**
 * The course nudge's state (CoachHelm Slice 8b). Owned by the round client
 * (New Round, Continue Round), because the same nudge shows in two places:
 * the shot screen at the round's start and the finish summary.
 *
 * Disabled (the flag is off), or the round already has a linked course, it
 * returns null: nothing is drawn and nothing changes.
 */

import { useCallback, useState } from 'react';

export interface CourseNudgeView {
  /** The course name the player typed, for the row's caption. */
  courseName: string;
  /** The course just linked here (the receipt), or null. */
  linkedName: string | null;
  onLink: (pick: { courseId: string; courseName: string }) => void;
  onSkip: () => void;
}

export function useCourseNudge({
  enabled,
  hasCourse,
  courseName,
  onLink,
}: {
  enabled: boolean;
  /** Whether the round already carries a course_id (read every render). */
  hasCourse: boolean;
  courseName: string;
  /** Hands the picked course to the round engine for its next update. */
  onLink: (courseId: string) => void;
}): CourseNudgeView | null {
  const [skipped, setSkipped] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const link = useCallback((pick: { courseId: string; courseName: string }) => {
    onLink(pick.courseId);
    setLinkedName(pick.courseName);
  }, [onLink]);
  const skip = useCallback(() => setSkipped(true), []);

  if (!enabled || skipped) return null;
  // Linked before this screen (a picked course, or a typed name the library
  // resolved): nothing to ask. Linked here: keep the receipt.
  if (hasCourse && linkedName === null) return null;
  return { courseName, linkedName, onLink: link, onSkip: skip };
}
