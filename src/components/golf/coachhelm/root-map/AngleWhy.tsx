'use client';

/**
 * ============================================================================
 * AngleWhy: the Why visuals for the insight-angle reads
 * ----------------------------------------------------------------------------
 * One small evidence visual per angle (`angle-why.ts` parses the stored
 * `evidence.detail`):
 *
 *   lie_approach   per band, fairway vs rough: greens hit % and proximity,
 *                  with n; a tee → approach link when missed fairways are
 *                  the cause
 *   bad_day_floor  every round on a score strip (median and P80 marked) and
 *                  the bad-minus-middle split (penalties / beyond bogey on
 *                  doubles+ / everything else)
 *   three_putt     the three pathways with counts, and the second-putt
 *                  distances per first-putt band
 *   tee_miss       left / fairway / right cost per miss with n; driver vs
 *                  non-driver fairways by par
 *   approach_miss  long / short / left / right recovery cost with n
 *
 * Every visual carries its receipts: the date window, the denominators, what
 * was left out, and the example holes (linked to the round).
 *
 * Numbers are drawn exactly as stored; nothing is recomputed except the
 * drawing scale. No mount animation (the server paint must show the bars).
 * ========================================================================== */

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatStrokes, shortDate } from '@/lib/coachhelm/root-map/build-root-map';
import {
  LEAVE_BUCKET_KEYS,
  LEAVE_BUCKET_TEXT,
  exampleHref,
  type AngleReceiptsView,
  type AngleWhyView,
  type ApproachMissView,
  type BadDayFloorView,
  type FloorPartKey,
  type LieApproachView,
  type MissSideView,
  type TeeMissView,
  type ThreePuttView,
} from '@/lib/coachhelm/root-map/angle-why';

const NEG = 'var(--fw-viz-div-neg)';
const SURFACE = 'var(--fw-color-surface)';
const mix = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, ${SURFACE})`;
const NEUTRAL = mix('var(--fw-color-border-strong)', 70);

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
      {children}
    </h3>
  );
}

function pct(v: number | null): string {
  return v === null ? '–' : `${Math.round(v)}%`;
}

function signed(v: number): string {
  return formatStrokes(v, { signed: true });
}

function windowText(r: AngleReceiptsView): string | null {
  const a = shortDate(r.windowStart);
  const b = shortDate(r.windowEnd);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a ?? b ?? null;
}

/** Window, denominators, exclusions and example holes. */
export function Receipts({ receipts }: { receipts: AngleReceiptsView }) {
  const win = windowText(receipts);
  const left = receipts.exclusions.filter((e) => e.n > 0);
  return (
    <div className="flex flex-col gap-1 text-caption text-text-tertiary" data-slot="angle-receipts">
      <p>
        {win ? <span>{win} · </span> : null}
        {receipts.samples.map((s, i) => (
          <span key={s.key}>
            {i > 0 ? ' · ' : ''}
            <span className="font-fw-mono tabular-nums text-text-secondary">{s.n}</span> {s.label}
          </span>
        ))}
      </p>
      {left.length > 0 || receipts.definition ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus [&::-webkit-details-marker]:hidden">
            How this was read{left.length > 0 ? ` · ${left.reduce((t, e) => t + e.n, 0)} left out` : ''}
          </summary>
          <div className="flex flex-col gap-1 pb-1">
            {receipts.definition ? <p>{receipts.definition}</p> : null}
            {left.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {left.map((e) => (
                  <li key={e.key}>
                    Left out: <span className="font-fw-mono tabular-nums text-text-secondary">{e.n}</span> {e.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
      {receipts.examples.length > 0 ? (
        <div className="flex flex-col gap-0.5" data-slot="angle-examples">
          <p className="font-medium text-text-secondary">Example holes</p>
          <ul className="flex flex-col">
            {receipts.examples.map((e) => {
              const href = exampleHref(e.roundId);
              const label = (
                <>
                  <span className="font-medium">Hole {e.holeNumber}</span>
                  {e.date ? <span> · {shortDate(e.date) ?? e.date}</span> : null}
                  {e.note ? <span className="text-text-tertiary"> — {e.note}</span> : null}
                </>
              );
              return (
                <li key={`${e.roundId}:${e.holeNumber}`}>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-flex min-h-11 items-center text-accent-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <span>{label}</span>
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center text-text-secondary">{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One horizontal bar with a value and an n, on a 0..max scale. */
function Bar({
  label,
  value,
  max,
  display,
  n,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  max: number;
  display: string;
  n: number;
  emphasis?: boolean;
}) {
  const w = value === null || max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 text-caption">
      <span className="truncate text-text-secondary">{label}</span>
      <span className="relative block h-3 rounded-sm bg-surface-sunken">
        <span
          className="absolute inset-y-0 left-0 rounded-sm motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${w}%`, background: emphasis ? NEG : NEUTRAL }}
        />
      </span>
      <span className="text-right">
        <span className="font-fw-mono tabular-nums text-text-primary">{display}</span>
        <span className="pl-1 text-text-tertiary">n {n}</span>
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Lie approach
 * ──────────────────────────────────────────────────────────────────────── */

export function LieApproachVisual({ view }: { view: LieApproachView }) {
  const id = useId();
  const bands = view.bands.filter((b) => b.fairway.n > 0 || b.rough.n > 0);
  const maxProx = Math.max(1, ...bands.flatMap((b) => [b.fairway.proximityFt ?? 0, b.rough.proximityFt ?? 0]));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-slot="angle-lie-approach">
      <Heading id={id}>Fairway vs rough, band by band</Heading>
      {view.cause === 'fairway_exposure' ? (
        <div className="flex items-stretch gap-2 text-caption" data-slot="lie-chain" aria-label="Tee to approach link">
          <div className="flex min-w-0 flex-1 flex-col rounded-fw-sm border border-border-subtle px-2 py-1.5">
            <span className="text-text-tertiary">Tee</span>
            <span className="text-text-primary">
              <span className="font-fw-mono tabular-nums">{pct(view.fairwayPct)}</span> fairways
              {view.peerFairwayPct !== null ? (
                <span className="text-text-secondary">
                  {' '}
                  vs <span className="font-fw-mono tabular-nums">{pct(view.peerFairwayPct)}</span> team
                </span>
              ) : null}
            </span>
            <span className="text-text-tertiary">n {view.fairwayHoles} holes</span>
          </div>
          <svg aria-hidden viewBox="0 0 24 12" className="w-6 shrink-0 self-center">
            <line x1={0} y1={6} x2={20} y2={6} strokeWidth={1.5} style={{ stroke: 'var(--fw-color-text-secondary)' }} />
            <path d="M18,2 L23,6 L18,10" fill="none" strokeWidth={1.5} style={{ stroke: 'var(--fw-color-text-secondary)' }} />
          </svg>
          <div className="flex min-w-0 flex-1 flex-col rounded-fw-sm border border-border-subtle px-2 py-1.5">
            <span className="text-text-tertiary">Approach</span>
            <span className="text-text-primary">
              <span className="font-fw-mono tabular-nums">{view.roughAllPer18?.toFixed(1) ?? '–'}</span> from the rough
            </span>
            <span className="text-text-tertiary">per 18 holes</span>
          </div>
        </div>
      ) : null}
      <ul className="flex flex-col gap-4">
        {bands.map((b) => (
          <li key={b.band} className="flex flex-col gap-1.5" data-slot="lie-band">
            <p className="text-body-sm font-medium text-text-primary">
              {b.label}
              {!b.qualifies ? <span className="pl-2 text-caption font-normal text-text-tertiary">too few on one side to test</span> : null}
            </p>
            <p className="text-caption text-text-tertiary">Greens hit</p>
            <Bar label="Fairway" value={b.fairway.girPct} max={100} display={pct(b.fairway.girPct)} n={b.fairway.n} />
            <Bar label="Rough" value={b.rough.girPct} max={100} display={pct(b.rough.girPct)} n={b.rough.n} emphasis />
            <p className="text-caption text-text-tertiary">Proximity when on the green</p>
            <Bar
              label="Fairway"
              value={b.fairway.proximityFt}
              max={maxProx}
              display={b.fairway.proximityFt === null ? '–' : `${Math.round(b.fairway.proximityFt)} ft`}
              n={b.fairway.n}
            />
            <Bar
              label="Rough"
              value={b.rough.proximityFt}
              max={maxProx}
              display={b.rough.proximityFt === null ? '–' : `${Math.round(b.rough.proximityFt)} ft`}
              n={b.rough.n}
              emphasis
            />
          </li>
        ))}
      </ul>
      <Receipts receipts={view.receipts} />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Bad-day floor
 * ──────────────────────────────────────────────────────────────────────── */

const FLOOR_LABEL: Record<FloorPartKey, string> = {
  penalties: 'Penalties',
  double_or_worse: 'Beyond bogey on doubles+',
  everything_else: 'Everything else',
};
const FLOOR_FILL: Record<FloorPartKey, string> = {
  penalties: NEG,
  double_or_worse: mix(NEG, 60),
  everything_else: NEUTRAL,
};

function toParText(v: number): string {
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
}

export function BadDayFloorVisual({ view }: { view: BadDayFloorView }) {
  const id = useId();
  const vals = view.rounds.map((r) => r.toPar);
  const lo = Math.floor(Math.min(...vals, view.median) - 1);
  const hi = Math.ceil(Math.max(...vals, view.p80) + 1);
  const W = 320;
  const x = (v: number) => 8 + ((v - lo) / (hi - lo || 1)) * (W - 16);
  // Stack rounds that share a whole stroke so every round stays visible.
  const bins = new Map<number, number>();
  const dots = [...view.rounds]
    .sort((a, b) => a.toPar - b.toPar)
    .map((r) => {
      const bin = Math.round(r.toPar);
      const k = bins.get(bin) ?? 0;
      bins.set(bin, k + 1);
      return { ...r, bin, k };
    });
  const tallest = Math.max(1, ...bins.values());
  const H = 34 + tallest * 9;
  const base = H - 16;
  const diff = view.badMean - view.middleMean;
  const parts = (['penalties', 'double_or_worse', 'everything_else'] as const).map((k) => ({ k, v: view.split[k] }));
  const positive = parts.filter((p) => p.v > 0);
  const posTotal = positive.reduce((t, p) => t + p.v, 0) || 1;
  const ticks: number[] = [];
  const step = hi - lo > 16 ? 5 : hi - lo > 8 ? 2 : 1;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-slot="angle-bad-day-floor">
      <Heading id={id}>Bad rounds against the typical round</Heading>
      <svg
        role="img"
        aria-label={`${view.rounds.length} rounds by score to par per 18. Median ${toParText(view.median)}, P80 ${toParText(view.p80)}; rounds at or above P80 are the bad rounds.`}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
      >
        <line x1={8} x2={W - 8} y1={base} y2={base} strokeWidth={1} style={{ stroke: 'var(--fw-viz-axis)' }} />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 3} textAnchor="middle" fontSize={9.5} style={{ fill: 'var(--fw-color-text-tertiary)' }}>
            {t > 0 ? `+${t}` : t}
          </text>
        ))}
        {[
          { v: view.median, label: `median ${toParText(view.median)}` },
          { v: view.p80, label: `P80 ${toParText(view.p80)}` },
        ].map((m, i) => (
          <g key={m.label}>
            <line
              x1={x(m.v)}
              x2={x(m.v)}
              y1={12}
              y2={base}
              strokeWidth={1.5}
              strokeDasharray={i === 0 ? undefined : '3 2'}
              style={{ stroke: 'var(--fw-color-text-primary)' }}
            />
            <text
              x={x(m.v)}
              y={9}
              textAnchor={i === 0 ? 'end' : 'start'}
              dx={i === 0 ? -2 : 2}
              fontSize={10}
              style={{ fill: 'var(--fw-color-text-primary)' }}
            >
              {m.label}
            </text>
          </g>
        ))}
        {dots.map((d) => (
          <circle
            key={d.id}
            cx={x(d.toPar)}
            cy={base - 5 - d.k * 9}
            r={3.6}
            strokeWidth={1.2}
            style={
              d.toPar >= view.p80
                ? { fill: NEG, stroke: NEG }
                : { fill: 'var(--fw-color-surface)', stroke: 'var(--fw-color-text-secondary)' }
            }
          >
            <title>{`${d.date ?? 'Round'}: ${toParText(d.toPar)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="text-caption text-text-tertiary">
        One dot per round, score to par per 18 (a 9-hole round scaled × 2). Filled: at or above P80.
      </p>
      <div className="flex flex-col gap-2" data-slot="floor-split">
        <p className="text-body-sm text-text-primary">
          Bad-round average minus middle-round average:{' '}
          <span className="font-fw-mono tabular-nums">{signed(diff)}</span> strokes
          <span className="text-text-secondary">
            {' '}
            ({view.badRounds} bad vs {view.middleRounds} middle rounds)
          </span>
        </p>
        <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-sm" aria-hidden>
          {positive.map((p) => (
            <span key={p.k} style={{ width: `${(p.v / posTotal) * 100}%`, background: FLOOR_FILL[p.k] }} />
          ))}
        </div>
        <ul className="flex flex-col gap-0.5 text-caption text-text-secondary">
          {parts.map((p) => (
            <li key={p.k} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: FLOOR_FILL[p.k] }} />
              <span className="min-w-0 flex-1">{FLOOR_LABEL[p.k]}</span>
              <span className="font-fw-mono tabular-nums text-text-primary">{signed(p.v)}</span>
            </li>
          ))}
        </ul>
      </div>
      <Receipts receipts={view.receipts} />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Three-putt autopsy
 * ──────────────────────────────────────────────────────────────────────── */

const PATHWAY_SHORT: Record<string, string> = {
  long_approach_leave: 'First putt 35+ ft',
  poor_first_putt_leave: 'First putt left 6+ ft',
  short_followup_miss: 'Missed inside 6 ft',
};

export function ThreePuttVisual({ view }: { view: ThreePuttView }) {
  const id = useId();
  const max = Math.max(1, ...view.pathways.map((p) => p.threePutts));
  const bands = view.exposure.filter((e) => e.recorded > 0);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-slot="angle-three-putt">
      <Heading id={id}>How the 3-putts happen</Heading>
      <ul className="flex flex-col gap-2">
        {view.pathways.map((p) => (
          <li key={p.pathway} className="flex flex-col gap-1" data-slot="putt-pathway">
            <div className="flex items-baseline justify-between gap-2 text-body-sm">
              <span className={p.pathway === view.cause ? 'font-medium text-text-primary' : 'text-text-secondary'}>
                {PATHWAY_SHORT[p.pathway] ?? p.label}
              </span>
              <span className="shrink-0 text-caption text-text-secondary">
                <span className="font-fw-mono tabular-nums text-text-primary">{p.threePutts}</span> of {view.classified}
                {p.sharePct !== null ? ` · ${Math.round(p.sharePct)}%` : ''}
              </span>
            </div>
            <span className="relative block h-3 rounded-sm bg-surface-sunken">
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${(p.threePutts / max) * 100}%`, background: p.pathway === view.cause ? NEG : NEUTRAL }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-tertiary">
        {view.classified} of {view.threePutts} 3-putts classified
        {view.suppressed > 0 ? `; ${view.suppressed} have no recorded second-putt distance and are left out` : ''}.
      </p>
      {bands.length > 0 ? (
        <div className="flex flex-col gap-2" data-slot="putt-leaves">
          <p className="text-body-sm font-medium text-text-primary">Second-putt distance, by first-putt length</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {bands.map((b) => {
              const top = Math.max(1, ...LEAVE_BUCKET_KEYS.map((k) => b.buckets[k]));
              return (
                <figure key={b.band} className="m-0 flex min-w-0 flex-col gap-1" data-slot="putt-leave-band">
                  <figcaption className="text-caption font-medium text-text-secondary">First putt {b.label}</figcaption>
                  <div className="flex h-12 items-end gap-1" aria-hidden>
                    {LEAVE_BUCKET_KEYS.map((k) => (
                      <span key={k} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                        <span className="font-fw-mono text-micro tabular-nums leading-none text-text-secondary">{b.buckets[k]}</span>
                        <span
                          className="block w-full rounded-t-sm"
                          style={{
                            height: `${Math.max(2, (b.buckets[k] / top) * 32)}px`,
                            background: k === '6_10' || k === '10_plus' ? NEG : NEUTRAL,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1 text-micro leading-none text-text-tertiary" aria-hidden>
                    {LEAVE_BUCKET_KEYS.map((k) => (
                      <span key={k} className="flex-1 text-center">
                        {LEAVE_BUCKET_TEXT[k]}
                      </span>
                    ))}
                  </div>
                  <span className="sr-only">
                    {LEAVE_BUCKET_KEYS.map((k) => `${LEAVE_BUCKET_TEXT[k]} ft: ${b.buckets[k]}`).join(', ')}
                  </span>
                  <span className="text-caption text-text-tertiary">
                    n {b.recorded} of {b.missed} missed first putts
                  </span>
                </figure>
              );
            })}
          </div>
        </div>
      ) : null}
      <Receipts receipts={view.receipts} />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Miss-cost compass (tee and approach)
 * ──────────────────────────────────────────────────────────────────────── */

const SIDE_LABEL: Record<string, string> = { left: 'Left', right: 'Right', fairway: 'Fairway', short: 'Short', long: 'Long' };

function SideCell({ side, worse, reference = false }: { side: MissSideView; worse: string | null; reference?: boolean }) {
  const hot = side.side === worse;
  return (
    <div
      className={cn('flex min-w-0 flex-col items-center gap-0.5 rounded-fw-sm px-1 py-2 text-center', hot ? 'ring-2 ring-text-primary' : '')}
      style={{ background: reference ? 'var(--fw-color-success-bg)' : hot ? mix(NEG, 45) : 'var(--fw-color-surface-sunken)' }}
      data-slot="miss-side"
      data-side={side.side}
    >
      <span className="text-caption font-medium text-text-secondary">{SIDE_LABEL[side.side] ?? side.side}</span>
      <span className="font-fw-mono text-body-sm tabular-nums text-text-primary">
        {reference ? 'ref' : side.cost === null ? '–' : signed(side.cost)}
      </span>
      <span className="text-caption text-text-tertiary">
        n {side.n}
        {!reference && side.costed !== side.n ? ` (${side.costed} costed)` : ''}
      </span>
      {side.upDownPct !== null ? <span className="text-caption text-text-tertiary">up & down {pct(side.upDownPct)}</span> : null}
    </div>
  );
}

export function TeeMissVisual({ view }: { view: TeeMissView }) {
  const id = useId();
  const order = ['left', 'fairway', 'right'];
  const sides = order.map((k) => view.sides.find((s) => s.side === k)).filter((s): s is MissSideView => !!s);
  const pars = [...new Set(view.clubChain.map((c) => c.par))].sort();
  const cell = (club: 'driver' | 'non_driver', par: number) => view.clubChain.find((c) => c.club === club && c.par === par);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-slot="angle-tee-miss">
      <Heading id={id}>What a tee miss costs, by side</Heading>
      <p className="text-caption text-text-tertiary">Strokes per tee shot against the player&apos;s own fairway holes (same par and club).</p>
      <div className="grid grid-cols-3 gap-2">
        {sides.map((s) => (
          <SideCell key={s.side} side={s} worse={view.worse} reference={s.side === 'fairway'} />
        ))}
      </div>
      <p className="text-caption text-text-tertiary">
        Miss side recorded on {view.coverage.recorded} of {view.coverage.missed} missed fairways
        {view.coverage.pct !== null ? ` (${Math.round(view.coverage.pct)}%)` : ''}.
      </p>
      {view.clubChain.length > 0 ? (
        <div className="flex flex-col gap-1" data-slot="tee-club-chain">
          <table className="w-full table-fixed border-collapse text-body-sm">
            <caption className="sr-only">Fairways hit by club and par</caption>
            <thead>
              <tr className="text-caption text-text-tertiary">
                <th scope="col" className="w-28 pb-1 text-left font-medium">
                  Fairways hit
                </th>
                {pars.map((p) => (
                  <th key={p} scope="col" className="pb-1 text-right font-medium">
                    Par {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['driver', 'non_driver'] as const).map((club) => (
                <tr key={club}>
                  <th scope="row" className="py-1 text-left font-medium text-text-secondary">
                    {club === 'driver' ? 'Driver' : 'Non-driver'}
                  </th>
                  {pars.map((p) => {
                    const c = cell(club, p);
                    return (
                      <td key={p} className="py-1 text-right">
                        <span className="font-fw-mono tabular-nums text-text-primary">{c ? pct(c.fairwayPct) : '–'}</span>
                        <span className="pl-1 text-caption text-text-tertiary">n {c?.teeShots ?? 0}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {view.biasNote ? <p className="text-caption text-text-tertiary">{view.biasNote}</p> : null}
        </div>
      ) : null}
      <Receipts receipts={view.receipts} />
    </section>
  );
}

export function ApproachMissVisual({ view }: { view: ApproachMissView }) {
  const id = useId();
  const s = view.sides;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-slot="angle-approach-miss">
      <Heading id={id}>What finishing the hole costs, by miss side</Heading>
      <p className="text-caption text-text-tertiary">
        Strokes to finish against the expectation from where the ball finished. A diagonal miss counts on both axes.
      </p>
      <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2">
        <span />
        <SideCell side={s.long} worse={view.worse} />
        <span />
        <SideCell side={s.left} worse={view.worse} />
        <div className="flex items-center justify-center rounded-full" style={{ background: 'var(--fw-color-success-bg)' }} aria-hidden>
          <span className="text-caption text-text-secondary">Green</span>
        </div>
        <SideCell side={s.right} worse={view.worse} />
        <span />
        <SideCell side={s.short} worse={view.worse} />
        <span />
      </div>
      <p className="text-caption text-text-tertiary">
        Miss direction recorded on {view.coverage.recorded} of {view.coverage.missed} missed greens
        {view.coverage.pct !== null ? ` (${Math.round(view.coverage.pct)}%)` : ''}.
      </p>
      <Receipts receipts={view.receipts} />
    </section>
  );
}

/** The angle visual for a parsed view. */
export function AngleWhy({ view }: { view: AngleWhyView }) {
  switch (view.kind) {
    case 'lie_approach':
      return <LieApproachVisual view={view} />;
    case 'bad_day_floor':
      return <BadDayFloorVisual view={view} />;
    case 'three_putt':
      return <ThreePuttVisual view={view} />;
    case 'tee_miss':
      return <TeeMissVisual view={view} />;
    case 'approach_miss':
      return <ApproachMissVisual view={view} />;
    default:
      return null;
  }
}
