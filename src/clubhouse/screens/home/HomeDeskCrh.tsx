'use client';

import Link from 'next/link';
import type { ChCoachHome, ChHomeEvent } from '../../data/home';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { CALENDAR, eventHref, whenLabel } from './event-links';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/States';
import { useChClockText } from '../../lib/use-clock';
import { formatAvg, formatToPar } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { leaderPlaces } from './Leaderboard';

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

/** This week: today's rows, then what is coming, rows 56 (06 §11.4). */
export function DeskAgenda({ rows }: { rows: ChCoachHome['week']['agenda'] }) {
  const t = useChClockText();
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-week">
      <div className="ch-dh-card__h">
        <h2 id="ch-dh-week" className="ch-dh-card__t">
          This week
        </h2>
        <Link href={CALENDAR} className="ch-hm-link">
          Calendar
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact kind="first-run" code="CH-2301" title="Nothing on the calendar this week" body="Practices, qualifiers and travel show up here." />
      ) : (
      <ul className="ch-dh-rows ch-dh-rows--agenda">
        {rows.map((r) => (
          <li key={r.id}>
            <span className="ch-dh-rank ch-num">{t(r.timeLabel)}</span>
            <i className={r.isNext ? 'is-next' : ''} aria-hidden="true" />
            <span className="ch-dh-rows__b">
              <b>{r.title}</b>
              {r.detail && <span>{r.detail}</span>}
            </span>
            {r.isNext && <span className="ch-hm-now">Next</span>}
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}

/** Latest rounds: the newest four, not tappable (06 11). A failed or empty read takes today's section, in the caller. */
export function DeskRounds({ rounds }: { rounds: ChCoachHome['latestRounds']['rounds'] }) {
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-rounds">
      <h2 id="ch-dh-rounds" className="ch-dh-card__t">
        Latest rounds
      </h2>
      <ul className="ch-dh-rows">
        {rounds.slice(0, 4).map((r) => (
          <li key={r.id}>
            <Avatar name={r.playerName} id={r.playerId} size="sm" />
            <span className="ch-dh-rows__b">
              <b>{r.playerName}</b>
              <span>{r.meta}</span>
            </span>
            <b className="ch-num">
              {r.score} <small>{formatToPar(r.toPar)}</small>
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Leaderboard: the top five, rank, coin, average; rows 52, inset 56 (06 11). */
export function DeskBoard({ rows }: { rows: ChCoachHome['leaderboard']['rows'] }) {
  const places = leaderPlaces(rows);
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-board">
      <h2 id="ch-dh-board" className="ch-dh-card__t">
        Leaderboard
      </h2>
      <ol className="ch-dh-rows ch-dh-rows--board">
        {rows.slice(0, 5).map((p, i) => (
          <li key={p.playerId}>
            <span className="ch-dh-rank ch-num">{places[i]!.label}</span>
            <Avatar name={p.name} id={p.playerId} size="sm" />
            <span className="ch-dh-rows__b">
              <b>{p.name}</b>
            </span>
            <b className="ch-num">{formatAvg(p.avg)}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}
