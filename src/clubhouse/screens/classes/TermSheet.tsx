'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { saveTeamTerm } from '@/app/golf/actions/class-status';
import { refetchTeamClassDay } from '../../lib/use-class-day';
import type { ChClassTerm } from '../../data/class-day-shape';
import { Button } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';
import { haptic } from '../../lib/haptics';
import { useAction } from '../../lib/use-action';
import { TIMEZONE_OPTIONS } from '../settings/model';
import { termComplete, termDefaults, validateTerm, type OtherTerm, type TermValues } from './term-form';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: "Fall 2026 term". The coach confirms the dates class status uses; outside them no one shows as
 * in class. The label prefills from the most common semester among the team's classes, the dates from the label's usual
 * window and say so until the coach changes them. Saving is the confirmation: nothing is stored unconfirmed.
 * Phone: a bottom sheet. Desktop: a Modal 460 wide.
 */
export function TermSheet({
  open,
  onClose,
  teamId,
  editing,
  others,
  label,
  teamTimeZone,
  classTimeZone,
  today,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  /** The term that covers today, when one is being edited. */
  editing: ChClassTerm | null;
  /** The team's other terms (the overlap check). */
  others: readonly OtherTerm[];
  /** The label to prefill with: the most common semester among the team's classes. */
  label: string | null;
  teamTimeZone: string;
  classTimeZone: string;
  today: string;
}) {
  const id = useId();
  const initial = useMemo(
    () => termDefaults({ editing: editing ? { ...editing } : null, label, timeZone: editing?.timeZone ?? classTimeZone ?? teamTimeZone }),
    [editing, label, teamTimeZone, classTimeZone],
  );
  const [v, setV] = useState<TermValues>(initial.values);
  const [suggested, setSuggested] = useState(initial.suggested);
  const [shown, setShown] = useState(false);
  // Each opening starts from the defaults again.
  useEffect(() => {
    if (!open) return;
    setV(initial.values);
    setSuggested(initial.suggested);
    setShown(false);
  }, [open, initial]);

  const set = <K extends keyof TermValues>(k: K, value: TermValues[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    if (k !== 'label' && k !== 'timeZone') setSuggested(false);
  };
  const issue = validateTerm(v, others.filter((o) => o.id !== editing?.id));
  const complete = termComplete(v);
  const save = useAction(
    'saveTeamTerm',
    saveTeamTerm,
    { done: '', failed: 'Couldn’t save the term dates', hint: 'Nothing was changed.', code: 'CH-2070' },
  );
  const submit = async () => {
    setShown(true);
    if (!complete || issue || save.pending) return;
    const r = await save.run({ teamId, id: editing?.id, ...v });
    if (r.success) {
      haptic('success');
      void refetchTeamClassDay(teamId);
      onClose();
    }
  };
  const zones = TIMEZONE_OPTIONS.some((z) => z.value === v.timeZone) ? [...TIMEZONE_OPTIONS] : [...TIMEZONE_OPTIONS, { value: v.timeZone, label: v.timeZone.replace(/_/g, ' ') }];
  const bad = shown && issue ? issue : null;
  const field = (f: 'label' | 'classesStart' | 'classesEnd' | 'examsEnd') => (bad?.field === f ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-err` } : {});

  return (
    <Modal
      open={open}
      onClose={save.pending ? () => {} : onClose}
      width={460}
      title={`${v.label.trim() || 'This'} term`}
      description="Class status uses these dates. Outside them, no one shows as in class."
      initialFocus={editing ? undefined : `[id="${id}-label"]`}
      footer={
        <>
          <Button variant="ghost" disabled={save.pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={save.pending} disabled={!complete} onClick={() => void submit()}>
            {save.pending ? 'Saving…' : 'Save dates'}
          </Button>
        </>
      }
    >
      <form
        className="ch-ca-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <button type="submit" hidden />
        <div className="ch-field">
          <label htmlFor={`${id}-label`} className="ch-field__label">
            Term name
          </label>
          <input id={`${id}-label`} className="ch-input" value={v.label} maxLength={40} autoComplete="off" onChange={(e) => set('label', e.target.value)} placeholder="e.g. Fall 2026" {...field('label')} />
        </div>
        <div className="ch-field">
          <span className="ch-field__label" id={`${id}-start-l`}>
            Classes start
          </span>
          <DateField value={v.classesStart} onChange={(d) => set('classesStart', d)} label="Classes start" today={today} {...field('classesStart')} />
        </div>
        <div className="ch-field">
          <span className="ch-field__label" id={`${id}-end-l`}>
            Last day of classes
          </span>
          <DateField value={v.classesEnd} onChange={(d) => set('classesEnd', d)} label="Last day of classes" anchor={v.classesStart || undefined} min={v.classesStart || undefined} today={today} {...field('classesEnd')} />
        </div>
        <div className="ch-field">
          <span className="ch-field__label" id={`${id}-exams-l`}>
            Exams end
          </span>
          <DateField value={v.examsEnd} onChange={(d) => set('examsEnd', d)} label="Exams end" anchor={v.classesEnd || undefined} min={v.classesEnd || undefined} today={today} {...field('examsEnd')} />
        </div>
        <div className="ch-field">
          <label htmlFor={`${id}-tz`} className="ch-field__label">
            Class time zone
          </label>
          <Select id={`${id}-tz`} value={v.timeZone} options={zones} onChange={(z) => set('timeZone', z)} />
        </div>
        {bad && (
          <span id={`${id}-err`} className="ch-field__help is-error" role="alert" data-ch-code={bad.code}>
            {bad.message}
          </span>
        )}
        {suggested && !bad && <span className="ch-field__help">Suggested from your school’s usual calendar. Check against the academic calendar.</span>}
      </form>
    </Modal>
  );
}
