'use client';

import { Avatar } from '../../ui/Avatar';
import { InlineNotice } from '../../ui/Notices';
import { ScoreMark } from '../../ui/ScoreMark';
import { Segmented } from '../../ui/Segmented';
import { SideScroll } from '../../ui/SideScroll';
import { EmptyState } from '../../ui/States';
import { costliest, holeAverages, holeRows, sumHoles, type HoleCardRow } from './desk-model';
import { NoData } from '../../ui/NoData';
import { formatSigned, formatToPar, plural } from './format';
import type { ChTourEvent, ChTourHoleLedger, ChTourPlayer } from './types';

type Mode = 'to-par' | 'scores' | 'counting';

/**
 * Hole analysis (board `Holes`; phone `tm-hg`): one round's hole-by-hole scores for everyone who has a card, as scores
 * (the kit's score marks), to par, or grouped by how each round counted. The last row is the team's average against par
 * on each hole, with the three costliest holes marked. Tap a hole for that card's evidence. A round entered as totals
 * only counts in team scores and is named here, never given holes.
 */
export function HoleGrid({
  event,
  players,
  ledger,
  failed,
  round,
  onRound,
  mode,
  onMode,
  phone,
  onOpen,
  onRetry,
  retrying,
}: {
  event: ChTourEvent;
  players: readonly ChTourPlayer[];
  ledger: ChTourHoleLedger | null;
  failed: boolean;
  round: number;
  onRound: (n: number) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  phone: boolean;
  onOpen: (row: HoleCardRow) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (failed)
    return <InlineNotice code="CH-16220" title="The scorecards didn’t load" body="Team scores are unaffected. Try again." onRetry={onRetry} retrying={retrying} />;
  if (!ledger || ledger.cards.length === 0)
    return <EmptyState compact kind="first-run" code="CH-16321" title="No hole-by-hole scores yet" body="Holes show here once scorecards are in. Team scores use whole rounds either way." />;

  const rows = holeRows(event, ledger, round);
  const pars = ledger.pars;
  const nines = pars.length > 9 ? [pars.slice(0, 9), pars.slice(9)] : [pars];
  const name = (id: string) => players.find((p) => p.id === id);
  const teamRows = rows.filter((r) => r.count !== 'individual');
  const avgs = holeAverages(teamRows, pars);
  const worst = costliest(avgs);
  const starts = new Set(rows.map((r) => r.card.startHole));
  const totalsOnly = ledger.totalsOnly.filter((t) => t.roundNumber === round);
  const cols = `${phone ? 76 : 160}px ${nines.map((n) => `repeat(${n.length}, 34px) 44px`).join(' ')} ${nines.length > 1 ? '50px' : ''}`;
  const parOf = (from: number, n: number) => pars.slice(from, from + n).reduce((a, b) => a + b, 0);
  const label = (r: HoleCardRow) => {
    const first = name(r.playerId)?.first ?? 'Player';
    return `${first}${r.count === 'dropped' || r.count === 'tie' ? ' · NC' : r.count === 'individual' ? ' · Ind.' : ''}`;
  };

  const cell = (r: HoleCardRow, i: number) => {
    const par = pars[i] ?? 0;
    const s = r.strokes[i] ?? null;
    const disputed = r.card.holes[i]?.disputed;
    const d = s == null ? null : s - par;
    return (
      <span key={i} role="cell" className={'ch-tour-desk-hg__c' + (disputed ? ' is-disputed' : '')}>
        <button type="button" className="ch-tour-desk-hg__cell" onClick={() => onOpen(r)} aria-label={`${name(r.playerId)?.name ?? 'Player'} hole ${i + 1}: ${s ?? 'no score'}, par ${par}${disputed ? ', disputed' : ''}. Open the evidence`}>
          {mode === 'to-par' ? (
            <span className={'ch-num ch-tour-desk-hg__tp' + (d != null && d < 0 ? ' ch-tour-under' : '')}>{d == null ? <NoData /> : formatToPar(d)}</span>
          ) : (
            <ScoreMark score={s} par={par} size="sm" />
          )}
        </button>
      </span>
    );
  };

  const line = (r: HoleCardRow) => (
    <div key={`${r.playerId}-${r.card.roundNumber}`} className={'ch-tour-desk-hg__row' + (r.count === 'individual' ? ' is-ind' : '')} role="row" style={{ gridTemplateColumns: cols }}>
      <span role="rowheader" className="ch-tour-desk-hg__who">
        {!phone && <Avatar name={name(r.playerId)?.name ?? '—'} size="xs" />}
        <span>{label(r)}</span>
      </span>
      {nines.map((n, k) => (
        <span key={k} className="ch-tour-desk-hg__nine" role="presentation">
          {n.map((_, j) => cell(r, k * 9 + j))}
          <span role="cell" className="ch-tour-desk-hg__tot ch-num">
            {(k ? r.inn : r.out) ?? <NoData />}
          </span>
        </span>
      ))}
      {nines.length > 1 && (
        <span role="cell" className="ch-tour-desk-hg__tot ch-num">
          {r.total ?? <NoData />}
        </span>
      )}
    </div>
  );

  const groups: Array<{ key: string; title: string | null; rows: HoleCardRow[] }> =
    mode === 'counting'
      ? [
          { key: 'counted', title: 'Counted', rows: rows.filter((r) => r.count === 'counted') },
          { key: 'dropped', title: 'Not counted', rows: rows.filter((r) => r.count === 'dropped' || r.count === 'tie') },
          { key: 'ind', title: 'Individuals', rows: rows.filter((r) => r.count === 'individual') },
        ].filter((g) => g.rows.length > 0)
      : [{ key: 'all', title: null, rows }];

  return (
    <div className={'ch-tour-desk-hg' + (phone ? ' is-phone' : '')}>
      <div className="ch-tour-desk-hg__tools">
        <Segmented size="sm" label="Round" value={`r${round}`} onChange={(v) => onRound(Number(v.slice(1)))} options={event.rounds.map((r) => ({ value: `r${r.number}`, label: phone ? `R${r.number}` : `Round ${r.number}` }))} />
        <Segmented
          size="sm"
          label="Hole view"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'to-par', label: 'To par' },
            { value: 'scores', label: 'Scores' },
            { value: 'counting', label: 'Counting' },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact kind="first-run" code="CH-16321" title="No hole-by-hole scores yet" body={`Round ${round} has no scorecards with holes. Team scores use whole rounds either way.`} />
      ) : (
        <SideScroll className="ch-tour-desk-hg__scroll" role="table" aria-label={`Hole-by-hole scores, round ${round}`} {...(phone ? { tabIndex: 0 } : {})}>
          <div className="ch-tour-desk-hg__row is-head" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader">Hole</span>
            {nines.map((n, k) => (
              <span key={k} className="ch-tour-desk-hg__nine" role="presentation">
                {n.map((_, j) => (
                  <span key={j} role="columnheader">
                    {k * 9 + j + 1}
                  </span>
                ))}
                <span role="columnheader">{k ? 'In' : nines.length > 1 ? 'Out' : 'Tot'}</span>
              </span>
            ))}
            {nines.length > 1 && <span role="columnheader">Tot</span>}
          </div>
          <div className="ch-tour-desk-hg__row is-par" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="rowheader">Par</span>
            {nines.map((n, k) => (
              <span key={k} className="ch-tour-desk-hg__nine" role="presentation">
                {n.map((p, j) => (
                  <span key={j} role="cell" className="ch-num">
                    {p}
                  </span>
                ))}
                <span role="cell" className="ch-num">
                  {parOf(k * 9, n.length)}
                </span>
              </span>
            ))}
            {nines.length > 1 && (
              <span role="cell" className="ch-num">
                {sumHoles(pars)}
              </span>
            )}
          </div>
          {groups.map((g) => (
            <div key={g.key} role="rowgroup" aria-label={g.title ?? undefined}>
              {g.title && <div className="ch-tour-desk-hg__group" role="row"><span role="rowheader">{g.title}</span></div>}
              {g.rows.map(line)}
            </div>
          ))}
          {teamRows.length > 0 && (
            <div className="ch-tour-desk-hg__row is-cost" role="row" style={{ gridTemplateColumns: cols }}>
              <span role="rowheader">Team vs par</span>
              {nines.map((n, k) => (
                <span key={k} className="ch-tour-desk-hg__nine" role="presentation">
                  {n.map((_, j) => {
                    const i = k * 9 + j;
                    const v = avgs[i] ?? null;
                    const tone = worst.includes(i) ? ' is-worst' : v != null && v > 0.5 ? ' is-over' : v != null && v < -0.1 ? ' is-under' : '';
                    return (
                      <span key={j} role="cell">
                        <i className={'ch-tour-desk-heat ch-num' + tone}>{v == null ? <NoData /> : Math.abs(v) < 0.05 ? 'E' : formatSigned(v, 1)}</i>
                        {worst.includes(i) && <span className="ch-sr-only"> costly hole</span>}
                      </span>
                    );
                  })}
                  <span role="cell" />
                </span>
              ))}
              {nines.length > 1 && <span role="cell" />}
            </div>
          )}
        </SideScroll>
      )}
      {phone && rows.length > 0 && <p className="ch-tour-desk-note">Swipe the grid sideways. The page itself doesn’t scroll sideways.</p>}
      {rows.length > 0 && teamRows.length > 0 && (
        <p className="ch-tour-desk-note">
          Highlighted: the {plural(worst.length, 'hole')} that cost the team most in round {round}, averaged over the {plural(teamRows.length, 'team player')}.
          {starts.size > 1 ? ' Starting holes differed, so read these as holes, not as opening or closing stretches.' : ''}
        </p>
      )}
      {totalsOnly.length > 0 && (
        <p className="ch-tour-desk-note">
          {plural(totalsOnly.length, 'round')} in round {round} {totalsOnly.length === 1 ? 'was' : 'were'} entered as totals only: {totalsOnly.length === 1 ? 'it counts' : 'they count'} in team scores, never in hole figures.
        </p>
      )}
    </div>
  );
}
