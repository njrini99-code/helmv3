import Link from 'next/link';
import type { ChNextEvent } from '../data/shell';

/** The sidebar's next-event card. No readiness bar until a readiness source exists. */
export function NextEventCard({ event }: { event: ChNextEvent }) {
  return (
    <Link href="/golf/dashboard/calendar" className="ch-next">
      <span className="ch-next__k">
        <span>Next event</span>
        <span>{event.whenLabel}</span>
      </span>
      <span className="ch-next__t">{event.title}</span>
      <span className="ch-next__m">{event.metaLabel}</span>
    </Link>
  );
}
