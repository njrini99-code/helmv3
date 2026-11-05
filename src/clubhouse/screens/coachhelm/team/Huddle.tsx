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
const COIN_R = 13;
/** Two coins never sit closer than this: their edges clear by 6pt, enough for a hollow coin's stroke. */
const COIN_GAP = COIN_R * 2 + 6;

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

/**
 * Coins pushed apart until none overlap, inside the plot. A moved coin keeps a leader line to its true point (the point
 * and the aria-label stay the real figures), so the spread never reads as a different number.
 */
export function spreadCoins(points: ReadonlyArray<{ x: number; y: number }>, box: { x0: number; x1: number; y0: number; y1: number }): Array<{ x: number; y: number }> {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const out = points.map((p) => ({ x: clamp(p.x, box.x0, box.x1), y: clamp(p.y, box.y0, box.y1) }));
  for (let pass = 0; pass < 64; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i] as { x: number; y: number };
        const b = out[j] as { x: number; y: number };
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= COIN_GAP) continue;
        // Two players on one point: a fixed direction per pair, so the layout is the same on every render.
        if (d < 0.01) {
          const turn = ((i + j + 1) * Math.PI) / 3;
          dx = Math.cos(turn);
          dy = Math.sin(turn);
          d = 1;
        }
        const push = (COIN_GAP - d) / 2 + 0.01;
        a.x = clamp(a.x - (dx / d) * push, box.x0, box.x1);
        a.y = clamp(a.y - (dy / d) * push, box.y0, box.y1);
        b.x = clamp(b.x + (dx / d) * push, box.x0, box.x1);
        b.y = clamp(b.y + (dy / d) * push, box.y0, box.y1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export type HuddleWord = { key: string; x: number; y: number; lines: readonly string[] };

const WORDS: ReadonlyArray<{ key: string; forms: ReadonlyArray<readonly string[]>; left: boolean; top: boolean }> = [
  { key: 'tl', forms: [['Scores well, strikes poorly'], ['Scores well,', 'strikes poorly']], left: true, top: true },
  { key: 'bl', forms: [['Behind on both']], left: true, top: false },
  { key: 'br', forms: [['Strikes well, leaks scoring'], ['Strikes well,', 'leaks scoring']], left: false, top: false },
];
const CHAR_W = 5.4;
const LINE_H = 11;
const PAD = 6;

/** Each quadrant's words where they fit: inside the quadrant, across no Tour line, under no coin. A word with no such place is left out, never overlapped. */
export function placeHuddleWords(g: { x0: number; x1: number; y0: number; y1: number; midX: number; midY: number; tourX: number; tourY: number; coins: ReadonlyArray<{ x: number; y: number }> }): HuddleWord[] {
  const out: HuddleWord[] = [];
  for (const w of WORDS) {
    const qx0 = w.left ? g.x0 : g.midX;
    const qx1 = w.left ? g.midX : g.x1;
    const qy0 = w.top ? g.y0 : g.midY;
    const qy1 = w.top ? g.midY : g.y1;
    let found: HuddleWord | null = null;
    for (const lines of w.forms) {
      const tw = Math.max(...lines.map((l) => l.length)) * CHAR_W;
      const th = lines.length * LINE_H;
      // The quadrant's outer corner first, then either side of a Tour line that runs through it.
      const lefts = [qx0 + PAD, qx1 - PAD - tw];
      if (g.tourX > qx0 && g.tourX < qx1) lefts.push(g.tourX + PAD, g.tourX - PAD - tw);
      const tops = w.top ? [qy0 + 4, qy1 - 4 - th] : [qy1 - 6 - th, qy0 + 4];
      if (g.tourY > qy0 && g.tourY < qy1) tops.push(g.tourY + 4, g.tourY - 4 - th);
      for (const top of tops) {
        for (const left of lefts) {
          const right = left + tw;
          const bottom = top + th;
          if (left < qx0 + 1 || right > qx1 - 1 || top < qy0 || bottom > qy1) continue;
          if (g.tourX > left - 2 && g.tourX < right + 2) continue;
          if (g.tourY > top - 2 && g.tourY < bottom + 2) continue;
          const hit = g.coins.some((c) => c.x + COIN_R + 2 > left && c.x - COIN_R - 2 < right && c.y + COIN_R + 2 > top && c.y - COIN_R - 2 < bottom);
          if (hit) continue;
          found = { key: w.key, x: left, y: top + 9, lines };
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) out.push(found);
  }
  return out;
}

/** "Theo, Sam, Jonah and 3 more": a long list never fills the card. */
export function namesLine(names: readonly string[], cap = 3): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= cap + 1) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, cap).join(', ')} and ${names.length - cap} more`;
}

/** "Not plotted" grouped by what's missing: most players on a real team miss the same thing, and the sentence says so once (AC-HUDDLE-04). */
export function notPlottedLine(missing: readonly ChTeamPlayer[]): string {
  const noShots: string[] = [];
  const byLeg = new Map<ChStation, string[]>();
  for (const p of missing) {
    if (STATIONS.every((s) => p.legs[s].strokes == null)) {
      noShots.push(p.first);
      continue;
    }
    const s = STATIONS.find((x) => p.legs[x].strokes == null) ?? 'putting';
    byLeg.set(s, [...(byLeg.get(s) ?? []), p.first]);
  }
  const parts = [...byLeg].map(([s, names]) => `${namesLine(names)}, no ${STATION_SHORT[s].toLowerCase()} figure yet`);
  if (noShots.length) parts.push(`${namesLine(noShots)}, no shot figures yet`);
  return `Not plotted: ${parts.join('; ')}`;
}

/** Ball striking against scoring. No trails (02-PLAN 9.2 A), so the legend's Line item isn't drawn. */
export function Huddle({ data, onPlayer }: { data: ChTeamBoardData; onPlayer: (id: string) => void }) {
  const list = data.players.list;
  const plotted = list.map((p) => ({ p, at: huddlePoint(p) })).filter((x): x is { p: ChTeamPlayer; at: { x: number; y: number } } => !!x.at);
  const missing = list.filter((p) => !huddlePoint(p));
  if (!plotted.length && !missing.length) return null;
  // A chart of one coin, or none, says nothing: most real teams start here, so the card says what it's waiting for and stays small.
  if (plotted.length < 2) {
    const only = plotted[0]?.p;
    return (
      <section className="card huddle is-waiting" data-ch-team-card="huddle" aria-label="The huddle">
        <div className="ch">
          <h4>The huddle</h4>
          <span className="meta">Strokes to Tour a round</span>
        </div>
        <p className="nordss" data-ch-team-huddlewait="">
          It draws once two players have all four figures{only ? `. ${only.first} is the only one so far.` : '.'}
        </p>
        <p className="nordss" data-ch-team-notplotted="">
          {notPlottedLine(missing)}
        </p>
      </section>
    );
  }
  const { lo, hi } = huddleRange(plotted.map((x) => x.at));
  const X = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const st = data.stations;
  const as = (st.tee.team ?? 0) + (st.approach.team ?? 0);
  const ac = (st.short_game.team ?? 0) + (st.putting.team ?? 0);
  const coins = spreadCoins(
    plotted.map((x) => ({ x: X(x.at.x), y: Y(x.at.y) })),
    { x0: L + COIN_R + 1, x1: W - R - COIN_R - 1, y0: T + COIN_R + 1, y1: H - B - COIN_R - 1 },
  );
  const words = placeHuddleWords({ x0: L, x1: W - R, y0: T, y1: H - B, midX: X(as), midY: Y(ac), tourX: X(0), tourY: Y(0), coins });
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
          {words.map((w) => (
            <text className="q" key={w.key} data-word={w.key} x={w.x} y={w.y}>
              {w.lines.map((line, i) => (
                <tspan key={line} x={w.x} dy={i ? 11 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
          ))}
          <text className="axl" x={(L + W - R) / 2} y={H - 10} textAnchor="middle">
            Ball striking: tee and approach
          </text>
          <text className="axl" transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">
            Scoring: short game and putting
          </text>
          {plotted.map(({ p, at }, i) => {
            const c = coins[i] as { x: number; y: number };
            const moved = Math.hypot(c.x - X(at.x), c.y - Y(at.y)) > 3;
            return (
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
                {moved && <line className="ldr" x1={X(at.x)} y1={Y(at.y)} x2={c.x} y2={c.y} />}
                <circle className="dotc" cx={c.x} cy={c.y} r={COIN_R} fill={coinColor(p.id)} stroke={coinColor(p.id)} />
                <text x={c.x} y={c.y}>
                  {initials(p.name)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend">
        <span>Dashed: team average</span>
        <span>Hollow: fewer than 5 rounds</span>
      </div>
      {missing.length > 0 && (
        <p className="nordss" data-ch-team-notplotted="">
          {notPlottedLine(missing)}
        </p>
      )}
    </section>
  );
}
