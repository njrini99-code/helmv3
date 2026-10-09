import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { ChGauge } from '../../data/stats-team';
import { gappedPath, lastValue } from '../../lib/chart';
import { formatSigned } from '../../lib/format';

export type TapeItem = {
  label: string;
  value: string;
  unit?: string;
  delta: number | null;
  deltaDigits: number;
  lowerIsBetter: boolean;
  context: string;
  note?: string;
  code?: string;
  /** The weekly line under the value, on the page's weeks. */
  series: Array<number | null>;
  /** What the dial beside the label draws the value against (the figure's own reference); the value it reads. */
  gauge?: ChGauge;
  n?: number | null;
};

/** Holes in a round, and two putts on every green: the references the holes and putts dials draw against (as FigureGauge's). */
const HOLES = 18;
const TWO_PUTT = 2 * HOLES;
/** The putts dial's full turn: a little past two-putting every green. */
const PUTT_SCALE = 40;

const W = 200;
const H = 46;
const PAD = 5;

/**
 * P004: the team's other figures as one open tape under the trend: a hairline between each, the value, how it moved, and
 * its weekly line at one height and one scale rule, so five different measures read as a set. Every line reads up as
 * better (a lower score or fewer putts are drawn higher), and the colour says whether the last stretch helped.
 */
export function TeamTape({ items }: { items: TapeItem[] }) {
  return (
    <ul className="ch-tp" aria-label="Team figures">
      {items.map((it) => (
        <TapeCell key={it.label} it={it} />
      ))}
    </ul>
  );
}

function TapeCell({ it }: { it: TapeItem }) {
  const d = it.delta;
  const flat = d != null && Math.abs(d) < (it.deltaDigits ? 0.05 : 0.5);
  const good = d != null && !flat && (it.lowerIsBetter ? d < 0 : d > 0);
  const vals = it.series.filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // A flat series sits mid-height instead of dividing by zero.
  const span = hi - lo || 1;
  const x = (i: number) => (it.series.length <= 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (it.series.length - 1));
  const y = (v: number) => {
    const t = (v - lo) / span;
    return PAD + (it.lowerIsBetter ? t : 1 - t) * (H - PAD * 2);
  };
  const path = vals.length > 1 ? gappedPath(it.series, x, y) : '';
  const end = lastValue(it.series);
  const first = it.series.findIndex((v) => v != null);
  const tone = d == null || flat ? 'is-flat' : good ? 'is-good' : 'is-bad';
  return (
    <li className={`ch-tp__c ${tone}`} data-ch-code={it.code}>
      <Dial it={it} tone={tone} />
      <span className="ch-tp__l">{it.label}</span>
      <b className="ch-tp__v ch-num">
        {it.value}
        {it.unit && <small>{it.unit}</small>}
      </b>
      <span className={`ch-tp__d ch-num ${tone}`}>
        {d != null ? (
          <>
            <Icon icon={flat ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight} size={13} />
            {formatSigned(d, it.deltaDigits)}
          </>
        ) : null}
        <em>{it.context}</em>
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`ch-tp__svg ${tone}`} aria-hidden="true">
        {path && end && (
          <>
            <path d={`${path} L${x(end.i)},${H} L${x(first)},${H} Z`} className="ch-tp__area" />
            <path d={path} className="ch-tp__line" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {end && <circle cx={x(end.i)} cy={y(end.v)} r={3.2} className="ch-tp__dot" vectorEffect="non-scaling-stroke" />}
      </svg>
      {it.note && <span className="ch-tp__n">{it.note}</span>}
    </li>
  );
}

/**
 * The small widget at the cell's corner: a rate as a ring with the Tour's mark where there is one, birdies as holes of
 * 18, putts against two on every green, and the scoring average as its distance from par. Decorative: the value says it.
 */
function Dial({ it, tone }: { it: TapeItem; tone: string }) {
  const g = it.gauge;
  const n = it.n;
  if (!g || n == null) return null;
  if (g.kind === 'par') {
    if (g.toPar == null) return null;
    const under = g.toPar <= 0;
    return (
      <span className={`ch-tp__par ch-num ${under ? 'is-good' : 'is-bad'}`} aria-hidden="true">
        {Math.abs(g.toPar) < 0.05 ? 'E' : formatSigned(g.toPar, 1)}
        <em>to par</em>
      </span>
    );
  }
  const full = g.kind === 'holes' ? HOLES : g.kind === 'putts' ? PUTT_SCALE : 100;
  const mark = g.kind === 'rate' ? g.ref : g.kind === 'putts' ? (TWO_PUTT / PUTT_SCALE) * 100 : null;
  const pct = Math.max(0, Math.min(100, (n / full) * 100));
  const R = 17;
  const C = 2 * Math.PI * R;
  const at = (p: number) => {
    const a = (p / 100) * 2 * Math.PI - Math.PI / 2;
    return { x1: 22 + (R - 5) * Math.cos(a), y1: 22 + (R - 5) * Math.sin(a), x2: 22 + (R + 5) * Math.cos(a), y2: 22 + (R + 5) * Math.sin(a) };
  };
  const m = mark != null ? at(mark) : null;
  return (
    <svg viewBox="0 0 44 44" className={`ch-tp__dial ${tone}`} aria-hidden="true">
      <circle cx={22} cy={22} r={R} className="ch-tp__ring" />
      <circle cx={22} cy={22} r={R} className="ch-tp__arc" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 22 22)" />
      {m && <line {...m} className="ch-tp__tick" />}
    </svg>
  );
}
