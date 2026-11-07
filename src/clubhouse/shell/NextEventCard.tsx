'use client';

import Link from 'next/link';
import type { ChNextEvent } from '../data/shell';
import { useChClockText } from '../lib/use-clock';
import { Badge } from '../ui/Badge';

/** The sidebar’s next-event card: when, what, and, for an event that asks for replies, how many invitees have said yes. */
export function NextEventCard({ event }: { event: ChNextEvent }) {
  const t = useChClockText();
  const r = event.ready;
  const meta = t(event.metaLabel);
  return (
    <Link href={`/golf/dashboard/calendar?event=${event.id}`} className="ch-next" title={meta}>
      <span className="ch-next__k">
        <span>Next event</span>
        <span>{event.whenLabel}</span>
      </span>
      <span className="ch-next__t">{event.title}</span>
      {/* A player's own reply still owed (their card only): the count is the coach's question, this is theirs. */}
      {event.mine === 'needed' && <Badge tone="warning">Reply needed</Badge>}
      {r ? (
        <>
          <span className="ch-next__bar" aria-hidden>
            <span style={{ width: `${Math.round((r.accepted / r.invited) * 100)}%` }} />
          </span>
          <span className="ch-next__m ch-num">
            {r.accepted} of {r.invited} going
          </span>
        </>
      ) : (
        <span className="ch-next__m">{meta}</span>
      )}
    </Link>
  );
}
