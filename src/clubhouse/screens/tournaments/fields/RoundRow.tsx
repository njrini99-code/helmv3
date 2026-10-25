'use client';

import { Clock, Ellipsis } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DateField } from '../../../ui/DateField';
import { Icon } from '../../../ui/Icon';
import { Button } from '../../../ui/Button';
import { Menu, type MenuItem } from '../../../ui/Menu';
import { TimeField } from '../../../ui/TimeField';
import { shortDay, spokenDay, type ChRoundDraft, type ChTourStartType } from './rounds-model';

export const START_TYPE_LABEL: Record<ChTourStartType, string> = { tee_times: 'Tee times', shotgun: 'Shotgun', two_tees: '1 and 10' };

/**
 * One round of the tournament section (P-5 4.1.6): the plate, the day (a date field in Custom), the start type or the
 * round's own course under it, the first tee (or "Add time"), and the round's menu. The plate is decoration: the row's
 * group name carries the round number for speech.
 */
export function RoundRow({
  round,
  n,
  custom,
  firstDay,
  lastDay,
  canRemove,
  courseLine,
  editingTee,
  label36,
  onTee,
  onEditTee,
  onDate,
  onStartType,
  onClearTee,
  onRemove,
  onChangeCourse,
}: {
  round: ChRoundDraft;
  /** 1-based round number, from date and time order. */
  n: number;
  custom: boolean;
  firstDay: string;
  lastDay: string;
  /** Custom, and this is the last round. */
  canRemove: boolean;
  /** "Same course every round" is off: this round's course, shown under its day. */
  courseLine: string | null;
  /** The coach pressed "Add time": the field shows, focused, with no time yet. */
  editingTee: boolean;
  /** The first row of a 36-hole day carries the label above it. */
  label36: boolean;
  onTee: (tee: string) => void;
  onEditTee: () => void;
  onDate: (date: string) => void;
  onStartType: (t: ChTourStartType) => void;
  onClearTee: () => void;
  onRemove: () => void;
  /** Only when "Same course every round" is off. */
  onChangeCourse?: () => void;
}) {
  const teeWrap = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (editingTee && !round.tee) teeWrap.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, [editingTee, round.tee]);
  const items: MenuItem[] = [
    ...(['tee_times', 'shotgun', 'two_tees'] as const).map((t) => ({ label: START_TYPE_LABEL[t], checked: round.startType === t, onSelect: () => onStartType(t) })),
    ...(onChangeCourse || round.tee || canRemove ? [{ kind: 'separator' as const }] : []),
    ...(onChangeCourse ? [{ label: 'Change course', onSelect: onChangeCourse }] : []),
    ...(round.tee ? [{ label: 'Clear time', onSelect: onClearTee }] : []),
    ...(canRemove ? [{ label: `Remove R${n}`, danger: true, feel: 'warning' as const, onSelect: onRemove }] : []),
  ];
  const secondary = courseLine ?? START_TYPE_LABEL[round.startType];
  return (
    <>
      {label36 && <div className="ch-tfx__label36">36-hole day</div>}
      <div className="ch-tfx__round" role="group" aria-label={`Round ${n}, ${round.date ? spokenDay(round.date) : 'no day yet'}`} data-round-id={round.id}>
        <span className="ch-tfx__plate ch-num" aria-hidden="true">
          R{n}
        </span>
        <span className="ch-tfx__day">
          {custom ? (
            <DateField label={`Round ${n} day`} value={round.date} min={firstDay} max={lastDay} onChange={(v) => v && onDate(v)} />
          ) : (
            <b className="ch-num">{round.date ? shortDay(round.date) : '—'}</b>
          )}
          <small>{secondary}</small>
        </span>
        <span className="ch-tfx__tee" ref={teeWrap}>
          {round.tee || editingTee ? (
            <TimeField label={`Round ${n} first tee`} stepMinutes={1} value={round.tee ?? ''} onChange={(v) => v && onTee(v)} />
          ) : (
            <Button variant="ghost" size="sm" aria={{ label: `Add a tee time for round ${n}` }} leftIcon={Clock} onClick={onEditTee}>
              Add time
            </Button>
          )}
        </span>
        <Menu
          label={`Round ${n} options`}
          items={items}
          trigger={(t) => (
            <button type="button" className="ch-tfx__more-btn" aria-label={`Round ${n} options`} {...t}>
              <Icon icon={Ellipsis} size={18} />
            </button>
          )}
        />
      </div>
    </>
  );
}
