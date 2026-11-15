'use client';

import { changeTone, formatFixed, formatToPar } from '../../../../lib/format';
import { formatValue, type AskEvidence } from '../../../../data/coachhelm-chat-thread';
import { ChartTable } from '../../../../ui/charts/ChartTable';
import { linePath, lineY } from '../../../../ui/charts/Line';
import { AskKey, type AskTarget } from './ask';
import type { StudioLeg } from './types';

/**
 * The studio's two drawings, in the chat's approved look (LOOK.md, "A. The yardage book"; the owner's sheet is drawn by
 * preview/ask-look/a/TurnA.tsx, and the hole here is that drawing, path for path).
 *
 *   HolePlan     the hole in plan, tee to green, each part of the game a station on it and, on the same x, a stem above
 *                the baseline for strokes gained or below it for strokes lost. Position on one scale, labelled at the
 *                mark, no legend and no track.
 *   RuledTrend   one measure round by round: ink on ruled paper, the first and the last round named.
 *
 * Label sizes are in drawing units (the drawing is 318 wide and scales with its column, capped by the stylesheet).
 * Neither moves on its own; `drawIn` only marks the trend's path for the live answer's draw (CoachComposition).
 */

/* ---------------------------------------------------------------- the hole */

/** Where on the hole each part of the game is played, in drawing units. */
const STATIONS = { tee: { x: 30, y: 92 }, approach: { x: 123, y: 78 }, around: { x: 222, y: 62 }, putting: { x: 280, y: 45 } } as const;
export type Station = keyof typeof STATIONS;
const STATION_NAME: Record<Station, readonly string[]> = { tee: ['Off the tee'], approach: ['Approach'], around: ['Around', 'the green'], putting: ['Putting'] };
const ORDER: readonly Station[] = ['tee', 'approach', 'around', 'putting'];

const SPINE = 'M30 92C78 104 112 88 142 66S216 30 276 42';
const FAIRWAY = 'M66 97C96 96 120 84 142 66S190 42 218 40';
const TREES: ReadonlyArray<readonly [number, number, number]> = [
  [78, 54, 6.5],
  [91, 45, 5],
  [66, 46, 4.5],
  [184, 92, 6.5],
  [198, 99, 5],
  [171, 101, 4.5],
];

/** The part of the game a leg is, from its metric id and its label; null for a leg that is not one of the four (a total, tee to green). */
export function stationOf(leg: Pick<StudioLeg, 'key' | 'label'>): Station | null {
  const s = `${leg.key} ${leg.label}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\btotal\b|tee to green/.test(s)) return null;
  if (/putt/.test(s)) return 'putting';
  if (/around|short game|\barg\b/.test(s)) return 'around';
  if (/approach|\bapp\b/.test(s)) return 'approach';
  if (/\btee\b|\bott\b|driv/.test(s)) return 'tee';
  return null;
}

/** The legs on their stations, tee to green, when every leg is one of the four parts and none is named twice; else null, and the legs are drawn as rows. */
export function onTheHole(legs: readonly StudioLeg[]): Array<{ at: Station; leg: StudioLeg }> | null {
  if (legs.length < 2) return null;
  const placed = new Map<Station, StudioLeg>();
  for (const leg of legs) {
    const at = stationOf(leg);
    if (!at || placed.has(at)) return null;
    placed.set(at, leg);
  }
  return ORDER.flatMap((at) => (placed.has(at) ? [{ at, leg: placed.get(at)! }] : []));
}

/** The names end here; the soundings start under it. */
const NAMES_END = 152;
/** A stroke in drawing units, as the sheet draws it, and the longest stem the drawing gives room for. */
const PER_STROKE = 54;
const LONGEST = 70;

/** "Approach: loses 0.9 strokes a round, over 8 rounds", for a screen reader: the sign said in words, the minus sign never read as a hyphen. */
function legSaid(leg: StudioLeg): string {
  const tone = changeTone(leg.value, false, 1);
  const n = formatFixed(Math.abs(leg.value), 1);
  const said = tone === 'is-gain' ? `gains ${n} strokes a round` : tone === 'is-loss' ? `loses ${n} strokes a round` : 'is even with the baseline';
  return `${leg.label}: ${said}${leg.sample ? `, ${leg.sample}` : ''}`;
}

export function HolePlan({ placed, target, baseline, highlight = null }: { placed: ReadonlyArray<{ at: Station; leg: StudioLeg }>; target: AskTarget; /** What zero is: "Baseline". */ baseline: string; /** The leg the answer is about. */ highlight?: string | null }) {
  const values = placed.map((p) => p.leg.value);
  const up = Math.max(0, ...values);
  const down = Math.max(0, ...values.map((v) => -v));
  const k = Math.min(PER_STROKE, LONGEST / Math.max(up, down, 0.1));
  // Room over the baseline for the tallest gain and its figure; the sheet's own baseline (186) when the gain is its 0.2.
  const zero = Math.max(170, Math.round(NAMES_END + 23 + up * k));
  const height = Math.round(Math.max(zero + 24, zero + down * k + 26));
  const tee = placed.find((p) => p.at === 'tee');
  // The baseline's name sits at the left, on the side of the line the tee's stem is not.
  const nameAbove = !!tee && changeTone(tee.leg.value, false, 1) === 'is-loss';
  return (
    <div className="ch-aks-hole" role="group" aria-label="Strokes gained from tee to green">
      <svg className="ch-aks-hole__svg" viewBox={`-2 0 322 ${height}`} aria-hidden="true" focusable="false">
        {/* The hole in plan, as a yardage book draws it: rough, fairway, the green and its fringe, sand, trees, the tee and the pin. */}
        <path className="ch-aks-hole__rough is-edge" d={SPINE} />
        <path className="ch-aks-hole__rough" d={SPINE} />
        <path className="ch-aks-hole__fairway is-edge" d={FAIRWAY} />
        <path className="ch-aks-hole__fairway" d={FAIRWAY} />
        <ellipse className="ch-aks-hole__fringe" cx="276" cy="42" rx="37" ry="28" />
        <ellipse className="ch-aks-hole__green" cx="276" cy="42" rx="30" ry="21.5" />
        <ellipse className="ch-aks-hole__sand" cx="100" cy="70" rx="9" ry="5" transform="rotate(-20 100 70)" />
        <ellipse className="ch-aks-hole__sand" cx="234" cy="76" rx="10.5" ry="5.5" transform="rotate(-26 234 76)" />
        <ellipse className="ch-aks-hole__sand" cx="243" cy="19" rx="8.5" ry="4.5" transform="rotate(20 243 19)" />
        {TREES.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} className="ch-aks-hole__tree" cx={cx} cy={cy} r={r} />
        ))}
        <rect className="ch-aks-hole__tee" x="20" y="86" width="20" height="12" rx="2" transform="rotate(10 30 92)" />
        <path className="ch-aks-hole__line" d="M30 92C78 104 112 88 142 66S216 30 290 37" />
        <path className="ch-aks-hole__pole" d="M290 37V15" />
        <path className="ch-aks-hole__flag" d="M290 15l11.5 4.2-11.5 4.2z" />
        <ellipse className="ch-aks-hole__cup" cx="290" cy="37" rx="2.2" ry="1.1" />

        {/* The soundings: one stem per part of the game, on the plan's own axis. Above the baseline it gains, below it loses. */}
        <path className="ch-aks-hole__zero" d={`M0 ${zero}H318`} />
        <text className="ch-aks-hole__base" x="0" y={nameAbove ? zero - 6 : zero + 15}>
          {baseline}
        </text>
        {placed.map(({ at, leg }) => {
          const p = STATIONS[at];
          const tone = changeTone(leg.value, false, 1);
          const end = tone ? zero - leg.value * k : zero;
          const name = STATION_NAME[at];
          const nameX = at === 'tee' ? 8 : p.x;
          return (
            <g key={at} className={'ch-aks-hole__part' + (tone ? ` ${tone}` : '') + (highlight === leg.key ? ' is-on' : '')}>
              <circle className="ch-aks-hole__station" cx={p.x} cy={p.y} r="3.5" />
              <path className="ch-aks-hole__lead" d={`M${p.x} ${p.y + 7}V${name.length > 1 ? 121 : 135}`} />
              <text className="ch-aks-hole__name" x={nameX} y={name.length > 1 ? 134 : 148} textAnchor={at === 'tee' ? 'start' : 'middle'}>
                {name.map((line, i) => (
                  <tspan key={line} x={nameX} dy={i === 0 ? 0 : 14}>
                    {line}
                  </tspan>
                ))}
              </text>
              {tone && <path className="ch-aks-hole__stem" d={`M${p.x} ${zero}V${end}`} />}
              <circle className="ch-aks-hole__end" cx={p.x} cy={end} r="4" />
              <text className="ch-num ch-aks-hole__value" x={p.x} y={tone === 'is-loss' ? end + 19 : end - 9} textAnchor="middle">
                {leg.display}
              </text>
            </g>
          );
        })}
      </svg>
      {/* The same figures as words, in tee-to-green order: what a screen reader reads, and the keys a tap asks with. */}
      <ul className="ch-aks-hole__keys">
        {placed.map(({ at, leg }) => (
          <li key={at} style={{ left: `${((STATIONS[at].x + 2) / 322) * 100}%` }}>
            <AskKey target={target} id={leg.key} className="ch-aks-hole__key" words={`Ask about this: strokes gained ${leg.label.toLowerCase()}, ${leg.display}`}>
              <span className="ch-sr-only">{legSaid(leg)}</span>
            </AskKey>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- the trend */

type TrendBlock = Extract<AskEvidence, { kind: 'trend' }>;

const W = 318;
const LEFT = 40;
const RIGHT = 299;
const TOP = 18;
const PLOT_H = 90;
const H = 148;

/** The finest round step that rules the span in seven lines or fewer, and the rules the span runs between. */
export function ruledSpan(lo: number, hi: number): { step: number; from: number; to: number } {
  const span = (step: number) => ({ step, from: Math.floor(lo / step + 1e-9) * step, to: Math.ceil(hi / step - 1e-9) * step });
  for (const step of [0.5, 1, 2, 5, 10, 20, 25, 50, 100]) {
    const s = span(step);
    if (Math.round((s.to - s.from) / step) + 1 <= 7) return s;
  }
  const step = 10 ** Math.ceil(Math.log10((hi - lo) / 6));
  return span(step);
}

/** How a trend prints a value: a to-par score signed with E for even, anything else in its unit. */
export function trendFormat(block: Pick<TrendBlock, 'toPar' | 'unit'>): (v: number) => string {
  return (v) => (block.toPar ? formatToPar(v, Number.isInteger(v) ? 0 : 1) : formatValue(v, block.unit));
}

/** The reference in words, for the section's head: "Average +2". */
export function trendReference(block: TrendBlock): string | null {
  const ref = block.reference;
  if (!ref) return null;
  return ref.label.startsWith('Team') ? ref.label : `${ref.label} ${trendFormat(block)(ref.value)}`;
}

/**
 * Whether the newest round sits on the good or the wrong side of the reference, for a measure whose direction is known:
 * green or amber on the last point, never red. Unknown direction, or level with it: plain ink.
 */
export function trendTone(block: TrendBlock): '' | 'is-gain' | 'is-loss' {
  const ref = block.reference;
  const last = block.points[block.points.length - 1]?.value;
  if (!ref || !block.goodDirection || last == null || last === ref.value) return '';
  return (block.goodDirection === 'up' ? last > ref.value : last < ref.value) ? 'is-gain' : 'is-loss';
}

export function RuledTrend({ block, drawIn = false }: { block: TrendBlock; drawIn?: boolean }) {
  const fmt = trendFormat(block);
  const values = block.points.map((p) => p.value);
  const n = values.length;
  if (n === 0) return null;
  const down = block.goodDirection === 'down';
  // The paper is ruled around the figures themselves: a line is read by its position between named rules, not from a zero.
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  // The ruled lines are round numbers, and the paper runs from the rule at or under the figures to the one at or over them.
  const { step, from, to } = ruledSpan(lo, hi);
  const lines: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) lines.push(Math.round(v * 100) / 100);
  // Every other rule is named and solid; the ones between are dotted. With three or fewer, each is named.
  const named = (v: number) => lines.length <= 3 || Math.round(v / step) % 2 === 0;
  // A lower-is-better measure (a score, putts) is drawn with lower values higher, so better is always up.
  const y = lineY([from, to], TOP, PLOT_H, down);
  const x = (i: number) => (n === 1 ? (LEFT + RIGHT) / 2 : LEFT + (i / (n - 1)) * (RIGHT - LEFT));
  const last = n - 1;
  const tone = trendTone(block);
  // The first figure goes under its point unless the line leaves downward; the last goes left of its point, on the side the line does not come from.
  const firstBelow = n < 2 || y(values[1]!) <= y(values[0]!);
  const lastAbove = n < 2 || y(values[last - 1]!) >= y(values[last]!);
  const summary = `${block.summary}${down ? ' Lower is better.' : ''}`;
  return (
    <div className={'ch-aks-ruled' + (tone ? ` ${tone}` : '')} data-draw={drawIn ? '' : undefined}>
      <svg className="ch-aks-ruled__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} focusable="false">
        {lines.map((v) => (
          <path key={v} className={'ch-aks-ruled__rule' + (named(v) ? '' : ' is-minor')} d={`M24 ${Math.round(y(v) * 10) / 10}H${W}`} />
        ))}
        {lines.filter(named).map((v) => (
          <text key={v} className="ch-num ch-aks-ruled__axis" x="0" y={y(v) + 4}>
            {fmt(v)}
          </text>
        ))}
        <path className="ch-aks-ruled__path" d={linePath(values, x, y)} {...(drawIn ? { pathLength: 1 } : {})} />
        {block.points.map((p, i) =>
          // A long run keeps its line and its newest round; a point for every round would be a second, dotted line.
          n > 24 && i !== last ? null : (
            <circle key={`${p.label}-${i}`} className={'ch-aks-ruled__pt' + (i === last ? ' is-last' : '')} cx={x(i)} cy={y(p.value)} r={i === last ? 4.5 : 3}>
              <title>{`${p.label}: ${fmt(p.value)}`}</title>
            </circle>
          ),
        )}
        {n > 1 && (
          <text className="ch-num ch-aks-ruled__first" x={x(0)} y={firstBelow ? y(values[0]!) + 18 : y(values[0]!) - 9} textAnchor="middle">
            {fmt(values[0]!)}
          </text>
        )}
        <text className="ch-num ch-aks-ruled__last" x={x(last) - 10} y={lastAbove ? y(values[last]!) - 3 : y(values[last]!) + 14} textAnchor="end">
          {fmt(values[last]!)}
        </text>
        <text className="ch-num ch-aks-ruled__axis" x={x(0)} y={H - 4} textAnchor="middle">
          {block.points[0]!.label}
        </text>
        {n > 1 && (
          <text className="ch-num ch-aks-ruled__axis" x={W} y={H - 4} textAnchor="end">
            {block.points[last]!.label}
          </text>
        )}
      </svg>
      {/* Every round's figure, for a screen reader that asks for them after the summary (AX-17): the "Table" key's table, kept out of sight. */}
      <ChartTable caption={block.table.caption} columns={block.table.columns} rows={block.table.rows} />
    </div>
  );
}
