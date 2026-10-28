'use client';

import { Avatar } from '../../ui/Avatar';
import { SideScroll } from '../../ui/SideScroll';
import { byTotal, notCounted, scoreWords, type DeskRow } from './desk-model';
import { NoData } from '../../ui/NoData';
import { formatToPar, plural } from './format';
import { ToPar } from './parts';
import type { ChTourEvent, ChTourPlayerRound } from './types';

/** How a player's round counted, in words (colour and the NC mark only back them up). */
export function countWords(pr: ChTourPlayerRound | null): string {
  if (!pr) return 'No score';
  if (pr.status === 'wd') return 'Withdrew';
  if (pr.status === 'dq') return 'Disqualified';
  // Out of the team score as a confirmed DQ is (scoring.ts); the words keep it provisional, since it can still change.
  if (pr.status === 'dq_pending') return 'Disqualification pending, not counted';
  switch (pr.count) {
    case 'counted':
      return 'Counted';
    case 'dropped':
      return 'Not counted';
    case 'tie':
      return 'Tied at the line, not counted';
    case 'individual':
      return 'Individual, not in the team score';
    default:
      return 'No score';
  }
}

/**
 * Who counted (board `Contribution`; phone `tm-ct`): every player's whole-round score in each round, the ones that made the
 * team total unmarked and the others marked NC, with the team's own score under the lineup. Each score is a key that opens
 * its evidence. Totals use whole-round scores, never best holes. `round` narrows it to one round and says in words how each
 * score counted; `view` "players" lists everyone flat by their own total, with no team row.
 */
export function WhoCounted({
  event,
  rows,
  round,
  view,
  phone,
  onOpen,
}: {
  event: ChTourEvent;
  rows: readonly DeskRow[];
  round: 'all' | number;
  view: 'team' | 'players';
  phone: boolean;
  onOpen: (row: DeskRow, pr: ChTourPlayerRound) => void;
}) {
  const result = event.team.result;
  const shown = event.rounds.map((r, i) => ({ r, i })).filter(({ r }) => round === 'all' || r.number === round);
  const single = round !== 'all';
  const team = rows.filter((x) => !x.individual);
  const ind = rows.filter((x) => x.individual);
  const flat = view === 'players';
  const body = flat ? byTotal(rows) : [...team];
  const par = result?.total != null && result.toPar != null ? result.total - result.toPar : null;

  const line = (x: DeskRow) => (
    <div key={x.entry.playerId} className={'ch-tour-desk-ct__row' + (x.individual ? ' is-ind' : '')} role="row">
      <span role="cell" className="ch-tour-desk-ct__who">
        {!phone && <Avatar name={x.player?.name ?? '—'} size="sm" />}
        <span>
          <span className="ch-tour-desk-ct__n">{phone ? (x.player?.first ?? 'Player') : (x.player?.name ?? 'Player')}</span>
          <span className="ch-tour-desk-ct__s">
            {x.individual
              ? phone
                ? 'Individual'
                : 'Individual entry · not in team score'
              : phone
                ? `${x.counted}/${x.played} counted`
                : `${x.alternate ? 'Alternate' : (x.player?.year ?? '')}`}
          </span>
        </span>
      </span>
      {shown.map(({ r, i }) => {
        const pr = x.cells[i] ?? null;
        const tie = pr != null && (pr.count === 'tie' || !!event.team.rounds[i]?.tiedAtBoundary.includes(pr.playerId));
        const nc = notCounted(pr);
        return (
          <span role="cell" key={r.number} className="ch-tour-desk-ct__c">
            {pr ? (
              <button
                type="button"
                className={'ch-tour-desk-sc ch-num' + (nc ? ' is-nc' : '') + (tie ? ' is-tie' : '') + (pr.shotData ? '' : ' no-shot')}
                aria-label={`${x.player?.name ?? 'Player'} round ${r.number}: ${scoreWords(pr)}, ${countWords(pr).toLowerCase()}${pr.shotData ? '' : ', scorecard only'}. Open the evidence`}
                onClick={() => onOpen(x, pr)}
              >
                <i className="ch-tour-desk-dot" aria-hidden="true" />
                {scoreWords(pr)}
                {nc && <em aria-hidden="true">NC</em>}
              </button>
            ) : (
              <span className="ch-tour-desk-sc is-none ch-num">
                <NoData />
              </span>
            )}
          </span>
        );
      })}
      {single ? (
        <span role="cell" className="ch-tour-desk-ct__w">
          {countWords(x.cells[shown[0]?.i ?? 0] ?? null)}
        </span>
      ) : (
        <>
          <span role="cell" className="is-r ch-num ch-tour-desk-ct__tot">
            {x.total ?? <NoData />}
          </span>
          {!phone && (
            <span role="cell" className="is-r ch-tour-desk-ct__cnt">
              {x.individual ? <NoData label="Not counted" /> : `${x.counted}/${x.played}`}
            </span>
          )}
        </>
      )}
    </div>
  );

  const teamRow = result && !flat && (
    <div className="ch-tour-desk-ct__row is-team" role="row">
      <span role="cell" className="ch-tour-desk-ct__n">
        {phone ? 'Team' : `Team · lowest ${event.format.counting} each round`}
      </span>
      {shown.map(({ r, i }) => {
        const tr = event.team.rounds[i];
        return (
          <span role="cell" key={r.number} className="ch-tour-desk-ct__c ch-num ch-tour-desk-ct__fin">
            {tr?.total ?? <NoData />}
          </span>
        );
      })}
      {single ? (
        <span role="cell" className="ch-tour-desk-ct__w ch-num">
          <ToPar value={event.team.rounds[shown[0]?.i ?? 0]?.toPar} />
        </span>
      ) : (
        <>
          <span role="cell" className="is-r ch-num ch-tour-desk-ct__fin">
            {result.total ?? <NoData />} <ToPar value={result.toPar} />
          </span>
          {!phone && (
            <span role="cell" className="is-r ch-tour-desk-ct__cnt">
              {par != null ? `Par ${par}` : ''}
            </span>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={'ch-tour-desk-ct' + (phone ? ' is-phone' : '')}>
      <SideScroll
        className={'ch-tour-desk-ct__scroll' + (single ? ' is-single' : '')}
        role="table"
        aria-label={single ? `Who counted in round ${round}` : 'Who counted'}
        style={{ ['--ch-tour-desk-n' as string]: shown.length }}
      >
        <div className="ch-tour-desk-ct__row is-head" role="row">
          <span role="columnheader">Player</span>
          {shown.map(({ r }) => (
            <span role="columnheader" key={r.number} className="is-r">
              R{r.number}
            </span>
          ))}
          {single ? (
            <span role="columnheader">How it counted</span>
          ) : (
            <>
              <span role="columnheader" className="is-r">
                {phone ? 'Tot' : 'Total'}
              </span>
              {!phone && (
                <span role="columnheader" className="is-r">
                  Rounds counted
                </span>
              )}
            </>
          )}
        </div>
        {body.map(line)}
        {teamRow}
        {!flat && ind.map(line)}
      </SideScroll>
      <p className="ch-tour-desk-key">
        <span>
          <span className="ch-tour-desk-sc is-nc ch-num">
            74<em>NC</em>
          </span>
          Not counted that round
        </span>
        <span>
          <i className="ch-tour-desk-dot" aria-hidden="true" />
          Shot data
        </span>
        <span>
          <i className="ch-tour-desk-dot no-shot" aria-hidden="true" />
          Scorecard only
        </span>
        <span>Team totals use whole-round scores, never best holes</span>
      </p>
      {single && <RoundNote event={event} round={round as number} rows={rows} />}
    </div>
  );
}

/** One round in a sentence: who made the count, who did not, from the round's own sets. */
function RoundNote({ event, round, rows }: { event: ChTourEvent; round: number; rows: readonly DeskRow[] }) {
  const tr = event.team.rounds.find((r) => r.roundNumber === round);
  if (!tr) return null;
  const name = (id: string) => rows.find((x) => x.entry.playerId === id)?.player?.first ?? 'A player';
  const at = Math.max(0, event.rounds.findIndex((r) => r.number === round));
  const score = (id: string) => rows.find((x) => x.entry.playerId === id)?.cells[at]?.total ?? null;
  const list = (ids: readonly string[]) => ids.map((id) => `${name(id)} ${score(id) ?? 'no score'}`).join(', ');
  return (
    <p className="ch-tour-desk-note">
      Round {round}: the lowest {tr.counting.length} of {tr.counting.length + tr.dropped.length} whole-round scores counted for {tr.total ?? <NoData />} ({formatToPar(tr.toPar)}). Counted: {list(tr.counting)}.
      {tr.dropped.length > 0 && ` Not counted: ${list(tr.dropped)}.`}
      {tr.tiedAtBoundary.length > 0 && ` ${plural(tr.tiedAtBoundary.length, 'score')} tied at the line.`}
    </p>
  );
}
