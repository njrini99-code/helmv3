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
import { cn } from '@/lib/utils';
import {
  BarCompare,
  computeSeriesTrend,
  InstrumentTable,
  InstrumentTableToggle,
  MakeCurve,
  Sparkline,
  StrokesGainedTornado,
  TrendChart as FairwayTrendChart,
  TrendChip,
} from '@/components/fairway/charts';
import type { ChartTableData } from '@/components/fairway/charts';
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
function provenanceText(
  win: string | null,
  sampleSize: number,
  sampleUnit: string,
  asOf: string,
): string {
  return [win, sampleSize > 0 ? `${sampleSize} ${sampleUnit}` : null, `computed ${formatFreshness(asOf)}`]
    .filter(Boolean)
    .join(' · ');
}

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
  return (
    <p className="font-fw-sans text-caption text-text-tertiary">
      {provenanceText(win, sampleSize, sampleUnit, asOf)}
    </p>
  );
}

/**
 * Header + bare instrument + table readout, with NO card of its own.
 *
 * `ChartFrame` is the right shell for a Recharts chart, which is a naked SVG.
 * It is the wrong shell for the drill-hero instruments (`MakeCurve`,
 * `SprayField`, `BandHistogram`): those already carry their own card, and they
 * size themselves by aspect ratio. Putting one inside a ChartFrame produced a
 * card inside a card AND overflowed it — ChartFrame gives its child a fixed
 * `height` on an `absolute inset-0` box, so an aspect-ratio instrument taller
 * than that height painted straight over the metrics panel underneath it.
 *
 * This is the matching wrapper: the same header vocabulary and the same "view
 * as table" affordance, minus the box the instrument already brings.
 */
function InstrumentFigure({
  title,
  overline,
  subtitle,
  ariaLabel,
  tableData,
  children,
}: {
  title: string;
  overline?: string;
  subtitle?: string;
  ariaLabel: string;
  tableData?: ChartTableData;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = React.useState(false);
  const hasTable = Boolean(tableData && tableData.rows.length > 0);

  return (
    <figure className="flex flex-col gap-2.5">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {overline && (
            <p className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
              {overline}
            </p>
          )}
          <p className="font-fw-sans text-body-sm font-semibold text-text-primary">{title}</p>
          {subtitle && (
            <p className="font-fw-sans text-caption text-text-tertiary">{subtitle}</p>
          )}
        </div>
        {hasTable && (
          // `shrink-0` + `nowrap`: at 390px the flex row squeezed the toggle
          // until "View as table" broke across two lines beside a title that
          // still had room.
          <span className="shrink-0 whitespace-nowrap">
            <InstrumentTableToggle show={showTable} onToggle={() => setShowTable((v) => !v)} />
          </span>
        )}
      </figcaption>
      {showTable && tableData ? (
        <InstrumentTable data={tableData} />
      ) : (
        // The same containment ChartFrame applies, and for the same reason: an
        // instrument's SVG carries `role="img"` while hosting focusable nodes
        // inside it, which axe flags as `nested-interactive` (serious) and a
        // keyboard user experiences as Tab landing on something no screen
        // reader can describe. `inert` — not merely aria-hidden — takes the
        // subtree out of BOTH the tab order and the a11y tree; the table
        // toggle above is the accessible readout.
        <div role="img" aria-label={ariaLabel} className="relative w-full">
          <div aria-hidden inert className="w-full">
            {children}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Honest states, styled as information rather than error. */
function CoverageNotice({ envelope }: { envelope: ToolEnvelope }) {
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
function MetricPanel({
  measurements,
  series = [],
}: {
  measurements: Measurement[];
  /** Same-metric history, when the envelope carried it — drives the sparkline. */
  series?: MeasurementSeries[];
}) {
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
            {/*
              The metric's own history, when the same envelope carried it: a
              sparkline and a signed delta, both derived from ONE call to the
              shared classifier so the line's colour and the chip's verdict can
              never disagree.

              `goodDirection` comes off the measurement's own `direction` field.
              That field has been in the envelope all along and nothing was
              reading it, so putts-per-round — where DOWN is good — was drawn
              with the same up-is-good assumption as make rate. A chart that
              calls an improvement a decline is worse than no chart.
            */}
            <MetricTrend measurement={m} series={series} />
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

/**
 * `direction` → the chart vocabulary's `goodDirection`.
 *
 * Null means the tool did not say, and the honest default for an unlabelled
 * metric is the conventional one rather than a guess dressed as a verdict.
 */
function goodDirectionOf(direction: Measurement['direction']): 'up' | 'down' {
  return direction === 'lower_better' ? 'down' : 'up';
}

/**
 * A sparkline + signed delta for one metric, when its history is in the same
 * envelope.
 *
 * Rendered only when there are at least three readings — the same threshold the
 * full trend chart holds to. A two-point sparkline is a line segment, and it
 * would carry a trend verdict chip next to it, which is precisely the "his
 * putting is falling, off two rounds" failure the file's rule 1 exists to stop.
 */
function MetricTrend({
  measurement: m,
  series,
}: {
  measurement: Measurement;
  series: MeasurementSeries[];
}) {
  const history = series.find(
    (s) => s.metric_id === m.metric_id && s.entity.id === m.entity.id && s.points.length >= MIN_POINTS_FOR_CHART,
  );
  if (!history) return null;

  const values = history.points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < MIN_POINTS_FOR_CHART) return null;

  const goodDirection = goodDirectionOf(m.direction);

  // ONE call. The sparkline's colour and the chip's verdict both read this
  // result, so they cannot disagree — computing a delta separately for each is
  // the documented way this pair drifts apart.
  const trend = computeSeriesTrend(values, { goodDirection });
  if (!trend) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <Sparkline
        data={values}
        direction={trend.direction}
        goodDirection={goodDirection}
        label={m.metric_label}
        width={52}
        height={16}
      />
      <TrendChip
        direction={trend.direction}
        label={`${trend.value > 0 ? '+' : ''}${formatValue(trend.value, m.unit)}`}
      />
    </div>
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

// ---------------------------------------------------------------------------
// Trend chart
// ---------------------------------------------------------------------------

/**
 * Movement over time for one metric.
 *
 * The mean is drawn as a reference line so a reader can see whether the last
 * point is genuinely off-trend or just the normal spread — a line chart without
 * one invites reading every wiggle as a story.
 */
export function TrendChart({ series }: { series: MeasurementSeries }) {
  const points = series.points.map((p) => ({
    x: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(`${p.at.slice(0, 10)}T12:00:00Z`),
    ),
    y: p.value,
  }));

  if (points.length < MIN_POINTS_FOR_CHART) {
    // Rule 1: two points are a change, not a trend.
    return <SeriesAsTable series={series} />;
  }

  const values = series.points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // A real, versioned benchmark beats the series' own mean: "vs PGA Tour" is a
  // standard, "vs your own average" is a tautology. The mean is the fallback so
  // the chart always has a reference to read the last point against.
  const benchmark =
    series.benchmark && !series.benchmark.omitted_for_cohort
      ? { value: series.benchmark.value, label: series.benchmark.source }
      : { value: mean, label: 'avg' };

  return (
    <FairwayTrendChart
      title={series.metric_label}
      overline={series.entity.label}
      subtitle={provenanceText(
        formatWindow(series.window_start, series.window_end),
        points.length,
        'rounds',
        series.as_of,
      )}
      takeaway={`${series.metric_label} for ${series.entity.label}: ${formatValue(
        values[0]!,
        series.unit,
      )} to ${formatValue(values[values.length - 1]!, series.unit)} across ${points.length} rounds.`}
      data={points}
      benchmark={benchmark}
      valueFormatter={(v) => formatValue(v, series.unit)}
      height={200}
    />
  );
}

// ---------------------------------------------------------------------------
// Distance / bucket comparison
// ---------------------------------------------------------------------------

/**
 * Categorical comparison — putting by distance bucket being the case that
 * motivated it.
 *
 * A make rate across distance bands is a MAKE CURVE, not a bar chart: it is a
 * monotonic-ish decay every golf coach already reads by shape, and the sample
 * behind each band varies wildly (270 attempts inside 3ft, eleven from 25ft+).
 * `MakeCurve` encodes that sample in the dot radius and draws anything under
 * the reliability floor hollow, so a thin band cannot pass for a solid one.
 * That is the honest reading of the same numbers a uniform bar chart flattened.
 *
 * Everything else stays a bar comparison, which is what an unordered set of
 * categories actually is.
 */
function BucketChart({ series }: { series: MeasurementSeries }) {
  const points = series.points.map((p) => ({
    label: p.bucket ?? p.at,
    value: p.value,
    sample: p.sample_size,
  }));

  if (points.length === 0) return null;
  if (points.length < 2) return <SeriesAsTable series={series} />;

  const subtitle = provenanceText(
    formatWindow(series.window_start, series.window_end),
    points.reduce((a, d) => a + d.sample, 0),
    'attempts',
    series.as_of,
  );

  const tableData = {
    columns: [
      { key: 'band', label: 'Band' },
      { key: 'value', label: series.metric_label, numeric: true },
      { key: 'sample', label: 'Attempts', numeric: true },
    ],
    rows: points.map((d) => ({
      band: d.label,
      value: formatValue(d.value, series.unit),
      sample: d.sample,
    })),
    caption: `${series.metric_label} by band for ${series.entity.label}.`,
  };

  // A rate over ordered distance bands → make curve.
  if (series.unit === 'percent') {
    return (
      <InstrumentFigure
        title={series.metric_label}
        overline={series.entity.label}
        subtitle={subtitle}
        // `metric_label` already reads "Make rate by distance"; appending
        // "by distance" produced "Make rate by distance by distance for …".
        ariaLabel={`${series.metric_label} for ${series.entity.label}`}
        tableData={tableData}
      >
        <MakeCurve
          points={points.map((d) => ({ label: d.label, pct: d.value, n: d.sample }))}
          ariaLabel={`${series.metric_label} for ${series.entity.label}`}
        />
      </InstrumentFigure>
    );
  }

  return (
    <BarCompare
      title={series.metric_label}
      overline={series.entity.label}
      subtitle={subtitle}
      takeaway={points
        .map((d) => `${d.label}: ${formatValue(d.value, series.unit)}`)
        .join('; ')}
      data={points.map((d) => ({ label: d.label, value: d.value }))}
      valueFormatter={(v) => formatValue(v, series.unit)}
      height={Math.max(140, points.length * 34)}
    />
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
                    {/*
                      Strokes gained is a signed delta from a baseline (0 =
                      expectation): positive is a gain, negative is a loss. A
                      bare "+0.46"/"-3.92" carried no baseline, unit, or
                      direction cue — the product owner himself misread the
                      sign reading this exact table, so a coach would too.
                      TrendChip's documented "signed magnitude" mode (see its
                      `label` prop doc) reads the EXISTING value's own sign
                      against the metric's own `direction` — never assumed —
                      and paints it with the same fw-success/fw-warning tokens
                      the rest of the app uses for this. No fabricated
                      benchmark, just the number made legible.
                    */}
                    {m && m.unit === 'strokes' && m.value !== null ? (
                      <TrendChip
                        delta={m.value}
                        goodDirection={goodDirectionOf(m.direction)}
                        label={formatValue(m.value, m.unit)}
                        numeric
                        size="sm"
                      />
                    ) : (
                      <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                        {m ? formatValue(m.value, m.unit) : '—'}
                      </span>
                    )}
                    {/* Plain-language sample size, same vocabulary as
                        `provenanceText()`/`ProvenanceLine` elsewhere in this
                        file (e.g. "11 rounds") — "n=11" is unexplained jargon
                        for a golf coach. */}
                    {m && m.sample_size > 0 && (
                      <span className="ml-1.5 font-fw-sans text-caption text-text-tertiary">
                        {m.sample_size} {m.sample_unit}
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
function RankingList({ measurements }: { measurements: Measurement[] }) {
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

  // A strokes-gained breakdown is a DIVERGING quantity — every category is a
  // signed distance from a baseline, and the question the coach is asking is
  // "which side of zero, and by how much". Four KPI tiles reading −0.8, +0.3,
  // −1.2, +0.1 make that comparison arithmetic; a tornado makes it a shape.
  const sg = strokesGainedCategories(envelope.measurements);

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
      {envelope.series.length === 0 && !isComparison && !isRanking && sg && (
        <StrokesGainedTornado
          title="Strokes gained"
          overline={sg.entityLabel}
          subtitle={sg.subtitle}
          takeaway={sg.takeaway}
          data={sg.data}
          height={Math.max(150, sg.data.length * 40)}
        />
      )}
      {envelope.series.length === 0 && !isComparison && !isRanking && !sg && (
        <MetricPanel measurements={envelope.measurements} series={envelope.series} />
      )}

      <CoverageNotice envelope={envelope} />
    </div>
  );
}

/**
 * Recognise a strokes-gained breakdown.
 *
 * Keyed on the unit plus the `sg_` metric-id prefix rather than on label text,
 * so a relabelled category still routes correctly and an unrelated `strokes`
 * metric does not get swept in. Needs at least two categories — a single
 * signed number is a figure, not a breakdown, and renders better as a tile.
 */
function strokesGainedCategories(measurements: Measurement[]): {
  data: { label: string; value: number }[];
  entityLabel?: string;
  subtitle: string;
  takeaway: string;
} | null {
  const sg = measurements.filter(
    (m) => m.unit === 'strokes' && m.metric_id.startsWith('sg_') && m.value !== null,
  );
  if (sg.length < 2) return null;

  const entities = new Set(sg.map((m) => m.entity.label));
  const first = sg[0]!;
  const worst = [...sg].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]!;

  return {
    data: sg.map((m) => ({
      // "Strokes gained: putting" → "Putting". The chart's own title already
      // says strokes gained; repeating it in every row label eats the gutter.
      label: m.metric_label.replace(/^strokes gained[:\s-]*/i, '').trim() || m.metric_label,
      value: m.value ?? 0,
    })),
    entityLabel: entities.size === 1 ? first.entity.label : undefined,
    subtitle: provenanceText(
      formatWindow(first.window_start, first.window_end),
      first.sample_size,
      first.sample_unit,
      first.as_of,
    ),
    takeaway: `Largest loss: ${worst.metric_label} at ${formatValue(worst.value, worst.unit)}.`,
  };
}
