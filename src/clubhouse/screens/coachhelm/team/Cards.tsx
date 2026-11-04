'use client';

import { Badge } from '../../../ui/Badge';
import { pluralWord } from '../../../lib/plural';

import { STATIONS, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import type { ChBriefWorking } from '../../../data/coachhelm-coach-brief-shape';
import type { ChInsight } from '../../../data/coachhelm-shape';
import type { ChTeamPart } from '../../../data/coachhelm-team-shape';
import type { ChTrackRecord } from '../../../data/coachhelm-track-record-shape';
import { formatSigned } from '../../../lib/format';
import { Button } from '../../../ui/Button';
import { Coin } from './parts';
import { STATION_SHORT } from './hole-geometry';

/** Four bars around a zero line: 20pt is 1.1 strokes, loss down, gain up (AC-ROSTER-03). */
export function FingerPrint({ player, labels = false }: { player: ChTeamPlayer; labels?: boolean }) {
  const w = labels ? 78 : 60;
  const h = 34;
  const bw = 10;
  const gap = (w - 4 * bw) / 3;
  const z = 9;
  const sc = 20 / 1.1;
  return (
    <svg className="fp" width={w} height={h + (labels ? 10 : 0)} viewBox={`0 0 ${w} ${h + (labels ? 10 : 0)}`} aria-hidden="true">
      <line className="z" x1="0" x2={w} y1={z} y2={z} />
      {STATIONS.map((s, i) => {
        const v = player.legs[s].strokes;
        const x = i * (bw + gap);
        const hh = v == null ? 0 : Math.max(2, Math.min(Math.abs(v) * sc, v < 0 ? h - z : z));
        return (
          <g key={s}>
            {v != null && (v < 0 ? <rect className="l" x={x} y={z + 1} width={bw} height={hh} rx="2.5" /> : <rect className="g" x={x} y={z - 1 - hh} width={bw} height={hh} rx="2.5" />)}
            {labels && (
              <text className="lab" x={x + bw / 2} y={h + 8}>
                {STATION_SHORT[s][0]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RosterCard({ players, phone, onPlayer }: { players: readonly ChTeamPlayer[]; phone: boolean; onPlayer: (id: string) => void }) {
  const sorted = [...players].sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
  return (
    <section className={'card' + (phone ? '' : ' rost')} data-ch-team-card="roster" aria-label="Roster">
      <div className="ch">
        <h4>Roster</h4>
        <span className="meta">{phone ? 'T · A · S · P' : 'Finger-print: tee, approach, short game, putting'}</span>
      </div>
      {sorted.map((p) => {
        const open = p.reads.needs.length + p.reads.working.length;
        return (
          <button type="button" className="rr tapp" key={p.id} onClick={() => onPlayer(p.id)}>
            <Coin player={p} />
            <span>
              <b>{p.name}</b>
              <span className="m">
                {[phone ? shortYear(p.classYear) : p.classYear, p.rounds ? `${p.rounds} rounds` : 'no rounds yet'].filter(Boolean).join(' · ')}
                {p.early && p.rounds ? ' · early' : ''}
                {p.heldBack ? ` · ${p.heldBack} held back` : ''}
              </span>
            </span>
            {!phone && (p.rounds ? p.worst ? <span className="lm"><Badge tone="warning">Loses most: {STATION_SHORT[p.worst]}</Badge></span> : <span /> : <span className="lm chipk">No rounds yet</span>)}
            {p.rounds ? (
              <>
                <FingerPrint player={p} labels={!phone} />
                <span className={'tot' + (p.total != null && p.total > 0 ? ' g' : '')}>
                  {formatSigned(p.total)}
                  <span>{open} open</span>
                </span>
              </>
            ) : (
              <>
                <span />
                <span />
              </>
            )}
          </button>
        );
      })}
    </section>
  );
}

/** (baseline − current) / (baseline − target), clamped 0 to 1 (AC-WORK-02). */
export function ringValue(p: { from: number; now: number; target: number }): number {
  const span = p.from - p.target;
  if (!span) return 0;
  return Math.max(0, Math.min(1, (p.from - p.now) / span));
}

function Ring({ v, proposed = false }: { v: number; proposed?: boolean }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg className={'ringc' + (proposed ? ' prop' : '')} width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle className="trk" cx="19" cy="19" r={r} fill="none" strokeWidth="4" />
      {!proposed && <circle className={'fil' + (v < 0.5 ? ' mid' : '')} cx="19" cy="19" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform="rotate(-90 19 19)" />}
    </svg>
  );
}

export function WorkingCard({ working, proposed, failed, onRetry }: { working: readonly ChBriefWorking[]; proposed: ReadonlyArray<{ player: ChTeamPlayer; read: ChInsight }>; failed: boolean; onRetry?: () => void }) {
  const n = working.length + proposed.length;
  return (
    <section className="card work" data-ch-team-card="work" aria-label="Working on">
      <div className="ch">
        <h4>Working on</h4>
        <span className="meta">
          {n} focus {pluralWord(n, 'area', 'areas')}
        </span>
      </div>
      {failed ? (
        <div className="notice">
          <div>
            <b>Couldn’t load this part</b>
            {onRetry && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div data-work="">
          {working.map((w) => (
            <div className="wk" key={w.id}>
              <Ring v={w.progress ? ringValue(w.progress) : 0} />
              <div>
                <b>
                  {w.who.split(' ')[0]} · {w.title}
                </b>
                {w.line && <span>{w.line}</span>}
                <span className={'st ' + (w.word === 'Active' ? 'ok' : 'wait')}>{[w.word, w.since].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
          ))}
          {proposed.map(({ player, read }) => (
            <div className="wk is-new" key={read.id}>
              <Ring v={0} proposed />
              <div>
                <b>
                  {player.first} · {read.title}
                </b>
                <span>
                  From {read.value} now · {player.first} sets the target
                </span>
                <span className="st wait">Proposed · {player.first} accepts it in their app</span>
              </div>
            </div>
          ))}
          {!n && <p className="nordss ch-htb-workempty">Nothing in progress yet. Assign a read as a focus and it shows here.</p>}
        </div>
      )}
    </section>
  );
}

/** The rungs' own words; a rung under 10 rechecked says "Not enough yet", never a share (AC-RECORD-02, 03). */
export function RecordCard({ part, desk = false }: { part: ChTeamPart<ChTrackRecord>; desk?: boolean }) {
  const notice = (title: string, body: string) => (
    <section className="card recc" data-ch-team-card="record">
      <div className="ch">
        <h4>How often CoachHelm is right</h4>
      </div>
      <div className="notice">
        <div>
          <b>{title}</b>
          <span>{body}</span>
        </div>
      </div>
    </section>
  );
  if (part.status === 'failed' || part.value.state === 'unavailable') return notice('Track record unavailable right now', 'It shows again once the check runs. No number is shown in its place.');
  const r = part.value;
  if (r.empty) return notice('No reads to check yet', 'Reads are re-checked against new rounds once the team has some.');
  return (
    <section className="card recc" data-ch-team-card="record" aria-label="How often CoachHelm is right">
      <div className="ch">
        <h4>How often CoachHelm is right</h4>
      </div>
      <div className="rec">
        <div className="big">
          <span>{r.program}</span>
        </div>
        {r.rungs.map((g) => (
          <div className="lv" key={g.id}>
            <span>{g.word}</span>
            {g.bar ? (
              <span className="t">
                <i className={g.bar.target == null ? 'na' : ''} style={{ transform: `scaleX(${g.bar.of ? g.bar.held / g.bar.of : 0})` }} />
                {g.bar.target != null && <u style={{ left: `${g.bar.target}%` }} title="target" />}
              </span>
            ) : (
              <span className="t is-none" />
            )}
            <span className="n">
              {g.line}
              {desk && g.bar ? <b> · {g.sub}</b> : null}
            </span>
          </div>
        ))}
      </div>
      <div className="recfoot">
        <span>Line: the target for that level</span>
      </div>
    </section>
  );
}

/** The roster's short years on a phone (S-TEAM.roster): Fr, So, Jr, Sr. */
function shortYear(year: string | null | undefined): string | null | undefined {
  return year ? ({ Freshman: 'Fr', Sophomore: 'So', Junior: 'Jr', Senior: 'Sr' } as Record<string, string>)[year] ?? year : year;
}
