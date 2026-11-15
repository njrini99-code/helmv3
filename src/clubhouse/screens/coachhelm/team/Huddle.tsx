'use client';

import { ChartText } from '../../../ui/charts/ChartText';
import { formatSigned } from '../../../lib/format';
import { initials } from '../../../lib/names';
import { huddlePoint, STATIONS, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { coinYear } from './TeamHole';
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

/** Where a player stood over their first 10 rounds this season, when the board carries that window (`first10`: twenty or more counted season rounds, 02-PLAN 9.2 B). */
function firstPoint(p: ChTeamPlayer): { x: number; y: number } | null {
  const f = p.first10;
  if (!f || f.tee == null || f.approach == null || f.short_game == null || f.putting == null) return null;
  return { x: f.tee + f.approach, y: f.short_game + f.putting };
}

/** Ball striking against scoring. A player with a first-10 window trails a line from there to now, drawn at rest (Q-153); the legend names the line only when one is drawn. */
export function Huddle({ data, onPlayer }: { data: ChTeamBoardData; onPlayer: (id: string) => void }) {
  const list = data.players.list;
  const plotted = list.map((p) => ({ p, at: huddlePoint(p) })).filter((x): x is { p: ChTeamPlayer; at: { x: number; y: number } } => !!x.at);
  const missing = list.filter((p) => !huddlePoint(p));
  if (!plotted.length && !missing.length) return null;
  const trails = plotted.map(({ p, at }) => ({ p, at, from: firstPoint(p) })).filter((t): t is { p: ChTeamPlayer; at: { x: number; y: number }; from: { x: number; y: number } } => !!t.from);
  const { lo, hi } = huddleRange([...plotted.map((x) => x.at), ...trails.map((t) => t.from)]);
  const X = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const st = data.stations;
  // A station nobody has a figure for isn't zero, so its average isn't drawn on the Tour line (FID-TEAM-17).
  const as = st.tee.team == null || st.approach.team == null ? null : st.tee.team + st.approach.team;
  const ac = st.short_game.team == null || st.putting.team == null ? null : st.short_game.team + st.putting.team;
  const labelWide = (t: string) => t.length * 12 * 0.54;
  const clear = (x: number, y: number, t: string) => !plotted.some(({ at }) => X(at.x) + 13 > x && X(at.x) - 13 < x + labelWide(t) && Y(at.y) + 13 > y && Y(at.y) - 13 < y + 14);
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
          <ChartText className="tl" size={12} x={X(0) - 4} y={Y(0) - 5} textAnchor="end">
            Tour
          </ChartText>
          {as != null && <line className="avg" x1={X(as)} x2={X(as)} y1={T} y2={H - B} />}
          {ac != null && <line className="avg" x1={L} x2={W - R} y1={Y(ac)} y2={Y(ac)} />}
          {/* Against the plot's own edges, whatever the averages are, and only where no coin stands (TEAM-14). */}
          {clear(L + 6, T + 8, 'Scores well, strikes poorly') && (
            <ChartText className="q" size={12} x={L + 6} y={T + 16}>
              Scores well, strikes poorly
            </ChartText>
          )}
          {clear(L + 6, H - B - 20, 'Behind on both') && (
            <ChartText className="q" size={12} x={L + 6} y={H - B - 8}>
              Behind on both
            </ChartText>
          )}
          {clear(W - R - 6 - labelWide('Strikes well, leaks scoring'), H - B - 20, 'Strikes well, leaks scoring') && (
            <ChartText className="q" size={12} x={W - R - 6} y={H - B - 8} textAnchor="end">
              Strikes well, leaks scoring
            </ChartText>
          )}
          <ChartText className="axl" size={12} x={(L + W - R) / 2} y={H - 10} textAnchor="middle">
            Ball striking: tee and approach
          </ChartText>
          <ChartText className="axl" size={12} transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">
            Scoring: short game, putting
          </ChartText>
          {trails.map(({ p, at, from }) => (
            <g key={p.id} className="trailg" data-year={coinYear(p.classYear) ?? undefined} data-ch-team-trail={p.id}>
              <circle className="ghost" cx={X(from.x)} cy={Y(from.y)} r={4} />
              <line className="trail" x1={X(from.x)} y1={Y(from.y)} x2={X(at.x)} y2={Y(at.y)} />
            </g>
          ))}
          {plotted.map(({ p, at }) => (
            <g
              key={p.id}
              className={'hp' + (p.early ? ' early' : '')}
              data-year={coinYear(p.classYear) ?? undefined}
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
              <circle className="hit" cx={X(at.x)} cy={Y(at.y)} r={22} fill="transparent" />
              <circle className="dotc" cx={X(at.x)} cy={Y(at.y)} r={13} />
              <ChartText size={12} weight={600} x={X(at.x)} y={Y(at.y)}>
                {initials(p.name)}
              </ChartText>
            </g>
          ))}
        </svg>
      </div>
      <div className="legend">
        {trails.length > 0 && <span>Line: from their first 10 rounds this season to their last 10</span>}
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
