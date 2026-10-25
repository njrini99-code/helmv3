'use client';

import Link from 'next/link';
import { Ban, ChevronRight } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { useChClock } from '../../lib/use-clock';
import { fmtHour } from '../calendar/model';
import { shortDay, spokenDay, teeMinutes, type ChTourStartType } from './fields/rounds-model';
import { START_TYPE_LABEL } from './fields/RoundRow';

export type ChRoundCardStatus = 'upcoming' | 'live' | 'suspended' | 'final' | 'cancelled';

export interface ChRoundCardData {
  roundNo: number;
  /** YYYY-MM-DD, the team's calendar date. */
  date: string;
  /** "HH:MM" on the team's clock, or null for a round with no tee time. */
  tee: string | null;
  startType: ChTourStartType;
  status: ChRoundCardStatus;
  course: string | null;
  href: string;
}

const STATUS_WORD: Record<ChRoundCardStatus, string> = { upcoming: 'Upcoming', live: 'Live', suspended: 'Suspended', final: 'Final', cancelled: 'Cancelled' };

/** "Tee times · first tee 8:42 AM", "Shotgun at 8:00 AM", "1 and 10 · first tee 8:00 AM", or "Time not set". */
export function roundCardLine(r: Pick<ChRoundCardData, 'tee' | 'startType'>, clock: '12' | '24' = '12'): string {
  if (!r.tee) return 'Time not set';
  const at = fmtHour(teeMinutes(r.tee) / 60, true, clock);
  return r.startType === 'shotgun' ? `Shotgun at ${at}` : `${START_TYPE_LABEL[r.startType]} · first tee ${at}`;
}

/** "Round 1, Thursday 5 November, Pinehurst No. 2, first tee 8:42 AM, upcoming" (P-5 7.1). */
export function roundCardName(r: ChRoundCardData, clock: '12' | '24' = '12'): string {
  const tee = r.tee ? `first tee ${fmtHour(teeMinutes(r.tee) / 60, true, clock)}` : 'time not set';
  return [`Round ${r.roundNo}`, spokenDay(r.date), r.course, tee, STATUS_WORD[r.status].toLowerCase()].filter(Boolean).join(', ');
}

/**
 * P-5 4.11.4: a round on the desk and the season home. A top label row (day and round, status), a plate, the course and
 * how it starts. The card's edge is a full hairline with the resting elevation: never a side bar or an inset left
 * shadow (tournament-fields.css; round-card.test.tsx guards it). The whole card is the link.
 */
export function RoundCard({ round }: { round: ChRoundCardData }) {
  const clock = useChClock();
  const cancelled = round.status === 'cancelled';
  return (
    <Link href={round.href} className="ch-tfx-card" data-status={round.status} aria-label={roundCardName(round, clock)}>
      <span className="ch-tfx-card__top" aria-hidden="true">
        <span>{`${shortDay(round.date)} · Round ${round.roundNo}`}</span>
        <span className="ch-tfx-card__status">
          {cancelled ? <Icon icon={Ban} size={12} /> : <i className="ch-tfx-card__dot" />}
          {STATUS_WORD[round.status]}
        </span>
      </span>
      <span className="ch-tfx-card__main" aria-hidden="true">
        <span className="ch-tfx__plate ch-num">{`R${round.roundNo}`}</span>
        <span className="ch-tfx-card__text">
          <span className="ch-tfx-card__title">{round.course ?? 'Course not set'}</span>
          <span className="ch-tfx-card__sub">{roundCardLine(round, clock)}</span>
        </span>
        <Icon icon={ChevronRight} size={16} />
      </span>
    </Link>
  );
}
