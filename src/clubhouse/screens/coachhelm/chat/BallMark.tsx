'use client';

import { useEffect, useState } from 'react';
import '../../../styles/coachhelm-ball.css';

/** A dimple on the 24-unit drawing: centre, half-width along its radius, half-height across it, and the turn that points it at the centre. */
type Dimple = readonly [cx: number, cy: number, rx: number, ry: number, turn: number];

/**
 * The dimples: hexagonal rings on a sphere (the pole, then 6, 12 and 18), the sphere tipped a little toward the light and
 * projected flat. Each is squeezed along its radius by how far round the ball it sits, which is what makes a disc read as
 * a ball at 20px. Worked out once and written down, so the server and the browser draw the same figures.
 */
const RINGS: ReadonlyArray<ReadonlyArray<Dimple>> = [
  [[11.52, 11.33, 1.12, 1.12, -125.5]],
  [[14.93, 14.32, 1.05, 1.12, 38.35], [10.7, 15.77, 1.04, 1.12, 109.05], [7.33, 12.84, 1.01, 1.12, 169.79], [8.2, 8.46, 0.99, 1.12, -137.03], [12.43, 7, 1, 1.12, -85.12], [15.79, 9.93, 1.03, 1.12, -28.59]],
  [[19.69, 13.11, 0.79, 1.12, 8.19], [17.83, 16.9, 0.81, 1.12, 40.07], [14.32, 19.27, 0.81, 1.12, 72.31], [10.1, 19.56, 0.79, 1.12, 104.11], [6.31, 17.71, 0.76, 1.12, 134.93], [3.95, 14.21, 0.73, 1.12, 164.67], [3.67, 9.99, 0.7, 1.12, -166.46], [5.53, 6.2, 0.69, 1.12, -138.11], [9.04, 3.84, 0.69, 1.12, -109.92], [13.26, 3.54, 0.7, 1.12, -81.53], [17.05, 5.39, 0.73, 1.12, -52.59], [19.41, 8.89, 0.77, 1.12, -22.74]],
  [[21.6, 15.53, 0.41, 1.12, 20.21], [19.72, 18.64, 0.42, 1.12, 40.71], [16.89, 20.93, 0.42, 1.12, 61.26], [13.46, 22.11, 0.42, 1.12, 81.78], [9.83, 22.04, 0.4, 1.12, 102.19], [6.45, 20.74, 0.38, 1.12, 122.43], [3.71, 18.36, 0.35, 1.12, 142.48], [1.96, 15.19, 0.34, 1.12, 162.36], [1.4, 11.61, 0.34, 1.12, -177.89], [2.1, 8.05, 0.34, 1.12, -158.24], [3.98, 4.94, 0.34, 1.12, -138.64], [6.81, 2.66, 0.34, 1.12, -119.06], [10.24, 1.48, 0.34, 1.12, -99.47], [13.87, 1.54, 0.34, 1.12, -79.84], [17.26, 2.84, 0.34, 1.12, -60.13], [19.99, 5.22, 0.34, 1.12, -40.31], [21.74, 8.39, 0.37, 1.12, -20.32], [22.3, 11.97, 0.39, 1.12, -0.14]],
];
const ALL = RINGS.flat();
/** The points of light leave in three waves, from the middle out: the pole with the first ring, then each ring beyond. */
const WAVES = [{ id: 'a', dimples: [...RINGS[0]!, ...RINGS[1]!] }, { id: 'b', dimples: RINGS[2]! }, { id: 'c', dimples: RINGS[3]! }] as const;
/** One working beat (`--ch-dur-typing`, 1200 ms), and a little over: how long a ball that has stopped thinking may take to finish its beat. */
const LOOP_MS = 1300;

const dimple = (d: Dimple, className?: string) => <ellipse key={`${d[0]}-${d[1]}`} className={className} cx={d[0]} cy={d[1]} rx={d[2]} ry={d[3]} transform={`rotate(${d[4]} ${d[0]} ${d[1]})`} />;

export type BallState = 'thinking' | 'rest' | 'still';

/**
 * CoachHelm's mark in the chat: a golf ball (owner, 11 Nov). No wheel, sparkle, robot or wand.
 *
 * `thinking`: the working indicator (MOTION-AND-VISUAL 3.1, 3.9): its dimples stand as points of light, in three waves
 * from the middle out, on the working beat's opacity cycle; it loops only for as long as it is `thinking`, which is
 * CoachHelm working. `rest` and `still`: the ball alone, still; nothing ripples at rest or on news (3.12; audit
 * 2026-11-15, MAC-15, H393-007). When the work is done the ball is not kept: `leaving` fades it on the quick beat and
 * whoever mounted it takes it away, so nothing stands beside a finished answer.
 *
 * The points of light are their own layers, moved by opacity only (styles/coachhelm-ball.css). A ball that stops thinking
 * finishes the beat it is in (the first wave's cycle ends with every wave dark), so nothing snaps. Reduced motion and
 * Animations off draw a still ball in every state.
 */
export function BallMark({
  state = 'still',
  on = 'green',
  size = 'md',
  leaving = false,
}: {
  state?: BallState;
  /** The surface under it: the deep green of the island, or the page's paper. */ on?: 'green' | 'paper';
  /** 20, 24 or 28 px. */ size?: 'sm' | 'md' | 'lg';
  leaving?: boolean;
}) {
  const [breathing, setBreathing] = useState(state === 'thinking');
  if (state === 'thinking' && !breathing) setBreathing(true);
  useEffect(() => {
    if (state === 'thinking' || !breathing) return;
    // The loop's own end is the cue (`onAnimationIteration`); this is for a loop that is not running (reduced motion, a hidden tab).
    const t = setTimeout(() => setBreathing(false), LOOP_MS);
    return () => clearTimeout(t);
  }, [state, breathing]);
  const shown: BallState = breathing ? 'thinking' : state;

  return (
    <span className={`ch-ball is-${shown}` + (on === 'paper' ? ' is-paper' : '') + (size === 'md' ? '' : ` is-${size}`) + (leaving ? ' is-leaving' : '')} aria-hidden="true">
      <span
        className="ch-ball__orb"
        onAnimationIteration={(e) => {
          // The first wave's beat ends with all three dark: the place to stop.
          if (e.animationName === 'ch-working' && (e.target as Element).classList.contains('is-a') && state !== 'thinking') setBreathing(false);
        }}
      >
        <span className="ch-ball__body">
          <i className="ch-ball__shell" />
          <svg viewBox="0 0 24 24" focusable="false">
            <g transform="translate(0.16 0.2)">{ALL.map((d) => dimple(d, 'ch-ball__lip'))}</g>
            {ALL.map((d) => dimple(d, 'ch-ball__pit'))}
          </svg>
        </span>
        {shown === 'thinking' &&
          WAVES.map((w) => (
            <svg key={w.id} className={`ch-ball__dots is-${w.id}`} viewBox="0 0 24 24" focusable="false">
              {w.dimples.map((d) => dimple(d))}
            </svg>
          ))}
      </span>
    </span>
  );
}
