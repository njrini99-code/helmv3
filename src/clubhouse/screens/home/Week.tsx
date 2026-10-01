import { CalendarDays, Flag } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChAgendaRow, ChCoachHome } from '../../data/home';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/States';
import { RefreshNotice } from '../../ui/RefreshNotice';

/** What the dots under a day say to a screen reader. */
export function dayLabel(count: number, competition: boolean): string {
  const events = count === 0 ? 'no events' : count === 1 ? '1 event' : `${count} events`;
  return competition ? `competition, ${events}` : events;
}

/** `between`: what sits between the days and the agenda (the player's Up next, Player - Home.html). */
export function Week({ week, between }: { week: ChCoachHome['week']; between?: ReactNode }) {
  const todayRows = week.agenda.filter((r) => r.when === 'today');
  const laterRows = week.agenda.filter((r) => r.when === 'later');
  return (
    <section className="ch-h-pane" aria-labelledby="ch-week-title">
      <div className="ch-h-pane__head">
        <h2 id="ch-week-title">This week</h2>
      </div>

      {week.error ? (
        <RefreshNotice
          code="CH-2201"
          title="This week's schedule didn't load."
          body="Your events are safe. This is a display problem, and trying again usually clears it."
        />
      ) : (
        <>
          <ol className="ch-h-days ch-well" aria-label="Days this week">
            {week.days.map((d) => (
              <li
                key={d.date}
                className={'ch-h-day' + (d.isToday ? ' ch-h-day--today' : '') + (d.hasCompetition ? ' ch-h-day--event' : '')}
                aria-current={d.isToday ? 'date' : undefined}
              >
                <span className="ch-h-day__d">{d.weekday}</span>
                <span className="ch-h-day__n ch-num">{d.dayOfMonth}</span>
                <span className="ch-h-day__m" aria-hidden="true">
                  {d.hasCompetition ? (
                    <Icon icon={Flag} size={11} />
                  ) : (
                    Array.from({ length: Math.min(d.eventCount, 4) }, (_, i) => <i key={i} />)
                  )}
                </span>
                <span className="ch-sr-only">{dayLabel(d.eventCount, d.hasCompetition)}</span>
              </li>
            ))}
          </ol>

          {between}

          <div className="ch-h-agenda">
            <div className="ch-h-agenda__label">Today</div>
            {todayRows.length === 0 && (
              <EmptyState code="CH-2301" compact icon={CalendarDays} title="Nothing on the calendar today." />
            )}
            {todayRows.map((r) => (
              <AgendaRow key={r.id} r={r} />
            ))}
            {laterRows.length > 0 && <div className="ch-h-agenda__label ch-h-agenda__label--later">Later this week</div>}
            {laterRows.map((r) => (
              <AgendaRow key={r.id} r={r} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AgendaRow({ r }: { r: ChAgendaRow }) {
  return (
    <div className={'ch-h-agenda__row' + (r.isNext ? ' is-next' : '') + (r.isCompetition ? ' is-event' : '')}>
      <span className="ch-h-agenda__t ch-num">{r.timeLabel}</span>
      <div className="ch-h-agenda__txt">
        <div className="ch-h-agenda__a">{r.title}</div>
        {r.detail && <div className="ch-h-agenda__b">{r.detail}</div>}
      </div>
      {r.isNext && <Badge tone="accent">Next</Badge>}
    </div>
  );
}
