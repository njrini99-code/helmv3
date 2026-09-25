'use client';

/**
 * ============================================================================
 * RootWhy: the drill view for one branch of the root map
 * (`/golf/dashboard/coachhelm?view=root&insight=<id>`)
 * ----------------------------------------------------------------------------
 * Breadcrumb path (area → cause → root), headline, support + confidence
 * chips, the stored diagnosis, "How it happens" (only when the diagnosis
 * stored a traced shot sequence), then "The evidence" collapsed by default
 * (summary first): the evidence visual, the angle / green / approach visuals
 * and what closing it is worth (only when the insight stores a scoring
 * projection). ONE primary action: make it a focus (the existing `createFocusAreaFromInsightV2` path
 * through the shared `FocusAreaModal`).
 *
 * Putting branches also get the top-down green (`GreenPlot`): recorded 4-6 ft
 * putts placed by slope (`golf_shots.putt_slope`, recorded on ~96% of putts)
 * and distance, with a make rate per region. It is omitted below its sample
 * gate (see `buildGreenView`).
 *
 * Approach branches get the length → par → shape evidence
 * (`approach-context.ts`, read live from the last countable rounds, so it is
 * labelled with its own window): the gated narrowing steps, a miss compass
 * (short/long × left/right, coverage stated; omitted below the coverage
 * gate), the par × length grid with the chosen slice emphasised, and the
 * three ranges' A2 metrics side by side.
 *
 * Insight-angle reads (`coachhelm_insight_angles_v1`: rough vs fairway
 * approaches, the bad-day floor, the 3-putt autopsy, the tee and approach
 * miss-cost compasses) add their own visual under the evidence line
 * (`AngleWhy`, parsed by metric in `angle-why.ts`). Every other branch shows
 * only the generic evidence visual (your value against the comparison, with
 * the sample).
 * ========================================================================== */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button, EmptyState, Eyebrow } from '@/components/fairway';
import { FocusAreaModal, type FocusAreaModalSubmit } from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import { createFocusAreaFromInsightV2 } from '@/app/golf/actions/development';
import { formatValue } from '@/components/golf/coachhelm/insights/format-value';
import {
  findBranch,
  formatStrokes,
  shortDate,
  type BranchDetail,
  type RootAudience,
  type RootMapModel,
} from '@/lib/coachhelm/root-map/build-root-map';
import { COACHHELM_HOME } from './RootToday';
import { MeasuredFacts, SupportChips } from './RootToday';
import { rootStyleCss } from './RootMap';
import { AngleWhy } from './AngleWhy';
import { Disclosure } from './Disclosure';
import {
  GREEN_CENTER,
  GREEN_INNER_RING_FT,
  GREEN_MAX_FT,
  GREEN_MIN_FT,
  GREEN_PX_PER_FT,
  GREEN_REGION_LABEL,
  GREEN_SIZE,
  greenAriaLabel,
  type GreenRegionStat,
  type GreenView,
} from '@/lib/coachhelm/root-map/green-view';
import type { ApproachCompass, ApproachWhyView } from '@/lib/coachhelm/root-map/approach-context';
import { INFERRED_LABEL } from '@/lib/coachhelm/root-map/plain-copy';

export interface RootWhyInsight {
  id: string;
  playerId: string;
  category: string | null;
}

export interface RootWhyProps {
  model: RootMapModel;
  details: Record<string, BranchDetail>;
  insights: RootWhyInsight[];
  /** Short-putt green, shown on putting branches; null omits it. */
  greenView?: GreenView | null;
  /** Insight id → approach band evidence; absent ids show none. */
  approachWhy?: Record<string, ApproachWhyView> | null;
  /** The player map speaks to the player ("your"). A coach drilling into a
   *  player reads it in the third person, by the player's first name. */
  audience?: RootAudience;
  /** Coach view: the player's first name (required for `audience='coach'`). */
  playerName?: string;
  /** The insight to show. Defaults to the `?insight=` search param (the
   *  player route); the coach drill passes it explicitly. */
  insightId?: string | null;
  /** Replaces the default "Today" back link; `null` renders none (the coach
   *  drill has its own back to Team roots). */
  backLink?: ReactNode | null;
  /** Extra secondary actions under the primary one (e.g. "Open signal"). */
  secondaryActions?: ReactNode;
}

/** How the Why view names the player: "your" / "You", or "Ava's" / "Ava". */
interface Voice {
  audience: RootAudience;
  /** "You" / "Ava" */
  subject: string;
  /** "your" / "Ava's" (lower-case form for mid-sentence use) */
  possessive: string;
  /** "Your" / "Ava's" */
  Possessive: string;
}

function voiceFor(audience: RootAudience, playerName: string | undefined): Voice {
  if (audience === 'coach') {
    const name = playerName?.trim() || 'The player';
    const poss = name === 'The player' ? "the player's" : `${name}'s`;
    return { audience, subject: name, possessive: poss, Possessive: poss.charAt(0).toUpperCase() + poss.slice(1) };
  }
  return { audience, subject: 'You', possessive: 'your', Possessive: 'Your' };
}

const PLAYER_VOICE = voiceFor('player', undefined);

function areaTypeFor(category: string | null): string {
  switch (category) {
    case 'putting':
      return 'putting';
    case 'tee':
      return 'driving';
    case 'approach':
      return 'iron_play';
    case 'short_game':
      return 'short_game';
    case 'pressure':
    case 'course_management':
      return 'mental_game';
    default:
      return 'other';
  }
}

/** Percent values arrive as a 0..1 fraction or 0..100; draw on one scale. */
function scaleValue(v: number, unit: BranchDetail['unit']): number {
  return unit === 'percent' && Math.abs(v) <= 1 ? v * 100 : v;
}

function EvidenceCompare({ detail, voice = PLAYER_VOICE }: { detail: BranchDetail; voice?: Voice }) {
  const marks = [
    { key: 'you', label: voice.subject, value: detail.yourValue, display: formatValue(detail.yourValue, detail.unit, detail.yourDisplay ?? undefined) },
    { key: 'cmp', label: detail.comparisonLabel, value: detail.comparisonValue, display: formatValue(detail.comparisonValue, detail.unit) },
    ...(detail.secondaryValue !== null && detail.secondaryLabel
      ? [{ key: 'sec', label: detail.secondaryLabel, value: detail.secondaryValue, display: formatValue(detail.secondaryValue, detail.unit) }]
      : []),
  ];
  const vals = marks.map((m) => scaleValue(m.value, detail.unit));
  const lo = detail.unit === 'percent' ? 0 : Math.min(0, ...vals);
  const rawHi = detail.unit === 'percent' ? 100 : Math.max(...vals) * 1.1;
  const hi = rawHi > lo ? rawHi : lo + 1;
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const window = [shortDate(detail.windowStart), shortDate(detail.windowEnd)].filter(Boolean).join(' – ');

  return (
    <section aria-labelledby="why-evidence-heading" className="flex flex-col gap-3">
      <Eyebrow as="h3" id="why-evidence-heading">
        {detail.metricLabel}
      </Eyebrow>
      <p className="font-fw-display text-title-1 tabular-nums text-text-primary">{marks[0]!.display}</p>
      <svg
        role="img"
        aria-label={`${detail.metricLabel}: ${voice.audience === 'coach' ? voice.subject : 'you'} ${marks[0]!.display}; ${marks
          .slice(1)
          .map((m) => `${m.label} ${m.display}`)
          .join('; ')}. ${detail.sampleN} tracked.`}
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        className="h-8 w-full overflow-visible"
      >
        <rect x={0} y={10} width={100} height={4} rx={2} style={{ fill: 'var(--fw-color-surface-sunken)' }} />
        <rect x={0} y={10} width={Math.max(0, Math.min(100, x(vals[0]!)))} height={4} rx={2} style={{ fill: 'var(--fw-viz-div-neg)' }} />
        {marks.slice(1).map((m, i) => (
          <line
            key={m.key}
            x1={x(vals[i + 1]!)}
            x2={x(vals[i + 1]!)}
            y1={4}
            y2={20}
            style={{ stroke: i === 0 ? 'var(--fw-color-text-primary)' : 'var(--fw-viz-benchmark)' }}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        {marks.map((m) => (
          <li key={m.key}>
            {m.label} <span className="font-fw-mono tabular-nums text-text-primary">{m.display}</span>
          </li>
        ))}
        <li>
          {detail.sampleN} tracked{window ? ` · ${window}` : ''}
        </li>
      </ul>
    </section>
  );
}

function RegionStat({ stat }: { stat: GreenRegionStat }) {
  const label = GREEN_REGION_LABEL[stat.slope];
  return (
    <div className="flex min-w-0 flex-col" data-slot="green-region" data-slope={stat.slope}>
      <span className="text-caption font-medium text-text-secondary">
        {label.place} · {label.slope}
      </span>
      <span className="font-fw-display text-title-1 tabular-nums text-text-primary">
        {stat.pct === null ? '–' : `${stat.pct}%`}
      </span>
      <span className="text-caption text-text-secondary">
        {stat.made} of {stat.n} made
        {stat.thin ? <span className="text-text-tertiary"> · thin read</span> : null}
      </span>
    </div>
  );
}

/**
 * Top-down green: hole at the centre, downhill putts in the wedge above it,
 * uphill below, level to the sides; made = filled dot, missed = ring. Only
 * 4-6 ft putts count; closer ones are faint. No comparison is written here:
 * each region states its own rate, and a thin region says so.
 */
function GreenPlot({ view, voice = PLAYER_VOICE }: { view: GreenView; voice?: Voice }) {
  const c = GREEN_CENTER;
  const diag = (GREEN_MAX_FT + 0.5) * GREEN_PX_PER_FT * Math.SQRT1_2;
  return (
    <section aria-labelledby="why-green-heading" className="flex flex-col gap-3" data-slot="green-plot">
      <h3 id="why-green-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
        {voice.Possessive} putts from {GREEN_MIN_FT}–{GREEN_MAX_FT} ft
      </h3>
      <div className="flex justify-center">
        <RegionStat stat={view.regions.downhill} />
      </div>
      <svg
        role="img"
        aria-label={greenAriaLabel(view)}
        viewBox={`0 0 ${GREEN_SIZE} ${GREEN_SIZE}`}
        className="mx-auto h-auto w-full max-w-[330px]"
      >
        <circle cx={c} cy={c} r={c - 2} style={{ fill: 'var(--fw-color-success-bg)' }} />
        {[1, -1].map((s) => (
          <line
            key={s}
            x1={c - diag}
            y1={c - s * diag}
            x2={c + diag}
            y2={c + s * diag}
            style={{ stroke: 'var(--fw-viz-grid)' }}
            strokeWidth={1}
          />
        ))}
        {[GREEN_INNER_RING_FT, GREEN_MAX_FT].map((ft) => (
          <g key={ft}>
            <circle
              cx={c}
              cy={c}
              r={ft * GREEN_PX_PER_FT}
              fill="none"
              style={{ stroke: 'var(--fw-viz-axis)' }}
              strokeWidth={1.2}
              strokeDasharray="4 4"
            />
            <text
              x={c + 4}
              y={c + ft * GREEN_PX_PER_FT - 4}
              fontSize={10.5}
              style={{ fill: 'var(--fw-color-text-tertiary)' }}
            >
              {ft} ft
            </text>
          </g>
        ))}
        {view.points.map((p, i) =>
          p.made ? (
            <circle key={i} cx={p.x} cy={p.y} r={3.4} opacity={p.faint ? 0.3 : 1} style={{ fill: 'var(--fw-color-success)' }} />
          ) : (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3.6}
              opacity={p.faint ? 0.3 : 1}
              strokeWidth={2}
              style={{ fill: 'var(--fw-color-surface)', stroke: 'var(--fw-color-warning)' }}
            />
          ),
        )}
        <circle cx={c} cy={c} r={6} style={{ fill: 'var(--fw-color-text-primary)' }} />
      </svg>
      <div className="grid grid-cols-2 gap-3">
        <RegionStat stat={view.regions.level} />
        <div className="flex justify-end text-right">
          <RegionStat stat={view.regions.uphill} />
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        <li className="inline-flex items-center gap-1.5">
          <svg aria-hidden width={10} height={10}>
            <circle cx={5} cy={5} r={4} style={{ fill: 'var(--fw-color-success)' }} />
          </svg>
          Made
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg aria-hidden width={10} height={10}>
            <circle cx={5} cy={5} r={3.6} fill="none" strokeWidth={2} style={{ stroke: 'var(--fw-color-warning)' }} />
          </svg>
          Missed
        </li>
        <li>Faint: {GREEN_INNER_RING_FT} ft or less, not counted</li>
      </ul>
      <p className="text-caption text-text-tertiary">
        Across {voice.possessive} last {view.rounds} rounds. Position around the hole is illustrative; distance and slope are recorded.
      </p>
    </section>
  );
}

const COMPASS_CELLS: Array<{ key: keyof ApproachCompass['quadrants'] | 'center'; col: number; row: number; label: string }> = [
  { key: 'long_left', col: 0, row: 0, label: 'long left' },
  { key: 'long', col: 1, row: 0, label: 'long' },
  { key: 'long_right', col: 2, row: 0, label: 'long right' },
  { key: 'left', col: 0, row: 1, label: 'left' },
  { key: 'center', col: 1, row: 1, label: 'green' },
  { key: 'right', col: 2, row: 1, label: 'right' },
  { key: 'short_left', col: 0, row: 2, label: 'short left' },
  { key: 'short', col: 1, row: 2, label: 'short' },
  { key: 'short_right', col: 2, row: 2, label: 'short right' },
];

/** Whether a compass cell belongs to the stated shape ("short-right" lights
 *  short_right; "short" lights every short cell). */
function inShape(cell: string, shape: string | null): boolean {
  if (!shape || cell === 'center') return false;
  const parts = shape.split('-');
  return parts.every((p) => cell.split('_').includes(p));
}

/**
 * Miss compass: where the recorded misses finished around the green, long
 * at the top, short at the bottom. Dot area follows the count; the cells of
 * the stated shape are filled, the rest outlined.
 */
function MissCompass({ compass }: { compass: ApproachCompass }) {
  const size = 240;
  const cell = size / 3;
  const max = Math.max(1, ...Object.values(compass.quadrants));
  const aria =
    `Where ${compass.covered} recorded misses finished, ${compass.population}: ` +
    COMPASS_CELLS.filter((c) => c.key !== 'center')
      .map((c) => `${c.label} ${compass.quadrants[c.key as keyof ApproachCompass['quadrants']]}`)
      .join(', ') +
    `. ${compass.short} short, ${compass.long} long, ${compass.left} left, ${compass.right} right.` +
    (compass.shape ? ` Most finish ${compass.shape}.` : ' No side dominates.');
  return (
    <section aria-labelledby="why-compass-heading" className="flex flex-col gap-3" data-slot="miss-compass">
      <h3 id="why-compass-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
        Where the misses finish
      </h3>
      <p className="text-body-sm text-text-secondary">{compass.population}</p>
      <svg role="img" aria-label={aria} viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[280px]">
        {[1, 2].map((i) => (
          <g key={i}>
            <line x1={cell * i} x2={cell * i} y1={0} y2={size} style={{ stroke: 'var(--fw-viz-grid)' }} strokeWidth={1} />
            <line y1={cell * i} y2={cell * i} x1={0} x2={size} style={{ stroke: 'var(--fw-viz-grid)' }} strokeWidth={1} />
          </g>
        ))}
        {COMPASS_CELLS.map((c) => {
          const cx = c.col * cell + cell / 2;
          const cy = c.row * cell + cell / 2;
          if (c.key === 'center') {
            return (
              <g key="center">
                <circle cx={cx} cy={cy} r={cell * 0.32} style={{ fill: 'var(--fw-color-success-bg)' }} />
                <circle cx={cx} cy={cy} r={4} style={{ fill: 'var(--fw-color-text-primary)' }} />
              </g>
            );
          }
          const count = compass.quadrants[c.key];
          const lit = inShape(c.key, compass.shape);
          const r = count > 0 ? 6 + (cell * 0.3 - 6) * Math.sqrt(count / max) : 0;
          return (
            <g key={c.key}>
              {count > 0 ? (
                <circle
                  cx={cx}
                  cy={cy - 6}
                  r={r}
                  strokeWidth={1.5}
                  style={
                    lit
                      ? { fill: 'var(--fw-viz-div-neg)', stroke: 'var(--fw-viz-div-neg)' }
                      : { fill: 'var(--fw-color-surface)', stroke: 'var(--fw-color-border-strong)' }
                  }
                />
              ) : null}
              <text
                x={cx}
                y={c.row * cell + cell - 8}
                textAnchor="middle"
                fontSize={11}
                style={{ fill: lit ? 'var(--fw-color-text-primary)' : 'var(--fw-color-text-tertiary)' }}
              >
                {c.label} · {count}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-caption text-text-tertiary">
        {compass.covered} of {compass.misses} misses have a recorded direction.
        {compass.shape ? ` Most finish ${compass.shape}.` : ' No side dominates.'}
      </p>
    </section>
  );
}

const LENGTHS = ['short', 'mid', 'long'] as const;

/** Par × hole length: misses of attempts from this range, the chosen slice
 *  emphasised (a whole-par slice emphasises its row). */
function ParLengthGrid({ view }: { view: ApproachWhyView }) {
  const grid = view.grid!;
  const pars = ([3, 4, 5] as const).filter((p) => grid.cells.some((c) => c.par === p));
  if (pars.length === 0) return null;
  const selected = (par: number, length: string) =>
    grid.selectedId === `par${par}_${length}` || grid.selectedId === `par${par}`;
  return (
    <section aria-labelledby="why-grid-heading" className="flex flex-col gap-3" data-slot="par-length-grid">
      <h3 id="why-grid-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
        By par and hole length
      </h3>
      <table className="w-full table-fixed border-collapse text-body-sm">
        <caption className="sr-only">
          Missed greens of approaches from {view.bandLabel}, by par and hole length
          {grid.selectedLabel ? `; misses concentrate on ${grid.selectedLabel}` : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-16 pb-1 text-left text-caption font-medium text-text-tertiary">
              <span className="sr-only">Par</span>
            </th>
            {LENGTHS.map((l) => (
              <th key={l} scope="col" className="pb-1 text-left text-caption font-medium capitalize text-text-tertiary">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pars.map((p) => (
            <tr key={p}>
              <th scope="row" className="py-1 text-left text-caption font-medium text-text-secondary">
                Par {p}
              </th>
              {LENGTHS.map((l) => {
                const c = grid.cells.find((x) => x.par === p && x.length === l);
                const on = selected(p, l) && !!c;
                return (
                  <td key={l} className="p-0.5">
                    <div
                      className={
                        on
                          ? 'flex min-h-11 flex-col justify-center rounded-fw-sm px-2 ring-2 ring-text-primary'
                          : 'flex min-h-11 flex-col justify-center rounded-fw-sm px-2'
                      }
                      style={{ background: c && c.attempts > 0 ? `color-mix(in oklch, var(--fw-viz-div-neg) ${Math.round((c.misses / c.attempts) * 60)}%, var(--fw-color-surface))` : 'var(--fw-color-surface-sunken)' }}
                    >
                      {c ? (
                        <>
                          <span className="font-fw-mono tabular-nums text-text-primary">
                            {c.misses}/{c.attempts}
                          </span>
                          <span className="text-caption text-text-secondary">missed</span>
                        </>
                      ) : (
                        <span className="text-caption text-text-tertiary">–</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-text-tertiary">
        Hole length bands: par 3 under 150 / 150–189 / 190+ yd, par 4 under 380 / 380–429 / 430+, par 5 under 500 /
        500–539 / 540+.
      </p>
    </section>
  );
}

function pctText(v: number | null): string {
  return v === null ? '–' : `${Math.round(v)}%`;
}

/** The three ranges side by side (A2 distance profile), this one emphasised. */
function BandMetrics({ view, voice = PLAYER_VOICE }: { view: ApproachWhyView; voice?: Voice }) {
  if (view.metrics.length === 0) return null;
  return (
    <section aria-labelledby="why-bands-heading" className="flex flex-col gap-3" data-slot="band-metrics">
      <h3 id="why-bands-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
        This range against {voice.possessive} others
      </h3>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Approach results by distance range, last {view.rounds} rounds</caption>
        <thead>
          <tr className="text-caption text-text-tertiary">
            <th scope="col" className="pb-1 text-left font-medium">Range</th>
            <th scope="col" className="pb-1 text-right font-medium">Greens hit</th>
            <th scope="col" className="pb-1 text-right font-medium">Proximity on</th>
            <th scope="col" className="pb-1 text-right font-medium">Severe</th>
          </tr>
        </thead>
        <tbody>
          {view.metrics.map((m) => {
            const on = m.band === view.band;
            return (
              <tr key={m.band} className={on ? 'font-semibold text-text-primary' : 'text-text-secondary'} aria-current={on ? 'true' : undefined}>
                <th scope="row" className="py-1.5 text-left font-medium">
                  {m.label}
                </th>
                <td className="py-1.5 text-right font-fw-mono tabular-nums">
                  {pctText(m.greensPct)}
                  <span className="pl-1 text-caption font-normal text-text-tertiary">
                    {m.greensHit ?? 0}/{m.attempts}
                  </span>
                </td>
                <td className="py-1.5 text-right font-fw-mono tabular-nums">{m.proximityFt === null ? '–' : `${Math.round(m.proximityFt)} ft`}</td>
                <td className="py-1.5 text-right font-fw-mono tabular-nums">{pctText(m.severePct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-caption text-text-tertiary">
        – = too few shots to state (fewer than 10 over 3 rounds). Severe = a penalty, a bunker or other trouble. From 175+ yd,
        par-5 shots that did not find the green are left out as likely lay-ups.
      </p>
    </section>
  );
}

/** Length → par → shape for one approach range, read from recorded shots. */
function ApproachContextSection({ view, voice = PLAYER_VOICE }: { view: ApproachWhyView; voice?: Voice }) {
  const passed = view.narrowing.steps.filter((s) => s.passed);
  const stop = view.narrowing.steps.find((s) => !s.passed) ?? null;
  return (
    <div className="flex flex-col gap-6" data-slot="approach-context">
      <section aria-labelledby="why-where-heading" className="flex flex-col gap-2">
        <h3 id="why-where-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
          Where it concentrates
        </h3>
        {view.narrowing.path.length > 0 ? (
          <p className="font-fw-display text-title-2 text-text-primary">{view.narrowing.path.join(' → ')}</p>
        ) : null}
        <ol className="flex flex-col gap-1 text-body-sm text-text-primary">
          {passed.map((s) => (
            <li key={s.level}>{s.statement.charAt(0).toUpperCase() + s.statement.slice(1)}.</li>
          ))}
        </ol>
        {stop ? <p className="text-body-sm text-text-secondary">Not narrowed further: {stop.statement}.</p> : null}
        {view.strokesLost !== null ? (
          <p className="text-body-sm text-text-secondary">
            <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(view.strokesLost)}</span> strokes a round
            lost from {view.bandLabel}: {voice.possessive} approach strokes gained split shot by shot.
          </p>
        ) : null}
        <p className="text-caption text-text-tertiary">
          Read from {voice.possessive} last {view.rounds} counted rounds. Where the ball finished is recorded; why is not (club, wind and
          target are not logged), so this is where the misses gather, not what causes them.
        </p>
      </section>
      {view.compass ? <MissCompass compass={view.compass} /> : null}
      {view.grid ? <ParLengthGrid view={view} /> : null}
      <BandMetrics view={view} voice={voice} />
    </div>
  );
}

function Worth({ now, ifClosed }: { now: number; ifClosed: number }) {
  const lo = Math.floor(Math.min(now, ifClosed) - 1);
  const hi = Math.ceil(Math.max(now, ifClosed) + 1);
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 1) ticks.push(t);
  return (
    <section aria-labelledby="why-worth-heading" className="flex flex-col gap-3">
      <h3 id="why-worth-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
        What closing it is worth
      </h3>
      <svg
        role="img"
        aria-label={`Scoring average now ${now.toFixed(1)}; projected ${ifClosed.toFixed(1)} if this gap to the Tour closed.`}
        viewBox="0 0 100 20"
        className="h-12 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <line x1={0} x2={100} y1={12} y2={12} style={{ stroke: 'var(--fw-viz-axis)' }} vectorEffect="non-scaling-stroke" />
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={10} y2={14} style={{ stroke: 'var(--fw-viz-axis)' }} vectorEffect="non-scaling-stroke" />
        ))}
        <line
          x1={x(ifClosed)}
          x2={x(now)}
          y1={12}
          y2={12}
          style={{ stroke: 'var(--fw-color-accent-500)' }}
          strokeWidth={2}
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative -mt-2 h-10 text-caption">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 text-text-tertiary" style={{ left: `${x(t)}%` }}>
            {t}
          </span>
        ))}
      </div>
      <p className="text-body-sm text-text-secondary">
        Scoring average <span className="font-fw-mono tabular-nums text-text-primary">{now.toFixed(1)}</span> now,{' '}
        <span className="font-fw-mono tabular-nums text-fw-success-ink">{ifClosed.toFixed(1)}</span> if this gap to the Tour
        closed. A projection stored with the insight, not a promise.
      </p>
    </section>
  );
}

export function RootWhy({
  model,
  details,
  insights,
  greenView = null,
  approachWhy = null,
  audience = 'player',
  playerName,
  insightId,
  backLink,
  secondaryActions,
}: RootWhyProps) {
  const searchParams = useSearchParams();
  const id = insightId !== undefined ? insightId : searchParams.get('insight');
  const voice = voiceFor(audience, playerName);
  const isCoach = audience === 'coach';
  const insight = insights.find((i) => i.id === id) ?? null;
  const detail = id ? details[id] ?? null : null;
  const branch = findBranch(model, id);
  const area = branch ? model.losses.find((a) => a.area === branch.area) ?? null : null;
  const [open, setOpen] = useState(false);

  const back =
    backLink !== undefined ? (
      backLink
    ) : (
    <Link
      href={COACHHELM_HOME}
      className="inline-flex min-h-11 items-center gap-1 text-body-sm font-medium text-accent-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <ChevronLeft aria-hidden className="h-4 w-4" />
      Today
    </Link>
    );

  if (!insight || !detail) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        {isCoach ? (
          <EmptyState
            title={`This read is not on ${voice.possessive} map right now`}
            description="It may have been resolved, dismissed, or replaced by a newer read, or it has no stored evidence to draw. Pick a branch of the map above, or open the raw signal."
            action={secondaryActions}
          />
        ) : (
          <EmptyState
            title="This read is not on your map right now"
            description="It may have been resolved, dismissed, or replaced by a newer read. Your current map is on Today."
            action={
              <Button asChild variant="primary">
                <Link href={COACHHELM_HOME}>Back to Today</Link>
              </Button>
            }
          />
        )}
      </div>
    );
  }

  async function handleSubmit(payload: FocusAreaModalSubmit): Promise<{ success: boolean; error?: string }> {
    const res = await createFocusAreaFromInsightV2({
      playerId: payload.player_id,
      insightId: insight!.id,
      title: payload.title,
      description: payload.description ?? '',
      areaType: payload.area_type,
      targetMetric: payload.target_metric ?? undefined,
      targetValue: payload.target_value ?? undefined,
    });
    return { success: res.success, error: res.error };
  }

  const style = branch?.style ?? detail.style;

  return (
    <article className="flex min-w-0 flex-col gap-6" data-slot="root-why">
      {back}

      <nav aria-label="Path on the root map">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
          {area ? (
            <li className="font-medium text-text-secondary">
              {area.label} <span className="font-fw-mono tabular-nums">{formatStrokes(area.sg, { signed: true })}</span>
              <span aria-hidden className="pl-2 text-text-tertiary">›</span>
            </li>
          ) : null}
          <li className="font-medium text-text-secondary">
            {branch?.measured ? branch.label : detail.metricLabel}
            {branch ? <span className="pl-1 font-fw-mono tabular-nums">{formatStrokes(branch.strokes)}</span> : null}
            {detail.rootCause ? <span aria-hidden className="pl-2 text-text-tertiary">›</span> : null}
          </li>
          {detail.rootCause ? (
            <li className="flex min-w-0 items-center gap-1.5 font-medium text-text-primary">
              <span aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-sm" style={rootStyleCss(style)} />
              <span className="min-w-0 truncate">{detail.rootCause}</span>
            </li>
          ) : null}
        </ol>
      </nav>

      <header className="flex flex-col gap-3">
        <h2 className="font-fw-display text-title-1 text-text-primary md:text-h1">{detail.title}</h2>
        <SupportChips style={style} tier={detail.tier} audience={audience} />
        {detail.symptom ? <p className="text-body text-text-secondary">{detail.symptom}</p> : null}
        {branch?.measured ? (
          <div className="flex flex-col gap-1" data-slot="why-measured">
            <p className="text-body-sm text-text-primary">
              <span className="font-fw-mono tabular-nums">{formatStrokes(branch.strokes)}</span> strokes a round lost:{' '}
              {branch.title.toLowerCase()}, {branch.sizingNote}.
            </p>
            <MeasuredFacts branch={branch} />
          </div>
        ) : null}
      </header>


      <section aria-labelledby="why-root-heading" className="flex flex-col gap-2">
        <h3 id="why-root-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
          {style === 'observed' ? (isCoach ? 'Seen in shots' : 'Seen in your shots') : style === 'likely' ? 'The likely root' : style === 'forming' ? 'A root that is still forming' : 'Why'}
        </h3>
        {detail.whySentence ? (
          isCoach ? (
            <figure className="m-0 flex flex-col gap-1">
              <blockquote className="border-l-2 border-border-strong pl-3 text-body text-text-primary">
                {detail.whySentence}
              </blockquote>
              <figcaption className="text-caption text-text-tertiary">From the read as {voice.subject} sees it.</figcaption>
            </figure>
          ) : (
            <p className="text-body text-text-primary">{detail.whySentence}</p>
          )
        ) : (
          <p className="text-body text-text-primary">
            {detail.rootCause ?? 'The cause behind this one is not explained yet.'}
          </p>
        )}
        {detail.causality === 'inferred_hypothesis' && detail.rootCause ? (
          <p className="text-caption font-medium text-text-secondary" data-slot="why-inferred">
            {INFERRED_LABEL}
          </p>
        ) : null}
        {detail.driver ? (
          <p className="text-body-sm text-text-secondary">
            {detail.driver.label}:{' '}
            <span className="font-fw-mono tabular-nums text-text-primary">{formatValue(detail.driver.value, detail.driver.unit)}</span>
            {detail.driver.sampleN > 0 ? ` over ${detail.driver.sampleN} tracked` : ''}
          </p>
        ) : null}
        {detail.confidenceReason ? <p className="text-caption text-text-tertiary">{detail.confidenceReason}</p> : null}
        {detail.recommendedAction ? (
          <p className="text-body-sm text-text-primary">
            <span className="font-medium">What to work on: </span>
            {detail.recommendedAction}
          </p>
        ) : null}
      </section>

      {detail.sequence ? (
        <section aria-labelledby="why-how-heading" className="flex flex-col gap-2">
          <h3 id="why-how-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
            How it happens
          </h3>
          <p className="text-body text-text-primary">{detail.sequence.pattern}</p>
          <p className="text-body-sm text-text-secondary">
            {detail.sequence.occurrences} of {detail.sequence.of} {detail.sequence.population}, across{' '}
            {detail.sequence.distinct_rounds} rounds ({detail.sequence.window}).
          </p>
        </section>
      ) : null}

      <Disclosure title="The evidence" slot="why-evidence" bodyClassName="flex flex-col gap-6">
        <EvidenceCompare detail={detail} voice={voice} />
        {detail.angle ? <AngleWhy view={detail.angle} /> : null}
        {greenView && insight.category === 'putting' ? <GreenPlot view={greenView} voice={voice} /> : null}
        {approachWhy?.[insight.id] ? <ApproachContextSection view={approachWhy[insight.id]!} voice={voice} /> : null}
        {detail.projection ? <Worth now={detail.projection.now} ifClosed={detail.projection.ifClosed} /> : null}
      </Disclosure>

      <Button variant="primary" size="lg" fullWidth type="button" onClick={() => setOpen(true)}>
        {isCoach ? `Propose as a focus for ${voice.subject}` : 'Make this my focus'}
      </Button>
      {secondaryActions}
      <FocusAreaModal
        open={open}
        onOpenChange={setOpen}
        mode={isCoach ? 'coach' : 'player'}
        players={[{ id: insight.playerId, name: isCoach ? voice.subject : 'You' }]}
        playerStats={{}}
        playerId={insight.playerId}
        sourceInsightId={insight.id}
        initial={{
          player_id: insight.playerId,
          area_type: areaTypeFor(insight.category),
          title: detail.title,
          description: detail.content,
        }}
        onSubmit={handleSubmit}
      />
    </article>
  );
}
