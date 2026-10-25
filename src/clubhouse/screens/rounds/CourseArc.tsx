'use client';

import { useState, type KeyboardEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { formatFixed } from '../../lib/format';
import { monotonePath } from '../../lib/chart';
import { flowGeometry, flowKeyStep } from './RoundZones';

/**
 * P-7 4.2.6: the round here, on the review's stage material: the player's average running score to par after each hole
 * across their full rounds here, with the usual spread from five rounds, and the best and the last round as optional
 * overlays. It shares ScoreFlow's scales (`flowGeometry`), so the two charts line up hole for hole. Drawn at its final
 * state; it is a slider over the holes, synced with the hole map.
 */

const W = 720;
const H = 248;
const X0 = 52;
const X1 = 690;
const TOP = 30;
const PLOT = 170;

const spoken = (v: number) => (Math.abs(v) < 0.05 ? 'level' : `${v > 0 ? 'plus' : 'minus'} ${formatFixed(Math.abs(v), 1)}`);

/** "Hole 14, average plus 1.9 through 14", and with the best on, "…, best here plus 1 through 14". */
export function arcValueText(n: number, mean: number, best: number | null): string {
  return `Hole ${n}, average ${spoken(mean)} through ${n}${best == null ? '' : `, best here ${spoken(best)} through ${n}`}`;
}

export function CourseArc({
  arc,
  lines,
  selected,
  onSelect,
}: {
  arc: { mean: number[]; sd: number[] | null; rounds: number };
  lines: { best: { cum: number[]; score: number } | null; last: { cum: number[]; score: number } | null };
  selected: number;
  onSelect: (n: number) => void;
}) {
  const [show, setShow] = useState<{ best: boolean; last: boolean }>({ best: false, last: false });
  const all = [...arc.mean, ...(arc.sd ? arc.mean.flatMap((m, i) => [m - arc.sd![i]!, m + arc.sd![i]!]) : []), ...(show.best && lines.best ? lines.best.cum : []), ...(show.last && lines.last ? lines.last.cum : []), 0];
  const lo = Math.floor(Math.min(...all)) - 1;
  const hi = Math.ceil(Math.max(...all)) + 1;
  const { x, y, split } = flowGeometry({ x0: X0, x1: X1, top: TOP, height: PLOT, holes: 18, lo, hi });
  const path = (vals: readonly number[]) => monotonePath(vals.map((v, i) => [x(i + 1), y(v)]));
  const band = arc.sd
    ? `${arc.mean.map((m, i) => `${x(i + 1)},${y(m - arc.sd![i]!)}`).join(' ')} ${[...arc.mean]
        .map((m, i) => `${x(i + 1)},${y(m + arc.sd![i]!)}`)
        .reverse()
        .join(' ')}`
    : null;
  const at = selected - 1;
  const toggle = (k: 'best' | 'last') => {
    haptic('select');
    setShow((s) => ({ ...s, [k]: !s[k] }));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const to = flowKeyStep(e.key, at, 18);
    if (to == null) return;
    e.preventDefault();
    if (to !== at) onSelect(to + 1);
  };
  return (
    <section className="ch-ch-sec" aria-labelledby="ch-carc-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-carc-h">The round here</h2>
      </div>
      <div className="ch-carc">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="ch-carc__svg"
          role="slider"
          tabIndex={0}
          aria-label="Average running score to par"
          aria-valuemin={1}
          aria-valuemax={18}
          aria-valuenow={selected}
          aria-valuetext={arcValueText(selected, arc.mean[at]!, show.best && lines.best ? lines.best.cum[at]! : null)}
          onKeyDown={onKey}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const vx = ((e.clientX - r.left) / r.width) * W;
            const n = Math.max(1, Math.min(18, Math.round(((vx - X0) / (X1 - X0)) * 17) + 1));
            haptic('select');
            onSelect(n);
          }}
        >
          <line x1={X0 - 8} x2={X1 + 10} y1={y(0)} y2={y(0)} stroke="var(--ch-stage-rule)" strokeWidth={1} />
          <text x={X0 - 14} y={y(0) + 4} textAnchor="end" fontSize={11} fill="var(--ch-stage-ink-soft)" className="ch-num">
            E
          </text>
          {split != null && (
            <g>
              <line x1={split} x2={split} y1={TOP - 12} y2={TOP + PLOT + 8} stroke="var(--ch-stage-rule)" strokeDasharray="4 5" />
              <text x={(x(1) + x(9)) / 2} y={16} textAnchor="middle" fontSize={11} fill="var(--ch-stage-ink-soft)">
                Out
              </text>
              <text x={(x(10) + x(18)) / 2} y={16} textAnchor="middle" fontSize={11} fill="var(--ch-stage-ink-soft)">
                In
              </text>
            </g>
          )}
          {band && <polygon className="ch-carc__band" points={band} fill="var(--ch-stage-line)" fillOpacity={0.12} />}
          <line x1={x(selected)} x2={x(selected)} y1={TOP - 12} y2={TOP + PLOT + 8} stroke="var(--ch-stage-ink-soft)" strokeWidth={1} />
          <path className="ch-carc__mean" d={path(arc.mean)} fill="none" stroke="var(--ch-stage-line)" strokeWidth={2} />
          {show.best && lines.best && <path className="ch-carc__best" d={path(lines.best.cum)} fill="none" stroke="var(--ch-stage-gold)" strokeWidth={1.5} />}
          {show.last && lines.last && <path className="ch-carc__last" d={path(lines.last.cum)} fill="none" stroke="var(--ch-stage-ink)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 3" />}
          <g fontSize={11} textAnchor="middle" fill="var(--ch-stage-ink-soft)">
            {arc.mean.map((_, i) => (
              <text key={i} x={x(i + 1)} y={H - 14} className={'ch-num' + (i % 2 === 1 ? ' ch-carc__alt' : '')} fontWeight={i + 1 === selected ? 700 : 500}>
                {i + 1}
              </text>
            ))}
          </g>
        </svg>
        <p className="ch-carc__cap">{arc.sd ? `Average of ${arc.rounds} rounds · band shows the usual spread` : `Average of ${arc.rounds} rounds · spread shows from 5 rounds`}</p>
      </div>
      {(lines.best || lines.last) && (
        <div className="ch-pills ch-carc__pills" role="group" aria-label="Draw over the average">
          {lines.best && (
            <button type="button" className="ch-pill ch-num" aria-pressed={show.best} onClick={() => toggle('best')}>
              Best · {lines.best.score}
            </button>
          )}
          {lines.last && (
            <button type="button" className="ch-pill ch-num" aria-pressed={show.last} onClick={() => toggle('last')}>
              Last · {lines.last.score}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
