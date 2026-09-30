'use client';

import { ChevronLeft, MapPin } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { SearchField } from '../../ui/SearchField';
import { Skeleton } from '../../ui/States';
import { haptic } from '../../lib/haptics';
import { chReport } from '../../lib/track';
import type { ChQCourseOption, ChQTeeOption, ChQWrites } from './writes';

export interface ChQPickedCourse {
  courseId: string;
  courseName: string;
  teeId: string;
  teeName: string;
  par: number | null;
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
}: {
  /** The round being set, or null when closed. */
  round: number | null;
  onClose: () => void;
  onPick: (round: number, picked: ChQPickedCourse) => void;
  writes: Pick<ChQWrites, 'courses' | 'tees'>;
}) {
  const open = round != null;
  const [q, setQ] = useState('');
  const [courses, setCourses] = useState<ChQCourseOption[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);
  const [course, setCourse] = useState<ChQCourseOption | null>(null);
  const [tees, setTees] = useState<ChQTeeOption[] | null>(null);
  const [teesFailed, setTeesFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) {
      setQ('');
      setCourse(null);
      setTees(null);
      setCourses(null);
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
      setTees(null);
      setTeesFailed(false);
      writes
        .tees(c.id)
        .then(setTees)
        .catch((err: unknown) => {
          chReport(err, { surface: 'qualifiers.picker', action: 'tees', severity: 'low' });
          setTeesFailed(true);
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
    <Modal open={open} onClose={onClose} width={520} icon={MapPin} title={round ? `Course for round ${round}` : 'Course'} description={course ? course.name : 'Choose the course, then its tees.'}>
      <div className="ch-qf-picker">
        {!course ? (
          <>
            <SearchField value={q} onChange={setQ} placeholder="Search courses" label="Search courses" />
            {coursesFailed ? (
              <InlineNotice code="CH-09209" title="Courses didn’t load." body="Nothing was changed. Try again." onRetry={() => setAttempt((n) => n + 1)} />
            ) : courses == null ? (
              <div className="ch-qf-skel" aria-busy="true" aria-label="Loading courses" data-ch-code="CH-09407">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} width="100%" height={40} radius={9} />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <EmptyState compact code="CH-09312" title={q.trim() ? `No courses match “${q.trim()}”.` : 'No courses in the library yet.'} body="Courses are added from the course library." />
            ) : (
              <div className="ch-qf-picker__list" role="list" aria-label="Courses">
                {courses.map((c) => (
                  <div key={c.id} role="listitem">
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
              <Button size="sm" variant="ghost" leftIcon={ChevronLeft} onClick={() => setCourse(null)}>
                All courses
              </Button>
            </div>
            {teesFailed ? (
              <InlineNotice code="CH-09210" title="Tees didn’t load." body="Nothing was changed. Try again." onRetry={() => loadTees(course)} />
            ) : tees == null ? (
              <div className="ch-qf-skel" aria-busy="true" aria-label="Loading tees" data-ch-code="CH-09407">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} width="100%" height={40} radius={9} />
                ))}
              </div>
            ) : tees.length === 0 ? (
              <EmptyState compact code="CH-09314" title="This course has no tee sets yet." body="Add its tees from the course library, or pick another course." />
            ) : (
              <div className="ch-qf-picker__list" role="list" aria-label="Tees">
                {tees.map((t) => (
                  <div key={t.id} role="listitem">
                    <button
                      type="button"
                      className="ch-qf-picker__row"
                      onClick={() => {
                        haptic('select');
                        onPick(round as number, { courseId: course.id, courseName: course.name, teeId: t.id, teeName: t.name, par: t.par });
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
