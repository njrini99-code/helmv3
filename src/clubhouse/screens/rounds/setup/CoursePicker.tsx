'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';
import { Modal } from '../../../ui/Modal';
import { TeeSwatch } from '../parts';
import { groupCourses, type ChResult, type ChSetupCourse, type ChSetupPorts, type ChSetupTee } from './shape';

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'failed'; error: string };

/** Runs a read, keeping only the latest answer (a slow first read never overwrites a newer one). */
function useRead<T>(read: (() => Promise<ChResult<T>>) | null) {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  const seq = useRef(0);
  const run = useCallback(() => {
    if (!read) return;
    const n = ++seq.current;
    setLoad({ state: 'loading' });
    read()
      .then((r) => n === seq.current && setLoad(r.ok ? { state: 'ok', data: r.data } : { state: 'failed', error: r.error }))
      .catch((e: unknown) => n === seq.current && setLoad({ state: 'failed', error: e instanceof Error ? e.message : String(e) }));
  }, [read]);
  useEffect(run, [run]);
  return [load, run] as const;
}

/**
 * CH-11510: where are you playing? A sheet with the course library (recently
 * played, team courses, the library; one Results list when searching) and,
 * once a course is chosen, its tees with length, rating and slope. "Add a
 * course" types one in by hand for this round (players can't add library
 * courses; Q-72h).
 */
export function CoursePicker({
  open,
  onClose,
  ports,
  initialCourse,
  onPick,
  onAddCourse,
}: {
  open: boolean;
  onClose: () => void;
  ports: Pick<ChSetupPorts, 'listCourses' | 'listTees'>;
  /** Open straight on this course's tees (Change tees). */
  initialCourse: ChSetupCourse | null;
  onPick: (course: ChSetupCourse, tee: ChSetupTee) => void;
  onAddCourse: () => void;
}) {
  const [course, setCourse] = useState<ChSetupCourse | null>(initialCourse);
  useEffect(() => {
    if (open) setCourse(initialCourse);
  }, [open, initialCourse]);
  return (
    <Modal open={open} onClose={onClose} title={course ? course.name : 'Where are you playing?'} description={course ? (course.place ?? undefined) : undefined} width={560} code="CH-11510">
      {open &&
        (course ? (
          <TeeList course={course} ports={ports} onBack={() => setCourse(null)} onPick={(t) => onPick(course, t)} />
        ) : (
          <CourseList ports={ports} onCourse={setCourse} onAddCourse={onAddCourse} />
        ))}
    </Modal>
  );
}

function CourseList({ ports, onCourse, onAddCourse }: { ports: Pick<ChSetupPorts, 'listCourses'>; onCourse: (c: ChSetupCourse) => void; onAddCourse: () => void }) {
  const [q, setQ] = useState('');
  const [load, retry] = useRead(ports.listCourses);
  const groups = load.state === 'ok' ? groupCourses(load.data, q) : [];
  return (
    <div className="ch-rs-pick">
      <label className="ch-rs-search">
        <Icon icon={Search} size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses" type="search" autoComplete="off" />
      </label>
      {load.state === 'loading' && (
        // CH-11403: the list is on its way, in the shape of its rows.
        <div className="ch-rs-plist" aria-busy="true" aria-label="Loading courses" data-ch-code="CH-11403">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ch-rs-crs is-skel ch-skel" />
          ))}
        </div>
      )}
      {load.state === 'failed' && (
        <InlineNotice code="CH-11209" title="The course library didn't load" body="Your round isn't started yet, so nothing is lost. Try again, or add the course by hand." onRetry={retry} />
      )}
      {groups.map((g) => (
        <section key={g.key} className="ch-rs-psec" aria-label={g.label}>
          <h4>
            {g.label}
            <span>{g.courses.length}</span>
          </h4>
          <div className="ch-rs-plist">
            {g.courses.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ch-rs-crs"
                onClick={() => {
                  haptic('select');
                  onCourse(c);
                }}
              >
                <span className="ch-rs-crs__ic" aria-hidden="true">
                  <Icon icon={MapPin} size={16} />
                </span>
                <span className="ch-rs-crs__b">
                  <b>{c.name}</b>
                  <span>{[c.place, c.par ? `Par ${c.par}` : null, c.teeCount ? `${c.teeCount} tee${c.teeCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                {c.lastPlayed && <span className="ch-rs-crs__r">{c.lastPlayed}</span>}
                <Icon icon={ChevronRight} size={16} className="ch-rs-chev" />
              </button>
            ))}
          </div>
        </section>
      ))}
      {load.state === 'ok' && !groups.length && (
        // CH-11310: nothing matches (or the library is empty).
        <p className="ch-rs-none" data-ch-code="CH-11310">
          {q.trim() ? `No courses match “${q.trim()}”. Check the spelling, or add it by hand.` : 'No courses yet. Add the one you’re playing.'}
        </p>
      )}
      <button type="button" className="ch-rs-add" onClick={onAddCourse}>
        <span aria-hidden="true">
          <Icon icon={Plus} size={16} />
        </span>
        <b>Add a course</b>
        <em>Enter its pars and yardages yourself</em>
      </button>
    </div>
  );
}

function TeeList({ course, ports, onBack, onPick }: { course: ChSetupCourse; ports: Pick<ChSetupPorts, 'listTees'>; onBack: () => void; onPick: (t: ChSetupTee) => void }) {
  const listTees = ports.listTees;
  const read = useCallback(() => listTees(course.id), [listTees, course.id]);
  const [load, retry] = useRead(read);
  const tees = load.state === 'ok' ? load.data : [];
  const longest = Math.max(1, ...tees.map((t) => t.yards ?? 0));
  return (
    <div className="ch-rs-pick">
      <button type="button" className="ch-rs-back" onClick={onBack}>
        <Icon icon={ChevronLeft} size={16} />
        Courses
      </button>
      <h4 className="ch-rs-teek">Choose your tees</h4>
      {load.state === 'loading' && (
        <div className="ch-rs-tees" aria-busy="true" aria-label="Loading tees" data-ch-code="CH-11404">
          {[0, 1, 2].map((i) => (
            <span key={i} className="ch-rs-tee is-skel ch-skel" />
          ))}
        </div>
      )}
      {load.state === 'failed' && <InlineNotice code="CH-11208" title={`The tees at ${course.name} didn't load`} body="Try again, or add the course by hand." onRetry={retry} />}
      {load.state === 'ok' && !tees.some((t) => !t.draft) && (
        <p className="ch-rs-none" data-ch-code="CH-11311">
          {course.name} has no tees ready to play yet. A coach can finish them in the course library; for now, add the course by hand.
        </p>
      )}
      {!!tees.length && (
        <div className="ch-rs-tees">
          {tees.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ch-rs-tee"
              disabled={t.draft}
              aria-label={`Play the ${t.name} tees${t.yards ? `, ${t.yards.toLocaleString('en-US')} yards` : ''}${t.draft ? ', not ready yet' : ''}`}
              onClick={() => {
                haptic('select');
                onPick(t);
              }}
            >
              <TeeSwatch color={t.color} />
              <span className="ch-rs-tee__b">
                <b>{t.name}</b>
                <span>{t.draft ? 'Not ready yet' : (t.category ?? `${t.holesCount} holes`)}</span>
              </span>
              <span className="ch-rs-tee__y">
                <b>{t.yards ? t.yards.toLocaleString('en-US') : '—'}</b>
                <em>yds</em>
              </span>
              <span className="ch-rs-tee__f">
                <span>
                  <em>Par</em>
                  {t.par ?? '—'}
                </span>
                <span>
                  <em>Rating</em>
                  {t.rating ?? '—'}
                </span>
                <span>
                  <em>Slope</em>
                  {t.slope ?? '—'}
                </span>
              </span>
              <span className="ch-rs-tee__bar" aria-hidden="true">
                <i style={{ width: `${((t.yards ?? 0) / longest) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
