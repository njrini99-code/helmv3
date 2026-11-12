'use client';

import { useState } from 'react';
import type { ChCompare } from '../../data/stats-figures';
import { formatFixed } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { halvesTone } from '../../lib/stats-signal';
import { ShsArrow, ShsCard, ShsChevron, ShsPill } from './SummaryCard';
import { monoPath, type ShsTone } from './shs-figures';

/** The page's words for "How this is measured" (design HOW). */
export const SHS_HOW = {
  scoring: 'Every hole of every round in the window, counted against its par.',
  sg: 'Each shot is compared with what a Tour player takes on average from the same spot. The sum, per round, is strokes gained; the thin line is the range the true figure likely sits in.',
  tee: 'Fairways count tee shots on par 4s and 5s that finish on the fairway. Distances are tee shots on the same holes.',
  approach: 'Every hole played counts. A green is hit in regulation when the ball is on it in par minus two strokes or fewer. Distance bands go by where the approach was played from.',
  short: 'Every hole where the green was missed is a chance, and a save is par or better on that hole. Sand saves count every greenside bunker visit.',
  putting: 'Every putt counts by its own distance from the hole. Putts per round are per 18 holes, from rounds with putts recorded.',
} as const;

/** The toggle: no height animation, the chevron turns 90° (criteria 38, 111). */
export function HowToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ch-shs-how" data-ch="stats-how" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        How this is measured
        <ShsChevron />
      </button>
      {open && <p className="ch-shs-how-t">{text}</p>}
    </>
  );
}

const fill = (tone: ShsTone) => (tone === 'gain' ? 'var(--ch-shs-s-gain-fill)' : tone === 'loss' ? 'var(--ch-shs-s-loss-fill)' : 'var(--ch-shs-s-flat)');

/** The trend ribbon: better is always up; a dashed reference only when its value is loaded (04 "Detail visuals"). */
export function Ribbon({
  points,
  lowerIsBetter = false,
  reference,
  format = (v) => String(Math.round(v)),
  tone = 'flat',
}: {
  points: ReadonlyArray<{ label: string; value: number }>;
  lowerIsBetter?: boolean;
  reference?: { value: number; label: string } | null;
  format?: (v: number) => string;
  tone?: ShsTone;
}) {
  const W = 300;
  const H = 120;
  const PAD = 10;
  const n = points.length;
  if (!n) return null;
  const vals = points.map((p) => p.value);
  const ref = reference?.value;
  let lo = Math.min(...vals, ...(ref == null ? [] : [ref]));
  let hi = Math.max(...vals, ...(ref == null ? [] : [ref]));
  const sp = hi - lo || 1;
  lo -= sp * 0.12;
  hi += sp * 0.12;
  const x = (i: number) => (n === 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v: number) => PAD + (lowerIsBetter ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * (H - PAD * 2);
  const pts = vals.map((v, i) => [x(i), y(v)] as const);
  const last = pts[n - 1]!;
  const top = lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  const bot = lowerIsBetter ? Math.max(...vals) : Math.min(...vals);
  const path = monoPath(pts);
  const colour = fill(tone);
  // An end of the range that lands on the reference line can't print beside the line's label. The axis still needs two figures to be a
  // scale (a best round at par left "75" alone), so there the line prints its value; the card's head already says what the dashed line is.
  const onRef = (v: number) => ref != null && Math.abs(y(v) - y(ref)) < 14;
  const refCovers = onRef(top) || onRef(bot);
  return (
    <div className="ch-shs-rib">
      <div className="ch-shs-rib__in">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {[0, 0.5, 1].map((t) => (
            <line key={t} className="g" x1="0" x2={W} y1={PAD + t * (H - PAD * 2)} y2={PAD + t * (H - PAD * 2)} />
          ))}
          {ref != null && <line className="rf-l" x1="0" x2={W} y1={y(ref)} y2={y(ref)} />}
          {path && (
            <>
              <path d={`${path}L${W},${H}L0,${H}Z`} fill={colour} opacity=".14" />
              <path className="ln" d={path} stroke={colour} />
            </>
          )}
        </svg>
        <i className="dot" style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%`, background: colour }} />
        {reference && (
          <span className={'rref' + (refCovers ? ' ch-num' : '')} style={{ top: `${(y(reference.value) / H) * 100}%` }} data-ch-rib-ref={refCovers ? 'value' : 'label'}>
            {refCovers ? format(reference.value) : reference.label}
          </span>
        )}
      </div>
      {[top, bot].map((v, i) =>
        // A figure on the reference line would print over its label: the label already sits there.
        onRef(v) ? null : (
          <span key={i} className="ry ch-num" style={{ top: `calc(${y(v) / H} * 124 * var(--ch-type-k))` }}>
            {format(v)}
          </span>
        ),
      )}
      <div className="rx">
        <span>{points[0]!.label}</span>
        <span>{points[n - 1]!.label}</span>
      </div>
    </div>
  );
}

export const COMPARE_ROWS = {
  all: ['Scoring avg', 'Greens in regulation', 'Fairways hit', 'Putts per round'],
  tee: ['Fairways hit'],
  approach: ['Greens in regulation'],
  putting: ['Putts per round'],
} as const;

/** Each row's span on its dumbbell: the page's own (design CMP). */
const SPAN: Readonly<Record<string, number>> = { 'Scoring avg': 12, 'Greens in regulation': 30, 'Fairways hit': 30, 'Putts per round': 8 };

/** Against the N before: dumbbells from `x.compare`, captioned as round totals; with no earlier window it says so (criterion 34). */
export function AgainstBefore({ compare, rows, how, previous }: { compare: ChCompare | null; rows: readonly string[]; how?: string; previous: boolean }) {
  const list = previous && compare ? compare.rows.filter((r) => rows.includes(r.label)) : [];
  return (
    <ShsCard anchor="against" title={previous && compare ? `Against the ${compare.previousRounds} before` : 'Against the window before'} meta={list.length ? 'From round totals' : undefined}>
      {!list.length ? (
        <div className="ch-shs-nothing">
          <b>Nothing to compare yet</b>
          <span>Only Last 5 and Last 10 have earlier rounds to compare with. Pick one to see the change.</span>
        </div>
      ) : (
        list.map((r) => {
          if (r.last == null || r.previous == null)
            return (
              <div className="ch-shs-db" key={r.label}>
                <div>
                  <div className="l">{r.label}</div>
                  <div className="nums"><NoData /></div>
                </div>
              </div>
            );
          const delta = r.last - r.previous;
          const t = halvesTone({ delta, se: r.se }, r.lowerIsBetter, r.digits);
          const tone: ShsTone = t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : 'flat';
          const span = SPAN[r.label] ?? 12;
          const lo = (r.last + r.previous) / 2 - span / 2;
          const at = (v: number) => Math.max(2, Math.min(98, ((v - lo) / span) * 100));
          return (
            <div className="ch-shs-db" key={r.label}>
              <div>
                <div className="l">{r.label}</div>
                <div className="nums">
                  <b>
                    {formatFixed(r.last, r.digits)}
                    {r.unit}
                  </b>
                  &nbsp; from {formatFixed(r.previous, r.digits)}
                  {r.unit}
                </div>
              </div>
              <ShsPill tone={tone}>
                <ShsArrow direction={delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat'} />
                {formatFixed(Math.abs(delta), r.digits)}
                {r.unit ? ' pts' : ''}
              </ShsPill>
              <div className="track" aria-hidden="true">
                <span className="seg" style={{ left: `${Math.min(at(r.last), at(r.previous))}%`, width: `${Math.abs(at(r.last) - at(r.previous))}%`, background: fill(tone) }} />
                <span className="was" style={{ left: `${at(r.previous)}%` }} />
                <span className="now" style={{ left: `${at(r.last)}%`, background: fill(tone) }} />
              </div>
            </div>
          );
        })
      )}
      {how && <HowToggle text={how} />}
    </ShsCard>
  );
}
