'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { LIVE_COPY, LIVE_ROUTE } from '../../live/copy';
import { isOnCourse, type LiveLane, type LiveRoundType, type LiveSnapshot } from '../../live/model';
import { useLiveRounds } from '../../live/use-live-rounds';
import { useNow } from '../../lib/use-now';
import { Icon } from '../../ui/Icon';
import type { ChCalEvent, ChCalType } from './model';
import '../../styles/live.css';

/**
 * Calendar, "Live · n on the course" (4.8). An event of a kind players score on (practice, qualifier, tournament) carries
 * the players now on the course who are playing it: the same team, the event's day, the same course when both name one,
 * and the same kind of round. The coach's peek and inspector say so in one row that opens the live view for the event, and
 * the week grid marks the block with a small static dot. Nothing is drawn when nobody is out, and a player's calendar
 * gets no snapshot at all.
 */
const ROUND_OF: Partial<Record<ChCalType, LiveRoundType>> = { practice: 'practice', qualifier: 'qualifier', tournament: 'tournament' };

/** The lanes on the course now that belong to this event. Pure: the tests and the context share it. */
export function liveLanesForEvent(e: Pick<ChCalEvent, 'type' | 'date' | 'cancelled' | 'courseId'>, lanes: readonly LiveLane[], now: number): LiveLane[] {
  const type = ROUND_OF[e.type];
  if (!type || e.cancelled) return [];
  return lanes.filter((l) => l.roundType === type && l.roundDate === e.date && isOnCourse(l, now) && !(e.courseId && l.courseId && e.courseId !== l.courseId));
}

type Counter = (e: ChCalEvent) => number;
const NONE: Counter = () => 0;
const Ctx = createContext<Counter>(NONE);

/** Gives the calendar's rows and blocks the live count of each event; keeps the lanes fresh like the Home card does. */
export function CalendarLiveProvider({ initial, frozen = false, now: frozenNow, children }: { initial: LiveSnapshot | undefined; frozen?: boolean; now?: number; children: ReactNode }) {
  if (!initial) return <>{children}</>;
  return (
    <Inner initial={initial} frozen={frozen} frozenNow={frozenNow}>
      {children}
    </Inner>
  );
}

function Inner({ initial, frozen, frozenNow, children }: { initial: LiveSnapshot; frozen: boolean; frozenNow?: number; children: ReactNode }) {
  const live = useLiveRounds({ initial, role: 'coach', frozen });
  const ticking = useNow();
  const now = frozenNow ?? ticking?.getTime() ?? null;
  const count = useMemo<Counter>(() => (now == null ? NONE : (e) => liveLanesForEvent(e, live.lanes, now).length), [live.lanes, now]);
  return <Ctx.Provider value={count}>{children}</Ctx.Provider>;
}

export const useEventLiveCount = (e: ChCalEvent): number => useContext(Ctx)(e);

export const eventLiveHref = (e: Pick<ChCalEvent, 'id'>) => `${LIVE_ROUTE}?event=${e.id}`;

/** The peek's and the inspector's row (CH-16640): a 44 px link, the live dot, the count, a chevron. */
export function EventLiveRow({ e }: { e: ChCalEvent }) {
  const n = useEventLiveCount(e);
  if (n < 1) return null;
  return (
    <Link href={eventLiveHref(e)} className="ch-lv-evrow" data-ch-code="CH-16640">
      <span className="ch-lv-dot" aria-hidden="true" />
      <span>{LIVE_COPY.eventRow(n)}</span>
      <Icon icon={ChevronRight} size={16} />
    </Link>
  );
}

/** The week block's mark (CH-16641): a 6 px static dot that reads "n on the course". */
export function EventLiveDot({ e }: { e: ChCalEvent }) {
  const n = useEventLiveCount(e);
  if (n < 1) return null;
  return <span className="ch-lv-dot ch-lv-evdot" role="img" aria-label={LIVE_COPY.eventAria(n)} data-ch-code="CH-16641" />;
}
