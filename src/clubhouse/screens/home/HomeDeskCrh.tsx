'use client';

import Link from 'next/link';
import type { ChCoachHome, ChHomeEvent } from '../../data/home';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { CALENDAR, eventHref, whenLabel } from './event-links';
import { Icon } from '../../ui/Icon';
import { EmptyShape } from '../../ui/EmptyShape';
import { useChClockText } from '../../lib/use-clock';
import { formatAvg, formatToPar } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { plural } from '../../lib/plural';
import type { ChYearKey } from '../../lib/class-year';
import { leaderPlaces } from './Leaderboard';
import { rebuiltHref } from '../../shell/nav';

/** A card with this many rows or fewer leaves room beside Team scoring, and says what the list holds (design parity, 5 Nov). */
const FEW_AGENDA_ROWS = 3;
/** The rows these two cards show (06 11). */
const DESK_ROUNDS = 4;
const DESK_BOARD = 5;

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
 * This week: today's rows, then what is coming, rows 56 (06 §11.4). The card matches Team scoring's height, so a short list
 * ends with a quiet line that says what the list holds: later days list competitions only, so it never says the week is empty.
 */
export function DeskAgenda({ rows: all, heroId = null }: { rows: ChCoachHome['week']['agenda']; /** The event the hero's Up next shows: an event shows once on Home (HOME-S3). */ heroId?: string | null }) {
  const t = useChClockText();
  const rows = all.filter((r) => r.id !== heroId);
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-week">
      <DeskHead id="ch-dh-week" title="This week" href={CALENDAR} link="Calendar" />
      {rows.length === 0 ? (
        <div className="ch-dh-none" data-ch-code="CH-2301">
          <p>{all.length ? 'Nothing else on the calendar this week.' : 'Nothing on the calendar this week.'}</p>
          <EmptyShape kind="time" count={1} />
        </div>
      ) : (
        <>
          <ul className="ch-dh-rows ch-dh-rows--agenda">
            {rows.map((r) => (
              <li key={r.id}>
                <span className="ch-dh-time ch-num">{t(r.timeLabel)}</span>
                <i className={r.isNext ? 'is-next' : ''} aria-hidden="true" />
                <span className="ch-dh-rows__b">
                  <b>{r.title}</b>
                  {r.detail && <span>{r.detail}</span>}
                </span>
                {r.isNext && <span className="ch-hm-now">Next</span>}
              </li>
            ))}
          </ul>
          {rows.length <= FEW_AGENDA_ROWS && <p className="ch-dh-rest">That’s today and this week’s competitions.</p>}
        </>
      )}
    </section>
  );
}

/**
 * Latest rounds: the newest four, not tappable (06 11), the score in a well over its to-par. A failed or empty read takes today's
 * section, in the caller. No sparkline: a round row carries no per-round line of its own, and the leaderboard's trend counts other rounds.
 */
export function DeskRounds({ rounds, years }: { rounds: ChCoachHome['latestRounds']['rounds']; years?: Record<string, ChYearKey> }) {
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-rounds">
      <DeskHead id="ch-dh-rounds" title="Latest rounds" href={rebuiltHref('/golf/dashboard/stats')} link="Team stats" />
      <ul className="ch-dh-rows ch-dh-rows--rounds">
        {rounds.slice(0, DESK_ROUNDS).map((r) => (
          <li key={r.id}>
            <span className="ch-dh-coin" data-year={years?.[r.playerId]}>
              <Avatar name={r.playerName} id={r.playerId} size="sm" />
            </span>
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

/**
 * Leaderboard: the top five, rank, coin, average; rows 52, inset 56 (06 11). The rank rule stays leaderPlaces' (B13); an early read has
 * no place, so its rank column holds a dash (HOME-S8). Each average is this season's 18-hole rounds and says how many (HOME-S6).
 */
export function DeskBoard({ rows, rosterSize, years }: { rows: ChCoachHome['leaderboard']['rows']; rosterSize: number; years?: Record<string, ChYearKey> }) {
  const shown = rows.slice(0, DESK_BOARD);
  const places = leaderPlaces(rows);
  const unplaced = shown.some((_, i) => places[i]!.place == null);
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-board">
      <DeskHead id="ch-dh-board" title="Leaderboard" href={rebuiltHref('/golf/dashboard/roster')} link="Roster" />
      <ol className="ch-dh-rows ch-dh-rows--board">
        {shown.map((p, i) => (
          <li key={p.playerId}>
            <span className="ch-dh-rank ch-num">{places[i]!.place == null ? '—' : places[i]!.label}</span>
            <span className="ch-dh-coin" data-year={years?.[p.playerId]}>
              <Avatar name={p.name} id={p.playerId} size="sm" />
            </span>
            <span className="ch-dh-rows__b">
              <b>{p.name}</b>
              <span className="ch-num">{plural(p.rounds, 'round')}</span>
            </span>
            <b className="ch-num">{formatAvg(p.avg)}</b>
          </li>
        ))}
      </ol>
      <p className="ch-dh-rest">
        Season average, 18-hole rounds.
        {unplaced ? ' Early reads have no place until three rounds.' : shown.length < DESK_BOARD && rosterSize > rows.length ? ' Players join the board with their first 18-hole round.' : ''}
      </p>
    </section>
  );
}
