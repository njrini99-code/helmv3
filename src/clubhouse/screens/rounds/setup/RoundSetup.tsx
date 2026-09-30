'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChartColumn, ChevronLeft, MapPin, Medal, Search } from 'lucide-react';
import type { ChRoundType } from '../../../data/rounds-shape';
import { haptic } from '../../../lib/haptics';
import { useAction } from '../../../lib/use-action';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';
import { TeeSwatch, TYPE_LABEL } from '../parts';
import { AddCourseSheet } from './AddCourseSheet';
import { CoursePicker } from './CoursePicker';
import { HoleConfig } from './HoleConfig';
import { holesForRound, parOf, setupBlocker, type ChSetupCourse, type ChSetupForm, type ChSetupHole, type ChSetupPick, type ChSetupPorts, type ChSetupQualifier } from './shape';
import '../../../styles/rounds-setup.css';

const STEPS = ['Course', 'Scorecard', 'Track'] as const;
const TYPES: ChRoundType[] = ['practice', 'tournament', 'qualifier'];

export interface RoundSetupProps {
  ports: ChSetupPorts;
  /** The player's open qualifiers, or null when they didn't load (CH-11211). */
  qualifiers: ChSetupQualifier[] | null;
  /** Today in the team's timezone (YYYY-MM-DD), the latest date a round can have. */
  today: string;
  /** Where Back goes (the Rounds library). */
  backHref: string;
  /** The round is saved: the round screen opens tracking. */
  onStarted: (roundId: string) => void;
}

type HolesLoad = { state: 'idle' } | { state: 'loading' } | { state: 'failed'; error: string };

/**
 * New round (board `rounds-flow.jsx` Setup): pick a course and tees (or type
 * one in), the round's type, date and holes, check the scorecard, start. The
 * screen draws; the round screen's ports read the course library and start
 * the round (docs/clubhouse/ROUNDS_PLAN.md).
 */
export function RoundSetup({ ports, qualifiers, today, backHref, onStarted }: RoundSetupProps) {
  const [form, setForm] = useState<ChSetupForm>({
    pick: null,
    type: 'practice',
    date: today,
    count: 18,
    nine: 'front',
    holes: [],
    baseline: null,
    qualifierId: null,
    qualifierRound: null,
    saveCourse: false,
  });
  const [picker, setPicker] = useState<{ course: ChSetupCourse | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [holesLoad, setHolesLoad] = useState<HolesLoad>({ state: 'idle' });
  const [lastTee, setLastTee] = useState<string | null>(null);
  const set = (patch: Partial<ChSetupForm>) => setForm((f) => ({ ...f, ...patch }));

  const loadHoles = useCallback(
    async (teeId: string) => {
      setLastTee(teeId);
      setHolesLoad({ state: 'loading' });
      const r = await ports.teeHoles(teeId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
      if (!r.ok) return setHolesLoad({ state: 'failed', error: r.error });
      setHolesLoad({ state: 'idle' });
      setForm((f) => ({ ...f, holes: r.data, baseline: r.data.map((h) => ({ ...h })), count: r.data.length < 18 ? 9 : f.count, nine: 'front' }));
    },
    [ports],
  );

  const pickTee = (
    course: { id: string | null; name: string; place: string | null },
    tee: { id: string; name: string; color: ChSetupPick['teeColor']; rating: number | null; slope: number | null; yards: number | null },
  ) => {
    setPicker(null);
    set({
      pick: { courseId: course.id, courseName: course.name, place: course.place, teeId: tee.id, teeName: tee.name, teeColor: tee.color, rating: tee.rating, slope: tee.slope, yards: tee.yards },
      holes: [],
      baseline: null,
      saveCourse: false,
    });
    void loadHoles(tee.id);
  };

  const playQualifier = (q: ChSetupQualifier) => {
    haptic('select');
    set({ type: 'qualifier', qualifierId: q.id, qualifierRound: q.nextRound });
    if (q.courseName && q.teeId && q.teeName) pickTee({ id: q.courseId, name: q.courseName, place: null }, { id: q.teeId, name: q.teeName, color: null, rating: null, slope: null, yards: null });
  };

  // CH-11007: starting fails; the toast's Retry starts it again, and what follows (opening tracking) happens inside the action, so Retry finishes the job.
  const start = useAction(
    'rounds.start',
    async (f: ChSetupForm) => {
      const r = await ports.start(f);
      if (r.ok) onStarted(r.data.roundId);
      return r.ok ? { success: true, data: r.data } : { success: false, error: r.error };
    },
    (f: ChSetupForm) => ({ done: '', failed: `Couldn't start your round at ${f.pick?.courseName ?? 'the course'}`, hint: 'Nothing was saved yet. Try again in a moment.', code: 'CH-11007' }),
  );

  const blocker = holesLoad.state === 'loading' ? 'Loading the scorecard' : holesLoad.state === 'failed' ? 'The scorecard didn’t load' : setupBlocker(form, today);
  const open = qualifiers?.filter((q) => q.nextRound != null) ?? [];
  const offer = form.type !== 'qualifier' ? open[0] : undefined;
  const chosenQ = qualifiers?.find((q) => q.id === form.qualifierId) ?? null;
  const played = holesForRound(form.holes, form.count, form.nine);
  const step = form.pick ? 1 : 0;
  const p = form.pick;

  return (
    <div className="ch-rs" data-ui="clubhouse">
      <div className="ch-rs-band">
        <Link className="ch-rs-band__back" href={backHref}>
          <Icon icon={ChevronLeft} size={16} />
          Rounds
        </Link>
        <span className="ch-rs-k">New round · {p ? 'Scorecard' : 'Setup'}</span>
        <h1>{p ? `Your round at ${p.courseName}` : 'Track every shot of this round.'}</h1>
        <p>
          {p
            ? form.baseline
              ? 'These pars and yardages came with the tees you picked. Change any hole, then start.'
              : 'Check each hole, then start.'
            : 'Pick a course, set up your scorecard, then start tracking.'}
        </p>
        <ol className="ch-rs-spine" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''} aria-current={i === step ? 'step' : undefined}>
              <i aria-hidden="true" />
              <em>{s}</em>
            </li>
          ))}
        </ol>
      </div>

      <div className="ch-rs-cols">
        <div className="ch-rs-col">
          <section className="ch-rs-card ch-rs-course" aria-label="Course">
            {p ? (
              <>
                <div className="ch-rs-course__band">
                  <b>{p.courseName}</b>
                  {p.place && (
                    <span>
                      <Icon icon={MapPin} size={13} />
                      {p.place}
                    </span>
                  )}
                </div>
                <div className="ch-rs-course__f">
                  <span className="ch-rs-course__tee">
                    <TeeSwatch color={p.teeColor} />
                    <b>{p.teeName} tees</b>
                  </span>
                  {p.yards ? <span>{p.yards.toLocaleString('en-US')} yds</span> : null}
                  {p.rating ? <span>Rating {p.rating}</span> : null}
                  {p.slope ? <span>Slope {p.slope}</span> : null}
                  <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={() => setPicker({ course: null })}>
                    <span>Change course</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="ch-rs-course__empty">
                <span className="ch-rs-course__ic" aria-hidden="true">
                  <Icon icon={MapPin} size={20} />
                </span>
                <div>
                  <b>Choose a course</b>
                  <span>Search the course library, pick one you&rsquo;ve played, or add it yourself.</span>
                </div>
                <button type="button" className="ch-btn ch-btn--secondary" onClick={() => setPicker({ course: null })}>
                  <Icon icon={Search} size={15} />
                  <span>Browse courses</span>
                </button>
              </div>
            )}
          </section>

          {offer && (
            <button type="button" className="ch-rs-qual" onClick={() => playQualifier(offer)}>
              <span className="ch-rs-qual__ic" aria-hidden="true">
                <Icon icon={Medal} size={17} />
              </span>
              <span className="ch-rs-qual__b">
                <em>Open qualifier</em>
                <b>{offer.name}</b>
                <span>{[`Round ${offer.nextRound} of ${offer.rounds}`, offer.courseName, offer.teeName].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ch-rs-qual__cta">Play</span>
            </button>
          )}

          <section className="ch-rs-card" aria-label="Round details">
            <div className="ch-rs-card__h">
              <div>
                <h3>Round details</h3>
              </div>
            </div>
            <div className="ch-rs-form">
              <div className="ch-rs-field">
                <span>Round type</span>
                <div className="ch-rs-seg" role="radiogroup" aria-label="Round type">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={form.type === t}
                      onClick={() => {
                        haptic('select');
                        set({ type: t, ...(t !== 'qualifier' ? { qualifierId: null, qualifierRound: null } : {}) });
                      }}
                    >
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ch-rs-2">
                <label className="ch-rs-field">
                  <span>Date</span>
                  <input
                    type="date"
                    className="ch-rs-in"
                    value={form.date}
                    max={today}
                    aria-invalid={form.date > today || undefined}
                    data-ch-code={form.date > today ? 'CH-11109' : undefined}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </label>
                <div className="ch-rs-field">
                  <span>Holes</span>
                  <div className="ch-rs-seg" role="radiogroup" aria-label="Holes">
                    {([9, 18] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={form.count === n}
                        disabled={n === 18 && form.holes.length > 0 && form.holes.length < 18}
                        onClick={() => {
                          haptic('select');
                          set({ count: n });
                        }}
                      >
                        {n} holes
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {form.type === 'qualifier' &&
                (qualifiers === null ? (
                  <InlineNotice code="CH-11211" title="Your qualifiers didn't load" body="Play it as a practice round, or come back in a moment." />
                ) : !qualifiers.length ? (
                  // CH-11312: nothing to qualify in.
                  <p className="ch-rs-none" data-ch-code="CH-11312">
                    No qualifier is open for you right now. Your coach opens one when it&rsquo;s time; until then, play a practice or tournament round.
                  </p>
                ) : (
                  <div className="ch-rs-opts" role="radiogroup" aria-label="Qualifier">
                    {qualifiers.map((q) => (
                      <button key={q.id} type="button" role="radio" aria-checked={form.qualifierId === q.id} disabled={q.nextRound == null} className="ch-rs-opt" onClick={() => playQualifier(q)}>
                        <span className="ch-rs-radio" aria-hidden="true" />
                        <span>
                          <b>{q.name}</b>
                          <em>{q.nextRound != null ? `Round ${q.nextRound} of ${q.rounds} · ${q.completed} played` : (q.blocked ?? 'No round open')}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              {chosenQ && chosenQ.nextRound != null && (
                <p className="ch-rs-qsel">
                  <Icon icon={Medal} size={15} />
                  <span>
                    This counts as round {chosenQ.nextRound} of {chosenQ.rounds} in {chosenQ.name}.
                  </span>
                </p>
              )}
            </div>
          </section>

          <p className="ch-rs-note">
            <Icon icon={ChartColumn} size={15} />
            <span>
              <b>Tracked on every shot:</b> driving, approach proximity, putting, scrambling and penalties. Use your rangefinder for accurate distances.
            </span>
          </p>
        </div>

        <div className="ch-rs-col">
          {holesLoad.state === 'loading' ? (
            <section className="ch-rs-card ch-rs-hc" aria-busy="true" aria-label="Loading the scorecard" data-ch-code="CH-11405">
              <div className="ch-rs-hc__ghost">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="ch-skel" />
                ))}
              </div>
            </section>
          ) : holesLoad.state === 'failed' ? (
            <section className="ch-rs-card ch-rs-hc">
              <InlineNotice
                code="CH-11210"
                title="The scorecard didn't load"
                body="Your course and tees are picked; only the pars and yardages are missing. Try again."
                onRetry={() => lastTee && void loadHoles(lastTee)}
              />
            </section>
          ) : p && form.holes.length ? (
            <HoleConfig holes={form.holes} baseline={form.baseline} count={form.count} nine={form.nine} onHoles={(holes) => set({ holes })} onNine={(nine) => set({ nine })} />
          ) : (
            // CH-11309: before a course, the scorecard's place is held.
            <section className="ch-rs-card ch-rs-hc ch-rs-hc--empty" data-ch-code="CH-11309">
              <div className="ch-rs-hc__ghost" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i}>
                    <b>{i + 1}</b>
                    <i />
                    <i />
                  </span>
                ))}
              </div>
              <p>Your scorecard appears here once you pick a course and tees.</p>
            </section>
          )}
        </div>
      </div>

      <div className="ch-rs-dock">
        <span className="ch-rs-dock__s" id="ch-rs-dock-s" role="status" aria-live="polite">
          {p && !blocker ? (
            <>
              <b>{p.courseName}</b> · {p.teeName} · {played.length} holes · Par {parOf(played)}
            </>
          ) : (
            blocker
          )}
        </span>
        <button
          type="button"
          className="ch-btn ch-btn--primary ch-btn--lg"
          disabled={!!blocker || start.pending}
          aria-describedby="ch-rs-dock-s"
          onClick={() => {
            haptic('press');
            void start.run(form);
          }}
        >
          <span>{start.pending ? 'Starting…' : 'Start round'}</span>
          <Icon icon={ArrowRight} size={16} />
        </button>
      </div>

      <CoursePicker
        open={!!picker}
        onClose={() => setPicker(null)}
        ports={ports}
        initialCourse={picker?.course ?? null}
        onPick={(c, t) => pickTee(c, t)}
        onAddCourse={() => {
          setPicker(null);
          setAdding(true);
        }}
      />
      <AddCourseSheet
        open={adding}
        onClose={() => setAdding(false)}
        onDone={(pick, holes: ChSetupHole[], count, saveCourse) => {
          setAdding(false);
          setHolesLoad({ state: 'idle' });
          set({ pick, holes, baseline: null, count, nine: 'front', saveCourse });
        }}
      />
    </div>
  );
}
