'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChartColumn, ChevronLeft, MapPin, Medal, Search } from 'lucide-react';
import type { ChRoundType } from '../../../data/rounds-shape';
import { haptic } from '../../../lib/haptics';
import { roving } from '../../../ui/use-roving';
import { useAction } from '../../../lib/use-action';
import { usePhoneImmersive, usePhoneTabsHidden } from '../../../shell/phone-chrome';
import { Icon } from '../../../ui/Icon';
import { DateField } from '../../../ui/DateField';
import { InlineNotice } from '../../../ui/Notices';
import { Select } from '../../../ui/Select';
import { TeeSwatch, TYPE_LABEL } from '../parts';
import { AddCourseSheet } from './AddCourseSheet';
import { CoursePicker } from './CoursePicker';
import { clearSetupDraft, readSetupDraft, restoreSetupDraft, useSetupDraftKey, writeSetupDraft } from './draft';
import { HoleConfig } from './HoleConfig';
import { holesForRound, parOf, setupBlocker, startPosition, type ChSetupCourse, type ChSetupForm, type ChSetupHole, type ChSetupPick, type ChSetupPorts, type ChSetupQualifier, type ChStartFailure, type ChStartResult } from './shape';
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
  /** A qualifier to play when the page opens (`?qualifier=`): chosen once, when it is in `qualifiers` with a round open. */
  preselectQualifierId?: string | null;
  /**
   * Whether Start counts as offline, in place of `navigator.onLine` alone. The round engine reads the connection probe
   * as well (WKWebView reports false on reachable networks) and refuses an offline start itself, with its own words.
   */
  isOffline?: () => boolean;
  /** The signed-in player: with the page's team, the key of the setup kept for this tab (draft.ts). None, nothing is kept. */
  viewerId?: string | null;
}

type HolesLoad = { state: 'idle' } | { state: 'loading' } | { state: 'failed'; error: string };

/**
 * The scorecard's heading while it waits (before a course, while its holes load, and when they didn't load). On the
 * phone the scorecard is a section on the canvas whose heading is its edge, so the heading is there from the first
 * paint; the desktop card holds its place without one (`.ch-rsu-ph` draws on the phone only).
 */
function ScorecardHead() {
  return (
    <div className="ch-rsu-card__h ch-rsu-ph">
      <div>
        <h2>Scorecard</h2>
      </div>
    </div>
  );
}

/**
 * New round (board `rounds-flow.jsx` Setup): pick a course and tees (or type
 * one in), the round's type, date and holes, check the scorecard, start. The
 * screen draws; the round screen's ports read the course library and start
 * the round (docs/clubhouse/ROUNDS_PLAN.md).
 */
export function RoundSetup({ ports, qualifiers, today, backHref, onStarted, preselectQualifierId = null, isOffline, viewerId = null }: RoundSetupProps) {
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
  // The setup kept for this tab comes back after mount (never during hydration), unless the page opened on a qualifier
  // to play; from then on every change is kept, until the round starts.
  const draftKey = useSetupDraftKey(viewerId);
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (!preselectQualifierId) {
      const draft = readSetupDraft(draftKey);
      if (draft) setForm(restoreSetupDraft(draft, qualifiers));
    }
    // Mount only.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // The first run is the default form, before the draft above has landed: it must not overwrite the draft.
    if (!draftLoaded.current) {
      draftLoaded.current = true;
      return;
    }
    writeSetupDraft(draftKey, form);
  }, [draftKey, form]);
  // A new round is a full-screen flow on the phone: the dock holds Start, and Back is in the band.
  usePhoneTabsHidden(true);
  // P011-D1: the band is the screen's own top bar (Back, the step), so the shell's top bar and bell go too.
  usePhoneImmersive(true);

  // The holes of the tee the player chose last (CoursePicker's `useRead` does the same): a slow read for a tee left behind must never
  // put its holes under the new tee, nor over holes the player typed in by hand (Add a course). Each choice takes a number; an answer
  // that is not the latest is dropped.
  const holesSeq = useRef(0);
  const loadHoles = useCallback(
    async (teeId: string) => {
      const n = ++holesSeq.current;
      setLastTee(teeId);
      setHolesLoad({ state: 'loading' });
      const r = await ports.teeHoles(teeId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
      if (n !== holesSeq.current) return;
      if (!r.ok) return setHolesLoad({ state: 'failed', error: r.error });
      setHolesLoad({ state: 'idle' });
      setForm((f) => ({ ...f, holes: r.data, baseline: r.data.map((h) => ({ ...h })), count: r.data.length < 18 ? 9 : f.count, nine: 'front' }));
    },
    [ports],
  );

  const pickTee = (
    course: { id: string | null; name: string; place: string | null; city?: string | null; state?: string | null; saved?: ChSetupCourse['saved'] },
    tee: { id: string; name: string; color: ChSetupPick['teeColor']; rating: number | null; slope: number | null; yards: number | null },
  ) => {
    setPicker(null);
    set({
      // A saved course ("Your courses") starts as Fairway's saved-course start does: its library link, if any, and no tee.
      pick: {
        courseId: course.saved ? course.saved.courseId : course.id,
        courseName: course.name,
        place: course.place,
        city: course.city,
        state: course.state,
        savedId: course.saved?.id ?? null,
        teeId: course.saved ? null : tee.id,
        teeName: tee.name,
        teeColor: tee.color,
        rating: tee.rating,
        slope: tee.slope,
        yards: tee.yards,
      },
      holes: [],
      baseline: null,
      saveCourse: false,
    });
    void loadHoles(tee.id);
  };

  const applyQualifier = (q: ChSetupQualifier) => {
    set({ type: 'qualifier', qualifierId: q.id, qualifierRound: q.nextRound });
    if (q.courseName && q.teeId && q.teeName) pickTee({ id: q.courseId, name: q.courseName, place: null }, { id: q.teeId, name: q.teeName, color: null, rating: null, slope: null, yards: null });
  };
  const playQualifier = (q: ChSetupQualifier) => {
    haptic('select');
    applyQualifier(q);
  };

  // CH-11007: starting fails; the toast's Retry starts it again, and what follows (opening tracking) happens inside the action, so Retry finishes the job.
  // A refusal that says what it is (`kind`, `code`, `retry`) changes the toast, or hands the outcome to the surface that owns it.
  const start = useAction<[ChSetupForm], ChStartResult>(
    'rounds.start',
    async (f) => {
      const r = await ports.start(f);
      if (r.ok) {
        clearSetupDraft(draftKey);
        onStarted(r.data.roundId);
      }
      return r.ok ? { success: true, data: r } : { success: false, error: r.error, data: r };
    },
    (f) => ({ done: '', failed: `Couldn’t start your round at ${f.pick?.courseName ?? 'the course'}`, hint: 'Nothing was saved yet. Try again in a moment.', code: 'CH-11007', offline: isOffline }),
    (result, c) => {
      const f = result.success ? null : (result.data as ChStartFailure | undefined);
      if (!f) return c;
      if (f.kind === 'handled') return { ...c, quiet: true };
      if (!f.kind && !f.code && !f.retry) return c;
      return { ...c, hint: f.error, code: f.code ?? c.code, retry: f.kind === 'final' ? (false as const) : f.retry };
    },
  );

  // The page opened on a qualifier (`?qualifier=`): play it, once, as soon as the list says it has a round open.
  const preselected = useRef(false);
  const applyPreselected = useRef(applyQualifier);
  applyPreselected.current = applyQualifier;
  useEffect(() => {
    if (preselected.current || !preselectQualifierId || !qualifiers) return;
    const q = qualifiers.find((x) => x.id === preselectQualifierId && x.nextRound != null);
    if (!q) return;
    preselected.current = true;
    applyPreselected.current(q);
  }, [preselectQualifierId, qualifiers]);

  const blocker = holesLoad.state === 'loading' ? 'Loading the scorecard' : holesLoad.state === 'failed' ? 'The scorecard didn’t load' : setupBlocker(form, today);
  const open = qualifiers?.filter((q) => q.nextRound != null) ?? [];
  const offer = form.type !== 'qualifier' ? open[0] : undefined;
  const chosenQ = qualifiers?.find((q) => q.id === form.qualifierId) ?? null;
  const played = holesForRound(form.holes, form.count, form.nine);
  // Shotgun start (CONTRACT 01, "Starting hole"): the hole the round starts on, by the card's number. Every hole is still
  // played once, in order from there and wrapping past the last one (lib/golf/round-session/play-order.ts).
  const startAt = startPosition(form);
  const startHole = played[startAt - 1]?.n ?? null;
  const step = form.pick ? 1 : 0;
  const p = form.pick;

  return (
    <main className="ch-rsu" data-ui="clubhouse">
      <div className="ch-rsu-band">
        <Link className="ch-rsu-band__back" href={backHref}>
          <Icon icon={ChevronLeft} size={16} />
          Rounds
        </Link>
        <span className="ch-rsu-k">{p ? 'New round · Scorecard' : 'Setup'}</span>
        {/* P011-D11: the screen's one h1 names it, not a tagline. */}
        <h1>{p ? `Your round at ${p.courseName}` : 'New round'}</h1>
        <p>
          {p
            ? form.baseline
              ? 'These pars and yardages came with the tees you picked. Change any hole, then start.'
              : 'Check each hole, then start.'
            : 'Pick a course, set up your scorecard, then start tracking.'}
        </p>
        <ol className="ch-rsu-spine" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''} aria-current={i === step ? 'step' : undefined}>
              <i aria-hidden="true" />
              <em>{s}</em>
            </li>
          ))}
        </ol>
      </div>

      <div className="ch-rsu-cols">
        <div className="ch-rsu-col">
          <section className="ch-rsu-card ch-rsu-course" aria-label="Course">
            {p ? (
              <>
                <div className="ch-rsu-course__band">
                  <b>{p.courseName}</b>
                  {p.place && (
                    <span>
                      <Icon icon={MapPin} size={13} />
                      {p.place}
                    </span>
                  )}
                </div>
                <div className="ch-rsu-course__f">
                  <span className="ch-rsu-course__tee">
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
              <div className="ch-rsu-course__empty">
                <span className="ch-rsu-course__ic" aria-hidden="true">
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
            <button type="button" className="ch-rsu-qual" onClick={() => playQualifier(offer)}>
              <span className="ch-rsu-qual__ic" aria-hidden="true">
                <Icon icon={Medal} size={17} />
              </span>
              <span className="ch-rsu-qual__b">
                <em>Open qualifier</em>
                <b>{offer.name}</b>
                <span>{[`Round ${offer.nextRound} of ${offer.rounds}`, offer.courseName, offer.teeName].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ch-rsu-qual__cta">Play</span>
            </button>
          )}

          <section className="ch-rsu-card" aria-label="Round details">
            <div className="ch-rsu-card__h">
              <div>
                <h2>Round details</h2>
              </div>
            </div>
            <div className="ch-rsu-form">
              <div className="ch-rsu-field">
                <span>Round type</span>
                <div className="ch-rsu-seg" role="radiogroup" aria-label="Round type" {...roving}>
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
              <div className="ch-rsu-2">
                <div className="ch-rsu-field">
                  <span>Date</span>
                  <DateField
                    label="Date"
                    className="ch-rsu-in"
                    value={form.date}
                    max={today}
                    today={today}
                    aria-invalid={form.date > today || undefined}
                    data-ch-code={form.date > today ? 'CH-11109' : undefined}
                    onChange={(d) => set({ date: d })}
                  />
                </div>
                <div className="ch-rsu-field">
                  <span>Holes</span>
                  <div className="ch-rsu-seg" role="radiogroup" aria-label="Holes" {...roving}>
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
                  {/* Why 18 is off: the card the tees came with has nine. */}
                  {form.holes.length > 0 && form.holes.length < 18 && <span className="ch-rsu-field__hint">These tees have 9 holes</span>}
                </div>
              </div>
              {/* Always shown so a shotgun start is findable; it waits for the card's holes before it can be set. */}
              <div className="ch-rsu-field">
                <label htmlFor="ch-rsu-start">Starting hole</label>
                {played.length > 0 ? (
                  <Select
                    id="ch-rsu-start"
                    value={String(startHole ?? played[0]!.n)}
                    options={played.map((h) => ({ value: String(h.n), label: `Hole ${h.n}` }))}
                    onChange={(v) => set({ start: Number(v) })}
                  />
                ) : (
                  <>
                    <Select id="ch-rsu-start" value="1" options={[{ value: '1', label: 'Hole 1' }]} onChange={() => {}} disabled />
                    {!p && <span className="ch-rsu-field__hint">Shotgun start? Pick a course, then choose your first hole.</span>}
                  </>
                )}
              </div>
              {form.type === 'qualifier' &&
                (qualifiers === null ? (
                  <InlineNotice code="CH-11211" title="Your qualifiers didn’t load" body="Play it as a practice round, or come back in a moment." />
                ) : !qualifiers.length ? (
                  // CH-11312: nothing to qualify in.
                  <p className="ch-rsu-none" data-ch-code="CH-11312">
                    No qualifier is open for you right now. Your coach opens one when it&rsquo;s time; until then, play a practice or tournament round.
                  </p>
                ) : (
                  <div className="ch-rsu-opts" role="radiogroup" aria-label="Qualifier" {...roving}>
                    {qualifiers.map((q) => (
                      <button key={q.id} type="button" role="radio" aria-checked={form.qualifierId === q.id} disabled={q.nextRound == null} className="ch-rsu-opt" onClick={() => playQualifier(q)}>
                        <span className="ch-rsu-radio" aria-hidden="true" />
                        <span>
                          <b>{q.name}</b>
                          <em>{q.nextRound != null ? `Round ${q.nextRound} of ${q.rounds} · ${q.completed} played` : (q.blocked ?? 'No round open')}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              {chosenQ && chosenQ.nextRound != null && (
                <p className="ch-rsu-qsel">
                  <Icon icon={Medal} size={15} />
                  <span>
                    This counts as round {chosenQ.nextRound} of {chosenQ.rounds} in {chosenQ.name}.
                  </span>
                </p>
              )}
            </div>
          </section>

          <p className="ch-rsu-note">
            <Icon icon={ChartColumn} size={15} />
            <span>
              <b>Tracked on every shot:</b> driving, approach proximity, putting, scrambling and penalties. Use your rangefinder for accurate distances.
            </span>
          </p>
        </div>

        <div className="ch-rsu-col">
          {holesLoad.state === 'loading' ? (
            <section className="ch-rsu-card ch-rsu-hc" aria-busy="true" aria-label="Loading the scorecard" data-ch-code="CH-11405">
              {/* Phone only: the loaded scorecard's heading and figure row hold their places, so nothing moves when it lands. */}
              <ScorecardHead />
              <dl className="ch-rsu-hc__sum ch-rsu-ph" aria-hidden="true">
                {['Holes', 'Par', 'Yards', 'Out', 'In'].map((k) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <span className="ch-skel" />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="ch-rsu-hc__ghost">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="ch-skel" />
                ))}
              </div>
            </section>
          ) : holesLoad.state === 'failed' ? (
            <section className="ch-rsu-card ch-rsu-hc">
              <ScorecardHead />
              <InlineNotice
                code="CH-11210"
                title="The scorecard didn’t load"
                body="Your course and tees are picked; only the pars and yardages are missing. Try again."
                onRetry={() => lastTee && void loadHoles(lastTee)}
              />
            </section>
          ) : p && form.holes.length ? (
            <HoleConfig holes={form.holes} baseline={form.baseline} count={form.count} nine={form.nine} onHoles={(holes) => set({ holes })} onNine={(nine) => set({ nine })} />
          ) : (
            // CH-11309: before a course, the scorecard's place is held.
            <section className="ch-rsu-card ch-rsu-hc ch-rsu-hc--empty" data-ch-code="CH-11309">
              <ScorecardHead />
              {/* The hole numbers alone: grey bars beside them read as loading (wave 10). */}
              <div className="ch-rsu-hc__ghost" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i}>
                    <b>{i + 1}</b>
                  </span>
                ))}
              </div>
              <p>Your scorecard appears here once you pick a course and tees.</p>
            </section>
          )}
        </div>
      </div>

      <div className="ch-rsu-dock">
        <span className="ch-rsu-dock__s" id="ch-rsu-dock-s" role="status" aria-live="polite">
          {p && !blocker ? (
            <>
              {/* No-break spaces keep "Par 72" and "18 holes" whole when the phone dock wraps, and bind each "·" to the
                  segment after it, so a wrapped line starts "· Par 72" instead of ending on a dangling dot (wave 9). */}
              {/* Nine of an 18-hole card says which nine. */}
              <b>{p.courseName}</b> ·&nbsp;{p.teeName} ·&nbsp;{form.count === 9 && form.holes.length === 18 ? (form.nine === 'back' ? 'Back nine' : 'Front nine') : <>{played.length}&nbsp;holes</>} ·&nbsp;Par&nbsp;{parOf(played)}
              {startAt > 1 && startHole != null ? ` ·\u00a0Starts on hole\u00a0${startHole}` : ''}
            </>
          ) : (
            blocker
          )}
        </span>
        <button
          type="button"
          className="ch-btn ch-btn--primary ch-btn--lg"
          disabled={!!blocker || start.pending}
          aria-describedby="ch-rsu-dock-s"
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
        // Add a course is opened from the course picker; closing it goes back there, as on the board.
        onClose={() => {
          setAdding(false);
          setPicker({ course: null });
        }}
        onDone={(pick, holes: ChSetupHole[], count, saveCourse, coursePhoto) => {
          setAdding(false);
          // The course typed in by hand is the latest choice: a tee read still on its way no longer applies.
          holesSeq.current++;
          setHolesLoad({ state: 'idle' });
          set({ pick, holes, baseline: null, count, nine: 'front', saveCourse, coursePhoto });
        }}
      />
    </main>
  );
}
