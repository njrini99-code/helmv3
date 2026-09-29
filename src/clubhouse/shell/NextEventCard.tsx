import Link from 'next/link';
import type { ChNextEvent } from '../data/shell';

/** The sidebar's next-event card: when, what, and how many invitees have said yes. */
export function NextEventCard({ event }: { event: ChNextEvent }) {
  const r = event.ready;
  return (
    <Link href={`/golf/dashboard/calendar?event=${event.id}`} className="ch-next" title={event.metaLabel}>
      <span className="ch-next__k">
        <span>Next event</span>
        <span>{event.whenLabel}</span>
      </span>
      <span className="ch-next__t">{event.title}</span>
      {r ? (
        <>
          <span className="ch-next__bar" aria-hidden>
            <span style={{ width: `${Math.round((r.accepted / r.invited) * 100)}%` }} />
          </span>
          <span className="ch-next__m ch-num">
            {r.accepted} of {r.invited} confirmed
          </span>
        </>
      ) : (
        <span className="ch-next__m">{event.metaLabel}</span>
      )}
    </Link>
  );
}
