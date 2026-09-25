'use client';

/**
 * ============================================================================
 * RootWhy: the drill view for one branch of the root map
 * (`/golf/dashboard/coachhelm?view=root&insight=<id>`)
 * ----------------------------------------------------------------------------
 * Breadcrumb path (area → cause → root), headline, support + confidence
 * chips, the evidence visual, the stored diagnosis, "How it happens" (only
 * when the diagnosis stored a traced shot sequence), what closing it is
 * worth (only when the insight stores a scoring projection), and ONE primary
 * action: make it a focus (the existing `createFocusAreaFromInsightV2` path
 * through the shared `FocusAreaModal`).
 *
 * Putting branches also get the top-down green (`GreenPlot`): recorded 4-6 ft
 * putts placed by slope (`golf_shots.putt_slope`, recorded on ~96% of putts)
 * and distance, with a make rate per region. It is omitted below its sample
 * gate (see `buildGreenView`). Other branches show only the generic evidence
 * visual (your value against the comparison, with the sample).
 * ========================================================================== */

import { useState } from 'react';
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
  type RootMapModel,
} from '@/lib/coachhelm/root-map/build-root-map';
import { COACHHELM_HOME } from './RootToday';
import { SupportChips } from './RootToday';
import { rootStyleCss } from './RootMap';
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
}

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

function EvidenceCompare({ detail }: { detail: BranchDetail }) {
  const marks = [
    { key: 'you', label: 'You', value: detail.yourValue, display: formatValue(detail.yourValue, detail.unit, detail.yourDisplay ?? undefined) },
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
        aria-label={`${detail.metricLabel}: you ${marks[0]!.display}; ${marks
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
function GreenPlot({ view }: { view: GreenView }) {
  const c = GREEN_CENTER;
  const diag = (GREEN_MAX_FT + 0.5) * GREEN_PX_PER_FT * Math.SQRT1_2;
  return (
    <section aria-labelledby="why-green-heading" className="flex flex-col gap-3" data-slot="green-plot">
      <h3 id="why-green-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
        Your putts from {GREEN_MIN_FT}–{GREEN_MAX_FT} ft
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
        Across your last {view.rounds} rounds. Position around the hole is illustrative; distance and slope are recorded.
      </p>
    </section>
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

export function RootWhy({ model, details, insights, greenView = null }: RootWhyProps) {
  const searchParams = useSearchParams();
  const id = searchParams.get('insight');
  const insight = insights.find((i) => i.id === id) ?? null;
  const detail = id ? details[id] ?? null : null;
  const branch = findBranch(model, id);
  const area = branch ? model.losses.find((a) => a.area === branch.area) ?? null : null;
  const [open, setOpen] = useState(false);

  const back = (
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
        <EmptyState
          title="This read is not on your map right now"
          description="It may have been resolved, dismissed, or replaced by a newer read. Your current map is on Today."
          action={
            <Button asChild variant="primary">
              <Link href={COACHHELM_HOME}>Back to Today</Link>
            </Button>
          }
        />
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
            {detail.metricLabel}
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
        <SupportChips style={style} tier={detail.tier} />
        {detail.symptom ? <p className="text-body text-text-secondary">{detail.symptom}</p> : null}
      </header>

      <EvidenceCompare detail={detail} />

      {greenView && insight.category === 'putting' ? <GreenPlot view={greenView} /> : null}

      <section aria-labelledby="why-root-heading" className="flex flex-col gap-2">
        <h3 id="why-root-heading" className="border-b border-text-primary pb-2 font-fw-display text-body-lg font-semibold text-text-primary">
          {style === 'observed' ? 'Seen in your shots' : style === 'likely' ? 'The likely root' : style === 'forming' ? 'A root that is still forming' : 'Why'}
        </h3>
        <p className="text-body text-text-primary">
          {detail.rootCause ?? 'The cause behind this one is not explained yet.'}
        </p>
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

      {detail.projection ? <Worth now={detail.projection.now} ifClosed={detail.projection.ifClosed} /> : null}

      <Button variant="primary" size="lg" fullWidth type="button" onClick={() => setOpen(true)}>
        Make this my focus
      </Button>
      <FocusAreaModal
        open={open}
        onOpenChange={setOpen}
        mode="player"
        players={[{ id: insight.playerId, name: 'You' }]}
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
