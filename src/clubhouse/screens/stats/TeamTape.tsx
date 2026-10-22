import { useId } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { ChGauge } from '../../data/stats-team';
import { gappedPath, lastValue } from '../../lib/chart';
import { formatSigned, NO_DATA } from '../../lib/format';
import { deltaTone, deltaWords } from '../../lib/stats-signal';

export type TapeItem = {
  label: string;
  value: string;
  unit?: string;
  delta: number | null;
  /** The change's standard error: the cell is green or amber only when the change clears it (Q4); null or absent, neutral. */
  se?: number | null;
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
 * better (a lower score or fewer putts are drawn higher). The colour says whether the change against the previous 10 is
 * larger than its standard error (`deltaTone`, decision Q4): green better, amber worse, neutral ink and "No clear change"
 * otherwise, the signed change still shown.
 */
export function TeamTape({ items, against = 'vs previous 10' }: { items: TapeItem[]; /** What a change is against, in the window's words ("vs previous 5"). */ against?: string }) {
  return (
    <ul className="ch-tp" aria-label="Team figures">
      {items.map((it) => (
        <TapeCell key={it.label} it={it} against={against} />
      ))}
    </ul>
  );
}

function TapeCell({ it, against }: { it: TapeItem; against: string }) {
  const d = it.delta;
  // A figure with no value keeps no caption: "vs previous 10" and the coverage note under an em dash describe a number that is not there.
  const none = it.value === NO_DATA;
  const signal = deltaTone(d, it.se, it.lowerIsBetter);
  // A change is always against the previous N (the loader has one only then); a figure whose caption says something else
  // (the Tour's average, "Eagles not counted") keeps that caption on the note line, under the change's words.
  const words = d != null ? deltaWords(d, signal, against) : it.context;
  const note = [d != null && it.context !== against ? it.context : null, it.note].filter(Boolean).join(' · ') || undefined;
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
  const tone = signal === 'is-gain' ? 'is-good' : signal === 'is-loss' ? 'is-bad' : 'is-flat';
  const gid = useId().replace(/:/g, '');
  const ink = tone === 'is-good' ? 'var(--ch-chart-gain)' : tone === 'is-bad' ? 'var(--ch-chart-loss)' : 'var(--ch-text-tertiary)';
  return (
    <li className={`ch-tp__c ${tone}`} data-ch-code={it.code}>
      <Dial it={it} tone={tone} />
      <span className="ch-tp__l">{it.label}</span>
      <b className="ch-tp__v ch-num">
        {it.value}
        {it.unit && !none && <small>{it.unit}</small>}
      </b>
      <span className={`ch-tp__d ch-num ${tone}`}>
        {d != null ? (
          <>
            <Icon icon={signal === '' ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight} size={13} />
            {formatSigned(d, it.deltaDigits)}
          </>
        ) : null}
        {!none && <em>{words}</em>}
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`ch-tp__svg ${tone}`} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1={0} x2={0} y1={0} y2={1}>
            <stop offset="0" stopColor={ink} stopOpacity={0.32} />
            <stop offset="1" stopColor={ink} stopOpacity={0} />
          </linearGradient>
        </defs>
        {path && end && (
          <>
            <path d={`${path} L${x(end.i)},${H} L${x(first)},${H} Z`} className="ch-tp__area" fill={`url(#${gid})`} />
            <path d={path} className="ch-tp__line" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {end && <circle cx={x(end.i)} cy={y(end.v)} r={3.2} className="ch-tp__dot" vectorEffect="non-scaling-stroke" />}
      </svg>
      {note && !none && <span className="ch-tp__n">{note}</span>}
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
