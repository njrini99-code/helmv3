'use client';

import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import type { ChCoachHome, ChHomeEvent } from '../../data/home';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { CALENDAR, eventHref, whenLabel } from './event-links';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { plural } from '../../lib/plural';
import { EmptyState } from '../../ui/States';
import { useChClockText } from '../../lib/use-clock';
import { formatAvg, formatToPar } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { leaderPlaces } from './Leaderboard';
import { rebuiltHref } from '../../shell/nav';
import { WeekStrip, type WeekStripDay } from '../../ui/WeekStrip';

/** A card with this many rows or fewer leaves room beside Team scoring, and says what the list holds (design parity, 5 Nov). */
const FEW_AGENDA_ROWS = 3;
/** The rows these two cards show (06 11). */
const DESK_ROUNDS = 4;
const DESK_BOARD = 5;

/** The week's seven days for the shared strip: phone takes the weekday's letter, desktop its short name. */
export function weekStripDays(days: ChCoachHome['week']['days'], letter: boolean): WeekStripDay[] {
  return days.map((d) => ({
    date: d.date,
    top: letter ? d.weekday.slice(0, 1) : d.weekday,
    num: d.dayOfMonth,
    isToday: d.isToday,
    dots: d.eventCount,
    mark: d.hasCompetition ? TYPE_ICON[d.competitionType ?? 'tournament'] : undefined,
    label: `${d.weekday} ${d.dayOfMonth}${d.isToday ? ', today' : ''}${d.hasCompetition ? ', competition' : ''}, ${plural(d.eventCount, 'event')}`,
    href: `${CALENDAR}?view=day&date=${d.date}`,
  }));
}

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
 * This week: today's rows, then what is coming, rows 56 (06 §11.4). The card matches Team scoring's height, so a short list
 * gives the room to the week's seven days (the strip the phone already has, each a link to that day) and a quiet line that says
 * what the list holds: later days list competitions only, so it never says the week is empty.
 */
export function DeskAgenda({ rows, days }: { rows: ChCoachHome['week']['agenda']; days: ChCoachHome['week']['days'] }) {
  const t = useChClockText();
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-week">
      <DeskHead id="ch-dh-week" title="This week" href={CALENDAR} link="Calendar" />
      {rows.length === 0 ? (
        <EmptyState compact kind="first-run" code="CH-2301" title="Nothing on the calendar this week" body="Practices, qualifiers and travel show up here." />
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
      {rows.length <= FEW_AGENDA_ROWS && (
        <>
          <WeekStrip label="This week, day by day" className="ch-dh-week" maxDots={4} days={weekStripDays(days, false)} />
          <p className="ch-dh-rest">That’s today and this week’s competitions.</p>
        </>
      )}
      </>
      )}
    </section>
  );
}

/**
 * Latest rounds: the newest four, not tappable (06 11), the score in a well over its to-par. A failed or empty read takes today's
 * section, in the caller. No sparkline: a round row carries no per-round line of its own, and the leaderboard's trend counts other rounds.
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

/**
 * Leaderboard: the top five, rank, coin, average; rows 52, inset 56 (06 11). The rank rule stays leaderPlaces' (B13). When nobody has a
 * place yet there is no rank column to fill: a column of dashes reads as broken, so the rows drop it and a quiet line says why.
 */
export function DeskBoard({ rows, rosterSize }: { rows: ChCoachHome['leaderboard']['rows']; rosterSize: number }) {
  const shown = rows.slice(0, DESK_BOARD);
  const places = leaderPlaces(rows);
  const unplaced = shown.every((_, i) => places[i]!.place == null);
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-board">
      <DeskHead id="ch-dh-board" title="Leaderboard" href={rebuiltHref('/golf/dashboard/roster')} link="Roster" />
      <ol className={'ch-dh-rows ch-dh-rows--board' + (unplaced ? ' is-unplaced' : '')}>
        {shown.map((p, i) => (
          <li key={p.playerId}>
            {!unplaced && <span className="ch-dh-rank ch-num">{places[i]!.label}</span>}
            <Avatar name={p.name} id={p.playerId} size="sm" />
            <span className="ch-dh-rows__b">
              <b>{p.name}</b>
            </span>
            <b className="ch-num">{formatAvg(p.avg)}</b>
          </li>
        ))}
      </ol>
      {unplaced ? (
        <p className="ch-dh-rest">Early reads. Places start at three 18-hole rounds.</p>
      ) : (
        shown.length < DESK_BOARD && rosterSize > rows.length && <p className="ch-dh-rest">Players join the board with their first 18-hole round.</p>
      )}
    </section>
  );
}

/** The board before there is one, in the board's own card: who to invite, or that it fills in as rounds are posted. */
export function DeskBoardEmpty({ rosterSize, inviteHref }: { rosterSize: number; inviteHref: string | null }) {
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-board">
      <DeskHead id="ch-dh-board" title="Leaderboard" href={rebuiltHref('/golf/dashboard/roster')} link="Roster" />
      {rosterSize === 0 ? (
        <EmptyState
          compact
          kind="first-run"
          code="CH-2304"
          title="No players on the roster yet."
          body="Share your team code from Roster; players appear here as they join."
          action={
            inviteHref ? (
              <Button size="sm" variant="primary" leftIcon={UserPlus} href={inviteHref}>
                Invite players
              </Button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState compact kind="first-run" code="CH-2305" title="No 18-hole rounds posted yet this season." body={`${plural(rosterSize, 'player is', 'players are')} on the roster. The leaderboard fills in as rounds are posted.`} />
      )}
    </section>
  );
}
