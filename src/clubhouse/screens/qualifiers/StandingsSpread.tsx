'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { formatToPar, initials } from '../../lib/format';
import { positionLabel, type ChQRow, type ChQRowState } from './model';

/**
 * P009: the field's spread on one number line. Each player who has a round in is a coin at their total to par (lower, better, on
 * the left); the gold line is the top-score cut, drawn between the last player who qualifies on score and the first who does not.
 * It holds nothing of its own: the rows, their to-par and their states are the leaderboard's. A coin's colour is its state (mint
 * on score, gold a coach's pick, a gold ring the bubble, ivory the rest); it is drawn in place at first paint (Q-153: no first-paint
 * draw-ins); a coin glides only when the data moves it. A pointer reads a name and a place; the leaderboard under it is the route for the keyboard and screen readers.
 */
const KIND: Partial<Record<NonNullable<ChQRowState>, 'score' | 'pick' | 'bubble'>> = { qualifying: 'score', qualified: 'score', selected: 'score', pick: 'pick', bubble: 'bubble' };

export function StandingsSpread({ rows, topScore }: { rows: ChQRow[]; topScore: number }) {
  const [hot, setHot] = useState<string | null>(null);
  const layout = useMemo(() => {
    const scored = rows.filter((r) => r.toPar != null);
    if (scored.length < 3) return null;
    const vals = scored.map((r) => r.toPar!);
    const lo = Math.min(0, ...vals) - 1;
    const hi = Math.max(0, ...vals) + 1;
    const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
    const byScore = [...scored].sort((a, b) => a.toPar! - b.toPar!);
    // Greedy lanes by distance on the line: a coin takes the first lane whose last coin is far enough away.
    const lastX: number[] = [];
    const placed = byScore.map((r) => {
      const x = at(r.toPar!);
      let lane = lastX.findIndex((lx) => Math.abs(x - lx) > 5.5);
      if (lane === -1) lane = lastX.length;
      lastX[lane] = x;
      return { r, x, lane };
    });
    // The cut sits between the last player on score and the next, when they are apart. The rows are in the board's
    // order as the server gave it (ranking.ts rankStandings), so it is read as given, never re-sorted.
    const a = scored[topScore - 1]?.toPar;
    const b = scored[topScore]?.toPar;
    const cut = topScore > 0 && a != null && b != null && b > a ? at((a + b) / 2) : null;
    const step = hi - lo > 22 ? 5 : hi - lo > 9 ? 2 : 1;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return { placed, cut, ticks, at, lanes: lastX.length };
  }, [rows, topScore]);
  if (!layout) return null;
  const even = layout.at(0);
  const height = layout.lanes * 40 + 6;
  const tip = hot ? layout.placed.find((p) => p.r.playerId === hot) : null;
  return (
    <div className="ch-qf-sp" onPointerLeave={() => setHot(null)}>
      <div className="ch-qf-sp__plot" style={{ height: height + 30 }} aria-hidden="true">
        <i className="ch-qf-sp__even" style={{ left: `${even}%`, height: height + 6 }} />
        {layout.cut != null && (
          <i className="ch-qf-sp__cut" style={{ left: `${layout.cut}%`, height: height + 6 }}>
            <span>Top {topScore} on score</span>
          </i>
        )}
        <ul style={{ height }}>
          {layout.placed.map(({ r, x, lane }) => (
            <li
              key={r.playerId}
              className={'is-' + (KIND[r.state as NonNullable<ChQRowState>] ?? 'out') + (hot === r.playerId ? ' is-hot' : '')}
              style={{ '--ch-qf-x': x, top: lane * 40 } as CSSProperties}
              onPointerEnter={() => setHot(r.playerId)}
            >
              <span>{initials(r.name)}</span>
            </li>
          ))}
        </ul>
        <div className="ch-qf-sp__axis">
          {layout.ticks.map((v) => (
            <span key={v} className="ch-num" style={{ left: `${layout.at(v)}%` }}>
              {v === 0 ? 'E' : v > 0 ? `+${v}` : `−${Math.abs(v)}`}
            </span>
          ))}
        </div>
        {tip && (
          <div className="ch-qf-sp__tip" style={{ left: `${tip.x}%` }}>
            <b>{tip.r.name}</b>
            <span className="ch-num">
              {positionLabel(tip.r)} · {formatToPar(tip.r.toPar)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
