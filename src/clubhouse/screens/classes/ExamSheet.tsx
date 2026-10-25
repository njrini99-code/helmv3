'use client';

import { useEffect, useId, useState } from 'react';
import type { ChClassTerm } from '../../data/class-day-shape';
import { Button } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { Modal } from '../../ui/Modal';
import { TimeField } from '../../ui/TimeField';
import { defaultExamLabel, examComplete, validateExam, type ExamValues } from './exam-form';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: "Add an exam". A one-off block for a class: a date inside the confirmed term (or its exam
 * period), a start and an end of at most 4 hours, and a label that begins with the class's code ("STAT 201 exam"). It
 * counts as a class for class status, and for holding pushes.
 */
export function ExamSheet({
  open,
  onClose,
  c,
  term,
  today,
  pending,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  c: { code: string; name: string } | null;
  term: ChClassTerm | null;
  today: string;
  pending: boolean;
  onAdd: (v: ExamValues) => void;
}) {
  const id = useId();
  const [v, setV] = useState<ExamValues>({ on: '', start: '', end: '', label: '' });
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open && c) {
      setV({ on: '', start: '', end: '', label: defaultExamLabel(c) });
      setShown(false);
    }
  }, [open, c]);
  const issue = validateExam(v, term);
  const bad = shown && issue ? issue : null;
  const submit = () => {
    setShown(true);
    if (!examComplete(v) || issue || pending) return;
    onAdd(v);
  };
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      width={440}
      title="Add an exam"
      description={c ? `${c.code || c.name}. It counts as a class while it runs.` : undefined}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={pending} disabled={!examComplete(v)} onClick={submit}>
            {pending ? 'Adding…' : 'Add exam'}
          </Button>
        </>
      }
    >
      <form
        className="ch-ca-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button type="submit" hidden />
        <div className="ch-field">
          <span className="ch-field__label">Date</span>
          <DateField value={v.on} onChange={(d) => setV((x) => ({ ...x, on: d }))} label="Exam date" today={today} anchor={term && today < term.classesStart ? term.classesStart : undefined} aria-invalid={bad?.field === 'on' ? true : undefined} aria-describedby={bad ? `${id}-err` : undefined} />
        </div>
        <div className="ch-ca-2">
          <div className="ch-field">
            <span className="ch-field__label">Starts</span>
            <TimeField label="Exam start" value={v.start} onChange={(t) => setV((x) => ({ ...x, start: t }))} />
          </div>
          <div className="ch-field">
            <span className="ch-field__label">Ends</span>
            <TimeField label="Exam end" value={v.end} onChange={(t) => setV((x) => ({ ...x, end: t }))} aria-invalid={bad?.field === 'end' ? true : undefined} aria-describedby={bad ? `${id}-err` : undefined} />
          </div>
        </div>
        <div className="ch-field">
          <label htmlFor={`${id}-label`} className="ch-field__label">
            Name
          </label>
          <input id={`${id}-label`} className="ch-input" value={v.label} maxLength={60} autoComplete="off" onChange={(e) => {
              const label = e.target.value;
              setV((x) => ({ ...x, label }));
            }} />
        </div>
        {bad && (
          <span id={`${id}-err`} className="ch-field__help is-error" role="alert" data-ch-code={bad.code}>
            {bad.message}
          </span>
        )}
      </form>
    </Modal>
  );
}
