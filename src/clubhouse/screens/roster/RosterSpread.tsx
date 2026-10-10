'use client';

import { useMemo } from 'react';
import { useInViewOnce } from '../../lib/use-in-view';
import { Avatar } from '../../ui/Avatar';
import type { ChRosterPlayer } from '../../data/roster';

/**
 * P003: where the team sits. Every ranked player is a coin on one scoring axis (lower is better, so the best score is on the
 * left), the team average a gold line across it. It holds no data of its own: the players and their averages are the roster's,
 * and a player under the early floor is not on it. Coins that would touch take another lane. The first time it is seen the
 * coins glide from the team line to their place.
 */
const COIN = 38;
const LANE = 62;

export function RosterSpread({ players, teamAvg, onOpen }: { players: ChRosterPlayer[]; teamAvg: number | null; onOpen: (id: string) => void }) {
  const [ref, seen] = useInViewOnce<HTMLDivElement>(0.4);
  const layout = useMemo(() => {
    const ranked = players.filter((p) => p.avg != null).sort((a, b) => a.avg! - b.avg!);
    if (ranked.length < 2) return null;
    const lo = Math.floor(ranked[0]!.avg! - 0.5);
    const hi = Math.ceil(ranked[ranked.length - 1]!.avg! + 0.5);
    const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
    // Greedy lanes by distance on the axis: a coin takes the first lane whose last coin is far enough away.
    const lastX: number[] = [];
    const placed = ranked.map((p) => {
      const x = at(p.avg!);
      let lane = lastX.findIndex((lx) => Math.abs(x - lx) > 6.5);
      if (lane === -1) lane = lastX.length;
      lastX[lane] = x;
      return { p, x, lane };
    });
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += hi - lo > 10 ? 2 : 1) ticks.push(v);
    return { placed, ticks, at, lanes: lastX.length };
  }, [players]);
  if (!layout) return null;
  const team = teamAvg == null ? null : layout.at(teamAvg);
  const height = layout.lanes * LANE + 8;
  return (
    <section className="ch-rs-sp" aria-labelledby="ch-rs-sp-h">
      <div className="ch-rs-sp__h">
        <h2 id="ch-rs-sp-h">Where the team sits</h2>
        <p>Season scoring average, lower is better. Each coin is a player; the gold line is the team average{teamAvg != null ? `, ${teamAvg.toFixed(1)}` : ''}.</p>
      </div>
      <div ref={ref} className={'ch-rs-sp__plot' + (seen ? ' is-in' : '')} style={{ height: height + 34 }}>
        {team != null && (
          <div className="ch-rs-sp__team" style={{ left: `${team}%`, height: height + 6 }}>
            <span>Team {teamAvg!.toFixed(1)}</span>
          </div>
        )}
        {/* A pointer shortcut to the faces below, which carry every player for the keyboard and screen readers. */}
        <ul className="ch-rs-sp__coins" aria-hidden="true" style={{ height }}>
          {layout.placed.map(({ p, x, lane }) => (
            <li key={p.id} style={{ left: `${seen ? x : (team ?? x)}%`, top: lane * LANE, ['--ch-sp-size' as string]: `${COIN}px` }}>
              <button type="button" tabIndex={-1} onClick={() => onOpen(p.id)}>
                <Avatar name={p.name} size={COIN} />
                <b className="ch-num">{p.avg!.toFixed(1)}</b>
                <em>{p.firstName}</em>
              </button>
            </li>
          ))}
        </ul>
        <div className="ch-rs-sp__axis" aria-hidden="true">
          {layout.ticks.map((v) => (
            <span key={v} style={{ left: `${layout.at(v)}%` }} className="ch-num">
              {v}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
