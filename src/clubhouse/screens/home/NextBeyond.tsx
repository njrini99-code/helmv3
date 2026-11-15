'use client';

import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import type { ChHomeEvent } from '../../data/home';
import { Icon } from '../../ui/Icon';
import { chTrail } from '../../lib/track';
import { useChClockText } from '../../lib/use-clock';
import { LinkPending } from '../../shell/LinkPending';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { afterWhen, eventHref } from './event-links';

/**
 * Up next once this week has nothing left (CH-2316, F-0006): it says so, and names the next event or trip after it, with its
 * day and time; the card opens it. Drawn in Up next's own card and empty-state parts (the phone hero of either role), so it
 * reads as Up next's quiet state, not a new card. "No events scheduled" (CH-2309) is kept for nothing ahead at all.
 */
export function NextBeyond({ e }: { e: ChHomeEvent }) {
  const t = useChClockText();
  const { day, time } = afterWhen(e);
  return (
    <Link href={eventHref(e)} className="ch-hm-next" data-ch-code="CH-2316" onClick={() => chTrail('home open next event')}>
      <span className="ch-hm-next__k">
        <span className="ch-hm-next__type">
          <Icon icon={CalendarDays} size={13} />
          Up next
        </span>
      </span>
      <div className="ch-hm-none">
        <span className="ch-hm-none__ic" aria-hidden="true">
          <Icon icon={TYPE_ICON[e.type]} size={22} />
        </span>
        <span>
          <h2>Nothing else this week</h2>
          <p className="ch-num">
            Next: {e.title}, {day}
            {time ? `, ${t(time)}` : ''}
          </p>
        </span>
      </div>
      <LinkPending />
    </Link>
  );
}

/** The desk's hero, beside the greeting: the same state in Up next's glass card (06 §11.4). */
export function DeskNextBeyond({ e }: { e: ChHomeEvent }) {
  const t = useChClockText();
  const { day, time } = afterWhen(e);
  return (
    <Link href={eventHref(e)} className="ch-h-herocard__next" data-ch-code="CH-2316" onClick={() => chTrail('home open next event')}>
      <span className="ch-dh-next__k">
        <span>
          <Icon icon={CalendarDays} size={13} />
          Nothing else this week
        </span>
        <em className="ch-num">{t([day, time].filter(Boolean).join(' · '))}</em>
      </span>
      <b>{e.title}</b>
      <p className="ch-num">{[`Next · ${TYPE_LABEL[e.type]}`, e.location].filter(Boolean).join(' · ')}</p>
    </Link>
  );
}
