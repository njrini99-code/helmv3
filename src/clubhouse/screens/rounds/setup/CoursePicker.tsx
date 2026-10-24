'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Plus, Search } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import { useChPhone } from '../../../lib/use-phone';
import { Icon } from '../../../ui/Icon';
import { Button } from '../../../ui/Button';
import { InlineNotice } from '../../../ui/Notices';
import { Modal } from '../../../ui/Modal';
import { TeeSwatch } from '../parts';
import { groupCourses, type ChResult, type ChSetupCourse, type ChSetupPorts, type ChSetupTee } from './shape';
import { BackLink } from '../../../ui/Section';
import { plural } from '../../../lib/plural';

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
  /** Types a course in by hand. Without it (the course nudge links a library course only) the head has no Add. */
  onAddCourse?: () => void;
}) {
  const [course, setCourse] = useState<ChSetupCourse | null>(initialCourse);
  const phone = useChPhone();
  useEffect(() => {
    if (open) setCourse(initialCourse);
  }, [open, initialCourse]);
  // A course's tees are asked for as a hand reaches its card (hover, focus, press), so they are usually there by the
  // click, and the tee list opens on them instead of on a wait (owner, 2026-10-16: no shimmer after picking a course).
  // Kept while the picker is open; a fresh open asks again.
  const tees = useRef(new Map<string, Promise<ChResult<ChSetupTee[]>>>());
  useEffect(() => {
    if (open) tees.current.clear();
  }, [open]);
  const listTees = ports.listTees;
  const teesFor = useCallback(
    (id: string) => {
      let p = tees.current.get(id);
      if (!p) {
        p = listTees(id);
        // A failed read is not kept: Try again asks the server again.
        p.then((r) => !r.ok && tees.current.delete(id)).catch(() => tees.current.delete(id));
        tees.current.set(id, p);
      }
      return p;
    },
    [listTees],
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={course ? course.name : 'Where are you playing?'}
      description={course ? (course.place ?? undefined) : undefined}
      width={880}
      code="CH-11510"
      // Typing a course in is in the head's corner, always in reach (owner, 2026-10-16), not under the whole library.
      action={
        course || !onAddCourse ? undefined : (
          // The phone head says "Add" so the title stays on one line at 390; the name stays whole.
          <Button size="sm" leftIcon={Plus} aria={{ label: 'Add a course' }} onClick={onAddCourse}>
            {phone ? 'Add' : 'Add a course'}
          </Button>
        )
      }
    >
      {open &&
        (course ? (
          <TeeList course={course} listTees={teesFor} onBack={() => setCourse(null)} onPick={(t) => onPick(course, t)} canAdd={!!onAddCourse} />
        ) : (
          <CourseList ports={ports} onCourse={setCourse} onReach={teesFor} canAdd={!!onAddCourse} />
        ))}
    </Modal>
  );
}

function CourseList({
  ports,
  onCourse,
  onReach,
  canAdd,
}: {
  ports: Pick<ChSetupPorts, 'listCourses'>;
  onCourse: (c: ChSetupCourse) => void;
  /** A hand is on its way to this course's card: its tees are fetched ahead. */
  onReach: (courseId: string) => unknown;
  /** Add a course is offered, so the notices may point to it. */
  canAdd: boolean;
}) {
  const [q, setQ] = useState('');
  const [load, retry] = useRead(ports.listCourses);
  const groups = load.state === 'ok' ? groupCourses(load.data, q) : [];
  return (
    <div className="ch-rsu-pick">
      <label className="ch-rsu-search">
        <Icon icon={Search} size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses" type="search" autoComplete="off" />
      </label>
      {load.state === 'loading' && (
        // CH-11403: the list is on its way, in the shape of its cards.
        <div className="ch-cpk-list" role="status" aria-busy="true" aria-label="Loading courses" data-ch-code="CH-11403">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="ch-cpk is-skel">
              <span className="ch-cpk__media" />
              <span className="ch-cpk__b">
                <i />
                <i />
              </span>
            </span>
          ))}
        </div>
      )}
      {load.state === 'failed' && (
        <InlineNotice code="CH-11209" title="The course library didn’t load" body={canAdd ? 'Your round isn’t started yet, so nothing is lost. Try again, or add the course by hand.' : 'Nothing was changed. Try again in a moment.'} onRetry={retry} />
      )}
      {groups.map((g) => {
        return (
          <section key={g.key} className="ch-rsu-psec" aria-label={g.label}>
            <h4>
              {g.label}
              <span>{g.courses.length}</span>
            </h4>
            {/* Photo cards that fold back as they leave the list's top and unfold as they come up from its bottom
                (rounds-setup.css, a scroll-driven animation on the compositor; still with reduced motion or Animations off). */}
            <div className="ch-cpk-list">
              {g.courses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="ch-cpk"
                  onPointerEnter={() => onReach(c.id)}
                  onPointerDown={() => onReach(c.id)}
                  onFocus={() => onReach(c.id)}
                  onClick={() => {
                    haptic('select');
                    onCourse(c);
                  }}
                >
                  <span className="ch-cpk__card">
                    {/* The course's own photo (one its team uploaded, or the real course's), never a stand-in scene: a
                        course without one is a quiet tile with the flag (owner, 2026-10-16). */}
                    <CourseMedia image={c.image} />
                    <span className="ch-cpk__row">
                      <span className="ch-cpk__b">
                        <b>{c.name}</b>
                        {c.place && <span>{c.place}</span>}
                      </span>
                      <span className="ch-cpk__meta ch-num">
                        {[c.lastPlayed, c.par ? `Par ${c.par}` : null, c.teeCount ? plural(c.teeCount, 'tee') : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {load.state === 'ok' && !groups.length && (
        // CH-11310: nothing matches (or the library is empty).
        <p className="ch-rsu-none" data-ch-code="CH-11310">
          {q.trim() ? `No courses match “${q.trim()}”. Check the spelling${canAdd ? ', or use Add a course' : ''}.` : canAdd ? 'No courses yet. Use Add a course for the one you’re playing.' : 'No courses in the library yet.'}
        </p>
      )}
    </div>
  );
}

function TeeList({ course, listTees, onBack, onPick, canAdd }: { course: ChSetupCourse; listTees: (courseId: string) => Promise<ChResult<ChSetupTee[]>>; onBack: () => void; onPick: (t: ChSetupTee) => void; canAdd: boolean }) {
  const read = useCallback(() => listTees(course.id), [listTees, course.id]);
  const [load, retry] = useRead(read);
  const tees = load.state === 'ok' ? load.data : [];
  const longest = Math.max(1, ...tees.map((t) => t.yards ?? 0));
  return (
    <div className="ch-rsu-pick">
      <BackLink onClick={onBack}>Courses</BackLink>
      <h4 className="ch-rsu-teek">Choose your tees</h4>
      {load.state === 'loading' && (
        // The tees on their way: a quiet space the height of a tee, no shimmer (owner, 2026-10-16). Usually never seen,
        // as the tees were asked for when the hand reached the course's card.
        <div className="ch-rsu-tees" role="status" aria-busy="true" aria-label="Loading tees" data-ch-code="CH-11404">
          <span className="ch-rsu-tee-wait" />
        </div>
      )}
      {load.state === 'failed' && <InlineNotice code="CH-11208" title={`The tees at ${course.name} didn’t load`} body={canAdd ? 'Try again, or add the course by hand.' : 'Try again in a moment.'} onRetry={retry} />}
      {load.state === 'ok' && !tees.some((t) => !t.draft) && (
        <p className="ch-rsu-none" data-ch-code="CH-11311">
          {course.name} has no tees ready to play yet. A coach can finish them in the course library{canAdd ? '; for now, add the course by hand.' : '.'}
        </p>
      )}
      {!!tees.length && (
        <div className="ch-rsu-tees">
          {tees.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ch-rsu-tee"
              disabled={t.draft}
              aria-label={`Play the ${t.name} tees${t.yards ? `, ${t.yards.toLocaleString('en-US')} yards` : ''}${t.draft ? ', not ready yet' : ''}`}
              onClick={() => {
                haptic('select');
                onPick(t);
              }}
            >
              <TeeSwatch color={t.color} />
              <span className="ch-rsu-tee__b">
                <b>{t.name}</b>
                <span>{t.draft ? 'Not ready yet' : (t.category ?? `${t.holesCount} holes`)}</span>
              </span>
              <span className="ch-rsu-tee__y">
                <b>{t.yards ? t.yards.toLocaleString('en-US') : '—'}</b>
                {t.yards ? <em>yds</em> : null}
              </span>
              <span className="ch-rsu-tee__f">
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
              <span className="ch-rsu-tee__bar" aria-hidden="true">
                <i style={{ width: `${((t.yards ?? 0) / longest) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A course's photo, or the quiet flag tile when it has none or its photo doesn't load (a broken image never shows). */
function CourseMedia({ image }: { image: string | null | undefined }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = image && image !== broken ? image : null;
  return (
    <span className={'ch-cpk__media' + (src ? '' : ' is-blank')}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} /> : <Icon icon={Flag} size={20} />}
    </span>
  );
}
