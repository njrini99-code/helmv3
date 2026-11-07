'use client';

import Link from 'next/link';
import type { ChCoachHome, ChHomeEvent } from '../../data/home';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { eventHref, whenLabel } from './event-links';
import { Icon } from '../../ui/Icon';
import { useChClockText } from '../../lib/use-clock';
import { formatToPar } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { rebuiltHref } from '../../shell/nav';

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
function DeskHead({ id, title, href, link }: { id: string; title: string; href: string | null; link: string }) {
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
 * Latest rounds: the newest four, not tappable (06 11), the score in a well over its to-par. A failed or empty read takes today's
 * section, in the caller. No sparkline: a round row carries no per-round line of its own, and a trend counts other rounds.
 */
export function DeskRounds({ rounds }: { rounds: ChCoachHome['latestRounds']['rounds'] }) {
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-rounds">
      <DeskHead id="ch-dh-rounds" title="Latest rounds" href={rebuiltHref('/golf/dashboard/stats')} link="Team stats" />
      <ul className="ch-dh-rows ch-dh-rows--rounds">
        {rounds.slice(0, DESK_ROUNDS).map((r) => (
          <li key={r.id}>
            <Avatar name={r.playerName} id={r.playerId} size="sm" />
            <span className="ch-dh-rows__b">
              <b>{r.playerName}</b>
              <span>{r.meta}</span>
            </span>
            <span className={'ch-dh-score ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>
              <b>{r.score}</b>
              <em>{formatToPar(r.toPar)}</em>
            </span>
          </li>
        ))}
      </ul>
      {rounds.length < DESK_ROUNDS && <p className="ch-dh-rest">New rounds show here as players post them.</p>}
    </section>
  );
}
