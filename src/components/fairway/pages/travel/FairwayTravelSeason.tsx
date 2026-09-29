'use client';

/**
 * FairwayTravelSeason — the team's travel season on one line (redesign
 * 2026-09-28, docs/redesign/travel).
 *
 * Every trip placed on a real date axis with a "today" marker, so the page
 * opens with where the team is in its season: what's behind, what's next and
 * how far apart trips are. Multi-day trips draw their length. Each trip is a
 * button (44px target) that opens its sheet. Built only from departure and
 * return dates, which are 100% / 87% filled.
 */
import { PressTarget } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { type TravelItinerary, getTripStatus, formatTravelDate } from './travel-helpers';

export interface FairwayTravelSeasonProps {
  itineraries: TravelItinerary[];
  now: Date | null;
  selectedId: string | null;
  nextId: string | null;
  onSelect: (itinerary: TravelItinerary) => void;
}

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

export function FairwayTravelSeason({ itineraries, now, selectedId, nextId, onSelect }: FairwayTravelSeasonProps) {
  if (itineraries.length < 2) return null;

  const today = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : null;
  const starts = itineraries.map((t) => toDate(t.departure_date).getTime());
  const ends = itineraries.map((t) => toDate(t.return_date ?? t.departure_date).getTime());
  const lo = Math.min(...starts, today?.getTime() ?? Infinity);
  const hi = Math.max(...ends, today?.getTime() ?? -Infinity);
  // Snap to whole months so the axis reads like a calendar.
  const start = new Date(new Date(lo).getFullYear(), new Date(lo).getMonth(), 1).getTime();
  const endD = new Date(hi);
  const end = new Date(endD.getFullYear(), endD.getMonth() + 1, 1).getTime();
  const span = Math.max(end - start, DAY);
  const pct = (t: number) => ((t - start) / span) * 100;

  const months: { label: string; left: number }[] = [];
  for (let d = new Date(start); d.getTime() < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ label: MONTHS[d.getMonth()]!, left: pct(d.getTime()) });
  }

  return (
    <section aria-labelledby="season-heading" className="rounded-card border border-border-subtle bg-surface px-5 pb-3 pt-4">
      <h2 id="season-heading" className="font-fw-sans text-caption font-medium text-text-tertiary">
        Travel season
      </h2>

      <div className="relative mx-2 mt-2 h-[4.5rem]">
        {/* Month gridlines + labels */}
        {months.map((m) => (
          <div key={m.label + m.left} aria-hidden className="absolute inset-y-0" style={{ left: `${m.left}%` }}>
            <span className="absolute bottom-5 top-0 border-l border-border-subtle" />
            <span className="absolute bottom-0 left-1 font-fw-sans text-caption font-medium text-text-tertiary">{m.label}</span>
          </div>
        ))}

        {/* The season line */}
        <span aria-hidden className="absolute left-0 right-0 top-[34px] h-px bg-border-strong" />

        {/* Today */}
        {today ? (
          <div aria-hidden className="absolute bottom-5 top-0" style={{ left: `${pct(today.getTime())}%` }}>
            <span className="absolute bottom-0 top-4 w-0.5 -translate-x-1/2 rounded-full bg-accent-fill" />
            {/* Label sits above the line, centred on the marker, clear of the trip dots. */}
            <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-wash px-1.5 font-fw-sans text-caption font-medium text-accent-ink">
              Today
            </span>
          </div>
        ) : null}

        {/* Trips */}
        <ul>
          {itineraries.map((t) => {
            const s = toDate(t.departure_date).getTime();
            const e = toDate(t.return_date ?? t.departure_date).getTime();
            const past = getTripStatus(t, now).label === 'Completed';
            const isNext = t.id === nextId;
            const isSel = t.id === selectedId;
            const width = Math.max(pct(e) - pct(s), 0);
            return (
              <li key={t.id}>
                <PressTarget
                  onClick={() => onSelect(t)}
                  aria-label={`${t.event_name || 'Trip'}, ${formatTravelDate(t.departure_date)}${past ? ', completed' : ''}`}
                  aria-current={isSel ? 'true' : undefined}
                  className="group absolute top-[34px] flex h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  style={{ left: `calc(${pct(s)}% - 22px)`, width: `max(44px, calc(${width}% + 12px))` }}
                >
                  <span
                    className={cn(
                      'block h-3 rounded-full ring-2 ring-surface transition-transform motion-reduce:transition-none group-hover:scale-110',
                      past ? 'bg-border-strong' : 'bg-accent-fill',
                      isNext && 'ring-4 ring-accent-wash',
                      isSel && 'outline outline-2 outline-offset-2 outline-accent-ink',
                    )}
                    style={{ width: `max(12px, calc(100% - 32px))` }}
                  />
                </PressTarget>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
