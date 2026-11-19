'use client';

import { Check, MapPin, TriangleAlert, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChQFormData, ChQFormRoundCourse } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { DateField } from '../../ui/DateField';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { BackLink } from '../../ui/Section';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { friendlyReason, normalise, useAction } from '../../lib/use-action';
import { chReport, chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useRefresh } from '../../lib/use-refresh';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop, usePhoneTabsHidden } from '../../shell/phone-chrome';
import { PhoneTextAction } from '../../ui/PhoneBar';
import { rebuiltHref } from '../../shell/nav';
import { enteredExempt, FIELD_ORDER, FORM_HELP, FORM_LEDE, plural, SQUAD_MAX, validateForm, type ChQField, type ChQFormValues, type ChQProblem } from './model';
import { CoursePicker, type ChQPickedCourse } from './CoursePicker';
import { isPlainClick } from './return-state';
import { LIVE_WRITES, type ChQEditPlan, type ChQWrites } from './writes';
import { pluralWord } from '../../lib/plural';
import '../../styles/qualifiers.css';
import { LargeTitle } from '../../ui/LargeTitle';
import { Select } from '../../ui/Select';
import type { QualifierTieRule } from '@/lib/coachhelm/v3/qualifying/ranking';

const TIE_OPTIONS: ReadonlyArray<{ value: QualifierTieRule; label: string }> = [
  { value: 'last_round', label: 'Last round, then the one before' },
  { value: 'coach', label: 'You decide' },
];

const LIST = '/golf/dashboard/qualifiers';
// The limit is said before a save refuses it (wave-6 #16).
const SQUAD_HELP = `Players who make the trip, up to ${SQUAD_MAX}.`;

/**
 * The form has no entry deadline (owner, 2026-10-16: qualifiers don't have one), but an older qualifier can carry one,
 * and both the form's check (CH-09104) and `updateGolfQualifierDetails` refuse a deadline after the start date. Moving
 * the start before a stored deadline would then fail on a field the coach can't see or change. So a stored deadline
 * rides along unchanged while it still fits, and is cleared once the new start date passes it.
 */
export function keptDeadline(v: Pick<ChQFormValues, 'entryDeadline' | 'startDate'>): string {
  return v.entryDeadline && v.startDate && v.entryDeadline > v.startDate ? '' : v.entryDeadline;
}
const FIELD_ID: Record<ChQField, string> = {
  name: 'qf-name',
  startDate: 'qf-start',
  endDate: 'qf-end',
  entryDeadline: 'qf-deadline',
  rounds: 'qf-rounds',
  oneRoundAck: 'qf-one',
  countBest: 'qf-count',
  playerIds: 'qf-players',
  squad: 'qf-squad',
  picks: 'qf-picks',
  exempt: 'qf-exempt',
};

/**
 * Create and edit a qualifier. The same form both ways (D-32): edit opens
 * prefilled, keeps players with a round in the qualifier entered, and fixes
 * the squad once the coach has confirmed it.
 */
export function QualifierForm({ data, writes = LIVE_WRITES }: { data: ChQFormData; writes?: ChQWrites }) {
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  const editing = data.mode === 'edit';
  const [v, setV] = useState<ChQFormValues>(data.initial);
  const [courses, setCourses] = useState<Map<number, ChQFormRoundCourse>>(() => new Map(data.roundCourses.map((c) => [c.number, c])));
  const [tried, setTried] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  // What a failed edit save did and didn't save. The toast is brief; this stays until the next save.
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const checked = useMemo(() => ({ ...v, entryDeadline: keptDeadline(v) }), [v]);
  const problems = useMemo(() => (tried ? validateForm(checked, { minRounds: data.minRounds }) : []), [tried, checked, data.minRounds]);
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
  // Opens Roster's invite sheet (Roster reads `?invite=1` once), as Home's Invite players.
  const inviteHref = rebuiltHref('/golf/dashboard/roster?invite=1');
  // Nobody on the roster: a qualifier needs an entrant, so Create waits, and the form says so first (CH-09305), not
  // under Players after ten fields.
  const noRoster = !data.playersError && data.players.length === 0;
  // Without the players, a save could enter or drop someone by mistake.
  const blocked = data.playersError || noRoster;

  // What follows a landed write is part of the action, not of the button that started it, so the toast's Retry
  // (which runs the action again) finishes the job too: the new qualifier opens, and nobody is left to create it twice.
  // Created once: between the action landing and the new page committing, the button was live again and a second tap
  // made a second qualifier (audit 2026-10-31). The latch keeps the form busy until it is replaced.
  const [created, setCreated] = useState(false);
  const createdRef = useRef(false);
  const create = useAction(
    'qualifiers.create',
    async () => {
      if (createdRef.current) return { success: false as const, error: 'already created' };
      const res = await writes.create({
        name: v.name.trim(),
        description: v.description.trim() || undefined,
        courseName: v.course.trim() || undefined,
        entryDeadline: keptDeadline(v) || undefined,
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
      // The tie rule rides after the create (F-04): the qualifier exists either way, and a rule that didn't save is said in the toast.
      let rulesFailed = false;
      if (normalise(res).success && res.data?.qualifierId && data.rulesState === 'ok') {
        let thrown: unknown = null;
        const ruled = await writes.saveRules(res.data.qualifierId, { tieRule: v.tieRule, countBest: v.countBest }).catch((err: unknown) => {
          thrown = err;
          return { success: false as const };
        });
        const rulesResult = normalise(ruled);
        rulesFailed = !rulesResult.success;
        // The action itself succeeded, so useAction reports nothing: a rule that didn't save is reported here (the toast tells the coach).
        if (!rulesResult.success) chReport(thrown ?? new Error(rulesResult.error || 'tie rule not saved'), { surface: 'qualifiers.form', action: 'qualifiers.saveRules', severity: 'high', extra: { qualifierId: res.data.qualifierId } });
      }
      // Who is exempt (F-06) rides after the create too: the players are entered by then.
      const exempt = enteredExempt(v);
      let exemptFailed = false;
      if (normalise(res).success && res.data?.qualifierId && data.exemptState === 'ok' && exempt.length && writes.saveExemptions) {
        let thrown: unknown = null;
        const saved = await writes.saveExemptions(res.data.qualifierId, exempt).catch((err: unknown) => {
          thrown = err;
          return { success: false as const };
        });
        const exemptResult = normalise(saved);
        exemptFailed = !exemptResult.success;
        if (!exemptResult.success) chReport(thrown ?? new Error(exemptResult.error || 'exemptions not saved'), { surface: 'qualifiers.form', action: 'qualifiers.saveExemptions', severity: 'high', extra: { qualifierId: res.data.qualifierId } });
      }
      // The form has done its job: replaced, so Back from the new qualifier does not return to a form whose Create would make a second one.
      if (normalise(res).success) {
        createdRef.current = true;
        setCreated(true);
        router.replace(res.data?.qualifierId ? `${LIST}/${res.data.qualifierId}` : LIST);
      }
      return (rulesFailed || exemptFailed) && normalise(res).success
        ? { ...res, data: { ...res.data!, ...(rulesFailed ? { rulesFailed: true } : {}), ...(exemptFailed ? { exemptFailed: true } : {}) } }
        : res;
    },
    () => ({
      done: `Qualifier created · ${plural(v.playerIds.length, 'player')} entered`,
      failed: 'Couldn’t create the qualifier',
      hint: 'Nothing was created. Check the details and try again.',
      code: 'CH-09001',
    }),
    // The qualifier exists but its courses did not save (audit F9): the toast says so instead of a clean "created", and where to set them.
    // A refine makes the hint the toast's whole body, so a failure keeps the server's reason (friendlyReason) as it did without one.
    (result, c) =>
      result.success
        ? result.data?.roundCoursesFailed
          ? { ...c, done: 'Qualifier created, but its courses didn’t save. Open Edit to set them.' }
          : (result.data as { rulesFailed?: boolean } | undefined)?.rulesFailed
            ? { ...c, done: 'Qualifier created, but its tie rule didn’t save. Open Edit to set it.' }
            : (result.data as { exemptFailed?: boolean } | undefined)?.exemptFailed
              ? { ...c, done: 'Qualifier created, but its exemptions didn’t save. Open Edit to set them.' }
              : c
        : { ...c, hint: friendlyReason(result.error) ?? c.hint },
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
          entryDeadline: keptDeadline(v) || null,
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
        rules: data.rulesState === 'ok' && (v.tieRule !== data.initial.tieRule || v.countBest !== data.initial.countBest) ? { tieRule: v.tieRule, countBest: v.countBest } : null,
        exemptions: data.exemptState === 'ok' && JSON.stringify(enteredExempt(v)) !== JSON.stringify(enteredExempt(data.initial)) ? enteredExempt(v) : null,
      };
      setSaveNote(null);
      const res = await writes.saveEdit(data.id as string, plan);
      if (!res.success && res.error) {
        // The form's notice tells this one (CH-09902), so the action's toast stays quiet (below); its error haptic and
        // its report are kept here.
        setSaveNote(res.error);
        haptic('error');
        chReport(new Error(res.error), { surface: 'qualifiers', action: 'qualifiers.save', severity: 'low' });
      }
      if (normalise(res).success) {
        // Replaced, not pushed: Back from the qualifier goes to where the coach came from, not into the form they just saved.
        router.replace(doneHref);
        router.refresh();
      }
      return res;
    },
    { done: 'Qualifier saved', failed: 'Couldn’t save the qualifier', hint: 'Check the form and save again.', code: 'CH-09002' },
    // A refusal the server explained is told once, by the notice over the form (lead, 2026-10-08), not by a toast as well.
    // A failure with no reason (the request itself failed) has no notice, so its toast and Retry stay (CH-09002).
    (result, c) => (!result.success && result.error ? { ...c, quiet: true } : c),
  );
  const pending = create.pending || save.pending || created;

  const submit = async () => {
    setTried(true);
    chTrail(editing ? 'qualifiers save' : 'qualifiers create');
    const found = validateForm(checked, { minRounds: data.minRounds });
    if (found.length) {
      const first = FIELD_ORDER.find((f) => found.some((p) => p.field === f));
      if (first) document.getElementById(FIELD_ID[first])?.focus();
      return;
    }
    if (editing) await save.run();
    else await create.run();
  };

  // The notice sits over the form, so a save refused from the foot of a long form brings it into view.
  const reduced = useChReducedMotion();
  useEffect(() => {
    if (saveNote) document.querySelector('[data-ch-code="CH-09902"]')?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [saveNote, reduced]);

  const phone = useChPhone();
  // Phone (docs/clubhouse/phone/qualifiers.md, board 04): Cancel and the submit sit in the top bar, so the
  // keyboard never covers them, and the tab bar steps aside.
  usePhoneTabsHidden(phone);
  const cancel = () => (dirty ? setLeaving(true) : router.push(doneHref));

  const toggle = (id: string, on: boolean) => set('playerIds', on ? [...v.playerIds, id] : v.playerIds.filter((x) => x !== id));
  // One tap for the whole roster: Select all enters every active player; Clear all keeps those with a round or a squad place.
  const activeIds = data.players.filter((p) => !p.inactive).map((p) => p.id);
  const allIn = activeIds.length > 0 && activeIds.every((id) => v.playerIds.includes(id));
  const toggleAll = () =>
    set('playerIds', allIn ? v.playerIds.filter((id) => data.players.some((p) => p.id === id && p.locked)) : [...new Set([...v.playerIds, ...activeIds])]);
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
    <main className="ch-qf ch-qf--form" data-canopy="">
      {phone && (
        <PhoneTop
        heading={false}
          title={editing ? 'Edit qualifier' : 'New qualifier'}
          back={{ label: 'Cancel', chevron: false, onBack: cancel }}
          action={
            <PhoneTextAction onClick={() => void submit()} disabled={blocked} busy={pending}>
              {pending ? <span data-ch-code="CH-09404">{editing ? 'Saving…' : 'Creating…'}</span> : editing ? 'Save' : 'Create'}
            </PhoneTextAction>
          }
        />
      )}
      {/* The way back is Cancel's: with unsaved changes it asks first (CH-09502); otherwise it is the link, so a new tab still works. */}
      <div
        className="ch-qf-back"
        onClickCapture={(e) => {
          if (dirty && isPlainClick(e)) {
            e.preventDefault();
            setLeaving(true);
          }
        }}
      >
        <BackLink href={doneHref}>{editing ? 'Qualifier' : 'Qualifiers'}</BackLink>
      </div>
      <header className="ch-qf-head" data-canopy-head="tight">
        <div>
          <span className="ch-qf-eyebrow">{editing ? 'Edit qualifier' : 'Qualifiers'}</span>
          <LargeTitle>{editing ? data.name : 'New qualifier'}</LargeTitle>
          <p>{FORM_LEDE}</p>
        </div>
      </header>

      {/* Without the players a save could enter or drop someone by mistake, so Create waits: said here, over the form,
          with Try again, where it explains the key that is off; the Players section keeps the title alone (states audit
          c14). */}
      {data.playersError && (
        <InlineNotice
          code="CH-09208"
          title={editing ? 'The players didn’t load' : 'The roster didn’t load'}
          body="Saving waits until they load, so nobody is entered or taken out by mistake."
          onRetry={refresh}
          retrying={refreshing}
        />
      )}

      {noRoster && (
        <EmptyState
          compact
          code="CH-09305"
          icon={Users}
          title="No active players on the roster"
          body="A qualifier needs at least one entrant, so Create waits until players join."
          action={
            inviteHref ? (
              <Button size="sm" variant="primary" leftIcon={UserPlus} href={inviteHref}>
                Invite players
              </Button>
            ) : undefined
          }
        />
      )}

      {problems.length > 0 && (
        <InlineNotice
          code="CH-09110"
          title={editing ? 'Couldn’t save the qualifier' : 'Couldn’t create the qualifier'}
          body={problems.length === 1 ? problems[0]!.text : `Fix the ${problems.length} highlighted fields below.`}
        />
      )}

      {saveNote && problems.length === 0 && <InlineNotice code="CH-09902" title="Couldn’t save the qualifier" body={saveNote} />}

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
                <input {...inputProps('name')} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pinehurst qualifier" maxLength={200} />
                {fieldHelp('name')}
              </div>
              <div className="ch-field">
                <label htmlFor="qf-desc" className="ch-field__label">
                  Description <span className="ch-field__opt">Optional</span>
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
                  {FORM_HELP.description}
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
                  <DateField label="Start date" {...inputProps('startDate')} value={v.startDate} onChange={(d) => set('startDate', d)} />
                  {fieldHelp('startDate')}
                </div>
                <div className="ch-field">
                  <label htmlFor="qf-end" className="ch-field__label">
                    End date <span className="ch-field__opt">Optional</span>
                  </label>
                  <DateField label="End date" {...inputProps('endDate', FORM_HELP.endDate)} min={v.startDate || undefined} anchor={v.startDate || undefined} clearable value={v.endDate} onChange={(d) => set('endDate', d)} />
                  {fieldHelp('endDate', FORM_HELP.endDate)}
                </div>
              </div>
              {/* No entry deadline field: qualifiers don't have one (owner, 2026-10-16). A stored deadline is kept as it is. */}
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
                    {...inputProps('rounds', FORM_HELP.rounds)}
                    inputMode="numeric"
                    value={v.rounds}
                    onChange={(e) => { const rounds = e.target.value.replace(/\D/g, '').slice(0, 2); setV((cur) => ({ ...cur, rounds, oneRoundAck: false })); }}
                  />
                  {fieldHelp('rounds', FORM_HELP.rounds)}
                </div>
                <div className="ch-field">
                  <label htmlFor="qf-course" className="ch-field__label">
                    Course <span className="ch-field__opt">Optional</span>
                  </label>
                  <input id="qf-course" className="ch-input" value={v.course} onChange={(e) => set('course', e.target.value)} placeholder="e.g. Finley GC" maxLength={200} />
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
              <RoundCourses rounds={rounds} courses={courses} fallback={v.course.trim() || null} failed={editing && data.coursesError} onPick={setPicking} onClear={clearCourse} />
              <CountBestField
                value={v.countBest}
                rounds={rounds}
                state={data.rulesState}
                onChange={(n) => set('countBest', n)}
                problem={problemOf('countBest')?.text ?? null}
              />
              <TieRuleField value={v.tieRule} state={data.rulesState} onChange={(rule) => set('tieRule', rule)} />
              <div className="ch-field">
                <label htmlFor="qf-rules" className="ch-field__label">
                  Scoring rules <span className="ch-field__opt">Optional</span>
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
              <div className="ch-qf-fs__h has-act">
                <div aria-hidden="true">
                  <h2>Players</h2>
                  {/* No count while the roster failed: "0 of 0" would read as an empty roster. The line stays, so the head keeps its height. */}
                  <p className="ch-num">
                    {data.playersError ? '\u00a0' : noRoster ? 'Nobody to enter yet' : `${v.playerIds.filter((id) => data.players.some((p) => p.id === id && !p.inactive)).length} of ${activeCount} active players entered`}
                  </p>
                </div>
                {!data.playersError && activeIds.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={toggleAll}>
                    {allIn ? 'Clear all' : 'Select all'}
                  </Button>
                )}
              </div>
              {data.playersError ? (
                <InlineNotice title={editing ? 'The players didn’t load' : 'The roster didn’t load'} covered />
              ) : noRoster ? null : (
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
                        <Avatar name={p.name} id={p.id} size={30} />
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
                    {...inputProps('squad', SQUAD_HELP)}
                    inputMode="numeric"
                    value={v.squad}
                    readOnly={data.squadLocked}
                    onChange={(e) => set('squad', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                  {fieldHelp('squad', SQUAD_HELP)}
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
              <ExemptField
                players={data.players.filter((p) => v.playerIds.includes(p.id))}
                value={v.exempt}
                picks={picks}
                state={data.exemptState}
                onChange={(next) => set('exempt', next)}
                problem={problemOf('exempt') ?? null}
              />
              <div className="ch-qf-readout ch-num" aria-live="polite">
                {/* The segments wrap whole, and a dot only ever sits between two on one line (qualifiers.css). */}
                <span className="ch-qf-readout__in">
                  <span className="ch-qf-seg">
                    <b>{Math.max(0, squad - picks)}</b> qualify on score
                  </span>
                  <span className="ch-qf-seg">
                    <b>{picks}</b> coach {pluralWord(picks, 'pick')}
                  </span>
                  <span className="ch-qf-seg">
                    <b>{squad}</b>-player squad
                  </span>
                </span>
              </div>
            </fieldset>
            <div className="ch-qf-formact">
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" leftIcon={Check} busy={pending} disabled={blocked}>
                {pending ? <span data-ch-code="CH-09404">{editing ? 'Saving…' : 'Creating…'}</span> : editing ? 'Save changes' : 'Create qualifier'}
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
  fallback,
  failed,
  onPick,
  onClear,
}: {
  rounds: number;
  courses: Map<number, ChQFormRoundCourse>;
  /** The qualifier's own course: a round without one of its own is played there (P009-D10: the default, not a gap). */
  fallback: string | null;
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
        <InlineNotice code="CH-09217" title="The round courses didn’t load" body="Saving keeps the courses already set; change them once they load." />
      ) : (
        <div className="ch-qf-rcs" role="list" aria-labelledby="qf-rc-l">
          {Array.from({ length: rounds }, (_, i) => {
            const c = courses.get(i + 1);
            return (
              <div key={i} className="ch-qf-rc" role="listitem">
                <span className="ch-qf-rn">{i + 1}</span>
                <span>
                  <b>{c?.courseName ?? fallback ?? 'No course set'}</b>
                  <small>{c ? [c.teeName, c.par != null ? `Par ${c.par}` : null].filter(Boolean).join(' · ') || 'Tees not set' : fallback ? 'The qualifier’s course' : 'Choose one, or set the qualifier’s course above'}</small>
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

/**
 * Who is exempt (F-06; owner, 16 Nov 2026: "Exempt before, from coach picks"): an entrant the coach places before the
 * qualifier, with a reason. Each takes one of the coach's picks when selection closes, so it is offered only with a pick
 * to take, and only before the qualifier starts. The reason is the coach's, never shown to players (D-33).
 */
function ExemptField({
  players,
  value,
  picks,
  state,
  onChange,
  problem,
}: {
  players: ReadonlyArray<{ id: string; name: string }>;
  value: ChQFormValues['exempt'];
  picks: number;
  state: ChQFormData['exemptState'];
  onChange: (next: ChQFormValues['exempt']) => void;
  problem: ChQProblem | null;
}) {
  const shown = value.filter((e) => players.some((p) => p.id === e.playerId));
  if (state === 'missing' || (state === 'ok' && picks === 0 && !shown.length)) return null;
  const names = new Map(players.map((p) => [p.id, p.name]));
  if (state !== 'ok') {
    return (
      <p className="ch-field__help" data-ch-code={state === 'error' ? 'CH-09282' : undefined}>
        {state === 'error'
          ? 'Exemptions didn’t load, so they can’t be changed here now. The qualifier keeps the ones it has.'
          : shown.length
            ? `Exempt: ${shown.map((e) => names.get(e.playerId)).join(', ')}. The qualifier has started, so exemptions are fixed; give a place with a coach’s pick.`
            : 'The qualifier has started, so nobody can be exempted now; give a place with a coach’s pick.'}
      </p>
    );
  }
  const has = (id: string) => value.some((e) => e.playerId === id);
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, { playerId: id, reason: '' }] : value.filter((e) => e.playerId !== id));
  const setReason = (id: string, reason: string) => onChange(value.map((e) => (e.playerId === id ? { ...e, reason } : e)));
  return (
    <fieldset className="ch-field" id="qf-exempt" aria-describedby="qf-exempt-h">
      <legend className="ch-field__label">
        Exempt players <span className="ch-field__opt">Optional</span>
      </legend>
      <span id="qf-exempt-h" className={'ch-field__help' + (problem ? ' is-error' : '')} role={problem ? 'alert' : undefined} data-ch-code={problem?.code}>
        {/* L-086: each exempt player takes one pick; the count is the Coach's picks field just above ("1 coach's pick" read wrong). */}
        {problem?.text ?? 'An exempt player needn’t play: they take a coach’s pick when selection closes. Only you see the reason.'}
      </span>
      {players.map((p) => (
        <div key={p.id} className="ch-field">
          <Checkbox id={`qf-exempt-${p.id}`} checked={has(p.id)} onChange={(on) => toggle(p.id, on)}>
            {/* Named apart from the same player's entry tick above. */}
            <span>
              <span className="ch-sr-only">Exempt</span> {p.name}
            </span>
          </Checkbox>
          {has(p.id) && (
            <input
              className="ch-input"
              aria-label={`Why ${p.name} is exempt`}
              placeholder="Reason, e.g. won the conference last spring"
              maxLength={280}
              value={value.find((e) => e.playerId === p.id)?.reason ?? ''}
              onChange={(e) => setReason(p.id, e.target.value)}
            />
          )}
        </div>
      ))}
    </fieldset>
  );
}

/**
 * Which rounds count (F-06): every round, or each player's best N of the qualifier's rounds, the worst dropped. Offered
 * only once there are two rounds to choose from; locked like the tie rule when its store is held or didn't load.
 */
function CountBestField({
  value,
  rounds,
  state,
  onChange,
  problem,
}: {
  value: number | null;
  rounds: number;
  state: ChQFormData['rulesState'];
  onChange: (n: number | null) => void;
  problem: string | null;
}) {
  if (!(rounds >= 2) && value == null) return null;
  const locked = state !== 'ok';
  const top = Math.max(rounds - 1, value ?? 0);
  const options = [
    { value: 'all', label: 'Every round' },
    ...Array.from({ length: top }, (_, i) => ({ value: String(i + 1), label: `Best ${i + 1} of ${plural(rounds, 'round')}` })),
  ];
  const help = problem
    ? problem
    : state === 'missing'
      ? 'Every round counts. Dropping a player’s worst round arrives with the next update.'
      : state === 'error'
        ? 'The counting rule didn’t load, so it can’t be changed here now. The qualifier keeps the rule it has.'
        : value == null
          ? 'Every round a player plays adds to their total.'
          : `Each player’s best ${value} rounds add up; their worst ${rounds - value === 1 ? 'round is' : `${rounds - value} rounds are`} dropped and marked Dropped on their card.`;
  return (
    <div className="ch-field">
      <label htmlFor="qf-count" className="ch-field__label">
        Rounds that count
      </label>
      <Select
        id="qf-count"
        value={value == null ? 'all' : String(value)}
        disabled={locked}
        options={options}
        onChange={(v) => onChange(v === 'all' ? null : Number(v))}
        describedBy="qf-count-h"
      />
      <span id="qf-count-h" className="ch-field__help" role={problem ? 'alert' : undefined} data-ch-code={problem ? 'CH-09180' : undefined}>
        {help}
      </span>
    </div>
  );
}

/**
 * How the standings separate players level on to par and strokes (F-04). A new qualifier starts on the last round, then
 * the one before (owner, 15 Nov 2026); Coach decides keeps every tie for the coach (Q-114). Without the rule's store
 * (migration held) or when it didn't load, the rule in force is said and can't be changed, so a guess never overwrites it.
 */
function TieRuleField({ value, state, onChange }: { value: QualifierTieRule; state: ChQFormData['rulesState']; onChange: (rule: QualifierTieRule) => void }) {
  const locked = state !== 'ok';
  const help =
    state === 'missing'
      ? 'Tied players share a place and you decide a tie at the cut. Choosing another rule arrives with the next update.'
      : state === 'error'
        ? 'The tie rule didn’t load, so it can’t be changed here now. The qualifier keeps the rule it has.'
        : value === 'last_round'
          ? 'Players level on to par and strokes are separated by the lower last round, then the round before. Still level, they share a place and you decide.'
          : 'Players level on to par and strokes share a place, and you decide a tie at the cut in Manage selections.';
  return (
    <div className="ch-field">
      <label htmlFor="qf-tie" className="ch-field__label">
        Ties
      </label>
      <Select
        id="qf-tie"
        value={value}
        disabled={locked}
        options={TIE_OPTIONS}
        onChange={onChange}
        describedBy="qf-tie-h"
      />
      <span id="qf-tie-h" className="ch-field__help" data-ch-code={state === 'error' ? 'CH-09281' : undefined}>
        {help}
      </span>
    </div>
  );
}
