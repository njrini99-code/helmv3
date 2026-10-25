'use client';

import { useEffect, useId, useState } from 'react';
import type { ChMyClassDay } from '../../data/class-day-shape';
import { classLabel, windowRange, type ChStatusTextOptions } from '../../data/class-status';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: "No class today". Coaches stop seeing the player in class, and anything waiting arrives now.
 * Only today's remaining and current blocks are listed (the past ones are irrelevant); the last choice is "All my classes
 * today". One `golf_class_exceptions` row, kind `off`, for the day in the class zone. Phone: a bottom sheet. Desktop: a
 * Modal 420 wide.
 */
export type NoClassChoice = { classId: string | null; label: string };

export function todaysChoices(day: ChMyClassDay, now: number, o: ChStatusTextOptions): Array<{ classId: string; label: string; range: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ classId: string; label: string; range: string | null }> = [];
  for (const b of day.blocks) {
    if (b.kind !== 'class' || !b.classId || Date.parse(b.endsAt) <= now || seen.has(b.classId)) continue;
    seen.add(b.classId);
    out.push({ classId: b.classId, label: classLabel(b.label || 'Class'), range: windowRange(Date.parse(b.startsAt), Date.parse(b.endsAt), o) });
  }
  return out;
}

export function NoClassTodaySheet({
  open,
  onClose,
  day,
  now,
  opts,
  pending,
  onMark,
}: {
  open: boolean;
  onClose: () => void;
  day: ChMyClassDay | null;
  now: number | null;
  opts: ChStatusTextOptions | null;
  pending: boolean;
  onMark: (choice: NoClassChoice) => void;
}) {
  const id = useId();
  const choices = day && now != null && opts ? todaysChoices(day, now, opts) : [];
  const [picked, setPicked] = useState<string>('all');
  useEffect(() => {
    if (open) setPicked('all');
  }, [open]);
  const chosen = choices.find((c) => c.classId === picked) ?? null;
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      width={420}
      title="No class today"
      description="Coaches stop seeing you in class, and anything waiting arrives now."
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={pending} onClick={() => onMark(chosen ? { classId: chosen.classId, label: chosen.label } : { classId: null, label: '' })}>
            {pending ? 'Saving…' : 'Mark no class'}
          </Button>
        </>
      }
    >
      <fieldset className="ch-ca-radios">
        <legend className="ch-sr-only">Which classes</legend>
        {choices.map((c) => (
          <label key={c.classId} className="ch-ca-radio" htmlFor={`${id}-${c.classId}`}>
            <input id={`${id}-${c.classId}`} type="radio" name={`${id}-which`} checked={picked === c.classId} onChange={() => setPicked(c.classId)} />
            <span>{c.label}</span>
            {c.range && <span className="ch-num">{c.range}</span>}
          </label>
        ))}
        <label className="ch-ca-radio" htmlFor={`${id}-all`}>
          <input id={`${id}-all`} type="radio" name={`${id}-which`} checked={picked === 'all'} onChange={() => setPicked('all')} />
          <span>All my classes today</span>
        </label>
      </fieldset>
    </Modal>
  );
}
