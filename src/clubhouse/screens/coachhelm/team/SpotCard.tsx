'use client';
import { pluralWord } from '../../../lib/plural';

import { useRef } from 'react';
import { formatSigned } from '../../../lib/format';
import { patternAt, readsAt, stationOrder, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { STATION_NAME } from './hole-geometry';
import { Coin, Notice, ReadRow } from './parts';
import { useContentIn, useRowFlip } from './team-motion';

const ZERO_AT = 84;
const LOSS_SCALE = 1.3;
const GAIN_SCALE = 0.25;

/** A loss of 1.30 fills the 84% to the left, a gain of 0.25 the 16% to the right, clamped beyond (AC-SPOT-03). */
export const barScale = (v: number): number => (v < 0 ? Math.min(Math.abs(v) / LOSS_SCALE, 1) : Math.min(v / GAIN_SCALE, 1));

function BarRow({ player, station, teamValue, onPlayer }: { player: ChTeamPlayer; station: ChStation; teamValue: number | null; onPlayer: (id: string) => void }) {
  const leg = player.legs[station];
  const v = leg.strokes;
  const name = (
    <span className="bn">
      <Coin player={player} small />
      {player.first}
    </span>
  );
  if (v == null)
    return (
      <button type="button" className="br tapp" data-p={player.id} onClick={() => onPlayer(player.id)} aria-label={`${player.name}, ${leg.missing ?? 'not measured'}`}>
        {name}
        <span className="bmiss">{leg.missing}</span>
        <span className="bv is-none">—</span>
      </button>
    );
  const loss = v < 0;
  return (
    <button type="button" className="br tapp is-row" data-p={player.id} data-early={player.early || undefined} onClick={() => onPlayer(player.id)} aria-label={`${player.name}, ${formatSigned(v)}`}>
      {name}
      <span className="bt">
        <i className="z" />
        {/* On the fills' own scale, either side of Tour (TEAM-9). */}
        {teamValue != null && <i className="avg" style={{ left: `${teamValue < 0 ? ZERO_AT - (Math.min(-teamValue, LOSS_SCALE) / LOSS_SCALE) * ZERO_AT : ZERO_AT + (Math.min(teamValue, GAIN_SCALE) / GAIN_SCALE) * (100 - ZERO_AT)}%` }} />}
        <i className={`bf ${loss ? 'l' : 'g'}${player.early ? ' early' : ''}`} style={{ transform: `scaleX(${barScale(v)})` }} />
      </span>
      <span className={'bv ch-num' + (loss ? '' : Math.abs(v) < 0.05 ? ' is-even' : ' g')}>{formatSigned(v)}</span>
    </button>
  );
}

/** One spot on the hole: bars worst first, the reads in the feed's order, the shared pattern or why there isn't one (AC-SPOT). */
export function SpotCard({
  data,
  station,
  onRead,
  onPlayer,
  onRetry,
}: {
  data: ChTeamBoardData;
  station: ChStation;
  onRead: (id: string) => void;
  onPlayer: (id: string) => void;
  onRetry?: () => void;
}) {
  const list = data.players.list;
  const teamValue = data.stations[station].team;
  const rank = stationOrder(data.stations).indexOf(station);
  // Players with a figure here (AC-SPOT-02); one with no figure has nothing to draw on the bar.
  const rows = list.filter((p) => p.legs[station].strokes != null).sort((a, b) => (a.legs[station].strokes as number) - (b.legs[station].strokes as number));
  const reads = readsAt(list, station);
  const patterns = patternAt(data.patterns, station);
  const names = new Map(list.map((p) => [p.id, p]));
  const card = useRef<HTMLElement | null>(null);
  useRowFlip(card, station);
  useContentIn(card, station, '.ch, .subh, .rds, .pat, .nopat');
  const status = data.patternsStatus ?? 'ok';
  return (
    <section ref={card} className="card spot" data-spot="" data-ch-team-card="spot" aria-label={STATION_NAME[station]}>
      <div className="ch">
        <h4>{STATION_NAME[station]}</h4>
        <span className="meta">
          {teamValue == null ? 'Not measured' : `${formatSigned(teamValue)} a round${rank === 0 && teamValue < 0 ? ' · biggest leak' : ''}`}
        </span>
      </div>
      <div className="spl">
        <div className="spl-l">
          {!rows.length && <p className="nordss">No player has enough rounds here yet.</p>}
          <div className="bars">
            {rows.map((p) => (
              <BarRow key={p.id} player={p} station={station} teamValue={teamValue} onPlayer={onPlayer} />
            ))}
          </div>
          {rows.length > 0 && (
            <div className="axis">
              <span className="axis__team">
                <i aria-hidden="true" />
                Team average
              </span>
              <span>Tour</span>
            </div>
          )}
        </div>
        <div className="spl-r">
          <div className="subh">
            What CoachHelm sees here · {reads.length} open {pluralWord(reads.length, 'read', 'reads')}
          </div>
          <div className="rds">
            {reads.map(({ player, read }) => (
              <ReadRow key={read.id} player={player} read={read} onOpen={onRead} />
            ))}
            {!reads.length && <p className="nordss">No open reads here yet. CoachHelm reads a spot once a player has enough rounds to stand behind it.</p>}
          </div>
          {status === 'failed' ? (
            <div className="nopat" role="status">
              <Notice title="Couldn’t load this part." onRetry={onRetry} />
            </div>
          ) : status === 'off' ? null : patterns.length ? (
            patterns.map((row) => (
              <div className="pat" key={row.id}>
                <div className="pc">
                  {(row.memberIds ?? []).map((id) => {
                    const p = names.get(id);
                    return p ? <Coin key={id} player={p} small /> : null;
                  })}
                </div>
                <b>{row.title}</b>
                <span>
                  {row.members}
                  {row.next ? ` · common step: ${row.next}` : ''}
                </span>
              </div>
            ))
          ) : (
            <p className="nopat">No shared pattern here yet. CoachHelm needs three players with the same step before it calls one.</p>
          )}
        </div>
      </div>
    </section>
  );
}
