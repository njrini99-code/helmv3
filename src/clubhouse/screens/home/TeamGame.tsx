'use client';

import { Fragment } from 'react';
import type { ChLegPeople, ChTeamLeg, ChTeamLegs } from '../../data/home';
import { changeTone, formatFixed, formatSigned } from '../../lib/format';
import { sgBaseline, sgExtremeWords, type ChSgTour } from '../../lib/sg';
import { NoData } from '../../ui/NoData';
import { legChange, NoHoleRounds, NOBODY_RANKED, Notices, People } from './TeamLegs';

/**
 * The team's game on coach Home, in Player Home's "Your game" layout (lay-01, owner 15 Nov 2026): the four parts as the
 * player's cards, each with the part's stat, the team's strokes gained per round in plain ink (colour lives only on the
 * change line under it, HOME-P-16), the one bar against the Tour that the player's cards draw (HOME-P-20), and who gains
 * and loses most. Same `ChTeamLegs` read as before, on the team average's own rounds.
 */
export function TeamGame({ legs, phone, covered = false }: { legs: ChTeamLegs; phone: boolean; covered?: boolean }) {
  const { vs } = sgBaseline(legs.tour);
  const worst = legs.rows
    .filter((l): l is ChTeamLeg & { sg: number } => l.sg != null && l.sg < 0)
    .sort((a, b) => a.sg - b.sg)
    .slice(0, 2)
    .map((l) => l.label);
  const head = phone ? (
    <div className="ch-hm-sec__h">
      <h2 id="ch-ph-tm-legs">The team’s game</h2>
      <span className="ch-hm-meta">Strokes gained {vs}</span>
    </div>
  ) : (
    <div className="ch-ph-game__h">
      <div>
        <h2 id="ch-ph-tm-legs">The team’s game</h2>
        <span>Last 10 rounds · strokes gained per round {vs} · the same rounds as the team average</span>
      </div>
    </div>
  );
  return (
    <section className={phone ? 'ch-hm-sec ch-ph-legs-sec is-phone ch-ph-tm' : 'ch-ph-legs-sec ch-ph-tm'} aria-labelledby="ch-ph-tm-legs">
      {head}
      <Notices legs={legs} covered={covered} />
      {legs.holeRounds === 0 ? (
        <NoHoleRounds />
      ) : (
        <>
          <div className="ch-ph-legs">
            {legs.rows.map((leg) => (
              <TeamLeg key={leg.key} leg={leg} tour={legs.tour} />
            ))}
          </div>
          {!legs.ranked ? (
            <p className="ch-ph-note" data-ch-code="CH-2315">
              {NOBODY_RANKED}
            </p>
          ) : worst.length ? (
            <p className="ch-ph-note">{`${worst.join(' and ')} cost${worst.length === 1 ? 's' : ''} the most.`}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function TeamLeg({ leg, tour }: { leg: ChTeamLeg; tour: ChSgTour }) {
  const { stat } = leg;
  const lowerIsBetter = stat.label === 'Putts';
  const fmt = (v: number) => (stat.unit === '%' ? `${Math.round(v)}%` : formatFixed(v, stat.digits));
  // The player's benchmark bar: a share of the scale for rates, or a putts band (fewer is further right).
  const pos = (v: number) => (stat.unit === '%' ? Math.max(0, Math.min(100, v)) : Math.max(0, Math.min(100, ((36 - v) / (36 - 26)) * 100)));
  // Against the Tour as the two figures print; level is neither, and an early read is never toned (A2, A7).
  const against = stat.value != null && stat.tour != null && !stat.early ? changeTone(stat.value - stat.tour, lowerIsBetter, stat.unit === '%' ? 0 : stat.digits) : '';
  const change = legChange(leg);
  const id = `ch-ph-tm-leg-${leg.key}`;
  return (
    <article className="ch-ph-leg" aria-labelledby={id}>
      <div className="ch-ph-leg__h">
        <b id={id}>{leg.label}</b>
        {leg.sg != null && (
          // Plain ink with its sign: the change line under the figure is the verdict, so the two never disagree in colour.
          <span className="ch-ph-leg__sg ch-num is-flat">
            {formatSigned(leg.sg)}
            <span className="ch-sr-only"> strokes gained a round, last 10 rounds</span>
          </span>
        )}
      </div>
      <div className="ch-ph-leg__v">
        <span className="ch-num">{stat.value == null ? <NoData /> : fmt(stat.value)}</span>
        <em>{stat.value == null && stat.needs ? `${stat.label} · ${stat.needs}` : stat.early ? `${stat.label} · ${stat.early}` : stat.label}</em>
      </div>
      <p className={'ch-ph-leg__chg ' + change.tone}>{change.words}</p>
      {stat.value != null && stat.tour != null && (
        <div className="ch-ph-bench">
          <span className="ch-ph-bench__t" aria-hidden="true">
            <i className={against} style={{ width: `${pos(stat.value)}%` }} />
            <em style={{ left: `${pos(stat.tour)}%` }} />
          </span>
          <span className="ch-ph-bench__k ch-num">
            <span>Team {fmt(stat.value)}</span>
            <span>
              {sgBaseline(tour).mark} {fmt(stat.tour)}
            </span>
          </span>
        </div>
      )}
      {leg.gains && (
        <p className="ch-ph-leg__n">
          <Who p={leg.gains} kind="gains" />
          {leg.loses && (
            <>
              <br />
              <Who p={leg.loses} kind="loses" />
            </>
          )}
        </p>
      )}
    </article>
  );
}

/** "Theo M. gains most +0.8", the names linking to each player's game on Stats, the figure the first named player's. A best player below zero is "least behind", and a zero says "breaks even" with no figure (L-013). */
function Who({ p, kind }: { p: ChLegPeople; kind: 'gains' | 'loses' }) {
  const said = sgExtremeWords(kind, p.value, p.names.length > 1);
  return (
    <Fragment>
      <People p={p} className="ch-ph-leg__who" /> {said.words}
      {said.figure && (
        <>
          {' '}
          <span className="ch-num">{formatSigned(p.value, 1)}</span>
        </>
      )}
    </Fragment>
  );
}
