'use client';

import { X } from 'lucide-react';
import { STATIONS, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import type { ChInsight } from '../../../data/coachhelm-shape';
import { playerFileHref, readHref } from '../../../data/coachhelm-views-shape';
import type { CourseHistoryRow } from '@/lib/coachhelm/v3/team-board/course-shape';
import { formatFixed, formatSigned } from '../../../lib/format';
import { Icon } from '../../../ui/Icon';
import { FocusActions, type ChFocusActions } from '../parts';
import { barScale } from './SpotCard';
import { toPar } from './CourseCard';
import { STATION_NAME, STATION_SHORT } from './hole-geometry';
import { Chevron, Coin, ReadRow } from './parts';

const areaName = (r: ChInsight) => (r.area ? STATION_NAME[r.area] : 'Course and scoring');

function Head({ lead, name, line, onClose }: { lead: React.ReactNode; name: string; line: string; onClose: () => void }) {
  return (
    <div className="insh">
      {lead}
      <span className="c">
        <b>{name}</b>
        <span>{line}</span>
      </span>
      <button type="button" className="xb" aria-label="Close" onClick={onClose}>
        <Icon icon={X} size={16} />
      </button>
    </div>
  );
}

/** Your figure, the team pool and the Tour, as bars from zero in one scale; the Team row only with a pool of five or more (W-TEAM-11). */
function Comparison({ read, first }: { read: ChInsight; first: string }) {
  const c = read.compare;
  if (!c || c.you == null) return null;
  const mx = Math.max(c.you, c.team ?? 0, c.tour ?? 0) * 1.08 || 1;
  const fmt = (v: number) => `${formatFixed(v, c.unit === '%' ? 0 : Math.abs(v) < 10 ? 2 : 1)}${c.unit}`;
  const row = (label: string, v: number, cls: string) => (
    <div className="ld" key={label}>
      <span>{label}</span>
      <span className="t">
        <i className={cls} style={{ width: `${(v / mx) * 100}%` }} />
      </span>
      <span className="v">{fmt(v)}</span>
    </div>
  );
  return (
    <section className="card">
      <div className="ch">
        <h4>{read.evidence.label}</h4>
        <span className="meta">{c.higherBetter ? 'Higher is better' : 'Lower is better'}</span>
      </div>
      <div className="lad">
        {row(first, c.you, 'you')}
        {c.team != null && row('Team', c.team, '')}
        {c.tour != null && row('Tour', c.tour, 'tour')}
      </div>
      {c.team == null && <p className="nordss ch-htb-ladnote">Team: not measured for this read</p>}
      {c.tour == null && <p className="nordss ch-htb-ladnote">No Tour figure for single holes, so none is drawn.</p>}
    </section>
  );
}

/** The read, one component in the phone sheet and the desktop inspector (AC-READ). */
export function ReadPanel({
  read,
  player,
  fa,
  missing,
  readOn,
  roster,
  onClose,
}: {
  read: ChInsight;
  player: ChTeamPlayer;
  fa: ChFocusActions;
  missing?: ChTeamBoardData['missing'];
  readOn: boolean;
  roster: ReadonlyArray<{ id: string }>;
  onClose: () => void;
}) {
  const cause = read.engine?.cause?.word;
  const word = read.evidence.read?.word;
  const href = readHref(player.id, read.id, roster, readOn);
  return (
    <>
      <Head lead={<Coin player={player} />} name={player.name} line={`${areaName(read)} · ${player.rounds} rounds this season`} onClose={onClose} />
      <h3>{read.title}</h3>
      <p className="lede">{read.lede}</p>
      <div className="evs">
        {read.stale && <span className="chipk">Out of date</span>}
        {read.stakes && <span className="chipk l">Worth {read.stakes} a round</span>}
        {word && <span className={'chipk' + (word === 'Solid read' ? ' g' : '')}>{word}</span>}
        {cause && <span className="chipk">Cause: {cause}</span>}
        {read.evidence.window && <span className="chipk">{read.evidence.window}</span>}
      </div>
      <Comparison read={read} first={player.first} />
      {read.week?.title ? (
        <section className="card">
          <div className="drill">
            <span className="dicon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <span>
              <b>{read.week.title}</b>
              {read.week.meta && <span>{read.week.meta}</span>}
            </span>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="drill">
            <span className="dicon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 2" />
              </svg>
            </span>
            <span>
              <b>Still gathering</b>
              {read.week?.text && <span>{read.week.text}</span>}
            </span>
          </div>
        </section>
      )}
      {!read.stale && (
        <div className="acts" data-acts="">
          <FocusActions fa={fa} target={{ playerId: player.id, first: player.first, ins: read }} missing={missing} where="board" />
        </div>
      )}
      {href && (
        <a className="lk" href={href}>
          Open the full read <Chevron />
        </a>
      )}
    </>
  );
}

export function PlayerPanel({ player, data, onRead, fileOn, onClose }: { player: ChTeamPlayer; data: ChTeamBoardData; onRead: (id: string) => void; fileOn: boolean; onClose: () => void }) {
  const reads = [...player.reads.needs, ...player.reads.working];
  const page = (
    <a className="lk" href={playerFileHref(player.id, undefined, fileOn)}>
      Open {player.first}’s page <Chevron />
    </a>
  );
  const year = player.classYear ?? 'Player';
  if (player.rounds === 0)
    return (
      <>
        <Head lead={<Coin player={player} />} name={player.name} line={`${year} · no rounds yet this season`} onClose={onClose} />
        <section className="card">
          <div className="notice" style={{ paddingTop: 16 }}>
            <div>
              <b>Nothing to show yet</b>
              <span>{player.first}’s four-area figures show after their first round this season.</span>
            </div>
          </div>
        </section>
        {page}
      </>
    );
  return (
    <>
      <Head lead={<Coin player={player} />} name={player.name} line={`${year} · ${player.rounds} rounds · ${formatSigned(player.total)} a round to Tour${player.early ? ' · early' : ''}`} onClose={onClose} />
      <section className="card">
        <div className="ch">
          <h4>Where {player.first} gains and loses</h4>
          <span className="meta">This season</span>
        </div>
        <div className="bars">
          {STATIONS.map((s) => {
            const v = player.legs[s].strokes;
            const team = data.stations[s].team;
            return (
              <div className="br" key={s}>
                <span className="bn">{STATION_SHORT[s]}</span>
                {v == null ? (
                  <span className="bmiss">{player.legs[s].missing}</span>
                ) : (
                  <span className="bt">
                    <i className="z" />
                    {team != null && <i className="avg" style={{ left: `${84 - (Math.min(Math.abs(team), 1.3) / 1.3) * 84}%` }} />}
                    <i className={`bf ${v < 0 ? 'l' : 'g'}${player.early ? ' early' : ''}`} style={{ transform: `scaleX(${barScale(v)})` }} />
                  </span>
                )}
                <span className={'bv' + (v != null && v >= 0 ? ' g' : '')}>{formatSigned(v)}</span>
              </div>
            );
          })}
        </div>
        <div className="axis">
          <span>Team average dashed</span>
          <span>Tour</span>
        </div>
      </section>
      <section className="card">
        <div className="ch">
          <h4>Open reads</h4>
          <span className="meta">{reads.length}</span>
        </div>
        <div className="rds">
          {reads.map((r) => (
            <button type="button" className="rd tapp" key={r.id} onClick={() => onRead(r.id)}>
              <Coin player={player} />
              <span>
                <b>{r.title}</b>
                <span className="ev">
                  {r.stakes && <span className="chipk l">{r.stakes} a round</span>}
                  {r.evidence.sample && <span>{r.evidence.sample}</span>}
                </span>
              </span>
              <Chevron />
            </button>
          ))}
          {!reads.length && <p className="nopat">No open reads.</p>}
        </div>
      </section>
      {page}
    </>
  );
}

/** One course: players here against their own season (S-TEAM.course-sheet). */
export function CourseSheet({ row, data, onPlayer, onRead, onClose }: { row: CourseHistoryRow; data: ChTeamBoardData; onPlayer: (id: string) => void; onRead: (id: string) => void; onClose: () => void }) {
  const season = data.course.history?.season ?? 0;
  const d = Math.round((row.value - season) * 10) / 10;
  const list = data.players.list;
  const byId = new Map(list.map((p) => [p.id, p]));
  const reads = data.course.reads.filter((r) => r.courseId === row.id);
  const here = [...row.players].sort((a, b) => a.value - b.value);
  const all = here.flatMap((x) => [x.value, x.season]);
  const lo = Math.min(...all, 0) - 0.6;
  const hi = Math.max(...all, 0) + 0.6;
  const at = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <>
      <Head
        lead={
          <span className="cicon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14.5V2m0 .5h7.5l-1.8 2.8 1.8 2.7H4" />
            </svg>
          </span>
        }
        name={row.name}
        line={`${row.rounds} rounds this season · last ${row.last}`}
        onClose={onClose}
      />
      <div className="cmk sh">
        <b>{toPar(row.value)}</b>
        <span>
          a round to par here
          <br />
          {d ? `${Math.abs(d).toFixed(1)} ${d > 0 ? 'over' : 'under'} the team’s season of ${toPar(season)}` : 'Level with the team’s season'}
        </span>
      </div>
      <section className="card">
        <div className="ch">
          <h4>Players here</h4>
          <span className="meta">Against their own season</span>
        </div>
        <div className="cpl">
          {here.map((x) => {
            const p = byId.get(x.id);
            if (!p) return null;
            const dd = Math.round((x.value - x.season) * 10) / 10;
            return (
              <button type="button" className="cp tapp" key={x.id} onClick={() => onPlayer(x.id)} aria-label={`${p.name}: ${toPar(x.value)} a round here from ${x.rounds} ${x.rounds === 1 ? 'round' : 'rounds'}, season ${toPar(x.season)}`}>
                <Coin player={p} small />
                <span className="n">
                  <b>{p.first}</b>
                  <span>
                    {x.rounds} {x.rounds === 1 ? 'round' : 'rounds'} here
                  </span>
                </span>
                <span className="db" aria-hidden="true">
                  <i className={dd > 0 ? '' : 'g'} style={{ left: `${Math.min(at(x.value), at(x.season))}%`, width: `${Math.abs(at(x.value) - at(x.season))}%` }} />
                  <u className="s" style={{ left: `${at(x.season)}%` }} />
                  <u className="h" style={{ left: `${at(x.value)}%` }} />
                </span>
                <span className="v">
                  <b>{toPar(x.value)}</b>
                </span>
              </button>
            );
          })}
        </div>
        <div className="dbkey">
          <span>
            <u className="h" />
            Here
          </span>
          <span>
            <u className="s" />
            Their season
          </span>
        </div>
      </section>
      {reads.length > 0 && (
        <section className="card">
          <div className="ch">
            <h4>Reads about {row.name}</h4>
            <span className="meta">{reads.length}</span>
          </div>
          <div className="rds">
            {reads.map((r) => {
              const p = byId.get(r.playerId);
              return p ? <ReadRow key={r.id} player={p} read={r} onOpen={onRead} /> : null;
            })}
          </div>
        </section>
      )}
      <p className="lede cnote">Every counted round here this season. To par uses the tees each player played.</p>
    </>
  );
}

/** A read that's gone: the deep link's card, loading no figures (CP-TEAM-8, 23). */
export function GonePanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Head lead={null} name="This read isn’t on the board anymore" line="It may have been resolved, or the player has left the team." onClose={onClose} />
      <button type="button" className="btn gh" onClick={onClose}>
        Close
      </button>
    </>
  );
}
