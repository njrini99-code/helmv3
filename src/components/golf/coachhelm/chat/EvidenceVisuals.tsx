'use client';

/**
 * ============================================================================
 * CoachHelm · chat · evidence visuals
 * ----------------------------------------------------------------------------
 * The typed renderers. Each one draws from a {@link ToolEnvelope} — values that
 * came back from a tool with their unit, window, sample size and as-of stamp
 * attached. The model never generates a chart, an SVG, or chart code; it names
 * what to look up, and these components draw what came back.
 *
 * Three rules the visuals hold to, each earned:
 *
 *   1. A chart needs at least three observations. Two points drawn as a line
 *      say "trend" about something that is a single change, and "his putting is
 *      falling" off two rounds is the most common way this kind of surface
 *      misleads a coach. Below the threshold it renders as a metric block.
 *
 *   2. Direction is read from the data, never assumed. For putts per round,
 *      down is good. A chart that colours "up" green regardless is wrong half
 *      the time and confidently so.
 *
 *   3. Sample size and freshness are on the chart, not in a tooltip. A coach
 *      deciding practice priorities from a 4-attempt bucket should be able to
 *      see that without hovering.
 * ========================================================================== */

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type {
  Measurement,
  MeasurementSeries,
  ToolEnvelope,
} from '@/lib/coachhelm/v3/chat/provenance';

/** Below this, a "trend" is not a trend. See rule 1 above. */
const MIN_POINTS_FOR_CHART = 3;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatValue(value: number | null, unit: Measurement['unit']): string {
  if (value === null || !Number.isFinite(value)) return '—';
  switch (unit) {
    case 'percent':
      return `${Math.round(value)}%`;
    case 'strokes':
      return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
    case 'score':
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    case 'yards':
      return `${Math.round(value)} yds`;
    case 'feet':
      return `${Math.round(value)} ft`;
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

/** "Mar 4 – Jul 22", or a single date, or null when there is no window. */
function formatWindow(start: string | null, end: string | null): string | null {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(`${iso.slice(0, 10)}T12:00:00Z`),
    );
  if (start && end && start.slice(0, 10) !== end.slice(0, 10)) return `${fmt(start)} – ${fmt(end)}`;
  if (end) return fmt(end);
  if (start) return fmt(start);
  return null;
}

/** "computed 2 hours ago" — freshness the coach can act on. */
function formatFreshness(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

/**
 * The line under every visual: window, sample size, freshness.
 *
 * Deliberately always present and always in the same place. A coach learns
 * where to look for "how much data is this?" once, and then it is free.
 */
function ProvenanceLine({
  window: win,
  sampleSize,
  sampleUnit,
  asOf,
}: {
  window: string | null;
  sampleSize: number;
  sampleUnit: string;
  asOf: string;
}) {
  const bits = [
    win,
    sampleSize > 0 ? `${sampleSize} ${sampleUnit}` : null,
    `computed ${formatFreshness(asOf)}`,
  ].filter(Boolean);
  return (
    <p className="font-fw-sans text-caption text-text-tertiary">{bits.join(' · ')}</p>
  );
}

/** Honest states, styled as information rather than error. */
export function CoverageNotice({ envelope }: { envelope: ToolEnvelope }) {
  if (envelope.coverage === 'complete' || !envelope.coverage_note) return null;

  const isFailure = envelope.coverage === 'unavailable';
  return (
    <div
      className={cn(
        'rounded-fw-md border px-3 py-2',
        isFailure
          ? 'border-border-strong bg-surface-sunken'
          : 'border-border-subtle bg-surface-sunken',
      )}
    >
      <p className="font-fw-sans text-caption text-text-secondary">
        <span className="font-medium text-text-primary">
          {isFailure ? 'Could not read this' : envelope.coverage === 'empty' ? 'No data yet' : 'Partial data'}
        </span>{' '}
        — {envelope.coverage_note}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric block — what a single observation renders as
// ---------------------------------------------------------------------------

/**
 * Several related numbers, as ONE panel.
 *
 * This replaces a stack of `MetricBlock` cards, and the reason is visible the
 * moment a coach asks about putting: four measurements came back and rendered
 * as four full-width cards, ~470px of column for four numbers, each repeating
 * the identical line "May 18 – Jul 10 · 15 rounds · computed 5 days ago". Four
 * boxes, one fact each, the same footnote four times.
 *
 * The metrics in one envelope almost always share a window, a sample and an
 * as-of stamp — they are one measurement of one player. So they are one block
 * with one provenance line, and the numbers sit in a row where they can be
 * compared. Where the provenance genuinely differs, it stays per-metric and the
 * shared line is dropped rather than asserting a window that is not true of
 * every value.
 *
 * The pattern is the standard one for related KPIs — a calm row, detail on
 * demand — rather than a vertical wall of equally-weighted cards.
 */
export function MetricPanel({ measurements }: { measurements: Measurement[] }) {
  const shown = measurements.filter((m) => m.value !== null).slice(0, 6);
  if (shown.length === 0) return null;

  const first = shown[0]!;

  // The WINDOW is nearly always shared even when the sample is not: a putting
  // answer measures the same 15 rounds but counts three-putt rate in holes and
  // strokes gained in rounds. Keying the shared line on the whole stamp meant
  // one differing unit sent the identical date range back onto all four cells.
  // So the window and the as-of are shared whenever they agree, and only the
  // part that genuinely differs — the sample — stays per-metric.
  const sharedWindow =
    shown.every(
      (m) => m.window_start === first.window_start && m.window_end === first.window_end,
    ) && shown.every((m) => m.as_of === first.as_of);
  const sharedSample = shown.every(
    (m) => m.sample_size === first.sample_size && m.sample_unit === first.sample_unit,
  );

  // One entity → name it once above the row instead of on every cell.
  const entities = new Set(shown.map((m) => m.entity.label));
  const entityLabel = entities.size === 1 ? first.entity.label : null;

  return (
    <section className="rounded-card border border-border-subtle bg-surface p-4">
      {entityLabel && (
        <p className="mb-3 font-fw-sans text-body-sm font-semibold text-text-primary">
          {entityLabel}
        </p>
      )}

      <div
        className={cn(
          'grid gap-x-6 gap-y-5',
          // Two up on a phone, four across from `sm`. A single metric keeps the
          // full width rather than sitting in a lonely quarter-column.
          shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        {shown.map((m) => (
          <div key={`${m.entity.id}-${m.metric_id}`} className="min-w-0">
            <p className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
              {m.metric_label}
            </p>
            <p className="mt-1.5 font-fw-mono text-h2 font-semibold tabular-nums leading-none text-text-primary">
              {formatValue(m.value, m.unit)}
            </p>
            {/* A reference label under the figure: what it is out of, or what
                it is measured against. This is where a bare number becomes a
                judgement — 27% means nothing until you know it is 27% of 270. */}
            <MetricReference measurement={m} />
            {!sharedSample && m.sample_size > 0 && (
              <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
                {m.sample_size} {m.sample_unit}
                {!sharedWindow && ` · ${formatWindow(m.window_start, m.window_end) ?? ''}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {sharedWindow && (
        <div className="mt-4 border-t border-border-subtle pt-2.5">
          <ProvenanceLine
            window={formatWindow(first.window_start, first.window_end)}
            sampleSize={sharedSample ? first.sample_size : 0}
            sampleUnit={first.sample_unit}
            asOf={first.as_of}
          />
        </div>
      )}

      {shown.some((m) => m.coverage_note) && (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
          {shown.find((m) => m.coverage_note)?.coverage_note}
        </p>
      )}
    </section>
  );
}

/** The denominator, or the benchmark — whichever this metric actually has. */
function MetricReference({ measurement: m }: { measurement: Measurement }) {
  if (m.denominator !== null && m.unit === 'percent' && m.value !== null) {
    return (
      <p className="mt-1 font-fw-sans text-caption text-text-secondary">
        {Math.round((m.value / 100) * m.denominator)} of {m.denominator}
      </p>
    );
  }
  if (m.benchmark && !m.benchmark.omitted_for_cohort) {
    return (
      <p className="mt-1 font-fw-sans text-caption text-text-secondary">
        {m.benchmark.source} {formatValue(m.benchmark.value, m.unit)}
      </p>
    );
  }
  return null;
}

export function MetricBlock({ measurement }: { measurement: Measurement }) {
  const m = measurement;
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-4">
      <p className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        {m.metric_label}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-fw-mono text-h2 font-semibold tabular-nums leading-none text-text-primary">
          {formatValue(m.value, m.unit)}
        </span>
        {m.denominator !== null && m.unit === 'percent' && m.value !== null && (
          <span className="font-fw-sans text-caption text-text-tertiary">
            {Math.round((m.value / 100) * m.denominator)} of {m.denominator}
          </span>
        )}
      </p>
      <div className="mt-2">
        <ProvenanceLine
          window={formatWindow(m.window_start, m.window_end)}
          sampleSize={m.sample_size}
          sampleUnit={m.sample_unit}
          asOf={m.as_of}
        />
      </div>
      {m.coverage_note && (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">{m.coverage_note}</p>
      )}
      {m.benchmark && !m.benchmark.omitted_for_cohort && (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
          {m.benchmark.source} ({m.benchmark.version}): {formatValue(m.benchmark.value, m.unit)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart
// ---------------------------------------------------------------------------

interface TrendPoint {
  label: string;
  value: number;
  sample: number;
}

interface EndpointLabelProps {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
}

/**
 * Print the first and last reading on the line itself.
 *
 * Direct labelling, rather than making the reader trace a point back to an axis
 * — the axis is gone for exactly this reason. Interior points stay unlabelled:
 * labelling all five would collide at this width and would re-clutter what
 * removing the grid just cleared.
 */
function EndpointLabel({
  x,
  y,
  value,
  index,
  total,
  unit,
}: EndpointLabelProps & { total: number; unit: Measurement['unit'] }) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  if ((!isFirst && !isLast) || typeof value !== 'number') return null;
  const cx = Number(x);
  const cy = Number(y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  return (
    <text
      x={cx}
      y={cy - 9}
      textAnchor={isFirst ? 'start' : 'end'}
      fontSize={11}
      fontWeight={600}
      className="font-fw-mono"
      fill={isLast ? 'var(--fw-color-text-primary)' : 'var(--fw-color-text-tertiary)'}
    >
      {formatValue(value, unit)}
    </text>
  );
}

/**
 * Movement over time for one metric.
 *
 * The mean is drawn as a reference line so a reader can see whether the last
 * point is genuinely off-trend or just the normal spread — a line chart without
 * one invites reading every wiggle as a story.
 */
export function TrendChart({ series }: { series: MeasurementSeries }) {
  const points: TrendPoint[] = series.points.map((p) => ({
    label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(`${p.at.slice(0, 10)}T12:00:00Z`),
    ),
    value: p.value,
    sample: p.sample_size,
  }));

  if (points.length < MIN_POINTS_FOR_CHART) {
    // Rule 1: two points are a change, not a trend.
    return <SeriesAsTable series={series} />;
  }

  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.2, 0.5);

  const summary = `${series.metric_label} for ${series.entity.label} across ${points.length} rounds, from ${formatValue(points[0]!.value, series.unit)} to ${formatValue(points[points.length - 1]!.value, series.unit)}.`;

  return (
    <figure className="rounded-card border border-border-subtle bg-surface p-4">
      <figcaption className="mb-3">
        <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
          {series.metric_label}
          <span className="ml-2 font-normal text-text-tertiary">{series.entity.label}</span>
          {/* The mean, stated in words next to the title rather than as a label
              floating on the plot. On the plot it landed on top of the first
              endpoint label whenever an early round sat near the average —
              which is most of the time, that being what an average is. */}
          <span className="ml-2 font-fw-mono font-normal tabular-nums text-text-secondary">
            avg {formatValue(mean, series.unit)}
          </span>
        </p>
        <ProvenanceLine
          window={formatWindow(series.window_start, series.window_end)}
          sampleSize={points.length}
          sampleUnit="rounds"
          asOf={series.as_of}
        />
      </figcaption>

      {/* The chart is decorative to a screen reader; the sentence below is the
          accessible equivalent, and it says the same thing. */}
      <div className="h-[180px] w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {/* Real margins now that the Y axis is gone. `left: -18` was pulling
              the plot under where the axis used to be, which clipped the first
              endpoint label's minus sign clean off. */}
          <AreaChart data={points} margin={{ top: 20, right: 28, bottom: 0, left: 26 }}>
            <defs>
              <linearGradient id="fw-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--fw-color-accent-500)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--fw-color-accent-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/*
              No grid, no Y axis.

              Both were drawing a lattice around five data points. The Y axis
              in particular cost 44px of the column to print numbers the reader
              then had to trace back horizontally — while the values themselves
              were only available on hover. The mean line is the reference this
              chart actually needs, and it is labelled in place; the first and
              last values are printed on the line itself, which is where the
              question "where did he start and where is he now" is answered.
            */}
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--fw-color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
              // Roughly five dates, not one per round. Ten rounds printed ten
              // labels — including the same day twice when two rounds fell on
              // it — which crowded the axis with dates nobody is reading
              // individually. The line's shape is the finding; the dates are
              // there to anchor its ends.
              interval={Math.max(0, Math.ceil(points.length / 5) - 1)}
              minTickGap={24}
            />
            <YAxis domain={[min - pad, max + pad]} hide />
            <ReferenceLine y={mean} stroke="var(--fw-color-border-strong)" strokeDasharray="2 4" />
            <Tooltip
              cursor={{ stroke: 'var(--fw-color-border-strong)' }}
              contentStyle={{
                background: 'var(--fw-color-surface)',
                border: '1px solid var(--fw-color-border-subtle)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(v) => [formatValue(typeof v === 'number' ? v : null, series.unit), series.metric_label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--fw-color-accent-600)"
              strokeWidth={1.75}
              fill="url(#fw-trend-fill)"
              // Fill DOWN from the line, always.
              //
              // Recharts fills to y=0 by default. Strokes gained is negative,
              // so zero sat above every reading and the wash rendered as a
              // block ABOVE the curve — the shaded region read as the subject
              // and the line as its edge. Anchoring to the bottom of the domain
              // makes the fill mean the same thing on every metric, whichever
              // side of zero it happens to live on.
              baseValue="dataMin"
              // Only the endpoints get a dot. A marker on every reading turns a
              // five-round line into a row of beads and implies each point is
              // separately meaningful; the shape is the finding, and the two
              // ends are what the reader is comparing.
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="value"
                content={(props) => (
                  <EndpointLabel
                    {...(props as EndpointLabelProps)}
                    total={points.length}
                    unit={series.unit}
                  />
                )}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="sr-only">{summary}</p>
      {series.coverage_note && (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">{series.coverage_note}</p>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Distance / bucket comparison
// ---------------------------------------------------------------------------

/**
 * Categorical comparison — putting by distance bucket being the case that
 * motivated it.
 *
 * Bars under ten attempts are drawn muted rather than hidden. Hiding them would
 * misrepresent the range the player actually faced; muting says "this is real
 * but thin", which is the honest reading.
 */
export function BucketChart({ series }: { series: MeasurementSeries }) {
  const data = series.points.map((p) => ({
    label: p.bucket ?? p.at,
    value: p.value,
    sample: p.sample_size,
    thin: p.sample_size > 0 && p.sample_size < 10,
  }));

  if (data.length === 0) return null;
  if (data.length < 2) return <SeriesAsTable series={series} />;

  const summary = data
    .map((d) => `${d.label}: ${formatValue(d.value, series.unit)} over ${d.sample} attempts`)
    .join('; ');

  return (
    <figure className="rounded-card border border-border-subtle bg-surface p-4">
      <figcaption className="mb-3">
        <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
          {series.metric_label}
          <span className="ml-2 font-normal text-text-tertiary">{series.entity.label}</span>
        </p>
        <ProvenanceLine
          window={formatWindow(series.window_start, series.window_end)}
          sampleSize={data.reduce((a, d) => a + d.sample, 0)}
          sampleUnit="attempts"
          asOf={series.as_of}
        />
      </figcaption>

      <div className="h-[180px] w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }}>
            {/*
              Grid and Y axis removed for the same reason as the trend: the
              value is printed on top of its own bar, so nothing has to be
              traced back to a scale. What is left is the bars and their labels.
            */}
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--fw-color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'var(--fw-color-surface-sunken)' }}
              contentStyle={{
                background: 'var(--fw-color-surface)',
                border: '1px solid var(--fw-color-border-subtle)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(v, _name, item) => [
                `${formatValue(typeof v === 'number' ? v : null, series.unit)} · ${
                  ((item as { payload?: { sample?: number } } | undefined)?.payload?.sample ?? 0)
                } attempts`,
                series.metric_label,
              ]}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              {/*
                `accent-600` at full saturation across every bar made the chart
                a block of solid green — the strongest colour on a cream page,
                spent uniformly, so it distinguished nothing. The scale now
                carries meaning: a thin sample stays visibly lighter (it is real
                data, so it is never hidden — see the note above), and the rest
                sit at a weight the labels can be read against.
              */}
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.thin ? 'var(--fw-color-accent-200)' : 'var(--fw-color-accent-500)'}
                />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                offset={6}
                fontSize={11}
                fontWeight={600}
                className="font-fw-mono"
                fill="var(--fw-color-text-primary)"
                formatter={(v: unknown) =>
                  formatValue(typeof v === 'number' ? v : null, series.unit)
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="sr-only">{summary}</p>
      {series.coverage_note && (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">{series.coverage_note}</p>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** A series too short to chart, shown as the facts it actually is. */
function SeriesAsTable({ series }: { series: MeasurementSeries }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-4">
      <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
        {series.metric_label}
        <span className="ml-2 font-normal text-text-tertiary">{series.entity.label}</span>
      </p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
        {series.points.map((p, i) => (
          <React.Fragment key={i}>
            <dt className="font-fw-sans text-body-sm text-text-secondary">{p.bucket ?? p.at.slice(0, 10)}</dt>
            <dd className="font-fw-mono text-body-sm tabular-nums text-text-primary">
              {formatValue(p.value, series.unit)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="mt-3">
        <ProvenanceLine
          window={formatWindow(series.window_start, series.window_end)}
          sampleSize={series.points.reduce((a, p) => a + p.sample_size, 0)}
          sampleUnit="observations"
          asOf={series.as_of}
        />
      </div>
    </div>
  );
}

/**
 * Multi-player comparison table.
 *
 * Sample size is a COLUMN, not a footnote, because an unequal basis is the
 * thing most likely to make the comparison wrong and it should be as legible as
 * the values themselves.
 */
export function ComparisonTable({ measurements }: { measurements: Measurement[] }) {
  const players = [...new Set(measurements.map((m) => m.entity.label))];
  const metrics = [...new Set(measurements.map((m) => m.metric_id))];
  const find = (player: string, metric: string) =>
    measurements.find((m) => m.entity.label === player && m.metric_id === metric);

  if (players.length < 2 || metrics.length === 0) return null;
  const labelOf = (id: string) => measurements.find((m) => m.metric_id === id)?.metric_label ?? id;

  return (
    <div className="overflow-x-auto rounded-card border border-border-subtle bg-surface">
      <table className="w-full min-w-[420px] border-collapse">
        <caption className="sr-only">
          Comparison of {players.join(' and ')} across {metrics.length} metrics, with sample sizes.
        </caption>
        <thead>
          <tr className="border-b border-border-subtle">
            <th scope="col" className="px-4 py-2.5 text-left font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
              Metric
            </th>
            {players.map((p) => (
              <th key={p} scope="col" className="px-4 py-2.5 text-right font-fw-sans text-body-sm font-semibold text-text-primary">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric} className="border-b border-border-subtle last:border-0">
              <th scope="row" className="px-4 py-2.5 text-left font-fw-sans text-body-sm font-normal text-text-secondary">
                {labelOf(metric)}
              </th>
              {players.map((p) => {
                const m = find(p, metric);
                return (
                  <td key={p} className="px-4 py-2.5 text-right">
                    <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                      {m ? formatValue(m.value, m.unit) : '—'}
                    </span>
                    {m && m.sample_size > 0 && (
                      <span className="ml-1.5 font-fw-sans text-caption text-text-tertiary">
                        n={m.sample_size}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranked list on one metric. Names a measured value — never a verdict. */
export function RankingList({ measurements }: { measurements: Measurement[] }) {
  const withValue = measurements.filter((m) => m.value !== null);
  if (withValue.length === 0) return null;
  const label = withValue[0]!.metric_label;
  const unit = withValue[0]!.unit;

  return (
    <div className="rounded-card border border-border-subtle bg-surface p-4">
      <p className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">{label}</p>
      <ol className="mt-3 flex flex-col gap-1.5">
        {withValue.map((m) => (
          <li key={m.entity.id} className="flex items-baseline justify-between gap-3">
            <span className="truncate font-fw-sans text-body-sm text-text-primary">{m.entity.label}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                {formatValue(m.value, unit)}
              </span>
              <span className="font-fw-sans text-caption text-text-tertiary">n={m.sample_size}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
        {measurements.length - withValue.length > 0
          ? `${measurements.length - withValue.length} player${measurements.length - withValue.length === 1 ? '' : 's'} have no recorded data for this.`
          : `computed ${formatFreshness(withValue[0]!.as_of)}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

/**
 * Pick the right visual for one tool's output.
 *
 * The choice is made from the SHAPE of the evidence, not from what the model
 * asked for: a series long enough to chart becomes a chart, a set of players on
 * shared metrics becomes a comparison, one number becomes a metric block. That
 * keeps the decision in one place and means a new tool returning a familiar
 * shape renders correctly without new code.
 */
export function EvidenceRenderer({ envelope }: { envelope: ToolEnvelope }) {
  if (envelope.coverage === 'unavailable' || envelope.coverage === 'empty') {
    return <CoverageNotice envelope={envelope} />;
  }

  const bucketSeries = envelope.series.filter((s) => s.points.some((p) => p.bucket !== null));
  const timeSeries = envelope.series.filter((s) => s.points.every((p) => p.bucket === null));

  const distinctPlayers = new Set(envelope.measurements.map((m) => m.entity.id));
  const distinctMetrics = new Set(envelope.measurements.map((m) => m.metric_id));

  const isComparison = distinctPlayers.size >= 2 && distinctMetrics.size >= 1 && envelope.series.length === 0;
  const isRanking = distinctPlayers.size >= 3 && distinctMetrics.size === 1;

  return (
    <div className="flex flex-col gap-3">
      {timeSeries.map((s, i) => (
        <TrendChart key={`t${i}`} series={s} />
      ))}
      {bucketSeries.map((s, i) => (
        <BucketChart key={`b${i}`} series={s} />
      ))}

      {envelope.series.length === 0 && isRanking && <RankingList measurements={envelope.measurements} />}
      {envelope.series.length === 0 && isComparison && !isRanking && (
        <ComparisonTable measurements={envelope.measurements} />
      )}
      {envelope.series.length === 0 && !isComparison && !isRanking && (
        <MetricPanel measurements={envelope.measurements} />
      )}

      <CoverageNotice envelope={envelope} />
    </div>
  );
}
