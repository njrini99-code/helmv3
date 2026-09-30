'use client';

import { Check, ChevronLeft, MapPin, TriangleAlert, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChQFormData, ChQFormRoundCourse } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { normalise, useAction } from '../../lib/use-action';
import { chTrail } from '../../lib/track';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop, usePhoneTabsHidden } from '../../shell/phone-chrome';
import { PhoneTextAction } from '../../ui/PhoneBar';
import { FIELD_ORDER, plural, validateForm, type ChQField, type ChQFormValues, type ChQProblem } from './model';
import { CoursePicker, type ChQPickedCourse } from './CoursePicker';
import { LIVE_WRITES, type ChQEditPlan, type ChQWrites } from './writes';
import '../../styles/qualifiers.css';

const LIST = '/golf/dashboard/qualifiers';
const FIELD_ID: Record<ChQField, string> = {
  name: 'qf-name',
  startDate: 'qf-start',
  endDate: 'qf-end',
  entryDeadline: 'qf-deadline',
  rounds: 'qf-rounds',
  oneRoundAck: 'qf-one',
  playerIds: 'qf-players',
  squad: 'qf-squad',
  picks: 'qf-picks',
};

/**
 * Create and edit a qualifier. The same form both ways (D-32): edit opens
 * prefilled, keeps players with a round in the qualifier entered, and fixes
 * the squad once the coach has confirmed it.
 */
export function QualifierForm({ data, writes = LIVE_WRITES }: { data: ChQFormData; writes?: ChQWrites }) {
  const router = useRouter();
  const editing = data.mode === 'edit';
  const [v, setV] = useState<ChQFormValues>(data.initial);
  const [courses, setCourses] = useState<Map<number, ChQFormRoundCourse>>(() => new Map(data.roundCourses.map((c) => [c.number, c])));
  const [tried, setTried] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  // What a failed edit save did and didn't save. The toast is brief; this stays until the next save.
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const problems = useMemo(() => (tried ? validateForm(v, { minRounds: data.minRounds }) : []), [tried, v, data.minRounds]);
  const problemOf = (f: ChQField): ChQProblem | undefined => problems.find((p) => p.field === f);
  const set = <K extends keyof ChQFormValues>(k: K, value: ChQFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const rounds = /^\d+$/.test(v.rounds) ? Math.min(Number(v.rounds), 50) : 0;
  const squad = /^\d+$/.test(v.squad) ? Number(v.squad) : 0;
  const picks = /^\d+$/.test(v.picks) ? Number(v.picks) : 0;
  const activeCount = data.players.filter((p) => !p.inactive).length;
  const dirty = useMemo(
    () => JSON.stringify(v) !== JSON.stringify(data.initial) || JSON.stringify([...courses.values()]) !== JSON.stringify(data.roundCourses),
    [v, courses, data.initial, data.roundCourses],
  );
  const doneHref = editing && data.id ? `${LIST}/${data.id}` : LIST;
  // Without the players, a save could enter or drop someone by mistake.
  const blocked = data.playersError;

  // What follows a landed write is part of the action, not of the button that started it, so the toast's Retry
  // (which runs the action again) finishes the job too: the new qualifier opens, and nobody is left to create it twice.
  const create = useAction(
    'qualifiers.create',
    async () => {
      const res = await writes.create({
        name: v.name.trim(),
        description: v.description.trim() || undefined,
        courseName: v.course.trim() || undefined,
        entryDeadline: v.entryDeadline || undefined,
        rules: v.rules.trim() || undefined,
        startDate: v.startDate,
        endDate: v.endDate || undefined,
        playerIds: v.playerIds,
        selectionSlotsTotal: squad,
        selectionSlotsCoachPick: picks,
        numRounds: rounds,
        roundCourses: [...courses.values()]
          .filter((c) => c.number <= rounds && c.courseName)
          .map((c) => ({ roundNumber: c.number, courseId: c.courseId, courseName: c.courseName, teeId: c.teeId })),
      });
      if (normalise(res).success) router.push(res.data?.qualifierId ? `${LIST}/${res.data.qualifierId}` : LIST);
      return res;
    },
    () => ({
      done: `Qualifier created · ${plural(v.playerIds.length, 'player')} entered`,
      failed: 'Couldn’t create the qualifier',
      hint: 'Nothing was created. Check the details and try again.',
      code: 'CH-09001',
    }),
  );

  const save = useAction(
    'qualifiers.save',
    async () => {
      const initialIds = [...data.initial.playerIds].sort().join();
      const plan: ChQEditPlan = {
        details: {
          name: v.name.trim(),
          description: v.description.trim() || null,
          courseName: v.course.trim() || null,
          rules: v.rules.trim() || null,
          entryDeadline: v.entryDeadline || null,
          startDate: v.startDate,
          endDate: v.endDate || null,
        },
        numRounds: rounds,
        // When the round courses didn't load, send none: the save keeps what is stored.
        roundCourses: data.coursesError
          ? null
          : Array.from({ length: rounds }, (_, i) => {
              const c = courses.get(i + 1);
              return { roundNumber: i + 1, courseId: c?.courseId ?? null, courseName: c?.courseName ?? null, teeId: c?.teeId ?? null };
            }).filter((c) => c.courseName || data.roundCourses.some((o) => o.number === c.roundNumber)),
        squad: !data.squadLocked && (v.squad !== data.initial.squad || v.picks !== data.initial.picks) ? { total: squad, coachPicks: picks } : null,
        playerIds: [...v.playerIds].sort().join() !== initialIds ? v.playerIds : null,
      };
      setSaveNote(null);
      const res = await writes.saveEdit(data.id as string, plan);
      if (!res.success && res.error) setSaveNote(res.error);
      if (normalise(res).success) {
        router.push(doneHref);
        router.refresh();
      }
      return res;
    },
    { done: 'Qualifier saved', failed: 'Couldn’t save the qualifier', hint: 'Check the form and save again.', code: 'CH-09002' },
  );
  const pending = create.pending || save.pending;

  const submit = async () => {
    setTried(true);
    chTrail(editing ? 'qualifiers save' : 'qualifiers create');
    const found = validateForm(v, { minRounds: data.minRounds });
    if (found.length) {
      const first = FIELD_ORDER.find((f) => found.some((p) => p.field === f));
      if (first) document.getElementById(FIELD_ID[first])?.focus();
      return;
    }
    if (editing) await save.run();
    else await create.run();
  };

  const phone = useChPhone();
  // Phone (docs/clubhouse/phone/qualifiers.md, board 04): Cancel and the submit sit in the top bar, so the
  // keyboard never covers them, and the tab bar steps aside.
  usePhoneTabsHidden(phone);
  const cancel = () => (dirty ? setLeaving(true) : router.push(doneHref));

  const toggle = (id: string, on: boolean) => set('playerIds', on ? [...v.playerIds, id] : v.playerIds.filter((x) => x !== id));
  const pick = (round: number, p: ChQPickedCourse) => {
    setCourses((cur) => new Map(cur).set(round, { number: round, courseId: p.courseId, courseName: p.courseName, teeId: p.teeId, teeName: p.teeName, par: p.par }));
    setPicking(null);
  };
  const clearCourse = (round: number) =>
    setCourses((cur) => {
      const next = new Map(cur);
      next.delete(round);
      return next;
    });

  const fieldHelp = (f: ChQField, help?: string) => {
    const p = problemOf(f);
    if (!p && !help) return null;
    return (
      <span id={`${FIELD_ID[f]}-h`} className={'ch-field__help' + (p ? ' is-error' : '')} role={p ? 'alert' : undefined} data-ch-code={p?.code}>
        {p?.text ?? help}
      </span>
    );
  };
  const inputProps = (f: ChQField, help?: string) => ({
    id: FIELD_ID[f],
    className: 'ch-input',
    'aria-invalid': problemOf(f) ? true : undefined,
    'aria-describedby': problemOf(f) || help ? `${FIELD_ID[f]}-h` : undefined,
  });

  return (
    <main className="ch-qf ch-qf--form">
      {phone && (
        <PhoneTop
          title={editing ? 'Edit qualifier' : 'New qualifier'}
          back={{ label: 'Cancel', chevron: false, onBack: cancel }}
          action={
            <PhoneTextAction onClick={() => void submit()} disabled={blocked} busy={pending}>
              {pending ? <span data-ch-code="CH-09404">{editing ? 'Saving' : 'Creating'}</span> : editing ? 'Save' : 'Create'}
            </PhoneTextAction>
          }
        />
      )}
      <div className="ch-qf-back">
        <Button size="sm" variant="ghost" leftIcon={ChevronLeft} onClick={cancel}>
          {editing ? 'Qualifier' : 'Qualifiers'}
        </Button>
      </div>
      <header className="ch-qf-head">
        <div>
          <span className="ch-qf-eyebrow">{editing ? 'Edit qualifier' : 'New qualifier'}</span>
          <h1>{editing ? data.name : 'Create a qualifier'}</h1>
          <p>Players enter rounds from their app. The leaderboard builds as they sign.</p>
        </div>
      </header>

      {problems.length > 0 && (
        <InlineNotice
          code="CH-09110"
          title={editing ? 'Couldn’t save the qualifier.' : 'Couldn’t create the qualifier.'}
          body={problems.length === 1 ? problems[0]!.text : `Fix the ${problems.length} highlighted fields below.`}
        />
      )}

      {saveNote && problems.length === 0 && <InlineNotice code="CH-09902" title="Couldn’t save the qualifier." body={saveNote} />}

      <SectionBoundary surface="qualifiers.form" label="The qualifier form" code="CH-09216">
        <form
          className="ch-qf-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="ch-qf-col">
            <fieldset className="ch-qf-fs">
              <legend className="ch-sr-only">Basics</legend>
              <div className="ch-qf-fs__h" aria-hidden="true">
                <h2>Basics</h2>
                <p>Name it and describe the format.</p>
              </div>
              <div className="ch-field">
                <label htmlFor="qf-name" className="ch-field__label">
                  Qualifier name
                </label>
                <input {...inputProps('name')} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Pinehurst qualifier" maxLength={200} />
                {fieldHelp('name')}
              </div>
              <div className="ch-field">
                <label htmlFor="qf-desc" className="ch-field__label ch-qf-label">
                  Description <span className="ch-qf-optional">Optional</span>
                </label>
                <textarea
                  id="qf-desc"
                  className="ch-textarea"
                  rows={3}
                  value={v.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Three 18-hole rounds counting toward a cumulative total…"
                  maxLength={2000}
                  aria-describedby="qf-desc-h"
                />
                <span id="qf-desc-h" className="ch-field__help">
                  What players should expect: format, stakes, vibe.
                </span>
              </div>
            </fieldset>

            <fieldset className="ch-qf-fs">
              <legend className="ch-sr-only">Schedule</legend>
              <div className="ch-qf-fs__h" aria-hidden="true">
                <h2>Schedule</h2>
                <p>When does it run? Dates never close entry; only you can.</p>
              </div>
              <div className="ch-qf-2">
                <div className="ch-field">
                  <label htmlFor="qf-start" className="ch-field__label">
                    Start date
                  </label>
                  <input {...inputProps('startDate')} type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
                  {fieldHelp('startDate')}
                </div>
                <div className="ch-field">
                  <label htmlFor="qf-end" className="ch-field__label ch-qf-label">
                    End date <span className="ch-qf-optional">Optional</span>
                  </label>
                  <input {...inputProps('endDate', 'For multi-day qualifiers.')} type="date" value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
                  {fieldHelp('endDate', 'For multi-day qualifiers.')}
                </div>
              </div>
              <div className="ch-field">
                <label htmlFor="qf-deadline" className="ch-field__label ch-qf-label">
                  Entry deadline <span className="ch-qf-optional">Optional</span>
                </label>
                <input {...inputProps('entryDeadline', 'Shown to players. On or before the start date.')} type="date" value={v.entryDeadline} onChange={(e) => set('entryDeadline', e.target.value)} />
                {fieldHelp('entryDeadline', 'Shown to players. On or before the start date.')}
              </div>
            </fieldset>

            <fieldset className="ch-qf-fs">
              <legend className="ch-sr-only">Course and rules</legend>
              <div className="ch-qf-fs__h" aria-hidden="true">
                <h2>Course and rules</h2>
                <p>Where it’s played and how it’s scored.</p>
              </div>
              <div className="ch-qf-2">
                <div className="ch-field">
                  <label htmlFor="qf-rounds" className="ch-field__label">
                    Rounds
                  </label>
                  <input
                    {...inputProps('rounds', 'How many rounds count. Players can’t enter more than this.')}
                    inputMode="numeric"
                    value={v.rounds}
                    onChange={(e) => setV((cur) => ({ ...cur, rounds: e.target.value.replace(/\D/g, '').slice(0, 2), oneRoundAck: false }))}
                  />
                  {fieldHelp('rounds', 'How many rounds count. Players can’t enter more than this.')}
                </div>
                <div className="ch-field">
                  <label htmlFor="qf-course" className="ch-field__label ch-qf-label">
                    Course <span className="ch-qf-optional">Optional</span>
                  </label>
                  <input id="qf-course" className="ch-input" value={v.course} onChange={(e) => set('course', e.target.value)} placeholder="Finley GC" maxLength={200} />
                </div>
              </div>
              {rounds === 1 && (
                <div className="ch-qf-one">
                  <Checkbox
                    id="qf-one"
                    checked={v.oneRoundAck}
                    onChange={(on) => set('oneRoundAck', on)}
                    invalid={!!problemOf('oneRoundAck')}
                    describedBy={problemOf('oneRoundAck') ? 'qf-one-h' : undefined}
                  >
                    <span>This qualifier intentionally allows one 18-hole round.</span>
                  </Checkbox>
                  {fieldHelp('oneRoundAck')}
                </div>
              )}
              <RoundCourses rounds={rounds} courses={courses} failed={editing && data.coursesError} onPick={setPicking} onClear={clearCourse} />
              <div className="ch-field">
                <label htmlFor="qf-rules" className="ch-field__label ch-qf-label">
                  Scoring rules <span className="ch-qf-optional">Optional</span>
                </label>
                <textarea
                  id="qf-rules"
                  className="ch-textarea"
                  rows={3}
                  value={v.rules}
                  onChange={(e) => set('rules', e.target.value)}
                  placeholder="Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff."
                  maxLength={5000}
                  aria-describedby="qf-rules-h"
                />
                <span id="qf-rules-h" className="ch-field__help">
                  Shown on the qualifier page.
                </span>
              </div>
            </fieldset>

            <fieldset className="ch-qf-fs" aria-describedby={problemOf('playerIds') ? 'qf-players-h' : undefined}>
              <legend className="ch-sr-only">Players</legend>
              <div className="ch-qf-fs__h" aria-hidden="true">
                <h2>Players</h2>
                <p className="ch-num">
                  {v.playerIds.filter((id) => data.players.some((p) => p.id === id && !p.inactive)).length} of {activeCount} active players entered
                </p>
              </div>
              {data.playersError ? (
                <InlineNotice
                  code="CH-09208"
                  title={editing ? 'The players didn’t load.' : 'The roster didn’t load.'}
                  body="Saving waits until they load, so nobody is entered or taken out by mistake."
                  onRetry={() => router.refresh()}
                />
              ) : data.players.length === 0 ? (
                <EmptyState compact code="CH-09305" icon={Users} title="No active players on the roster." body="A qualifier needs at least one entrant. Add players to the roster first." />
              ) : (
                <div className="ch-qf-players">
                  {data.players.map((p, i) => {
                    const on = v.playerIds.includes(p.id);
                    return (
                      <Checkbox
                        key={p.id}
                        id={i === 0 ? 'qf-players' : undefined}
                        className={'ch-qf-prow' + (p.locked ? ' is-locked' : '')}
                        checked={on}
                        disabled={p.locked && on}
                        invalid={!!problemOf('playerIds')}
                        describedBy={problemOf('playerIds') ? 'qf-players-h' : undefined}
                        onChange={(next) => toggle(p.id, next)}
                      >
                        <Avatar name={p.name} size={30} />
                        <span>
                          <b>{p.name}</b>
                          <small>{p.locked && on ? (p.locked === 'squad' ? 'Has a squad place' : 'Has a round in it') : p.inactive ? 'Not on the active roster' : (p.classYear ?? ' ')}</small>
                        </span>
                      </Checkbox>
                    );
                  })}
                </div>
              )}
              {fieldHelp('playerIds')}
            </fieldset>
          </div>

          <div className="ch-qf-col ch-qf-sticky">
            <fieldset className="ch-qf-fs">
              <legend className="ch-sr-only">Travel squad</legend>
              <div className="ch-qf-fs__h" aria-hidden="true">
                <h2>Travel squad</h2>
                <p>Sets the cut lines on the leaderboard.</p>
              </div>
              <div className="ch-qf-2">
                <div className="ch-field">
                  <label htmlFor="qf-squad" className="ch-field__label">
                    Squad size
                  </label>
                  <input
                    {...inputProps('squad', 'Players who make the trip.')}
                    inputMode="numeric"
                    value={v.squad}
                    readOnly={data.squadLocked}
                    onChange={(e) => set('squad', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                  {fieldHelp('squad', 'Players who make the trip.')}
                </div>
                <div className="ch-field">
                  <label htmlFor="qf-picks" className="ch-field__label">
                    Coach’s picks
                  </label>
                  <input
                    {...inputProps('picks', 'Discretionary spots.')}
                    inputMode="numeric"
                    value={v.picks}
                    readOnly={data.squadLocked}
                    onChange={(e) => set('picks', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                  {fieldHelp('picks', 'Discretionary spots.')}
                </div>
              </div>
              {data.squadLocked && <p className="ch-field__help">The squad is confirmed, so its size is fixed.</p>}
              <div className="ch-qf-readout ch-well-soft ch-num" aria-live="polite">
                <span className="ch-qf-seg">
                  <b>{Math.max(0, squad - picks)}</b> qualify on score
                </span>
                <span>·</span>
                <span className="ch-qf-seg">
                  <b>{picks}</b> coach {picks === 1 ? 'pick' : 'picks'}
                </span>
                <span>·</span>
                <span className="ch-qf-seg">
                  <b>{squad}</b>-player squad
                </span>
              </div>
            </fieldset>
            <div className="ch-qf-formact">
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" leftIcon={Check} disabled={pending || blocked}>
                {pending ? <span data-ch-code="CH-09404">{editing ? 'Saving' : 'Creating'}</span> : editing ? 'Save changes' : 'Create qualifier'}
              </Button>
            </div>
          </div>
        </form>
      </SectionBoundary>

      <CoursePicker round={picking} onClose={() => setPicking(null)} onPick={pick} writes={writes} />
      <Modal
        code="CH-09502"
        open={leaving}
        onClose={() => setLeaving(false)}
        width={440}
        icon={TriangleAlert}
        title="Discard your changes?"
        description={editing ? 'Nothing you changed here has been saved.' : 'The qualifier hasn’t been created.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              Keep editing
            </Button>
            <Button variant="danger" feel="warning" onClick={() => router.push(doneHref)}>
              Discard
            </Button>
          </>
        }
      />
    </main>
  );
}

function RoundCourses({
  rounds,
  courses,
  failed,
  onPick,
  onClear,
}: {
  rounds: number;
  courses: Map<number, ChQFormRoundCourse>;
  failed: boolean;
  onPick: (round: number) => void;
  onClear: (round: number) => void;
}) {
  if (!rounds) return null;
  return (
    <div className="ch-field">
      <span className="ch-field__label" id="qf-rc-l">
        Course per round
      </span>
      {failed ? (
        <InlineNotice code="CH-09217" title="The round courses didn’t load." body="Saving keeps the courses already set; change them once they load." />
      ) : (
        <div className="ch-qf-rcs" role="list" aria-labelledby="qf-rc-l">
          {Array.from({ length: rounds }, (_, i) => {
            const c = courses.get(i + 1);
            return (
              <div key={i} className="ch-qf-rc" role="listitem">
                <span className="ch-qf-rn">{i + 1}</span>
                <span>
                  <b>{c?.courseName ?? 'No course set'}</b>
                  <small>{c ? [c.teeName, c.par != null ? `Par ${c.par}` : null].filter(Boolean).join(' · ') || 'Tees not set' : 'Uses the qualifier’s course'}</small>
                </span>
                <span className="ch-qf-rc__act">
                  <Button size="sm" variant="ghost" leftIcon={MapPin} onClick={() => onPick(i + 1)}>
                    {c ? 'Change' : 'Choose'}{' '}
                    <span className="ch-sr-only">course for round {i + 1}</span>
                  </Button>
                  {c && (
                    <Button size="sm" variant="ghost" leftIcon={X} onClick={() => onClear(i + 1)}>
                      Clear{' '}
                      <span className="ch-sr-only">round {i + 1} course</span>
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <span className="ch-field__help">Sets each round’s course and tees, and so its par.</span>
    </div>
  );
}
