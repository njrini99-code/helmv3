/**
 * Bespoke per-area mini-instruments for the Game Fingerprint ledger.
 *
 * Each one draws a single idea on hairlines, with direct labels and SF
 * tabular numerals. No card, no fill behind the chart, no legend. Values come
 * from the section's null-guarded `metrics` (never the 0-coerced `chart_data`
 * bars), except the putting bands, which exist only as bars; there a 0 is
 * drawn as a gap and footnoted.
 *
 * Server-safe: no hooks, no handlers.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SectionData } from '@/app/golf/actions/player-fingerprint-types';
import {
  findMetric,
  formatSignedValue,
  metricNumber,
  parseSigned,
  puttingBands,
} from './fingerprint-model';
import {
  LADDER_MAX_YARDS,
  LADDER_MIN_YARDS,
  LADDER_THIN_SHOTS,
  type ApproachLadderData,
} from './approach-ladder-model';

/* ── Shared atoms ────────────────────────────────────────────────────────── */

/** A caption line under an instrument: what it is, the window, the sample. */
export function InstrumentNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 font-fw-sans text-caption text-text-tertiary">{children}</p>;
}

export interface StatItem {
  label: string;
  value: string;
  note?: string | null;
}

/** An inline row of 2-3 figures split by hairlines. Not tiles. */
export function StatLine({ items }: { items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="flex divide-x divide-border-subtle border-y border-border-subtle">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 flex-1 px-3 py-3 first:pl-0 last:pr-0">
          <dt className="font-fw-sans text-caption text-text-secondary">{it.label}</dt>
          <dd className="mt-0.5 font-fw-sans text-body-lg font-semibold tabular-nums text-text-primary">
            {it.value}
            {it.note ? (
              <span className="ml-1 font-fw-sans text-caption font-medium text-text-tertiary">{it.note}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function stat(section: SectionData, label: string, as?: string): StatItem | null {
  const m = findMetric(section, label);
  if (!m) return null;
  return { label: as ?? label, value: m.value, note: m.comparison ?? null };
}

export function statItems(section: SectionData, labels: Array<string | [string, string]>): StatItem[] {
  return labels
    .map((l) => (Array.isArray(l) ? stat(section, l[0], l[1]) : stat(section, l)))
    .filter((x): x is StatItem => x != null);
}

/* ── Tee: fairway strip ──────────────────────────────────────────────────── */

/**
 * The fairway-hit strip: one band split hit | missed. A single proportion of
 * one whole, so the two widths are honest parts. The tee has no left/right
 * miss data in the stats cache, so no dispersion is invented.
 */
export function FairwayStrip({ section }: { section: SectionData }) {
  const hit = metricNumber(section, 'Fairways');
  const distance = metricNumber(section, 'Avg distance');
  if (hit == null && distance == null) return null;
  return (
    <div>
      {hit != null ? (
        <figure aria-label={`Fairways hit ${hit}%, missed ${100 - hit}%`} className="m-0">
          <div className="flex items-baseline justify-between font-fw-sans text-caption text-text-secondary">
            <span>
              <span className="text-body-lg font-semibold tabular-nums text-text-primary">{hit}%</span> fairways hit
            </span>
            <span className="tabular-nums">{100 - hit}% missed</span>
          </div>
          <div aria-hidden="true" className="mt-2 flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
            <span className="h-full rounded-l-full bg-fw-success" style={{ width: `${hit}%` }} />
            <span className="h-full flex-1 rounded-r-full bg-surface-sunken" />
          </div>
        </figure>
      ) : null}
      {distance != null ? (
        <InstrumentNote>
          Average drive <span className="tabular-nums text-text-secondary">{Math.round(distance)} yd</span>
        </InstrumentNote>
      ) : null}
    </div>
  );
}

/* ── Approach: miss compass ──────────────────────────────────────────────── */

/**
 * Where approaches miss, around a green. The four shares come from separate
 * cache columns and can overlap (a short-left miss counts in both), so they
 * are placed at their compass points and never drawn as parts of one whole.
 */
export function MissCompass({ section }: { section: SectionData }) {
  const chart = section.chart_data;
  if (!chart || chart.kind !== 'pills') return null;
  const get = (label: string) => parseSigned(chart.pills.find((p) => p.label === label)?.value);
  const left = get('Left');
  const right = get('Right');
  const short = get('Short');
  const long = get('Long');
  if ([left, right, short, long].every((v) => v == null)) return null;
  const fmt = (v: number | null) => (v == null ? '—' : `${v}%`);
  const cell = 'font-fw-sans text-caption text-text-secondary';
  const num = 'block text-body font-semibold tabular-nums text-text-primary';
  return (
    <figure className="m-0" aria-label={`Approach misses: left ${fmt(left)}, right ${fmt(right)}, short ${fmt(short)}, long ${fmt(long)}`}>
      <div aria-hidden="true" className="mx-auto grid w-full max-w-[280px] grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto_auto] items-center gap-2 text-center">
        <span />
        <span className={cell}><span className={num}>{fmt(long)}</span>long</span>
        <span />
        <span className={cn(cell, 'text-right')}><span className={num}>{fmt(left)}</span>left</span>
        <svg viewBox="0 0 96 64" className="h-16 w-24" role="presentation">
          <ellipse cx="48" cy="32" rx="44" ry="28" className="fill-surface-sunken stroke-border-strong" strokeWidth="1" />
          <line x1="48" y1="6" x2="48" y2="58" className="stroke-border-subtle" strokeWidth="1" />
          <line x1="6" y1="32" x2="90" y2="32" className="stroke-border-subtle" strokeWidth="1" />
          <circle cx="48" cy="32" r="2.5" className="fill-text-primary" />
        </svg>
        <span className={cn(cell, 'text-left')}><span className={num}>{fmt(right)}</span>right</span>
        <span />
        <span className={cell}><span className={num}>{fmt(short)}</span>short</span>
        <span />
      </div>
      <InstrumentNote>Where approaches miss, by direction. A short-left miss counts as both, so the four do not add to 100.</InstrumentNote>
    </figure>
  );
}

/* ── Approach: distance ladder (coach) ───────────────────────────────────── */

export function ApproachLadder({ data }: { data: ApproachLadderData }) {
  const bands = data.bands.filter((b) => b.start >= LADDER_MIN_YARDS && b.end <= LADDER_MAX_YARDS);
  if (bands.length === 0) {
    return (
      <p className="font-fw-sans text-body-sm text-text-secondary">
        No tracked approach shots from {LADDER_MIN_YARDS}–{LADDER_MAX_YARDS} yards in the last {data.windowDays} days.
      </p>
    );
  }
  const maxAbs = Math.max(0.1, ...bands.map((b) => Math.abs(b.avgSg)));
  return (
    <figure className="m-0" aria-label="Approach results by distance">
      <ol className="divide-y divide-border-subtle border-y border-border-subtle">
        {bands.map((b) => {
          const thin = b.shots < LADDER_THIN_SHOTS;
          const pct = (Math.abs(b.avgSg) / maxAbs) * 50;
          const gain = b.avgSg >= 0;
          return (
            <li key={b.start} className="grid min-h-[48px] grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-x-3 py-2">
              <span className="font-fw-sans text-body-sm font-medium tabular-nums text-text-primary">
                {b.start}–{b.end}
                <span className="block text-caption font-medium text-text-tertiary">yards</span>
              </span>
              <span className="min-w-0">
                <span aria-hidden="true" className="relative block h-3">
                  <span className="absolute inset-y-[-4px] left-1/2 w-px bg-border-strong" />
                  <span
                    className={cn(
                      'absolute top-0 h-3 rounded-[3px]',
                      thin
                        ? cn('border bg-transparent', gain ? 'border-fw-success' : 'border-fw-warning')
                        : gain
                          ? 'bg-fw-success'
                          : 'bg-fw-warning',
                    )}
                    style={gain ? { left: '50%', width: `${Math.max(pct, 1)}%` } : { right: '50%', width: `${Math.max(pct, 1)}%` }}
                  />
                </span>
                <span className="mt-1.5 block truncate font-fw-sans text-caption text-text-tertiary tabular-nums">
                  {Math.round(b.leaveFeet)} ft leave · {Math.round(b.greenPct)}% greens · {b.shots} {b.shots === 1 ? 'shot' : 'shots'}
                  {thin ? ' · thin' : ''}
                </span>
              </span>
              <span
                className={cn(
                  'text-right font-fw-sans text-body font-semibold tabular-nums',
                  thin ? 'text-text-tertiary' : gain ? 'text-fw-success-ink' : 'text-fw-warning-ink',
                )}
              >
                {formatSignedValue(b.avgSg, 2)}
              </span>
            </li>
          );
        })}
      </ol>
      <InstrumentNote>
        Strokes gained per approach shot, shot-level default baseline. Tee shots and putts excluded. {data.shots} shots over{' '}
        {data.rounds} {data.rounds === 1 ? 'round' : 'rounds'}, last {data.windowDays} days. Outlined bands have fewer than{' '}
        {LADDER_THIN_SHOTS} shots.
      </InstrumentNote>
      <table className="sr-only">
        <caption>Approach shots by distance band</caption>
        <thead>
          <tr>
            <th scope="col">Yards</th>
            <th scope="col">Strokes gained per shot</th>
            <th scope="col">Average leave, feet</th>
            <th scope="col">Greens hit</th>
            <th scope="col">Shots</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.start}>
              <th scope="row">{b.start} to {b.end}</th>
              <td>{formatSignedValue(b.avgSg, 2)}</td>
              <td>{Math.round(b.leaveFeet)}</td>
              <td>{Math.round(b.greenPct)}%</td>
              <td>{b.shots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* ── Short game: rate meters ─────────────────────────────────────────────── */

/** Independent rates on one fixed 0-100 axis (never normalised to a sum). */
export function RateMeters({ section, labels }: { section: SectionData; labels: string[] }) {
  const rows = labels
    .map((label) => ({ label, v: metricNumber(section, label) }))
    .filter((r): r is { label: string; v: number } => r.v != null);
  if (rows.length === 0) return null;
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[108px_minmax(0,1fr)_44px] items-center gap-x-3">
            <span className="font-fw-sans text-body-sm text-text-secondary">{r.label}</span>
            <span aria-hidden="true" className="relative block h-2 rounded-full bg-surface-sunken">
              <span className="absolute inset-y-0 left-0 rounded-full bg-text-secondary" style={{ width: `${Math.min(100, Math.max(0, r.v))}%` }} />
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-border-strong" />
            </span>
            <span className="text-right font-fw-sans text-body font-semibold tabular-nums text-text-primary">{Math.round(r.v)}%</span>
          </li>
        ))}
      </ul>
      <InstrumentNote>Percent of chances converted. The tick marks 50%.</InstrumentNote>
    </div>
  );
}

/* ── Putting: make curve ─────────────────────────────────────────────────── */

const CURVE_W = 320;
const CURVE_H = 148;
const CURVE_PAD = { top: 12, right: 10, bottom: 26, left: 32 };

export function PuttingMakeCurve({ section }: { section: SectionData }) {
  const bands = puttingBands(section);
  if (bands.length === 0 || bands.every((b) => b.pct == null)) return null;
  const innerW = CURVE_W - CURVE_PAD.left - CURVE_PAD.right;
  const innerH = CURVE_H - CURVE_PAD.top - CURVE_PAD.bottom;
  const x = (i: number) => CURVE_PAD.left + (bands.length === 1 ? innerW / 2 : (i / (bands.length - 1)) * innerW);
  const y = (pct: number) => CURVE_PAD.top + innerH - (pct / 100) * innerH;

  // Contiguous runs only; a gap is never interpolated across.
  const runs: number[][] = [];
  let cur: number[] = [];
  bands.forEach((b, i) => {
    if (b.pct != null) cur.push(i);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);
  const hasGap = bands.some((b) => b.pct == null);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Putts made by distance: ${bands.map((b) => `${b.label} ${b.pct == null ? 'no makes recorded' : `${b.pct}%`}`).join(', ')}`}
      >
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line
              x1={CURVE_PAD.left}
              x2={CURVE_W - CURVE_PAD.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'stroke-border-strong' : 'stroke-border-subtle'}
              strokeWidth={1}
            />
            <text x={CURVE_PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} className="fill-text-tertiary font-fw-sans tabular-nums">
              {t}%
            </text>
          </g>
        ))}
        {runs.map((run) =>
          run.length > 1 ? (
            <polyline
              key={run.join('-')}
              points={run.map((i) => `${x(i)},${y(bands[i]!.pct as number)}`).join(' ')}
              fill="none"
              className="stroke-fw-success"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {bands.map((b, i) =>
          b.pct == null ? (
            <line key={b.label} x1={x(i)} x2={x(i)} y1={y(0) - 5} y2={y(0) + 5} className="stroke-text-tertiary" strokeDasharray="2 2" />
          ) : (
            <g key={b.label}>
              <circle cx={x(i)} cy={y(b.pct)} r={3.5} className="fill-fw-success" />
              <text x={x(i)} y={y(b.pct) - 8} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-text-primary font-fw-sans tabular-nums">
                {b.pct}%
              </text>
            </g>
          ),
        )}
        {bands.map((b, i) => (
          <text key={`x-${b.label}`} x={x(i)} y={CURVE_H - 8} textAnchor="middle" fontSize={10} className="fill-text-secondary font-fw-sans">
            {b.label}
          </text>
        ))}
      </svg>
      <InstrumentNote>
        Putts made by starting distance, all tracked rounds.{hasGap ? ' A dashed tick means no makes recorded in that band.' : ''}
      </InstrumentNote>
    </figure>
  );
}

/* ── Scoring: par-type deltas ────────────────────────────────────────────── */

export function ParDeltas({ section }: { section: SectionData }) {
  const rows = (['Par 3', 'Par 4', 'Par 5'] as const)
    .map((label) => {
      const m = findMetric(section, label);
      const avg = parseSigned(m?.value);
      const delta = parseSigned(m?.comparison);
      return avg != null && delta != null ? { label, avg, delta } : null;
    })
    .filter((r): r is { label: 'Par 3' | 'Par 4' | 'Par 5'; avg: number; delta: number } => r != null);
  if (rows.length === 0) return null;
  const maxAbs = Math.max(0.5, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const over = r.delta > 0.005;
          const w = (Math.abs(r.delta) / maxAbs) * 50;
          return (
            <li key={r.label} className="grid grid-cols-[56px_minmax(0,1fr)_64px] items-center gap-x-3">
              <span className="font-fw-sans text-body-sm text-text-secondary">{r.label}s</span>
              <span aria-hidden="true" className="relative block h-3">
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-border-strong" />
                <span
                  className={cn('absolute top-0 h-3 rounded-[3px]', over ? 'bg-fw-warning' : 'bg-fw-success')}
                  style={over ? { left: '50%', width: `${Math.max(w, 1)}%` } : { right: '50%', width: `${Math.max(w, 1)}%` }}
                />
              </span>
              <span className={cn('text-right font-fw-sans text-body font-semibold tabular-nums', over ? 'text-fw-warning-ink' : 'text-fw-success-ink')}>
                {formatSignedValue(r.delta, 2)}
              </span>
            </li>
          );
        })}
      </ul>
      <InstrumentNote>
        Average strokes over par by hole type ({rows.map((r) => `${r.label.toLowerCase()} ${r.avg.toFixed(2)}`).join(', ')}).
      </InstrumentNote>
    </div>
  );
}

/* ── Pressure: practice vs competition ───────────────────────────────────── */

export function PressureSplit({ section }: { section: SectionData }) {
  const practice = findMetric(section, 'Practice avg');
  const tourn = findMetric(section, 'Tournament avg');
  const gap = findMetric(section, 'Pressure gap');
  const p = parseSigned(practice?.value);
  const t = parseSigned(tourn?.value);
  const g = parseSigned(gap?.value);
  if (p == null || t == null) return null;
  const lo = Math.min(0, p, t);
  const hi = Math.max(0, p, t);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const rows = [
    { label: 'Practice', v: p, n: practice?.comparison },
    { label: 'Competition', v: t, n: tourn?.comparison },
  ];
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[88px_minmax(0,1fr)_52px] items-center gap-x-3">
            <span className="font-fw-sans text-body-sm text-text-secondary">
              {r.label}
              {r.n ? <span className="block text-caption text-text-tertiary tabular-nums">{r.n.replace(/\brd\b/, 'rounds')}</span> : null}
            </span>
            <span aria-hidden="true" className="relative block h-3">
              <span className="absolute inset-y-[-3px] w-px bg-border-strong" style={{ left: `${pos(0)}%` }} />
              <span className="absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-text-primary" style={{ left: `${pos(r.v)}%` }} />
            </span>
            <span className="text-right font-fw-sans text-body font-semibold tabular-nums text-text-primary">{formatSignedValue(r.v)}</span>
          </li>
        ))}
      </ul>
      {g != null ? (
        <p className="mt-3 font-fw-sans text-body-sm text-text-secondary">
          <span className={cn('font-semibold tabular-nums', g > 2 ? 'text-fw-warning-ink' : g <= 0 ? 'text-fw-success-ink' : 'text-text-primary')}>
            {formatSignedValue(g)}
          </span>{' '}
          strokes to par in competition
          {gap?.comparison ? ` · ${gap.comparison.toLowerCase()}` : ''}
        </p>
      ) : null}
      <InstrumentNote>Average score to par per round, from the last 10 rounds. The line marks even par.</InstrumentNote>
    </div>
  );
}
