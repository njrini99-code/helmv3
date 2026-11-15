import { useId } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { ChGauge, ChTeamStats } from '../../data/stats-team';
import { gappedArea, gappedPath, lastValue, lonePoints, weekShares } from '../../lib/chart';
import { changeTone, formatSigned, NO_DATA } from '../../lib/format';
import { deltaTone, deltaWords, POOLED_SD } from '../../lib/stats-signal';

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
  /**
   * The least range the line is drawn on, in the measure's own units: about two standard errors of a week's team figure, so a
   * wobble inside the noise draws nearly flat instead of filling the cell (stats and charts audit 2026-11-15, CH-06). Absent,
   * the line spans its own range.
   */
  minSpan?: number;
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
/** Rounds in a typical week of team golf: what a week's figure is averaged over. */
const WEEK_ROUNDS = 10;
const twoSe = (sd: number) => Math.round(((2 * sd) / Math.sqrt(WEEK_ROUNDS)) * 10) / 10;
/**
 * The least range each tape line is drawn on (stats and charts audit 2026-11-15, CH-06): about two standard errors of a week's team
 * figure over ten rounds, so week-to-week noise draws nearly flat. Scoring from the pooled round spread (`POOLED_SD.score`, 3.6
 * strokes); the others from typical college round spreads: greens 15 points, putts 3, scrambling 20 points, birdies 1.3 a round.
 */
export const TAPE_MIN_SPAN: Partial<Record<ChTeamStats['figures'][number]['key'], number>> = {
  score: twoSe(POOLED_SD.score),
  gir: twoSe(15),
  putts: twoSe(3),
  scramble: twoSe(20),
  birdies: twoSe(1.3),
};
/** A share as a percentage, to two places. */
const pct = (share: number) => Math.round(share * 10000) / 100;

/**
 * P004: the team's other figures as one open tape under the trend: a hairline between each, the value, how it moved, and
 * its weekly line at one height and one scale rule, so five different measures read as a set. Every line reads up as
 * better (a lower score or fewer putts are drawn higher). The colour says whether the change against the previous 10 is
 * clear of its noise (`deltaTone`, two standard errors, decision Q4 and CH-05): green better, amber worse, neutral ink and
 * "No clear change" otherwise, the signed change still shown.
 *
 * The lines tell the truth about their scale (stats and charts audit 2026-11-15): a figure that held still draws at
 * mid-height, and a wobble inside the measure's `minSpan` draws nearly flat (CH-06); weeks sit by their dates, as the trend
 * above does (CH-11); segments are straight and break across a week with no value (CH-15); and the end dot is drawn outside
 * the stretched drawing, so it stays round (CH-23).
 */
export function TeamTape({
  items,
  against = 'vs previous 10',
  starts,
}: {
  items: TapeItem[];
  /** What a change is against, in the window's words ("vs previous 5"). */
  against?: string;
  /** Each week's first day (ISO), one per series point: the weeks sit by their dates. Absent or a different length, evenly. */
  starts?: ReadonlyArray<string | null>;
}) {
  return (
    <ul className="ch-tp" aria-label="Team figures">
      {items.map((it) => (
        <TapeCell key={it.label} it={it} against={against} starts={starts} />
      ))}
    </ul>
  );
}

/**
 * Where a cell's values sit, top to bottom, as a share of its plot: better is up, a flat line sits mid-height, and the range is
 * at least `minSpan`, centred on the values, so a small wobble stays small.
 */
export function tapeScale(values: number[], lowerIsBetter: boolean, minSpan = 0): (v: number) => number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, minSpan);
  if (!(span > 0)) return () => 0.5;
  const base = (lo + hi) / 2 - span / 2;
  return (v) => {
    const t = (v - base) / span;
    return lowerIsBetter ? t : 1 - t;
  };
}

function TapeCell({ it, against, starts }: { it: TapeItem; against: string; starts?: ReadonlyArray<string | null> }) {
  const d = it.delta;
  // A figure with no value keeps no caption: "vs previous 10" and the coverage note under an em dash describe a number that is not there.
  const none = it.value === NO_DATA;
  const signal = deltaTone(d, it.se, it.lowerIsBetter);
  // A change is always against the previous N (the loader has one only then); a figure whose caption says something else
  // (the Tour's average, "Eagles not counted") keeps that caption on the note line, under the change's words.
  const words = d != null ? deltaWords(d, signal, against) : it.context;
  const note = [d != null && it.context !== against ? it.context : null, it.note].filter(Boolean).join(' · ') || undefined;
  const vals = it.series.filter((v): v is number => v != null);
  const at = tapeScale(vals, it.lowerIsBetter, it.minSpan);
  const share = weekShares(it.series.length, starts);
  const x = (i: number) => (it.series.length <= 1 ? W / 2 : PAD + share[i]! * (W - PAD * 2));
  const y = (v: number) => PAD + at(v) * (H - PAD * 2);
  const path = vals.length > 1 ? gappedPath(it.series, x, y) : '';
  const area = path ? gappedArea(it.series, x, y, H) : '';
  const end = lastValue(it.series);
  // A week between two empty weeks has no segment to sit on: it keeps a dot, or the broken line would drop it (CH-15).
  const lone = lonePoints(it.series).filter((i) => i !== end?.i);
  const tone = signal === 'is-gain' ? 'is-gain' : signal === 'is-loss' ? 'is-loss' : 'is-flat';
  const gid = useId().replace(/:/g, '');
  const ink = tone === 'is-gain' ? 'var(--ch-chart-gain)' : tone === 'is-loss' ? 'var(--ch-chart-loss)' : 'var(--ch-text-tertiary)';
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
            {signal !== '' && <Icon icon={d > 0 ? ArrowUpRight : ArrowDownRight} size={13} />}
            {formatSigned(d, it.deltaDigits)}
          </>
        ) : null}
        {!none && <em>{words}</em>}
      </span>
      <span className={`ch-tp__plot ${tone}`} aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`ch-tp__svg ${tone}`} aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1={0} x2={0} y1={0} y2={1}>
              <stop offset="0" stopColor={ink} stopOpacity={0.32} />
              <stop offset="1" stopColor={ink} stopOpacity={0} />
            </linearGradient>
          </defs>
          {path && (
            <>
              {area && <path d={area} className="ch-tp__area" fill={`url(#${gid})`} />}
              <path d={path} className="ch-tp__line" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {/* The drawing stretches to the cell; the dot sits on it as a box of its own, so it stays round at any width (CH-23). */}
        {lone.map((i) => (
          <i key={i} className="ch-tp__pt" style={{ left: `${pct(x(i) / W)}%`, top: `${pct(y(it.series[i]!) / H)}%` }} />
        ))}
        {end && <i className="ch-tp__dot" style={{ left: `${pct(x(end.i) / W)}%`, top: `${pct(y(end.v) / H)}%` }} />}
      </span>
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
    // The tone and the E use one zero test: a par average that prints as E is neither good nor bad.
    const par = changeTone(g.toPar, true, 1);
    return (
      <span className={`ch-tp__par ch-num ${par === 'is-gain' || par === 'is-loss' ? par : ''}`} aria-hidden="true">
        {par === '' ? 'E' : formatSigned(g.toPar, 1)}
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
