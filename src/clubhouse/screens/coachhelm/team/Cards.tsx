'use client';

import type { ReactNode } from 'react';
import { ChartText } from '../../../ui/charts/ChartText';
import { Badge } from '../../../ui/Badge';
import { pluralWord } from '../../../lib/plural';

import { STATIONS, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import type { ChBriefWorking } from '../../../data/coachhelm-coach-brief-shape';
import type { ChInsight } from '../../../data/coachhelm-shape';
import type { ChTeamPart } from '../../../data/coachhelm-team-shape';
import type { ChTrackRecord } from '../../../data/coachhelm-track-record-shape';
import { formatSigned } from '../../../lib/format';
import { Coin, Notice, readTitle } from './parts';
import { STATION_SHORT } from './hole-geometry';
import { sgIsEstimate } from '../../../data/stats-sg-mix';

/** The fingerprint's height, and its most points a stroke: 20pt is 1.1 strokes (AC-ROSTER-03). */
const FP_H = 34;
const FP_PER_STROKE = 20 / 1.1;

/**
 * One ruler for every fingerprint on the roster (stats and charts audit 2026-11-15, CH-17): the zero line sits where the largest gain
 * and the largest loss both fit, at the spec's 20pt a 1.1 strokes or less, so no bar is cut short and every player reads on the same
 * scale. The old zero sat at 9 of 34 for everyone, so a gain stopped at about 0.4 of a stroke and a loss at 1.3, with no mark.
 */
export function fingerScale(players: readonly ChTeamPlayer[], h = FP_H): { zero: number; perStroke: number } {
  const all = players.flatMap((p) => STATIONS.map((s) => p.legs[s].strokes)).filter((v): v is number => v != null);
  const gain = Math.max(0, ...all);
  const loss = Math.max(0, ...all.map((v) => -v));
  const room = h - 4;
  if (gain + loss === 0) return { zero: h / 2, perStroke: FP_PER_STROKE };
  const perStroke = Math.min(FP_PER_STROKE, room / (gain + loss));
  // The spare room is split evenly above and below, so a roster of small gains and losses keeps its zero near the middle.
  const spare = room - (gain + loss) * perStroke;
  return { zero: 2 + spare / 2 + gain * perStroke, perStroke };
}

/** Four bars around a zero line, loss down, gain up, on the roster's one ruler (`fingerScale`), with no floor on a bar's length. */
export function FingerPrint({ player, labels = false, scale }: { player: ChTeamPlayer; labels?: boolean; scale?: { zero: number; perStroke: number } }) {
  const w = labels ? 78 : 60;
  const h = FP_H;
  const bw = 10;
  const gap = (w - 4 * bw) / 3;
  const { zero: z, perStroke: sc } = scale ?? fingerScale([player]);
  return (
    <svg className="fp" width={w} height={h + (labels ? 14 : 0)} viewBox={`0 0 ${w} ${h + (labels ? 14 : 0)}`} aria-hidden="true">
      <line className="z" x1="0" x2={w} y1={z} y2={z} />
      {STATIONS.map((s, i) => {
        const v = player.legs[s].strokes;
        const x = i * (bw + gap);
        const hh = v == null ? 0 : Math.abs(v) * sc;
        return (
          <g key={s}>
            {v != null && hh > 0 && (v < 0 ? <rect className="l" x={x} y={z + 1} width={bw} height={hh} rx="2.5" /> : <rect className="g" x={x} y={z - 1 - hh} width={bw} height={hh} rx="2.5" />)}
            {labels && (
              <ChartText className="lab" size={12} x={x + bw / 2} y={h + 11} textAnchor="middle">
                {STATION_SHORT[s][0]}
              </ChartText>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RosterCard({ players, phone, onPlayer }: { players: readonly ChTeamPlayer[]; phone: boolean; onPlayer: (id: string) => void }) {
  const sorted = [...players].sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
  const ruler = fingerScale(players);
  return (
    <section className={'card' + (phone ? '' : ' rost')} data-ch-team-card="roster" aria-label="Roster">
      <div className="ch">
        <h4>Roster</h4>
        <span className="meta">{phone ? 'T · A · S · P' : 'Fingerprint: off the tee, approach, around the green, putting'}</span>
      </div>
      {sorted.map((p) => {
        const open = p.reads.needs.length + p.reads.working.length;
        return (
          <button data-ctl="CTL-P013-241" type="button" className="rr tapp" key={p.id} onClick={() => onPlayer(p.id)}>
            <Coin player={p} />
            <span>
              <b>{p.name}</b>
              <span className="m">
                {[phone ? shortYear(p.classYear) : p.classYear, p.rounds ? `${p.rounds} rounds` : 'no rounds yet'].filter(Boolean).join(' · ')}
                {p.early && p.rounds ? ' · early' : ''}
                {p.total != null && sgIsEstimate(p.sgMix) ? ' · estimated' : ''}
                {p.heldBack ? ` · ${p.heldBack} held back` : ''}
              </span>
            </span>
            {/* L-075: a player with no rounds says so once, in the line under the name; a chip in the stat column repeated it off-centre. */}
            {!phone && (p.rounds && p.worst ? <span className="lm"><Badge tone="warning">{STATION_SHORT[p.worst]}</Badge></span> : <span />)}
            {p.rounds ? (
              <>
                <FingerPrint player={p} labels={!phone} scale={ruler} />
                <span className={'tot' + (p.total == null || Math.abs(p.total) < 0.05 ? ' is-even' : p.total > 0 ? ' g' : '')}>
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

/**
 * How far a focus is toward its target (look-09, "make it specific to what it is displaying"): a short bar from where it started,
 * filled to now, with the target as the firm tick at its end. It closes the row; the row's line already says the figures.
 */
function TargetBar({ v }: { v: number }) {
  return (
    <span className="tgtbar" aria-hidden="true">
      <i className={v < 0.5 ? 'mid' : undefined} style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );
}

/** "Cole", "Cole and Dylan", "Cole, Dylan and Jackson". */
const namesWords = (names: readonly string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const focusKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

/** A focus's title without its player's name in front: a focus keeps the read's own title, and an old read's carries "Dylan: ". */
const focusTitle = (w: ChBriefWorking) => readTitle({ first: w.who.split(' ')[0] ?? w.who, name: w.who }, w.title);

/** Working on's rows: one focus to a row, and a focus two or more players share is one row, in the order the brief lists them. */
export function workingRows(working: readonly ChBriefWorking[]): Array<{ key: string; title: string; areas: ChBriefWorking[] }> {
  const rows = new Map<string, { title: string; areas: ChBriefWorking[] }>();
  for (const w of working) {
    const title = focusTitle(w);
    const row = rows.get(focusKey(title));
    if (row) row.areas.push(w);
    else rows.set(focusKey(title), { title, areas: [w] });
  }
  return [...rows].map(([key, row]) => ({ key, ...row }));
}

/**
 * Working on (W11, staging 11 Nov: nine focus areas, nearly all with an empty ring, every state line in the same green, and one
 * focus repeated for three players). The words lead every row; a bar to the target closes it only when the focus has a target to
 * fill toward (AC-WORK-02, rings until look-09), so a focus without one, or a proposal whose player sets it, has none. A focus several
 * players share is one row with their names and no bar, since one bar for several targets would be a figure nobody measured. The state line is quiet ink.
 */
export function WorkingCard({ working, proposed, failed, onRetry }: { working: readonly ChBriefWorking[]; proposed: ReadonlyArray<{ player: ChTeamPlayer; read: ChInsight }>; failed: boolean; onRetry?: () => void }) {
  const n = working.length + proposed.length;
  return (
    <section className="card work" data-ch-team-card="work" aria-label="Working on">
      <div className="ch">
        <h4>Working on</h4>
        {!failed && (
          <span className="meta">
            {n} focus {pluralWord(n, 'area', 'areas')}
          </span>
        )}
      </div>
      {failed ? (
        <Notice title="Couldn’t load this part" onRetry={onRetry} />
      ) : (
        <div data-work="">
          {workingRows(working).map(({ key, title, areas }) => {
            const w = areas[0] as ChBriefWorking;
            if (areas.length > 1) {
              const words = new Set(areas.map((a) => a.word));
              return (
                <div className="wk is-shared" key={`shared:${key}`}>
                  <div>
                    <b className="ch-num">{title}</b>
                    <span>{namesWords(areas.map((a) => a.who.split(' ')[0] as string))}</span>
                    {words.size === 1 && <span className="st">{w.word}</span>}
                  </div>
                </div>
              );
            }
            return (
              <div className="wk" key={w.id}>
                <div>
                  <b className="ch-num">
                    {w.who.split(' ')[0]} · {title}
                  </b>
                  {w.line && <span>{w.line}</span>}
                  <span className="st">{[w.word, w.since].filter(Boolean).join(' · ')}</span>
                </div>
                {w.progress && <TargetBar v={ringValue(w.progress)} />}
              </div>
            );
          })}
          {proposed.map(({ player, read }) => (
            <div className="wk" key={read.id}>
              <div>
                <b className="ch-num">
                  {player.first} · {readTitle(player, read.title)}
                </b>
                <span>
                  From {read.value} now · {player.first} sets the target
                </span>
                <span className="st">Proposed · {player.first} accepts it in their app</span>
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
export function RecordCard({ part, desk = false, recheck = null }: { part: ChTeamPart<ChTrackRecord>; desk?: boolean; recheck?: ReactNode }) {
  const notice = (title: string, body: string) => (
    <section className="card recc" data-ch-team-card="record">
      <div className="ch">
        <h4>How often CoachHelm is right</h4>
      </div>
      <Notice title={title} body={body} />
      {/* The way to run the check stays, whatever the record says (the design's failed state draws none; this is the coach's only way). */}
      {recheck && <div className="recfoot">{recheck}</div>}
    </section>
  );
  if (part.status === 'failed' || part.value.state === 'unavailable') return notice('Track record unavailable right now', 'It shows again once the check runs. No number is shown in its place.');
  const r = part.value;
  const { held, rechecked: checked } = r;
  if (r.empty) return notice('No reads to check yet', 'Reads are re-checked against new rounds once the team has some.');
  return (
    <section className="card recc" data-ch-team-card="record" aria-label="How often CoachHelm is right">
      <div className="ch">
        <h4>How often CoachHelm is right</h4>
      </div>
      <div className="rec">
        <div className="big">
          {checked > 0 && (
            <b className="ch-num">
              {held} of {checked}
            </b>
          )}
          <span>{checked > 0 ? 'reads held up when re-checked' : r.program}</span>
        </div>
        {/* L-002: with no level drawn there is nothing to list; say it once, not five times. */}
        {r.rungs.every((g) => !g.bar) && (
          <p className="n" data-ch-record-none="">
            {checked > 0 ? 'Not enough re-checked reads at any level yet.' : 'No reads re-checked yet.'}
          </p>
        )}
        {r.rungs.some((g) => g.bar) && r.rungs.map((g) => (
          <div className="lv" key={g.id}>
            <span>{g.word}</span>
            {g.bar ? (
              <span className="t">
                <i className={g.bar.target == null ? 'na' : ''} style={{ transform: `scaleX(${g.bar.of ? g.bar.held / g.bar.of : 0})` }} />
                {g.bar.target != null && <u style={{ left: `${g.bar.target * 10}%` }} title="target" />}
              </span>
            ) : (
              <span className="t is-none">—</span>
            )}
            <span className="n">
              {/* The rung named "Not enough yet" doesn't say so twice (QA-9). */}
              {g.line === g.word ? null : g.line.replace(/ held$/, '')}
              {desk && g.bar ? <b> · {g.bar.target == null ? 'no target yet' : `target ${/under/i.test(g.sub ?? '') ? 'under ' : ''}${g.bar.target * 10}%`}</b> : null}
            </span>
          </div>
        ))}
      </div>
      <div className="recfoot">
        {r.rungs.some((g) => g.bar) && <span>Line: the target for that level</span>}
        {recheck}
      </div>
    </section>
  );
}

/** The roster's short years on a phone (S-TEAM.roster): Fr, So, Jr, Sr. */
function shortYear(year: string | null | undefined): string | null | undefined {
  return year ? ({ Freshman: 'Fr', Sophomore: 'So', Junior: 'Jr', Senior: 'Sr' } as Record<string, string>)[year] ?? year : year;
}
