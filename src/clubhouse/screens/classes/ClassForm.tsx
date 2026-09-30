'use client';

import { useId, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { parseSemesterDates } from '@/lib/golf/semester';
import {
  CH_DAYS,
  CH_WEEKDAYS,
  DAY_SHORT,
  checkDraft,
  conflictsOf,
  dayToken,
  daysLabel,
  draftOf,
  eventLabel,
  eventWhen,
  inputFromDraft,
  inTerm,
  inTermLabel,
  overlapsAmong,
  shortDay,
  sortDays,
  termOptions,
  type ChClass,
  type ChClassDraft,
  type ChClassInput,
  type ChFormField,
  type ChFormIssue,
  type ChTerm,
  type ChWeek,
} from '../../data/classes-shape';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';

/**
 * Add or edit a class (classes.jsx `AddClass`; the board's inline card form is
 * the same fields, so the dashed tile opens this sheet). Course code, name and
 * term are required; the times are both or neither; a class that meets at
 * exactly another's days and times is refused. An overlap with another class or
 * with a team event this week is said, and doesn't stop the save. Only classes
 * in the term the form is set to count, and the team's week is only this term's.
 */
export function ClassForm({
  open,
  editing,
  classes,
  term,
  week,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  editing: ChClass | null;
  classes: readonly ChClass[];
  term: ChTerm;
  week: ChWeek;
  saving: boolean;
  onSave: (input: ChClassInput, editing: ChClass | null) => unknown;
  onClose: () => void;
}) {
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const [was, setWas] = useState(false);
  const [v, setV] = useState<ChClassDraft>(() => draftOf(editing, term.label));
  const [attempted, setAttempted] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Each time the sheet opens it starts from the class being edited, or a blank one.
  if (open !== was) {
    setWas(open);
    if (open) {
      setV(draftOf(editing, term.label));
      setAttempted(false);
      setDiscarding(false);
    }
  }
  const initial = useMemo(() => draftOf(editing, term.label), [editing, term.label]);
  const dirty = JSON.stringify({ ...v, days: sortDays(v.days) }) !== JSON.stringify({ ...initial, days: sortDays(initial.days) });
  const set = <K extends keyof ChClassDraft>(k: K, value: ChClassDraft[K]) => setV((x) => ({ ...x, [k]: value }));

  // The days offered are the weekdays, and a weekend day the class already has (an import can save one), so it can be taken off.
  const offered = CH_DAYS.filter((d) => (CH_WEEKDAYS as readonly string[]).includes(d) || initial.days.includes(d));

  const others = useMemo(() => classes.filter((c) => c.id !== editing?.id), [classes, editing]);
  const issues = useMemo(() => checkDraft(v, others, editing?.id ?? null, term.label), [v, others, editing, term.label]);
  const shown = attempted ? issues : [];
  const issue = (f: ChFormField): ChFormIssue | undefined => shown.find((x) => x.field === f);

  // Overlaps that warn without blocking.
  const meeting = { id: editing?.id ?? 'new', days: v.days, start: v.start, end: v.end };
  const clashes = overlapsAmong(
    meeting,
    others.filter((o) => inTermLabel(o, v.semester, term.label)),
  ).filter((x) => !x.exact);
  // This week's events meet only a class in this term.
  const team = week.error || !inTerm({ semester: v.semester }, term) ? [] : conflictsOf([meeting], week.events, week.dates);

  const windowEnd = parseSemesterDates(v.semester)?.end;
  const FOCUS: Record<ChFormField, string> = { code: id('code'), name: id('name'), semester: id('term'), time: id('start'), credits: id('credits'), duplicate: id('days') };

  const submit = () => {
    if (saving) return;
    setAttempted(true);
    const first = issues[0];
    if (first) {
      // CH-12804: a refused save says what is wrong beside the field (role=alert, aria-invalid) and moves focus to the first one.
      document.getElementById(FOCUS[first.field])?.focus();
      return;
    }
    void onSave(inputFromDraft(v), editing);
  };
  const requestClose = () => {
    if (saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };
  const err = (f: ChFormField) => {
    const x = issue(f);
    return x ? (
      <span id={id(`${f}-h`)} className="ch-field__help is-error" role="alert" data-ch-code={x.code}>
        {x.message}
      </span>
    ) : null;
  };
  const inv = (f: ChFormField) => ({ 'aria-invalid': issue(f) ? true : undefined, 'aria-describedby': issue(f) ? id(`${f}-h`) : undefined });

  return (
    <>
      {/* The form steps aside while the discard question is up (one dialog at a time), and comes back with what was typed. */}
      <Modal
        open={open && !discarding}
        onClose={requestClose}
        title={editing ? 'Edit class' : 'Add a class'}
        description={windowEnd ? `Repeats weekly until ${shortDay(windowEnd)}, the end of the term.` : 'Repeats weekly for the term.'}
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={submit}>
              {saving ? (editing ? 'Saving' : 'Adding') : editing ? 'Save changes' : 'Add class'}
            </Button>
          </>
        }
      >
        <form
          className="ch-cl-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* Enter in a field saves, as on every other form. */}
          <button type="submit" hidden />
          <div className="ch-cl-2">
            <div className="ch-field">
              <label htmlFor={id('code')} className="ch-field__label">
                Course code
              </label>
              <input
                id={id('code')}
                className="ch-input"
                value={v.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="GEOG 110"
                maxLength={20}
                autoCapitalize="characters"
                autoComplete="off"
                required
                {...inv('code')}
              />
              {err('code')}
            </div>
            <div className="ch-field">
              <label htmlFor={id('credits')} className="ch-field__label">
                Credits
              </label>
              <input
                id={id('credits')}
                className="ch-input"
                value={v.credits}
                onChange={(e) => set('credits', e.target.value)}
                inputMode="numeric"
                maxLength={2}
                placeholder="3"
                autoComplete="off"
                {...inv('credits')}
              />
              {err('credits')}
            </div>
          </div>
          <div className="ch-field">
            <label htmlFor={id('name')} className="ch-field__label">
              Course name
            </label>
            <input
              id={id('name')}
              className="ch-input"
              value={v.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Global Environmental Change"
              maxLength={120}
              autoComplete="off"
              required
              {...inv('name')}
            />
            {err('name')}
          </div>
          <div className="ch-field">
            <label htmlFor={id('prof')} className="ch-field__label">
              Instructor
            </label>
            <input id={id('prof')} className="ch-input" value={v.instructor} onChange={(e) => set('instructor', e.target.value)} placeholder="Dr. J. Alvarez" maxLength={80} autoComplete="off" />
          </div>
          <div className="ch-field">
            <span className="ch-field__label" id={id('days-l')}>
              Days
            </span>
            <div className="ch-cl-daypick" role="group" aria-labelledby={id('days-l')} id={id('days')} tabIndex={-1} style={{ ['--ch-cl-pick' as string]: offered.length }}>
              {offered.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={v.days.includes(d)}
                  aria-label={DAY_SHORT[d]}
                  onClick={() => {
                    // CH-12703: choosing a day is a selection tap.
                    haptic('select');
                    set('days', sortDays(v.days.includes(d) ? v.days.filter((x) => x !== d) : [...v.days, d]));
                  }}
                >
                  {DAY_SHORT[d]}
                </button>
              ))}
            </div>
            {err('duplicate')}
          </div>
          <div className="ch-cl-2">
            <div className="ch-field">
              <label htmlFor={id('start')} className="ch-field__label">
                Starts
              </label>
              <input id={id('start')} className="ch-input" type="time" value={v.start} onChange={(e) => set('start', e.target.value)} {...inv('time')} />
            </div>
            <div className="ch-field">
              <label htmlFor={id('end')} className="ch-field__label">
                Ends
              </label>
              <input id={id('end')} className="ch-input" type="time" value={v.end} onChange={(e) => set('end', e.target.value)} {...inv('time')} />
            </div>
          </div>
          {err('time')}
          {clashes.length > 0 && (
            <div className="ch-cl-clash" role="status" data-ch-code="CH-12108">
              <Icon icon={TriangleAlert} size={15} />
              <span>
                <b>Overlaps another class</b>
                {clashes
                  .slice(0, 2)
                  .map((x) => `${x.other.code || x.other.name} on ${daysLabel(x.days)}`)
                  .join('; ')}
                {clashes.length > 2 ? ` and ${clashes.length - 2} more` : ''}.
              </span>
            </div>
          )}
          {team.length > 0 && (
            <div className="ch-cl-clash" role="status" data-ch-code="CH-12109">
              <Icon icon={TriangleAlert} size={15} />
              <span>
                <b>Overlaps the team</b>
                {team
                  .slice(0, 2)
                  .map((x) => `${eventLabel(x.event)} on ${DAY_SHORT[dayToken(x.date)]}, ${eventWhen(x.event, x.date)}`)
                  .join('; ')}
                {team.length > 2 ? ` and ${team.length - 2} more` : ''}. This week. Your coach can see your classes.
              </span>
            </div>
          )}
          <div className="ch-cl-2">
            <div className="ch-field">
              <label htmlFor={id('building')} className="ch-field__label">
                Building
              </label>
              <input id={id('building')} className="ch-input" value={v.building} onChange={(e) => set('building', e.target.value)} placeholder="Carroll Hall" maxLength={80} autoComplete="off" />
            </div>
            <div className="ch-field">
              <label htmlFor={id('room')} className="ch-field__label">
                Room
              </label>
              <input id={id('room')} className="ch-input" value={v.room} onChange={(e) => set('room', e.target.value)} placeholder="111" maxLength={40} autoComplete="off" />
            </div>
          </div>
          <div className="ch-field">
            <label htmlFor={id('term')} className="ch-field__label">
              Term
            </label>
            <Select id={id('term')} value={v.semester} options={termOptions(term.label, editing?.semester ?? v.semester).map((t) => ({ value: t, label: t }))} onChange={(t) => set('semester', t)} />
            {err('semester')}
          </div>
          <div className="ch-field">
            <label htmlFor={id('notes')} className="ch-field__label">
              Notes
            </label>
            <textarea id={id('notes')} className="ch-textarea" value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={500} />
          </div>
        </form>
      </Modal>
      <Modal
        open={discarding}
        onClose={() => setDiscarding(false)}
        icon={TriangleAlert}
        code="CH-12502"
        title="Discard your changes?"
        description="What you typed here isn't saved."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiscarding(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              feel="warning"
              onClick={() => {
                setDiscarding(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </>
        }
      />
    </>
  );
}
