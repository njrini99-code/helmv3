'use client';

import { useMemo, type ReactNode } from 'react';
import { useChClock } from '../../lib/use-clock';
import { directClassPlayer, threadClassSection, type ChThreadClassDay } from './class-thread';
import { firstName, type ChConv, type ChPerson } from './model';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: the Details panel's Class status block (coach, 1:1 with a player of the coach's team). Nothing is drawn
 * for anyone else, with the flag off, or while the class day is not loaded. Reads nothing itself: the cached class day the
 * container already holds. The caller says how the block is framed (`wrap`), so the desktop pane and the phone's pushed screen
 * keep their own section styles and the heading appears only when there is something under it.
 */
export function ThreadClassSection({ cls, conv, other, wrap }: { cls: ChThreadClassDay | null | undefined; conv: ChConv; other: ChPerson | undefined; wrap: (content: ReactNode) => ReactNode }) {
  const clock = useChClock();
  const player = directClassPlayer(cls, conv, other);
  const section = useMemo(() => {
    if (!player || !cls?.day || cls.now == null) return null;
    return threadClassSection(player, cls.now, { clock, teamTz: cls.day.teamTimeZone, classTz: cls.day.classTimeZone }, other ? firstName(other.name) : null);
  }, [player, cls, clock, other]);
  if (!section) return null;
  return wrap(
    <div className="ch-ca-thread" data-ch-code="CH-7273">
      <p className="ch-ca-thread__primary">{section.primary}</p>
      {section.today && <p className="ch-ca-thread__line">{section.today}</p>}
      {section.note && <p className="ch-ca-thread__line">{section.note}</p>}
    </div>,
  );
}
