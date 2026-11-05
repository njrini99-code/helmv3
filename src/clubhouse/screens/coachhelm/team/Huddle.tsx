'use client';

import { avatarTone } from '../../../ui/Avatar';
import { formatSigned } from '../../../lib/format';
import { initials } from '../../../lib/names';
import { huddlePoint, STATIONS, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { coinColor } from './TeamHole';
import { STATION_SHORT } from './hole-geometry';

const W = 320;
const H = 256;
const L = 36;
const R = 12;
const T = 16;
const B = 36;

/** Starts at −1.8 to +0.2 and widens in steps of 0.5 so no coin is clipped (AC-HUDDLE-01). */
export function huddleRange(points: ReadonlyArray<{ x: number; y: number }>): { lo: number; hi: number } {
  let lo = -1.8;
  let hi = 0.2;
  const pad = 0.15;
  for (const p of points) {
    while (Math.min(p.x, p.y) - pad < lo) lo -= 0.5;
    while (Math.max(p.x, p.y) + pad > hi) hi += 0.5;
  }
  return { lo, hi };
}

/** Ball striking against scoring. No trails (02-PLAN 9.2 A), so the legend's Line item isn't drawn. */
export function Huddle({ data, onPlayer }: { data: ChTeamBoardData; onPlayer: (id: string) => void }) {
  const list = data.players.list;
  const plotted = list.map((p) => ({ p, at: huddlePoint(p) })).filter((x): x is { p: ChTeamPlayer; at: { x: number; y: number } } => !!x.at);
  const missing = list.filter((p) => !huddlePoint(p));
  if (!plotted.length && !missing.length) return null;
  const { lo, hi } = huddleRange(plotted.map((x) => x.at));
  const X = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const st = data.stations;
  const as = (st.tee.team ?? 0) + (st.approach.team ?? 0);
  const ac = (st.short_game.team ?? 0) + (st.putting.team ?? 0);
  const firstMissing = (p: ChTeamPlayer): ChStation | undefined => STATIONS.find((s) => p.legs[s].strokes == null);
  return (
    <section className="card huddle" data-ch-team-card="huddle" aria-label="The huddle">
      <div className="ch">
        <h4>The huddle</h4>
        <span className="meta">Strokes to Tour a round</span>
      </div>
      <div className="hud">
        <svg className="hudsvg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Huddle chart: ball striking against scoring for each player.">
          <line className="ax" x1={L} x2={W - R} y1={H - B} y2={H - B} />
          <line className="ax" x1={L} x2={L} y1={T} y2={H - B} />
          <line className="tour" x1={X(0)} x2={X(0)} y1={T} y2={H - B} />
          <line className="tour" x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} />
          <text className="tl" x={X(0) - 4} y={Y(0) - 5} textAnchor="end">
            Tour
          </text>
          <line className="avg" x1={X(as)} x2={X(as)} y1={T} y2={H - B} />
          <line className="avg" x1={L} x2={W - R} y1={Y(ac)} y2={Y(ac)} />
          {/* Two lines each, so a label stays in its quadrant whatever the team's average does to the dashed lines. */}
          <text className="q" x={L + 6} y={T + 16}>
            <tspan>Scores well, </tspan>
            <tspan x={L + 6} dy={11}>
              strikes poorly
            </tspan>
          </text>
          <text className="q" x={L + 6} y={H - B - 8}>
            Behind on both
          </text>
          <text className="q" x={X(as) + 6} y={H - B - 19}>
            <tspan>Strikes well, </tspan>
            <tspan x={X(as) + 6} dy={11}>
              leaks scoring
            </tspan>
          </text>
          <text className="axl" x={(L + W - R) / 2} y={H - 10} textAnchor="middle">
            Ball striking: tee and approach
          </text>
          <text className="axl" transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">
            Scoring: short game and putting
          </text>
          {plotted.map(({ p, at }) => (
            <g
              key={p.id}
              className={'hp' + (p.early ? ' early' : '')}
              data-tone={avatarTone(p.id)}
              role="button"
              tabIndex={0}
              aria-label={`${p.name}: striking ${formatSigned(at.x)}, scoring ${formatSigned(at.y)}`}
              onClick={() => onPlayer(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPlayer(p.id);
                }
              }}
            >
              <circle className="dotc" cx={X(at.x)} cy={Y(at.y)} r={13} fill={coinColor(p.id)} stroke={coinColor(p.id)} />
              <text x={X(at.x)} y={Y(at.y)}>
                {initials(p.name)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="legend">
        <span>Dashed: team average</span>
        <span>Hollow: fewer than 5 rounds</span>
      </div>
      {missing.length > 0 && (
        <p className="nordss" data-ch-team-notplotted="">
          Not plotted: {missing.map((p) => `${p.first}, no ${STATION_SHORT[firstMissing(p) ?? 'putting'].toLowerCase()} figure yet`).join('; ')}
        </p>
      )}
    </section>
  );
}
