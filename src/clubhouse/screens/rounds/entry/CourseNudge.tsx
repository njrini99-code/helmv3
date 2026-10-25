'use client';

import { useCallback, useMemo, useState } from 'react';
import { CoursePicker } from '../setup/CoursePicker';
import type { ChSetupCourse, ChSetupPorts } from '../setup/shape';
import { AskRow } from '../track/DataPrompts';
import { Button } from '../../../ui/Button';

/** CH-11962: the course nudge, as the round screen owns it. */
export interface ChCourseNudgeView {
  /** The course name the player typed, for the caption. */
  courseName: string;
  /** The course just linked here (the receipt), or null while it asks. */
  linkedName: string | null;
  onLink: (pick: { courseId: string; courseName: string }) => void;
  onSkip: () => void;
}

/**
 * The course nudge's state (CoachHelm Slice 8b, `coachhelm_data_prompts_v2`), owned by the round screen (New round, Continue
 * round) because one nudge shows in two places: the shot screen at the round's start and the Round complete sheet. Off, or
 * the round already has a library course: null, and nothing is drawn or changed.
 */
export function useChCourseNudge({
  enabled,
  hasCourse,
  courseName,
  onLink,
}: {
  enabled: boolean;
  /** The round already carries a course_id (read on every render). */
  hasCourse: boolean;
  courseName: string;
  /** Hands the picked course to the round engine, which sends it with the round's next update. */
  onLink: (courseId: string) => void;
}): ChCourseNudgeView | null {
  const [skipped, setSkipped] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const link = useCallback(
    (pick: { courseId: string; courseName: string }) => {
      onLink(pick.courseId);
      setLinkedName(pick.courseName);
    },
    [onLink],
  );
  const skip = useCallback(() => setSkipped(true), []);
  if (!enabled || skipped) return null;
  // Linked before this screen (a picked course, or a typed name the library resolved): nothing to ask. Linked here: the receipt.
  if (hasCourse && linkedName === null) return null;
  return { courseName, linkedName, onLink: link, onSkip: skip };
}

/** The library course a picker card stands for: a saved course's linked course, or none (it cannot be linked). */
export function linkableCourseId(c: ChSetupCourse): string | null {
  return c.saved ? c.saved.courseId : c.id;
}

/**
 * CH-11962: a round with no library course (a course typed by hand) cannot feed a course plan or hole history. One row,
 * "Link this round to a course", at the first hole before its first shot and in the Round complete sheet: Pick the course
 * opens the course picker (the library only: no Add), and the pick goes to the server as the round's course with its next
 * update. The round's pars and yardages stay as entered. Skip hides it for the round. The picker is mounted on the first tap.
 */
export function CourseNudge({ nudge, ports, sheet = false }: { nudge: ChCourseNudgeView; ports: Pick<ChSetupPorts, 'listCourses' | 'listTees'>; sheet?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // A saved course with no library course behind it cannot be linked, so the picker does not offer it.
  const libraryPorts = useMemo<Pick<ChSetupPorts, 'listCourses' | 'listTees'>>(
    () => ({
      listCourses: async () => {
        const res = await ports.listCourses();
        return res.ok ? { ok: true, data: res.data.filter((c) => linkableCourseId(c) !== null) } : res;
      },
      listTees: ports.listTees,
    }),
    [ports],
  );
  const pick = () => {
    setMounted(true);
    setOpen(true);
  };
  const { linkedName, courseName } = nudge;
  return (
    <>
      <AskRow
        code="CH-11962"
        label={linkedName === null ? 'Link this round to a course' : `Linked to ${linkedName}`}
        onSkip={linkedName === null ? nudge.onSkip : undefined}
        skipLabel="Skip linking a course"
        sheet={sheet}
        line={linkedName === null ? `${courseName.trim() ? `“${courseName.trim()}” isn’t linked to the course library. ` : ''}Linked rounds build your hole history and course plans.` : `It saves ${sheet ? 'when you post the round' : 'with your next shot'}. Your pars and yardages stay as you entered them.`}
      >
        <Button size="sm" className="ch-rt-ask__go" onClick={pick}>
          {linkedName === null ? 'Pick the course' : 'Change'}
        </Button>
      </AskRow>
      {mounted && (
        <CoursePicker
          open={open}
          onClose={() => setOpen(false)}
          ports={libraryPorts}
          initialCourse={null}
          onPick={(course) => {
            const courseId = linkableCourseId(course);
            if (courseId) nudge.onLink({ courseId, courseName: course.name });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
