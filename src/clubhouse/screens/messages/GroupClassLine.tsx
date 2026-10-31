'use client';

import { BookOpen, ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useChClock } from '../../lib/use-clock';
import { Icon } from '../../ui/Icon';
import { InClassSheet } from '../classes/InClassSheet';
import type { ChThreadClassDay } from './class-thread';
import { groupClass, groupClassLine } from './group-class';
import type { ChConv, ChPerson } from './model';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness, group threads (coach only): "4 in class now" in a quiet row directly above the composer, opening the
 * In class now sheet scoped to this group. Hidden at 0, and for everything but a coach in a group that belongs to the coach's
 * team. No names in the line itself: the sheet is the coach's private view.
 */
export function GroupClassLine({ cls, conv, personOf }: { cls: ChThreadClassDay | null | undefined; conv: ChConv; personOf: (userId: string) => Pick<ChPerson, 'role' | 'playerId'> | undefined }) {
  const clock = useChClock();
  const group = useMemo(() => groupClass(cls, conv, personOf), [cls, conv, personOf]);
  const opts = useMemo(() => (group ? { clock, teamTz: group.day.teamTimeZone, classTz: group.day.classTimeZone } : null), [clock, group]);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement | null>(null);
  const text = group ? groupClassLine(group) : null;
  if (!group || !text || cls?.now == null) return null;
  return (
    <span ref={trigger} className="ch-ms-classline-wrap" data-ch-code="CH-7272">
      <button type="button" className="ch-ms-classline" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>
        <Icon icon={BookOpen} size={12} />
        <span>{text}</span>
        <Icon icon={ChevronRight} size={12} />
      </button>
      <InClassSheet
        open={open}
        onClose={() => setOpen(false)}
        day={group.day}
        status="ready"
        now={cls.now}
        opts={opts}
        onRetry={() => {}}
        onEditTerm={() => {}}
        onBreaks={() => {}}
        triggerRef={trigger}
        scope={{ kind: 'conversation', total: group.total, noStatus: group.noStatus }}
      />
    </span>
  );
}
