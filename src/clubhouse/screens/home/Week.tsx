'use client';

import { CalendarDays, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ChAgendaRow, ChCoachHome, ChHomeEvent } from '../../data/home';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/States';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { TYPE_ICON } from '../calendar/type-icon';
import { messagesPrefillHref } from '../messages/prefill';
import { rebuiltHref } from '../../shell/nav';
import { useChClock } from '../../lib/use-clock';
import { agendaDetail, agendaTime } from './agenda-clock';
import { nudgeDraft } from './nudge-draft';

/** What the dots under a day say to a screen reader. */
export function dayLabel(count: number, competition: boolean): string {
  const events = count === 0 ? 'no events' : count === 1 ? '1 event' : `${count} events`;
  return competition ? `competition, ${events}` : events;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

/**
 * The coach's Next row, second line (spec B §4): who is going and who hasn't replied, with one Nudge, only while the
 * event still takes a reply and someone hasn't given one. The Nudge is the phone day card's own (DayCard): Messages
 * prefilled with the same draft, never sent. Null otherwise.
 */
export function nextReplies(e: ChHomeEvent | null | undefined, today: string | null): { line: string; nudge: { href: string; label: string; aria: string } | null } | null {
  const awaiting = e?.awaiting ?? [];
  if (!e || !e.replyOpen || !awaiting.length) return null;
  const people = e.invitees ?? [];
  const going = e.going != null && people.length ? `${e.going} of ${people.length} going` : people.length ? `${people.length} invited` : null;
  const who = awaiting.length === 1 ? `${firstName(awaiting[0]!.name)} hasn’t replied` : awaiting.length === 2 ? `${firstName(awaiting[0]!.name)} and 1 other haven’t replied` : `${firstName(awaiting[0]!.name)} and ${awaiting.length - 1} others haven’t replied`;
  const href = rebuiltHref(messagesPrefillHref({ players: awaiting.map((p) => p.id), draft: nudgeDraft(e, today), title: e.title }) ?? '', 'coach');
  const label = awaiting.length === 1 ? `Nudge ${firstName(awaiting[0]!.name)}` : `Nudge ${awaiting.length}`;
  const aria = awaiting.length === 1 ? `Nudge ${firstName(awaiting[0]!.name)} about ${e.title}` : `Nudge ${awaiting.length} players about ${e.title}`;
  return { line: [going, who].filter(Boolean).join(' · '), nudge: href ? { href, label, aria } : null };
}

/**
 * `between`: what sits between the days and the agenda (the player's Up next, Player - Home.html). `covered`: the
 * page's notice (CH-1209) carries the one Try again, so the failed week keeps only its notice's title. `events`: the
 * coach's today events with their replies (the phone's Today list), for the Next row's reply line and Nudge.
 */
export function Week({ week, between, covered = false, events }: { week: ChCoachHome['week']; between?: ReactNode; covered?: boolean; events?: ChHomeEvent[] }) {
  const todayRows = week.agenda.filter((r) => r.when === 'today');
  const today = week.days.find((d) => d.isToday)?.date ?? null;
  const nextOf = (id: string) => events?.find((e) => e.id === id) ?? null;
  const laterRows = week.agenda.filter((r) => r.when === 'later');
  return (
    <section className="ch-h-pane" aria-labelledby="ch-week-title">
      <div className="ch-h-pane__head">
        <h2 id="ch-week-title">This week</h2>
      </div>

      {week.error ? (
        <RefreshNotice
          code="CH-2201"
          title="This week’s schedule didn’t load"
          body="Your events are safe. Try again."
          covered={covered}
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
                    <Icon icon={TYPE_ICON[d.competitionType ?? 'tournament']} size={11} />
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
              <AgendaRow key={r.id} r={r} replies={r.isNext ? nextReplies(nextOf(r.id), today) : null} />
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

function AgendaRow({ r, replies = null }: { r: ChAgendaRow; replies?: ReturnType<typeof nextReplies> }) {
  const clock = useChClock();
  const detail = agendaDetail(r, clock);
  return (
    <div className={'ch-h-agenda__row' + (r.isNext ? ' is-next' : '') + (r.isCompetition ? ' is-event' : '') + (replies ? ' has-replies' : '')}>
      <span className="ch-h-agenda__t ch-num">{agendaTime(r, clock)}</span>
      <div className="ch-h-agenda__txt">
        <div className="ch-h-agenda__a">{r.title}</div>
        {detail && <div className="ch-h-agenda__b">{detail}</div>}
        {replies && <div className="ch-h-agenda__rsvp ch-num">{replies.line}</div>}
      </div>
      {r.isNext && <Badge tone="accent">Next</Badge>}
      {replies?.nudge && (
        <Link href={replies.nudge.href} className="ch-btn ch-btn--ghost ch-btn--sm ch-h-agenda__nudge" aria-label={replies.nudge.aria}>
          <Icon icon={MessageSquare} size={14} />
          <span>{replies.nudge.label}</span>
        </Link>
      )}
    </div>
  );
}
