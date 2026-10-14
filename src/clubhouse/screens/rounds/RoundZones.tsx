'use client';

import { useId, useState, type CSSProperties } from 'react';
import type { ChReviewHole } from '../../data/round-review-shape';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { useInViewOnce } from '../../lib/use-in-view';
import { ZoneBlock } from '../../ui/Zone';
import { costliest, flow, puttBands, puttSplit, trail, type HoleResult } from './round-insights';

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

/**
 * The round as a running score to par on a deep-green stage: a line that rises when the player is gaining on par and falls
 * when strokes go back, the holes below as columns. Move across it to read a hole; a click picks the hole on the scorecard.
 */
export function ScoreFlow({
  holes,
  outScore,
  outToPar,
  inScore,
  inToPar,
  onPick,
}: {
  holes: ChReviewHole[];
  outScore: number | null;
  outToPar: number | null;
  inScore: number | null;
  inToPar: number | null;
  onPick?: (n: number) => void;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // The card keeps the last hole it read while it fades out, so it never empties before it is gone.
  const [last, setLast] = useState<number | null>(null);
  const [stageRef, seen] = useInViewOnce<HTMLDivElement>();
  const pts = flow(holes);
  if (pts.length < 2) return <p className="ch-znmiss">The running score needs two holes with scores.</p>;
  const n = Math.max(...holes.map((h) => h.n));
  const W = 720;
  const X0 = 52;
  const X1 = 690;
  const x = (hole: number) => X0 + ((hole - 1) / Math.max(1, n - 1)) * (X1 - X0);
  // The plot runs from just under the best the round got to just over its worst, always with par inside it; up is better.
  const lo = Math.min(0, ...pts.map((p) => p.cum)) - 1;
  const hi = Math.max(0, ...pts.map((p) => p.cum)) + 1;
  const TOP = 44;
  const H = 150;
  const y = (v: number) => TOP + ((v - lo) / (hi - lo)) * H;
  const Y0 = y(0);
  const line = pts.map((p) => `${x(p.n)},${y(p.cum)}`).join(' ');
  const area = `${x(pts[0]!.n)},${Y0} ${line} ${x(pts[pts.length - 1]!.n)},${Y0}`;
  const stepBy = hi - lo > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / stepBy) * stepBy; v <= hi; v += stepBy) ticks.push(v);
  const worst = costliest(holes, 1)[0];
  const colBase = TOP + H + 44;
  const height = colBase + 52;
  const label = (v: number) => (v === 0 ? 'E' : v > 0 ? `+${v}` : `−${Math.abs(v)}`);
  const summary = pts.map((p) => `Hole ${p.n} ${formatToPar(p.cum)}`).join(', ');
  const split = n > 9 ? x(9) + (x(10) - x(9)) / 2 : null;
  const cur = hover == null ? null : (pts.find((p) => p.n === hover) ?? null);
  const shown = pts.find((p) => p.n === (hover ?? last)) ?? null;
  const near = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    return pts.reduce((a, b) => (Math.abs(x(b.n) - vx) < Math.abs(x(a.n) - vx) ? b : a)).n;
  };
  return (
    <div ref={stageRef} className={'ch-rzstage' + (seen ? ' is-in' : '')}>
      <svg
        className="ch-rzsvg"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`Running score to par: ${summary}`}
        onPointerMove={(e) => {
          const h = near(e.clientX, e.currentTarget);
          setHover(h);
          setLast(h);
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onPick?.(near(e.clientX, e.currentTarget))}
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
        {ticks.map((v) => (
          <g key={v}>
            <line x1={X0 - 8} y1={y(v)} x2={X1 + 10} y2={y(v)} stroke={v === 0 ? 'var(--ch-stage-ink-soft)' : 'var(--ch-stage-rule)'} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={X0 - 14} y={y(v) + 4} textAnchor="end" fontSize={12} fontWeight={v === 0 ? 700 : 500} fill="var(--ch-stage-ink-soft)">
              {label(v)}
            </text>
          </g>
        ))}
        <text className="ch-rzsvg__hint" x={X1 + 10} y={TOP - 14} textAnchor="end" fontSize={11} fill="var(--ch-stage-ink-soft)">Better than par</text>
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
        {worst && !cur && (
          <text x={x(worst.n)} y={y(worst.cum) + 30} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ch-stage-gold)">
            Hole {worst.n}: {formatSigned(worst.delta, 0)}
          </text>
        )}
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
            <text key={p.n} x={x(p.n)} y={colBase + 36} fontWeight={cur?.n === p.n || worst?.n === p.n ? 700 : 500} fill={cur?.n === p.n ? 'var(--ch-stage-ink)' : 'var(--ch-stage-ink-soft)'}>
              {p.n}
            </text>
          ))}
        </g>
      </svg>
      {shown && (
        <div className="ch-rzstage__tipx" style={{ '--ch-rz-x': (x(shown.n) / W) * 100 } as CSSProperties} role="presentation" aria-hidden={cur ? undefined : true}>
          <div className={'ch-rzstage__tip' + (cur ? ' is-on' : '')}>
            <b>
              Hole {shown.n} · par {shown.par}
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
    </div>
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
              <b className="ch-num">{h.putts ?? NO_DATA}</b>
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
            <b className="ch-num">{split.three}</b>three-putt {split.three === 1 ? 'hole' : 'holes'}
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
                <b className="ch-num">{b.attempts > 0 ? `${b.made} of ${b.attempts}` : NO_DATA}</b>
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

/** The selected hole's full shots as arcs along its length, tee to pin, each coloured by where it finished; putts counted at the pin. */
export function ShotTrail({ hole }: { hole: ChReviewHole }) {
  const t = trail(hole);
  if (!t) return null;
  const X0 = 30;
  const X1 = 600;
  const base = 104;
  const x = (p: number) => X0 + pos(p, 0, 1) * (X1 - X0);
  const label = `Hole ${hole.n} shots along the hole: ${t.steps.map((s) => `${s.kind}${s.penalty ? ' penalty' : ''}${s.left ? ` to ${s.left}` : ''}`).join(', ')}${t.putts ? `, then ${t.putts} ${t.putts === 1 ? 'putt' : 'putts'}` : ''}`;
  return (
    <div className="ch-rzplate">
      <svg className="ch-rzsvg ch-rztrail" viewBox="0 0 740 150" role="img" aria-label={label}>
        <line x1={X0} y1={base} x2={X1} y2={base} stroke="var(--ch-stage-rule)" strokeWidth={8} strokeLinecap="round" />
        <line x1={X0} y1={base} x2={X1} y2={base} stroke="var(--ch-stage-ink-soft)" strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" />
        {t.steps.map((s) => {
          const a = x(s.from);
          const b = x(s.to);
          if (s.penalty) {
            return (
              <g key={s.n}>
                <circle cx={a} cy={base - 20} r={10} fill="var(--ch-stage-red)" />
                <text x={a} y={base - 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ch-green-900)">+1</text>
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
              <text x={b} y={base + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ch-green-900)">{s.n}</text>
              {s.left && (
                <text x={b} y={base + 30} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">{s.left} out</text>
              )}
            </g>
          );
        })}
        <circle cx={X0} cy={base} r={6} fill="var(--ch-stage-ink)" />
        <text x={X0} y={base + 30} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">
          {hole.yards ? `Tee · ${hole.yards} yds` : 'Tee'}
        </text>
        <line x1={X1 + 16} y1={base} x2={X1 + 16} y2={base - 36} stroke="var(--ch-stage-ink)" strokeWidth={2} />
        <path d={`M ${X1 + 16} ${base - 36} l 20 7 l -20 7 z`} fill="var(--ch-stage-red)" />
        {t.putts > 0 && (
          <g>
            {Array.from({ length: Math.min(t.putts, 5) }, (_, i) => (
              <circle key={i} cx={X1 + 54 + i * 14} cy={base} r={4.5} fill={t.putts >= 3 ? 'var(--ch-stage-gold)' : 'var(--ch-stage-line)'} />
            ))}
            <text x={X1 + 54} y={base + 30} fontSize={11.5} fontWeight={600} fill="var(--ch-stage-ink-soft)">
              {t.putts} {t.putts === 1 ? 'putt' : 'putts'}
              {t.firstPutt != null ? ` · from ${t.firstPutt} ft` : ''}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
