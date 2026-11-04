'use client';

import type { ChCoachHome, ChTeamLegs } from '../../data/home';
import { changeTone, formatAvg, formatSigned, formatToPar } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { NoData } from '../../ui/NoData';
import { legChange, legStatText } from './TeamLegs';
import { leaderPlaces } from './Leaderboard';

/** The team's game on the desktop's redesign: four columns with dividers (`.dlegs`, classes-roster-home 06 11). */
export function DeskLegs({ legs }: { legs: ChTeamLegs }) {
  return (
    <section className="ch-dh-card" aria-labelledby="ch-dh-legs">
      <h2 id="ch-dh-legs" className="ch-dh-card__t">
        The team’s game
      </h2>
      <ul className="ch-dh-legs">
        {legs.rows.map((leg) => {
          const change = legChange(leg);
          return (
            <li key={leg.key}>
              <b className="ch-dh-legs__l">{leg.label}</b>
              <b className={'ch-dh-legs__sg ch-num ' + changeTone(leg.sg, false)}>{leg.sg == null ? <NoData /> : formatSigned(leg.sg)}</b>
              <span className="ch-num">{legStatText(leg.stat)}</span>
              <em className={change.tone}>{change.words}</em>
            </li>
          );
        })}
      </ul>
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
