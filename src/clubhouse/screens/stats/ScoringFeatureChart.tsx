'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { hapticScrub } from '../../lib/haptics';
import { meanSeries, parLine, type TrendRound } from './round-trend';
import { monoPath, type ShsTone } from './shs-figures';

const H = 160;
const PAD = { l: 4, r: 30, t: 10, b: 26 };

/**
 * The feature card's chart (08 criteria 12, 13, 68): 160 tall and never stretched, so its width is measured. Every round a dot, the
 * five-round average through them, par dashed. Press and drag reads the nearest round and tells the card; release restores the
 * average; it never opens the detail (`data-ch-no-open`). One round: one dot and the par rule, not focusable (CP-126).
 */
export function ScoringFeatureChart({ rounds, tone, onRead }: { rounds: readonly TrendRound[]; tone: ShsTone; onRead: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [read, setRead] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = rounds.filter((r): r is TrendRound & { value: number } => r.value != null);
  const n = shown.length;
  const scores = shown.map((r) => r.value);
  const par = parLine(shown);
  let lo = Math.min(...scores, ...(par == null ? [] : [par])) - 1;
  let hi = Math.max(...scores) + 1;
  const step = hi - lo > 10 ? 4 : hi - lo > 6 ? 2 : 1;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i: number) => PAD.l + (n <= 1 ? (width - PAD.l - PAD.r) / 2 : (i * (width - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const avg = meanSeries(shown)
    .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
    .filter((p): p is readonly [number, number] => p != null);
  const line = monoPath(avg);
  const area = avg.length ? `${line}L${avg[avg.length - 1]![0]},${H - PAD.b}L${avg[0]![0]},${H - PAD.b}Z` : '';
  const colour = tone === 'gain' ? 'var(--s-gain-fill)' : tone === 'loss' ? 'var(--s-loss-fill)' : 'var(--s-flat)';

  const set = useCallback(
    (i: number | null) => {
      setRead((was) => {
        if (was !== i && i != null) hapticScrub('step');
        return i;
      });
      onRead(i);
    },
    [onRead],
  );
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - (e.clientX - left));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    set(best);
  };

  if (!n) return null;
  const first = shown[0]!;
  const last = shown[n - 1]!;
  const interactive = n > 1;
  return (
    <div
      ref={box}
      className="ch-shs-chart"
      data-ch="stats-hero-chart"
      data-ch-no-open=""
      role={interactive ? 'slider' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Scores for ${n} ${n === 1 ? 'round' : 'rounds'}, from ${Math.round(first.value)} on ${first.label} to ${Math.round(last.value)} on ${last.label}. Use the arrow keys to read each round.`}
      aria-valuemin={interactive ? 1 : undefined}
      aria-valuemax={interactive ? n : undefined}
      aria-valuenow={interactive ? (read ?? n - 1) + 1 : undefined}
      aria-valuetext={interactive ? (read == null ? `Latest ${Math.round(last.value)}, ${last.label}` : `${Math.round(shown[read]!.value)}, ${shown[read]!.label}`) : undefined}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        hapticScrub('start');
        pick(e);
      }}
      onPointerMove={(e) => {
        if (interactive && e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
      onPointerUp={() => {
        if (read == null) return;
        hapticScrub('end');
        set(null);
      }}
      onPointerCancel={() => set(null)}
      onBlur={() => set(null)}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          const cur = read ?? (e.key === 'ArrowLeft' ? n : -1);
          set(Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
        } else if (e.key === 'Escape' && read != null) {
          e.preventDefault();
          e.stopPropagation();
          set(null);
        }
      }}
    >
      <svg viewBox={`0 0 ${width} ${H}`} height={H} aria-hidden="true">
        <defs>
          <linearGradient id="ch-shs-hg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={colour} stopOpacity=".28" />
            <stop offset="1" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line className="ch-shs-grid" x1={PAD.l} x2={width - PAD.r + 4} y1={y(v)} y2={y(v)} />
            <text className="ch-shs-ax" x={width} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {par != null && <line className="ch-shs-parline" x1={PAD.l} x2={width - PAD.r + 4} y1={y(par)} y2={y(par)} />}
        {area && <path d={area} fill="url(#ch-shs-hg)" />}
        {line && <path className="ch-shs-avgline" d={line} stroke={colour} />}
        {shown.map((r, i) => (
          <circle key={r.id} className={'ch-shs-rdot' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')} cx={x(i)} cy={y(r.value)} r={read === i ? 6 : i === n - 1 ? 5 : 3.6} />
        ))}
        {read != null && (
          <>
            <line className="ch-shs-scrub" x1={x(read)} x2={x(read)} y1={PAD.t - 4} y2={H - PAD.b + 2} />
            <circle className="ch-shs-scrub-ring" cx={x(read)} cy={y(shown[read]!.value)} r="10" />
          </>
        )}
        <text className="ch-shs-ax" x={PAD.l} y={H - 6}>
          {first.label}
        </text>
        {n > 1 && (
          <text className="ch-shs-ax" x={width - PAD.r} y={H - 6} textAnchor="end">
            {last.label}
          </text>
        )}
      </svg>
    </div>
  );
}
