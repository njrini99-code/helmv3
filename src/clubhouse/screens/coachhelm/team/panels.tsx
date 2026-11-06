'use client';

import { plural } from '../../../lib/plural';
import { day } from './CourseCard';
import Link from 'next/link';
import { Badge } from '../../../ui/Badge';
import { pluralWord } from '../../../lib/plural';

import { X } from 'lucide-react';
import { STATIONS, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import type { ChInsight } from '../../../data/coachhelm-shape';
import { coachReadHref, playerFileHref, readHref } from '../../../data/coachhelm-views-shape';
import type { CourseHistoryRow } from '@/lib/coachhelm/v3/team-board/course-shape';
import { formatFixed, formatSigned } from '../../../lib/format';
import { Icon } from '../../../ui/Icon';
import type { ChDeepInsight } from '../../../data/coachhelm-dive-shape';
import { CorrectionChips } from '../Corrections';
import { FocusActions, type ChFocusActions } from '../parts';
import { askAboutReadHref } from '../chat/ask-links';
import { Button } from '../../../ui/Button';
import { barScale } from './SpotCard';
import { toPar } from './CourseCard';
import { STATION_NAME, STATION_SHORT } from './hole-geometry';
import { Chevron, Coin, ReadRow, Notice } from './parts';

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
  if (!c || c.own == null) return null;
  const mx = Math.max(c.own, c.team ?? 0, c.tour ?? 0) * 1.08 || 1;
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
        {row(first, c.own, 'you')}
        {c.team != null && row('Team', c.team, '')}
        {c.tour != null && row('Tour', c.tour, 'tour')}
      </div>
      {c.team == null && <p className="nordss ch-htb-ladnote">Team: not measured for this read</p>}
    </section>
  );
}

/** The read's own rounds, holes and why, when the host has them (06 CP shared read sheet). Each only when the read has it. */
function ReadEvidence({ deep, penalties, coach }: { deep: ChDeepInsight; penalties?: ReadonlyArray<{ label: string; value: number }> | null; coach: boolean }) {
  const toPar = deep.rounds.strip;
  const strip = penalties?.length ? penalties.map((p) => p.value) : toPar;
  const low = strip.length ? Math.min(0, ...strip) : 0;
  const span = (strip.length ? Math.max(...strip) : 1) - low || 1;
  const b = deep.base;
  const meta = [b.evidence.sample, b.evidence.window, deep.firmness, b.evidence.asOf?.toLowerCase()].filter(Boolean).join(' · ');
  return (
    <>
      {strip.length > 0 && (
        <section className="card">
          <div className="ch">
            <h4>{penalties?.length ? `Penalties in the last ${strip.length} rounds` : `Score to par, last ${strip.length} rounds`}</h4>
          </div>
          <div className="ch-hf-strip" aria-hidden="true">
            {strip.map((v, i) => (
              <i key={i} className={penalties?.length && v >= 2 ? 'hi' : ''} style={{ height: `${Math.max(5, ((v - low) / span) * 100)}%` }} />
            ))}
          </div>
        </section>
      )}
      {deep.where && deep.where.holes.length > 0 && (
        <section className="card">
          <div className="ch">
            <h4>Where it happened</h4>
          </div>
          <div className="ch-hf-holes">
            {deep.where.holes.slice(0, 3).map((h, i) => (
              <div key={h.key || i}>
                <span>
                  {h.date} · Hole {h.hole}
                </span>
                <p>{[h.course, h.what].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {b.why && (
        <section className="card">
          <div className="ch">
            <h4>{coach ? 'Why we think this' : 'Why CoachHelm thinks this'}</h4>
          </div>
          <p className="ch-hf-why">{b.why}</p>
          {meta && <p className="ch-hf-whym">{meta}</p>}
        </section>
      )}
    </>
  );
}

/** The read, one component in the phone sheet and the desktop inspector (AC-READ). */
export function ReadPanel({
  read,
  player,
  fa,
  missing,
  readOn,
  askOn = false,
  roster,
  onClose,
  role = 'coach',
  deep,
  penalties,
  dismissible = false,
  fileHost = false,
}: {
  read: ChInsight;
  player: Pick<ChTeamPlayer, 'id' | 'name' | 'first' | 'rounds' | 'early'>;
  fa?: ChFocusActions;
  missing?: ChTeamBoardData['missing'];
  readOn: boolean;
  /** `coachhelm_ask_v2`: the Ask lane's link beside Assign. */
  askOn?: boolean;
  roster: ReadonlyArray<{ id: string }>;
  onClose: () => void;
  /** A player's sheet: their words, no coin, no footer, no cause (06 CP shared read sheet). */
  role?: 'coach' | 'player';
  /** The file's host adds the read's rounds, holes, why and corrections. */
  deep?: ChDeepInsight;
  /** `golf_rounds.total_penalties`, last 8 countable rounds, oldest first; only on a penalty read. */
  penalties?: ReadonlyArray<{ label: string; value: number }> | null;
  /** Lenses has a place for Undo; Team doesn't (W-TEAM-12). */
  dismissible?: boolean;
  /** Lenses leaves "Open the full read" out with Read off; Team links today's Deep dive. */
  fileHost?: boolean;
}) {
  const coach = role === 'coach';
  const cause = coach ? read.engine?.cause?.word : undefined;
  const word = read.evidence.read?.word;
  const canLink = fileHost ? readOn : !!coachReadHref(player.id, read.id, roster);
  const href = !canLink ? null : coach ? readHref(player.id, read.id, readOn) : readHref(null, read.id, readOn);
  const ask = coach ? askAboutReadHref({ insightId: read.id, title: read.title, first: player.first }, askOn) : null;
  const cx = deep?.base.engine?.corrections;
  return (
    <>
      {coach ? <Head lead={<Coin player={player} />} name={player.name} line={`${areaName(read)} · ${player.rounds} rounds this season`} onClose={onClose} /> : <Head lead={null} name={areaName(read)} line="" onClose={onClose} />}
      <h3>{read.title}</h3>
      <p className="lede">{read.lede}</p>
      <div className="evs">
        {read.stale && <Badge>Out of date</Badge>}
        {read.stakes && <Badge tone="warning">Worth {read.stakes} a round</Badge>}
        {word && <Badge tone={word === 'Solid read' ? 'positive' : 'neutral'}>{word}</Badge>}
        {cause && <Badge>Cause: {cause}</Badge>}
        {read.evidence.window && <Badge>{read.evidence.window}</Badge>}
      </div>
      <Comparison read={read} first={coach ? player.first : 'You'} />
      {deep && <ReadEvidence deep={deep} penalties={penalties} coach={coach} />}
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
      {cx && (
        <section className="card ch-hf-cx">
          <CorrectionChips c={cx} />
        </section>
      )}
      {coach && fa && !read.stale && (
        <div className="acts" data-acts="">
          <FocusActions fa={fa} target={{ playerId: player.id, first: player.first, ins: read }} missing={missing} where="board" noDismiss={!dismissible} />
          {ask && (
            <Button variant="secondary" href={ask}>
              Ask about this
            </Button>
          )}
        </div>
      )}
      {href && (
        <Link className="lk" href={href}>
          Open the full read <Chevron />
        </Link>
      )}
    </>
  );
}

export function PlayerPanel({ player, data, onRead, fileOn, onClose }: { player: ChTeamPlayer; data: ChTeamBoardData; onRead: (id: string) => void; fileOn: boolean; onClose: () => void }) {
  const reads = [...player.reads.needs, ...player.reads.working];
  const page = (
    <Link className="lk" href={playerFileHref(player.id, undefined, fileOn)}>
      Open {player.first}’s page <Chevron />
    </Link>
  );
  const year = player.classYear ?? 'Player';
  if (player.rounds === 0)
    return (
      <>
        <Head lead={<Coin player={player} />} name={player.name} line={`${year} · no rounds yet this season`} onClose={onClose} />
        <section className="card">
          <Notice title="Nothing to show yet" body={`${player.first}’s four-area figures show after their first round this season.`} />
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
                  {r.stakes && <Badge tone="warning">{r.stakes} a round</Badge>}
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
        line={`${plural(row.rounds, 'round')} this season · last ${day(row.last)}`}
        onClose={onClose}
      />
      <div className="cmk sh">
        <b>{toPar(row.value)}</b>
        <span>
          a round to par here
          <br />
          {d ? `${formatFixed(Math.abs(d), 1)} ${d > 0 ? 'over' : 'under'} the team’s season of ${toPar(season)}` : 'Level with the team’s season'}
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
              <button type="button" className="cp tapp" key={x.id} onClick={() => onPlayer(x.id)} aria-label={`${p.name}: ${toPar(x.value)} a round here from ${x.rounds} ${pluralWord(x.rounds, 'round', 'rounds')}, season ${toPar(x.season)}`}>
                <Coin player={p} small />
                <span className="n">
                  <b>{p.first}</b>
                  <span>
                    {x.rounds} {pluralWord(x.rounds, 'round', 'rounds')} here
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
      <Button variant="ghost" size="lg" onClick={onClose}>
        Close
      </Button>
    </>
  );
}
