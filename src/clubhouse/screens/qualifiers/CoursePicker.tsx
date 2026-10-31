'use client';

import { ChevronLeft, Clock, MapPin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { SearchField } from '../../ui/SearchField';
import { Skeleton } from '../../ui/States';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';
import { chReport } from '../../lib/track';
import type { ChQCourseOption, ChQTeeOption, ChQWrites } from './writes';

export interface ChQPickedCourse {
  courseId: string;
  courseName: string;
  teeId: string;
  teeName: string;
  par: number | null;
  /** Tee yardage, when the tees step had it ("Blue tees · 7,214 yds"). */
  yards?: number | null;
}

/**
 * P-5: what the picker gives back with its optional steps on. `courseId` null is a name typed by hand (`allowTyped`),
 * stored as a label, never as a new library row (owner call 5); `teeId` null is "Pick tees later" (`allowNoTee`).
 */
export interface ChQPickedLoose {
  courseId: string | null;
  courseName: string;
  teeId: string | null;
  teeName: string | null;
  par: number | null;
  yards?: number | null;
}

/**
 * Choose a round's course, then its tees, from the course library (the team's
 * saved courses first). Adding a course to the library stays in the course
 * pages; this only picks.
 */
export function CoursePicker({
  round,
  onClose,
  onPick,
  writes,
  title,
  allowNoTee = false,
  allowTyped = false,
  recentFirst = false,
  onPickLoose,
}: {
  /** The round being set, or null when closed. */
  round: number | null;
  onClose: () => void;
  onPick: (round: number, picked: ChQPickedCourse) => void;
  writes: Pick<ChQWrites, 'courses' | 'tees'>;
  /** The sheet's title in place of "Course for round N". */
  title?: string;
  /** P-5: a "Pick tees later" row at the top of the tees step (and on its error), which picks the course with no tee. */
  allowNoTee?: boolean;
  /** P-5: with no match, offer the typed words as the course name (CH-6340). */
  allowTyped?: boolean;
  /** P-5: with no search, the team's saved courses under "Recent", then "All courses". */
  recentFirst?: boolean;
  /** P-5: where a pick with no tee or a typed name goes; required with allowNoTee or allowTyped. */
  onPickLoose?: (round: number, picked: ChQPickedLoose) => void;
}) {
  const open = round != null;
  const [q, setQ] = useState('');
  const [courses, setCourses] = useState<ChQCourseOption[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);
  const [course, setCourse] = useState<ChQCourseOption | null>(null);
  const [tees, setTees] = useState<ChQTeeOption[] | null>(null);
  const [teesFailed, setTeesFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Which course's tees are being asked for: a slower answer for an earlier choice is dropped, so the tees under a
  // course's name are always that course's (owner rule 4: the last choice wins).
  const teesFor = useRef(0);

  useEffect(() => {
    if (!open) {
      teesFor.current++;
      setQ('');
      setCourse(null);
      setTees(null);
      setCourses(null);
      setCoursesFailed(false);
      setTeesFailed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || course) return;
    let live = true;
    const t = window.setTimeout(() => {
      setCoursesFailed(false);
      writes
        .courses(q)
        .then((list) => live && setCourses(list))
        .catch((err: unknown) => {
          chReport(err, { surface: 'qualifiers.picker', action: 'courses', severity: 'low' });
          if (live) setCoursesFailed(true);
        });
    }, q ? 250 : 0);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, course, q, writes, attempt]);

  const loadTees = useCallback(
    (c: ChQCourseOption) => {
      const mine = ++teesFor.current;
      setTees(null);
      setTeesFailed(false);
      writes
        .tees(c.id)
        .then((list) => {
          if (mine === teesFor.current) setTees(list);
        })
        .catch((err: unknown) => {
          chReport(err, { surface: 'qualifiers.picker', action: 'tees', severity: 'low' });
          if (mine === teesFor.current) setTeesFailed(true);
        });
    },
    [writes],
  );

  const chooseCourse = (c: ChQCourseOption) => {
    haptic('select');
    setCourse(c);
    loadTees(c);
  };

  return (
    <Modal open={open} onClose={onClose} width={520} icon={MapPin} title={title ?? (round ? `Course for round ${round}` : 'Course')} description={course ? course.name : 'Choose the course, then its tees.'}>
      <div className="ch-qf-picker">
        {!course ? (
          <>
            <SearchField value={q} onChange={setQ} placeholder="Search courses" label="Search courses" />
            {coursesFailed ? (
              <InlineNotice code="CH-09209" title="Courses didn’t load" body="Nothing was changed. Try again." onRetry={() => setAttempt((n) => n + 1)} />
            ) : courses == null ? (
              <div className="ch-qf-skel" role="status" aria-busy="true" aria-label="Loading courses" data-ch-code="CH-09407">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} width="100%" height={40} radius={9} />
                ))}
              </div>
            ) : courses.length === 0 && allowTyped && q.trim() ? (
              <EmptyState
                compact
                kind="filtered"
                code="CH-6340"
                title={`No courses match “${q.trim()}”`}
                body="Use the name as it is, or search again."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      haptic('select');
                      onPickLoose?.(round as number, { courseId: null, courseName: q.trim().slice(0, 120), teeId: null, teeName: null, par: null });
                    }}
                  >
                    {`Use “${q.trim().slice(0, 120)}” as the course name`}
                  </Button>
                }
              />
            ) : courses.length === 0 ? (
              <EmptyState compact kind={q.trim() ? 'filtered' : undefined} code="CH-09312" title={q.trim() ? `No courses match “${q.trim()}”.` : 'No courses in the library yet.'} body="Courses are added from the course library." />
            ) : (
              <div className="ch-qf-picker__list" role="list" aria-label="Courses">
                {(recentFirst && !q.trim() ? withHeads(courses) : courses.map((c) => ({ c, head: null as string | null }))).map(({ c, head }) => (
                  <div key={c.id} role="listitem">
                    {head && <p className="ch-qf-picker__head">{head}</p>}
                    <button type="button" className="ch-qf-picker__row" onClick={() => chooseCourse(c)}>
                      <span>
                        <b>{c.name}</b>
                        {c.place && <small>{c.place}</small>}
                      </span>
                      {c.par != null && <small>Par {c.par}</small>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={ChevronLeft}
                onClick={() => {
                  // Back to the list: whatever the tees read was going to say belongs to a choice that is no longer on screen.
                  teesFor.current++;
                  setCourse(null);
                }}
              >
                All courses
              </Button>
            </div>
            {allowNoTee && (
              <button
                type="button"
                className="ch-qf-picker__row"
                onClick={() => {
                  haptic('select');
                  onPickLoose?.(round as number, { courseId: course.id, courseName: course.name, teeId: null, teeName: null, par: course.par });
                }}
              >
                <Icon icon={Clock} size={18} />
                <span>
                  <b>Pick tees later</b>
                  <small>You can choose tees on the tournament desk.</small>
                </span>
              </button>
            )}
            {teesFailed ? (
              <InlineNotice code="CH-09210" title="Tees didn’t load" body="Nothing was changed. Try again." onRetry={() => loadTees(course)} />
            ) : tees == null ? (
              <div className="ch-qf-skel" role="status" aria-busy="true" aria-label="Loading tees" data-ch-code="CH-09407">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} width="100%" height={40} radius={9} />
                ))}
              </div>
            ) : tees.length === 0 ? (
              <EmptyState compact code="CH-09314" title="This course has no tee sets yet" body="Add its tees from the course library, or pick another course." />
            ) : (
              <div className="ch-qf-picker__list" role="list" aria-label="Tees">
                {tees.map((t) => (
                  <div key={t.id} role="listitem">
                    <button
                      type="button"
                      className="ch-qf-picker__row"
                      onClick={() => {
                        haptic('select');
                        onPick(round as number, { courseId: course.id, courseName: course.name, teeId: t.id, teeName: t.name, par: t.par, yards: t.yards });
                      }}
                    >
                      <span>
                        <b>{t.name}</b>
                        <small>{[t.par != null ? `Par ${t.par}` : null, t.yards ? `${t.yards.toLocaleString('en-US')} yards` : null, `${t.holes} holes`].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** "Recent" over the team's saved courses, then "All courses", for a list read with no search (`recentFirst`). */
function withHeads(list: ChQCourseOption[]): Array<{ c: ChQCourseOption; head: string | null }> {
  const firstAll = list.findIndex((c) => !c.saved);
  return list.map((c, i) => ({ c, head: i === 0 && c.saved ? 'Recent' : i === firstAll && firstAll > 0 ? 'All courses' : null }));
}
