'use client';

import { CalendarPlus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ChCoachHome, ChHomeEvent } from '../../data/home';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { CALENDAR, eventHref, whenLabel } from './event-links';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/States';
import { useChClockText } from '../../lib/use-clock';
import { formatToPar } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { rebuiltHref } from '../../shell/nav';
import { latestRows } from './model';

/** The rows Latest rounds shows (06 11). */
const DESK_ROUNDS = 4;

/** Up next in the hero's right column: glass, no chevron (06 §11.4). */
export function DeskNext({ e, now }: { e: ChHomeEvent; now: Date | null }) {
  const t = useChClockText();
  const when = whenLabel(e, now);
  const people = e.invitees ?? [];
  return (
    <Link href={eventHref(e)} className="ch-h-herocard__next">
      <span className="ch-dh-next__k">
        <span>
          <Icon icon={TYPE_ICON[e.type]} size={13} />
          {TYPE_LABEL[e.type]}
        </span>
        <em className="ch-num">{t(when.text)}</em>
      </span>
      <b>{e.title}</b>
      <p className="ch-num">{[t(e.rangeLabel), e.location].filter(Boolean).join(' · ')}</p>
      {people.length > 0 && (
        <span className="ch-dh-next__f">
          <span className="ch-hm-stack" aria-hidden="true">
            {people.slice(0, 5).map((n) => (
              <Avatar key={n} name={n} size="xs" />
            ))}
          </span>
          <span className="ch-num">{e.going != null ? `${e.going} of ${people.length} going` : `${people.length} invited`}</span>
        </span>
      )}
    </Link>
  );
}

/** A card's title over a hairline, with the card's one link on the right when that route is rebuilt (06 §1.3). */
export function DeskHead({ id, title, href, link }: { id: string; title: string; href: string | null; link: string }) {
  return (
    <div className="ch-dh-card__h">
      <h2 id={id} className="ch-dh-card__t">
        {title}
      </h2>
      {href && (
        <Link href={href} className="ch-hm-link">
          {link}
        </Link>
      )}
    </div>
  );
}

/**
 * Today: the rest of the day, with Up next in the hero, so no event is drawn twice. Each row opens its event. A day with nothing on it
 * says so; the week lives on Calendar.
 */
export function DeskToday({ events, now }: { events: readonly ChHomeEvent[]; now: Date | null }) {
  const t12 = useChClockText();
  const t = now?.getTime();
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-today">
      <DeskHead id="ch-dh-today" title="Today" href={CALENDAR} link="Calendar" />
      {events.length === 0 ? (
        <EmptyState compact kind="first-run" code="CH-2301" title="Nothing scheduled" body="Players can still post rounds from the course." />
      ) : (
        <ul className="ch-dh-rows ch-dh-rows--today">
          {events.map((e) => {
            const live = !e.allDay && t != null && Date.parse(e.startIso) <= t && Date.parse(e.endIso ?? e.startIso) > t;
            return (
              <li key={e.id}>
                <Link href={eventHref(e)} className="ch-dh-rows__a">
                  <span className="ch-dh-time ch-num">{e.allDay ? 'All day' : t12(e.startLabel)}</span>
                  <i className={`ch-dh-dot is-${e.type}`} aria-hidden="true" />
                  <span className="ch-dh-rows__b">
                    <b>{e.title}</b>
                    {e.location && <span>{e.location}</span>}
                  </span>
                  {e.conflict ? (
                    <span className="ch-dh-clash" title="Overlaps another event">
                      <Icon icon={TriangleAlert} size={13} />
                      Overlap
                    </span>
                  ) : live ? (
                    <span className="ch-hm-now">Now</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Today on the first run, before anything is on the calendar: the card says what will show here and offers the first event. */
export function DeskTodayFirst() {
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-today">
      <DeskHead id="ch-dh-today" title="Today" href={CALENDAR} link="Calendar" />
      <EmptyState
        compact
        kind="first-run"
        code="CH-2301"
        title="Nothing on the calendar today"
        body="New events show here with who’s going."
        action={
          <Button size="sm" leftIcon={CalendarPlus} href="/golf/dashboard/calendar?new=1">
            New event
          </Button>
        }
      />
    </section>
  );
}

/**
 * Latest rounds: the newest four rows, not tappable (06 11), the score in a well over its to-par. One player's rounds of one
 * event fold into one row over the event's total (W4). A failed or empty read takes today's section, in the caller. The form
 * line that sat beside each score is gone: it had no key, and the leaderboard below draws the same rounds under "Last 7 rounds".
 */
export function DeskRounds({ rounds }: { rounds: ChCoachHome['latestRounds']['rounds'] }) {
  const shown = latestRows(rounds, DESK_ROUNDS);
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-rounds">
      <DeskHead id="ch-dh-rounds" title="Latest rounds" href={rebuiltHref('/golf/dashboard/stats')} link="Team stats" />
      <ul className="ch-dh-rows ch-dh-rows--rounds">
        {shown.map((r) => (
          <li key={r.key}>
            <Avatar name={r.playerName} id={r.playerId} size="sm" />
            <span className="ch-dh-rows__b">
              <b>{r.playerName}</b>
              <span>{r.meta}</span>
            </span>
            <span className={'ch-dh-score ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')} role={r.scores ? 'img' : undefined} aria-label={r.scores ? `Total ${r.score}, ${formatToPar(r.toPar)}` : undefined}>
              <b>{r.score}</b>
              <em>{formatToPar(r.toPar)}</em>
            </span>
          </li>
        ))}
      </ul>
      {shown.length < DESK_ROUNDS && <p className="ch-dh-rest">New rounds show here as players post them.</p>}
    </section>
  );
}
