'use client';

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ChReviewHole } from '../../data/round-review-shape';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { ZoneBlock } from '../../ui/Zone';
import { costliest, flow, puttBands, puttSplit, trail, type FlowPoint, type HoleResult, type turningStretch } from './round-insights';
import { afterRailMove } from '../../lib/rail-fold';
import { plural, pluralWord } from '../../lib/plural';

/**
 * P011: the pictures of a round's review. A zone is a band under a gold rule: what the area is and one reading on the left,
 * the picture that fits it on the right. Every picture is drawn from the review's own holes and shots (round-insights.ts);
 * a round without the data says so in a line rather than drawing zeros.
 */

/** The marks on the deep-green stage: under par is red (D-42), par recedes, over par is gold, a double is ivory. */
const COLOR: Record<HoleResult, string> = {
  eagle: 'var(--ch-stage-red)',
  birdie: 'var(--ch-stage-red)',
  par: 'var(--ch-stage-ink-soft)',
  bogey: 'var(--ch-stage-gold)',
  double: 'var(--ch-stage-ink)',
};
const WORD: Record<HoleResult, string> = { eagle: 'Eagle', birdie: 'Birdie', par: 'Par', bogey: 'Bogey', double: 'Double bogey or worse' };

const pos = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

/** Where the stretch that turned the round sits (`turningStretch`); null when no run moved the score by 2. */
export type FlowTurning = ReturnType<typeof turningStretch>;

/**
 * P-7: the arc's scales, shared by the review's ScoreFlow and the course page's average arc so the two line up exactly.
 * Holes run left to right from `x0` to `x1`; to par runs from `lo` at the top to `hi` at the foot (better is up). `split` is
 * the x between holes 9 and 10 on a round longer than nine.
 */
export function flowGeometry({ x0, x1, top, height, holes, lo, hi }: { x0: number; x1: number; top: number; height: number; holes: number; lo: number; hi: number }) {
  const x = (hole: number) => x0 + ((hole - 1) / Math.max(1, holes - 1)) * (x1 - x0);
  const y = (v: number) => top + ((v - lo) / (hi - lo)) * height;
  const split = holes > 9 ? x(9) + (x(10) - x(9)) / 2 : null;
  return { x, y, split };
}

/** "plus 3", "minus 2", "level par": a to-par figure as it is spoken. */
const spokenToPar = (v: number) => {
  const r = Math.round(v * 10) / 10;
  const mag = Number.isInteger(r) ? String(Math.abs(r)) : formatFixed(Math.abs(r), 1);
  return r === 0 ? 'level par' : r > 0 ? `plus ${mag}` : `minus ${mag}`;
};

/** What the arc's slider says for a hole: "Hole 14, par 4, made 6, plus 3 through 14". */
export function flowValueText(p: FlowPoint): string {
  return `Hole ${p.n}, par ${p.par}, made ${p.score}, ${spokenToPar(p.cum)} through ${p.n}`;
}

/** The hole a key moves the slider to, or null for a key the slider does not take: arrows a hole, Page keys three, Home and End the ends. */
export function flowKeyStep(key: string, at: number, count: number): number | null {
  const to = (i: number) => Math.max(0, Math.min(count - 1, i));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return to(at + 1);
    case 'ArrowLeft':
    case 'ArrowDown':
      return to(at - 1);
    case 'PageUp':
      return to(at + 3);
    case 'PageDown':
      return to(at - 3);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The round as a running score to par on a deep-green stage: a line that rises when the player is gaining on par and falls
 * when strokes go back, the holes below as columns. Move across it to read a hole; a click picks the hole on the scorecard.
 * P-7: it is a slider over the holes (arrows, Page keys, Home and End pick a hole; `selected` is the picked one), and the
 * stretch that turned the round is drawn as a band behind the line with its sentence at the top.
 */
export function ScoreFlow({
  holes,
  outScore,
  outToPar,
  inScore,
  inToPar,
  selected = null,
  turning = null,
  ghost = null,
  onPick,
}: {
  holes: ChReviewHole[];
  outScore: number | null;
  outToPar: number | null;
  inScore: number | null;
  inToPar: number | null;
  /** The hole picked on the scorecard; the slider's value. */
  selected?: number | null;
  turning?: FlowTurning;
  /** P-7: another round drawn under this one: its running score to par by hole number (1..18) and what it is. */
  ghost?: { cum: readonly number[]; label: string; spoken: string } | null;
  /** `via` is 'key' when the pick came from the keyboard, so the caller can keep focus where it is. */
  onPick?: (n: number, via: 'pointer' | 'key') => void;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // While the slider has keyboard focus the picked hole is read like a hovered one.
  const [focused, setFocused] = useState(false);
  // The card keeps the last hole it read while it fades out, so it never empties before it is gone.
  const [last, setLast] = useState<number | null>(null);
  const pts = flow(holes);
  if (pts.length < 2) return <p className="ch-znmiss">The running score needs two holes with scores.</p>;
  const n = Math.max(...holes.map((h) => h.n));
  const W = 720;
  const X0 = 52;
  const X1 = 690;
  // The plot runs from just under the best the round got to just over its worst, always with par inside it; up is better.
  const ghostVals = ghost ? ghost.cum.slice(0, n) : [];
  const lo = Math.floor(Math.min(0, ...pts.map((p) => p.cum), ...ghostVals)) - 1;
  const hi = Math.ceil(Math.max(0, ...pts.map((p) => p.cum), ...ghostVals)) + 1;
  const TOP = 44;
  const H = 150;
  const { x, y, split } = flowGeometry({ x0: X0, x1: X1, top: TOP, height: H, holes: n, lo, hi });
  const Y0 = y(0);
  const line = pts.map((p) => `${x(p.n)},${y(p.cum)}`).join(' ');
  const area = `${x(pts[0]!.n)},${Y0} ${line} ${x(pts[pts.length - 1]!.n)},${Y0}`;
  const stepBy = hi - lo > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / stepBy) * stepBy; v <= hi; v += stepBy) ticks.push(v);
  // On a phone the words are drawn larger (rounds.css, `chrz`), so where they would touch every other tick and hole
  // number gives way (`ch-rzsvg__alt`); par and the odd holes always stay.
  const tickAlt = (v: number) => (H / (hi - lo)) * stepBy < 36 && (v / stepBy) % 2 !== 0;
  const worst = costliest(holes, 1)[0];
  const colBase = TOP + H + 44;
  const height = colBase + 52;
  const label = (v: number) => (v === 0 ? 'E' : v > 0 ? `+${v}` : `−${Math.abs(v)}`);
  const active = hover ?? (focused ? selected : null);
  const cur = active == null ? null : (pts.find((p) => p.n === active) ?? null);
  const shown = pts.find((p) => p.n === (active ?? last)) ?? null;
  const valueAt = Math.max(0, pts.findIndex((p) => p.n === selected));
  const value = pts[valueAt]!;
  const firstN = pts[0]!.n;
  const lastN = pts[pts.length - 1]!.n;
  // The turning band covers its holes' columns; a run that wraps past the last hole is told in words only.
  const half = (X1 - X0) / Math.max(1, n - 1) / 2;
  const band = turning && turning.to >= turning.from ? { x0: x(turning.from) - half, x1: x(turning.to) + half, loss: turning.sum > 0 } : null;
  const bandMid = band ? (band.x0 + band.x1) / 2 : 0;
  const bandAnchor = !band ? 'middle' : bandMid < X0 + 90 ? 'start' : bandMid > X1 - 90 ? 'end' : 'middle';
  const bandLx = !band ? 0 : bandAnchor === 'start' ? Math.max(X0 - 8, band.x0 + 4) : bandAnchor === 'end' ? Math.min(X1 + 10, band.x1 - 4) : bandMid;
  // The band's label sits on the hint row; the right-hand hint gives way when the label reaches it.
  const hintClear = !band || (bandAnchor === 'end' ? false : bandAnchor === 'middle' ? bandMid + 80 < X1 - 100 : true);
  const worstInBand = !!(band && worst && worst.n >= turning!.from && worst.n <= turning!.to);
  const spoken = [
    split != null && outScore != null && outToPar != null ? `Out in ${outScore}, ${spokenToPar(outToPar)}.` : null,
    split != null && inScore != null && inToPar != null ? `In in ${inScore}, ${spokenToPar(inToPar)}.` : null,
    turning ? `${turning.words}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const to = flowKeyStep(e.key, valueAt, pts.length);
    if (to == null) return;
    e.preventDefault();
    if (pts[to]!.n !== selected) onPick?.(pts[to]!.n, 'key');
  };
  const near = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    return pts.reduce((a, b) => (Math.abs(x(b.n) - vx) < Math.abs(x(a.n) - vx) ? b : a)).n;
  };
  return (
    <div className="ch-rzstage">
      <svg
        className="ch-rzsvg"
        viewBox={`0 0 ${W} ${height}`}
        role="slider"
        tabIndex={0}
        aria-label="Running score to par"
        aria-valuemin={firstN}
        aria-valuemax={lastN}
        aria-valuenow={value.n}
        aria-valuetext={flowValueText(value) + (ghost && ghost.cum[value.n - 1] != null ? `, ${ghost.spoken} ${spokenToPar(ghost.cum[value.n - 1]!)} through ${value.n}` : '')}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerMove={(e) => {
          const h = near(e.clientX, e.currentTarget);
          setHover(h);
          setLast(h);
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onPick?.(near(e.clientX, e.currentTarget), 'pointer')}
      >
        <defs>
          <clipPath id={`${id}-up`}>
            <rect x={0} y={0} width={W} height={Y0} />
          </clipPath>
          <clipPath id={`${id}-down`}>
            <rect x={0} y={Y0} width={W} height={400} />
          </clipPath>
          <linearGradient id={`${id}-gu`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--ch-stage-line)" stopOpacity="0.04" />
            <stop offset="1" stopColor="var(--ch-stage-line)" stopOpacity="0.42" />
          </linearGradient>
          <linearGradient id={`${id}-gd`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ch-stage-gold)" stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--ch-stage-gold)" stopOpacity="0.04" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {band && (
          <g className={'ch-rzband' + (band.loss ? ' is-loss' : ' is-gain')}>
            <rect x={band.x0} y={TOP - 6} width={band.x1 - band.x0} height={colBase - TOP + 6} fill={band.loss ? 'var(--ch-stage-gold)' : 'var(--ch-stage-line)'} fillOpacity={band.loss ? 0.14 : 0.12} />
            <line x1={band.x0} y1={TOP - 6} x2={band.x0} y2={colBase} stroke={band.loss ? 'var(--ch-stage-gold)' : 'var(--ch-stage-line)'} strokeWidth={1} />
            <line x1={band.x1} y1={TOP - 6} x2={band.x1} y2={colBase} stroke={band.loss ? 'var(--ch-stage-gold)' : 'var(--ch-stage-line)'} strokeWidth={1} />
          </g>
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={X0 - 8} y1={y(v)} x2={X1 + 10} y2={y(v)} stroke={v === 0 ? 'var(--ch-stage-ink-soft)' : 'var(--ch-stage-rule)'} strokeWidth={v === 0 ? 1.5 : 1} />
            <text className={tickAlt(v) ? 'ch-rzsvg__alt ch-num' : 'ch-num'} x={X0 - 14} y={y(v) + 4} textAnchor="end" fontSize={12} fontWeight={v === 0 ? 700 : 500} fill="var(--ch-stage-ink-soft)">
              {label(v)}
            </text>
          </g>
        ))}
        {hintClear && (
          <text className="ch-rzsvg__hint" x={X1 + 10} y={TOP - 14} textAnchor="end" fontSize={11} fill="var(--ch-stage-ink-soft)">
            Better than par
          </text>
        )}
        {band && (
          <text className="ch-rzband__label" x={bandLx} y={TOP - 14} textAnchor={bandAnchor} fontSize={13} fontWeight={600} fill="var(--ch-stage-ink)">
            {turning!.words}
          </text>
        )}
        <text className="ch-rzsvg__hint" x={X1 + 10} y={TOP + H + 22} textAnchor="end" fontSize={11} fill="var(--ch-stage-ink-soft)">Worse than par</text>
        {split != null && (
          <g>
            <line x1={split} y1={28} x2={split} y2={colBase + 28} stroke="var(--ch-stage-rule)" strokeDasharray="4 5" />
            <text x={(x(1) + x(9)) / 2} y={18} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">
              Out {outScore ?? NO_DATA} · {formatToPar(outToPar)}
            </text>
            <text x={(x(10) + x(n)) / 2} y={18} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">
              In {inScore ?? NO_DATA} · {formatToPar(inToPar)}
            </text>
          </g>
        )}
        <g className="ch-rzfill">
          <polygon points={area} fill={`url(#${id}-gu)`} clipPath={`url(#${id}-up)`} />
          <polygon points={area} fill={`url(#${id}-gd)`} clipPath={`url(#${id}-down)`} />
        </g>
        {ghost && ghostVals.length > 1 && (
          <g className="ch-rzghost">
            <polyline points={ghostVals.map((v, i) => `${x(i + 1)},${y(v)}`).join(' ')} fill="none" stroke="var(--ch-stage-ink)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={X1 + 10} y={y(ghostVals[ghostVals.length - 1]!) - 8} textAnchor="end" fontSize={11} fill="var(--ch-stage-ink-soft)" className="ch-num">
              {ghost.label}
            </text>
          </g>
        )}
        <polyline className="ch-rzline" pathLength={1} points={line} fill="none" stroke="var(--ch-stage-line)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" filter={`url(#${id}-glow)`} />
        {cur && (
          <g>
            <line x1={x(cur.n)} y1={30} x2={x(cur.n)} y2={colBase + 20} stroke="var(--ch-stage-ink-soft)" strokeWidth={1.5} />
          </g>
        )}
        <g className="ch-rzdots">
          {pts.map((p) => (
            <g key={p.n} className={'ch-rzdot' + (cur?.n === p.n ? ' is-hot' : '')} style={{ transformOrigin: `${x(p.n)}px ${y(p.cum)}px` }}>
              {p.delta !== 0 && <circle className="ch-rzdot__halo" cx={x(p.n)} cy={y(p.cum)} r={13} fill={COLOR[p.result]} />}
              <circle cx={x(p.n)} cy={y(p.cum)} r={p.delta === 0 ? 4 : 6.5} fill={COLOR[p.result]} stroke="var(--ch-green-900)" strokeWidth={2.5} />
            </g>
          ))}
        </g>
        {worst && !cur && !worstInBand && <WorstLabel at={x(worst.n)} dotY={y(worst.cum)} n={worst.n} delta={worst.delta} x0={X0} x1={X1} foot={TOP + H + 10} />}
        <line x1={X0 - 8} y1={colBase} x2={X1 + 10} y2={colBase} stroke="var(--ch-stage-rule)" />
        {pts.map((p) => (
          <rect
            key={p.n}
            x={x(p.n) - 9}
            y={p.delta > 0 ? colBase : colBase + p.delta * 11}
            width={18}
            height={Math.max(2, Math.abs(p.delta) * 11)}
            rx={3}
            fill={COLOR[p.result]}
            opacity={p.delta === 0 ? 0.4 : cur && cur.n !== p.n ? 0.55 : 1}
          />
        ))}
        <g fontSize={12} textAnchor="middle">
          {pts.map((p) => (
            <text key={p.n} className={n > 9 && p.n % 2 === 0 ? 'ch-rzsvg__alt' : undefined} x={x(p.n)} y={colBase + 36} fontWeight={cur?.n === p.n || worst?.n === p.n ? 700 : 500} fill={cur?.n === p.n ? 'var(--ch-stage-ink)' : 'var(--ch-stage-ink-soft)'}>
              {p.n}
            </text>
          ))}
        </g>
      </svg>
      {shown && (
        <div className="ch-rzstage__tipx" style={{ '--ch-rz-x': (x(shown.n) / W) * 100 } as CSSProperties} role="presentation" aria-hidden={cur ? undefined : true}>
          <div className={'ch-rzstage__tip' + (cur ? ' is-on' : '')}>
            <b>
              Hole {shown.n} · Par {shown.par}
            </b>
            <span>
              <i style={{ background: COLOR[shown.result] }} />
              {shown.score} · {WORD[shown.result]}
            </span>
            <em className="ch-num">
              {formatToPar(shown.cum)} through {shown.n}
            </em>
          </div>
        </div>
      )}
      {spoken && <p className="ch-sr-only">{spoken}</p>}
    </div>
  );
}

/**
 * The costliest hole's label, under its dot: centred on it, or set from it inward near either end so it never runs into
 * the score labels on the left or off the stage on the right; over the dot when the dot is at the foot of the plot.
 */
function WorstLabel({ at, dotY, n, delta, x0, x1, foot }: { at: number; dotY: number; n: number; delta: number; x0: number; x1: number; foot: number }) {
  const anchor = at < x0 + 60 ? 'start' : at > x1 - 60 ? 'end' : 'middle';
  const lx = anchor === 'start' ? Math.max(x0 + 6, at - 10) : anchor === 'end' ? Math.min(x1 + 6, at + 10) : at;
  const ly = dotY + 30 > foot ? dotY - 16 : dotY + 30;
  return (
    <text x={lx} y={ly} textAnchor={anchor} fontSize={12} fontWeight={700} fill="var(--ch-stage-gold)">
      Hole {n}: {formatSigned(delta, 0)}
    </text>
  );
}

/** A row of one mark per hole: hit, missed or not applicable, the hole's number under it. */
function HitRow({ label, holes, pick, hitWord }: { label: string; holes: ChReviewHole[]; pick: (h: ChReviewHole) => boolean | null; hitWord: string }) {
  return (
    <div className="ch-rzhit" role="img" aria-label={`${label} by hole: ${holes.map((h) => `${h.n} ${pick(h) == null ? 'not applicable' : pick(h) ? hitWord : 'missed'}`).join(', ')}`}>
      <b>{label}</b>
      <div>
        {holes.map((h) => {
          const v = pick(h);
          return (
            <span key={h.n} className={'ch-rzhit__c ' + (v == null ? 'is-na' : v ? 'is-hit' : 'is-miss')}>
              <i />
              <em>{h.n}</em>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function TeeToGreen({ holes }: { holes: ChReviewHole[] }) {
  return (
    <div className="ch-rzth">
      <HitRow label="Fairway" holes={holes} pick={(h) => h.fairway} hitWord="hit" />
      <HitRow label="Green in regulation" holes={holes} pick={(h) => h.gir} hitWord="hit" />
    </div>
  );
}

/** Putts a hole as columns (one putt green, two neutral, three or more amber), with the split and the first putts by length. */
export function PuttingViz({ holes }: { holes: ChReviewHole[] }) {
  const split = puttSplit(holes);
  if (!split) return <p className="ch-znmiss">No putts were recorded for this round.</p>;
  const max = Math.max(3, ...holes.map((h) => h.putts ?? 0));
  const bands = puttBands(holes);
  const withData = bands.filter((b) => b.attempts > 0);
  return (
    <>
      <ZoneBlock title="Putts on each hole" note="One putt is green, two is neutral, three or more is gold.">
        <div className="ch-rzpt" role="img" aria-label={`Putts by hole: ${holes.map((h) => `${h.n} ${h.putts ?? 'none'}`).join(', ')}`}>
          {holes.map((h) => (
            <span key={h.n} className="ch-rzpt__c">
              <b className="ch-num">{h.putts ?? <NoData />}</b>
              <i className={h.putts == null ? '' : h.putts <= 1 ? 'is-one' : h.putts === 2 ? 'is-two' : 'is-three'} style={{ '--ch-rz-p': h.putts == null ? 0 : h.putts / max } as CSSProperties} />
              <em>{h.n}</em>
            </span>
          ))}
        </div>
        <div className="ch-rzsplit">
          <span>
            <b className="ch-num">{split.one}</b>one-putt holes
          </span>
          <span>
            <b className="ch-num">{split.two}</b>two-putt holes
          </span>
          <span className={split.three ? 'is-warn' : undefined}>
            <b className="ch-num">{split.three}</b>three-putt {pluralWord(split.three, 'hole')}
          </span>
        </div>
      </ZoneBlock>
      {withData.length > 0 && (
        <ZoneBlock title="First putts by length" note="Putts holed out of the putts hit first on each green.">
          <div className="ch-rzrows">
            {bands.map((b) => (
              <div key={b.label} className="ch-rzrow">
                <span>{b.label}</span>
                <div className="ch-rzrow__t" aria-hidden="true">
                  {b.attempts > 0 && <i style={{ '--ch-rz-p': b.made / b.attempts } as CSSProperties} />}
                </div>
                <b className="ch-num">{b.attempts > 0 ? `${b.made} of ${b.attempts}` : <NoData />}</b>
              </div>
            ))}
          </div>
        </ZoneBlock>
      )}
    </>
  );
}

const LIE_COLOR: Record<string, string> = {
  fairway: 'var(--ch-stage-line)',
  green: 'var(--ch-hero-mint-strong)',
  hole: 'var(--ch-stage-ink)',
  rough: 'var(--ch-stage-gold)',
  sand: 'var(--ch-stage-gold)',
  other: 'var(--ch-stage-gold)',
  penalty: 'var(--ch-stage-red)',
  tee: 'var(--ch-stage-line)',
};

/** The label size the stylesheet gives the picture's words now (larger in a narrow `chrz`, the picture's own width), in its own units. */
function useLabelSize(fallback: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const read = () => {
      const text = svg.querySelector('text[data-ch-label]');
      const fs = text ? parseFloat(getComputedStyle(text).fontSize) : NaN;
      setSize(Number.isFinite(fs) && fs > 0 ? fs : fallback);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    // Once the sidebar's fold has settled, not on every frame of it (lib/rail-fold.ts).
    const ro = new ResizeObserver(() => afterRailMove(read));
    ro.observe(svg);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, size] as const;
}

/**
 * The selected hole's full shots as arcs along its length, tee to pin, each coloured by where it finished; putts counted at the pin.
 * The words under the line never print over each other: the tee's runs from the tee, the putts' ends at the stage's edge,
 * and a shot's "out" label that would touch the one before it or the putts' is left out (the list under it has every shot).
 */
export function ShotTrail({ hole }: { hole: ChReviewHole }) {
  const [svgRef, fs] = useLabelSize(11.5);
  const t = trail(hole);
  if (!t) return null;
  const X0 = 30;
  const X1 = 600;
  const RIGHT = 736;
  const base = 104;
  const x = (p: number) => X0 + pos(p, 0, 1) * (X1 - X0);
  // A label's width, estimated from its length at the size the stylesheet draws it (this face averages ~0.43em a character).
  const width = (text: string) => text.length * fs * 0.46;
  const GAP = fs * 0.6;
  const teeText = hole.yards ? `Tee · ${hole.yards} yds` : 'Tee';
  const puttText = t.putts > 0 ? `${plural(t.putts, 'putt')}${t.firstPutt != null ? ` · from ${t.firstPutt} ft` : ''}` : null;
  const puttLeft = puttText ? RIGHT - width(puttText) : Infinity;
  let edge = X0 - 8 + width(teeText);
  const shown = new Set<number>();
  for (const st of t.steps) {
    if (st.penalty || !st.left) continue;
    const w = width(`${st.left} out`);
    const b = x(st.to);
    if (b - w / 2 < edge + GAP || b + w / 2 > puttLeft - GAP || b + w / 2 > RIGHT) continue;
    shown.add(st.n);
    edge = b + w / 2;
  }
  const label = `Hole ${hole.n} shots along the hole: ${t.steps.map((s) => `${s.kind}${s.penalty ? ' penalty' : ''}${s.left ? ` to ${s.left}` : ''}`).join(', ')}${t.putts ? `, then ${plural(t.putts, 'putt')}` : ''}`;
  return (
    <div className="ch-rzplate">
      <svg ref={svgRef} className="ch-rzsvg ch-rztrail" viewBox="0 0 740 150" role="img" aria-label={label}>
        <line x1={X0} y1={base} x2={X1} y2={base} stroke="var(--ch-stage-rule)" strokeWidth={8} strokeLinecap="round" />
        <line x1={X0} y1={base} x2={X1} y2={base} stroke="var(--ch-stage-ink-soft)" strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" />
        {t.steps.map((s) => {
          const a = x(s.from);
          const b = x(s.to);
          if (s.penalty) {
            return (
              <g key={s.n}>
                <circle cx={a} cy={base - 20} r={10} fill="var(--ch-stage-red)" />
                <text className="ch-rzsvg__in" x={a} y={base - 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ch-green-900)">+1</text>
              </g>
            );
          }
          const rise = Math.min(66, 16 + Math.abs(b - a) * 0.16);
          const mid = (a + b) / 2;
          const color = LIE_COLOR[s.lie] ?? LIE_COLOR.other;
          const i = t.steps.indexOf(s);
          return (
            <g key={s.n} className="ch-rzshot" style={{ '--ch-i': i } as CSSProperties}>
              <path className="ch-rzshot__arc" pathLength={1} d={`M ${a} ${base} Q ${mid} ${base - rise * 2} ${b} ${base}`} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" opacity={0.95} />
              <circle className="ch-rzshot__dot" cx={b} cy={base} r={9} fill={color} stroke="var(--ch-green-900)" strokeWidth={2.5} />
              <text className="ch-rzsvg__in" x={b} y={base + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ch-green-900)">{s.n}</text>
              {s.left && shown.has(s.n) && (
                <text x={b} y={base + 30} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">{s.left} out</text>
              )}
            </g>
          );
        })}
        <circle cx={X0} cy={base} r={6} fill="var(--ch-stage-ink)" />
        <text data-ch-label="" x={X0 - 8} y={base + 30} fontSize={11.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">
          {teeText}
        </text>
        <line x1={X1 + 16} y1={base} x2={X1 + 16} y2={base - 36} stroke="var(--ch-stage-ink)" strokeWidth={2} />
        <path d={`M ${X1 + 16} ${base - 36} l 20 7 l -20 7 z`} fill="var(--ch-stage-red)" />
        {puttText && (
          <g>
            {Array.from({ length: Math.min(t.putts, 5) }, (_, i) => (
              <circle key={i} cx={X1 + 54 + i * 14} cy={base} r={4.5} fill={t.putts >= 3 ? 'var(--ch-stage-gold)' : 'var(--ch-stage-line)'} />
            ))}
            <text x={RIGHT} y={base + 30} textAnchor="end" fontSize={11.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">
              {puttText}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
