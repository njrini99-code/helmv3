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

import { cn } from '@/lib/utils';
import { computeSeriesTrend, Sparkline, TrendChip } from '@/components/fairway/charts';
import { dotRadiusForN, isHollowDot } from '@/components/fairway/charts/MakeCurve';
import { InlineNotice } from '@/components/fairway/feedback';
import { BarRows, DivergingRows, EvidenceCard, Headline, LineFigure } from './EvidenceFigures';
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
  // A typographic minus (U+2212), the width of the plus sign, so signed
  // columns align and "−0.42" does not read as a hyphenated word.
  return formatUnsigned(value, unit).replace(/^-/, '\u2212');
}

function formatUnsigned(value: number, unit: Measurement['unit']): string {
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


/** "Sep 26" — the x-axis and headline vocabulary. */
function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00Z`),
  );
}

/** "1 player", "3 players". */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

/**
 * The line under every visual: window, sample size, freshness.
 *
 * Deliberately always present and always in the same place — the card's foot.
 * A coach learns where to look for "how much data is this?" once, and then it
 * is free.
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

/** "Lower is better" — said once, where the verdict is, for metrics where it is true. */
function directionNote(direction: Measurement['direction']): string | null {
  return direction === 'lower_better' ? 'lower is better' : null;
}

/** Honest states, styled as information rather than error. */
export function CoverageNotice({ envelope }: { envelope: ToolEnvelope }) {
  if (envelope.coverage === 'complete' || !envelope.coverage_note) return null;

  const isFailure = envelope.coverage === 'unavailable';
  return (
    <InlineNotice
      tone={isFailure ? 'warning' : 'info'}
      title={isFailure ? 'Could not read this' : envelope.coverage === 'empty' ? 'No data yet' : 'Partial data'}
    >
      {envelope.coverage_note}
    </InlineNotice>
  );
}

// ---------------------------------------------------------------------------
// Metric panel — what single observations render as
// ---------------------------------------------------------------------------

/**
 * Several related numbers, as ONE panel.
 *
 * The metrics in one envelope almost always share a window, a sample and an
 * as-of stamp — they are one measurement of one player. So they are one card
 * with one provenance line, and the numbers sit in a row of cells where they
 * can be compared. Where the provenance genuinely differs, it stays per-metric
 * and the shared line is dropped rather than asserting a window that is not
 * true of every value.
 */
export function MetricPanel({
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
  // strokes gained in rounds. So the window and the as-of are shared whenever
  // they agree, and only the part that genuinely differs — the sample — stays
  // per-metric.
  const sharedWindow =
    shown.every(
      (m) => m.window_start === first.window_start && m.window_end === first.window_end,
    ) && shown.every((m) => m.as_of === first.as_of);
  const sharedSample = shown.every(
    (m) => m.sample_size === first.sample_size && m.sample_unit === first.sample_unit,
  );

  // One entity → name it once in the header instead of on every cell.
  const entities = new Set(shown.map((m) => m.entity.label));
  const entityLabel = entities.size === 1 ? first.entity.label : null;
  const note = shown.find((m) => m.coverage_note)?.coverage_note;

  return (
    <section
      data-slot="evidence-card"
      className="overflow-hidden rounded-card border border-border-subtle bg-surface"
    >
      {entityLabel && (
        <header className="px-4 pt-4 sm:px-5">
          <h3 className="font-fw-sans text-body font-semibold text-text-primary">{entityLabel}</h3>
        </header>
      )}

      {/* Cells divided by hairlines (a 1px gap over the border colour), so the
          numbers read as one instrument rather than a stack of boxes. Two up
          on a phone, up to four across from `sm`. */}
      <div
        className={cn(
          'mt-3 grid gap-px border-y border-border-subtle bg-border-subtle',
          shown.length === 1 ? 'grid-cols-1' : shown.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
          shown.length >= 4 && 'sm:grid-cols-4',
          !entityLabel && 'mt-0 border-t-0',
        )}
      >
        {shown.map((m) => (
          <div key={`${m.entity.id}-${m.metric_id}`} className="min-w-0 bg-surface px-4 py-3.5 sm:px-5">
            <p className="font-fw-sans text-caption text-text-secondary">{m.metric_label}</p>
            {!entityLabel && (
              <p className="font-fw-sans text-caption text-text-tertiary">{m.entity.label}</p>
            )}
            <p className="mt-1.5 font-fw-sans text-h2 tabular-nums text-text-primary">
              {formatValue(m.value, m.unit)}
            </p>
            {/*
              The metric's own history, when the same envelope carried it: a
              sparkline and a signed delta, both derived from ONE call to the
              shared classifier so the line's colour and the chip's verdict can
              never disagree. `goodDirection` comes off the measurement's own
              `direction` field — for putts per round, DOWN is good.
            */}
            <MetricTrend measurement={m} series={series} />
            {/* What the figure is out of, or measured against: 27% means
                nothing until you know it is 27% of 270. */}
            <MetricReference measurement={m} />
            {!sharedSample && m.sample_size > 0 && m.denominator !== m.sample_size && (
              <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                {m.sample_size} {m.sample_unit}
                {!sharedWindow && ` · ${formatWindow(m.window_start, m.window_end) ?? ''}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {(sharedWindow || note) && (
        <footer className="flex flex-col gap-1 px-4 py-2.5 sm:px-5">
          {sharedWindow && (
            <p className="font-fw-sans text-caption text-text-tertiary">
              {provenanceText(
                formatWindow(first.window_start, first.window_end),
                sharedSample ? first.sample_size : 0,
                first.sample_unit,
                first.as_of,
              )}
            </p>
          )}
          {note && <p className="font-fw-sans text-caption text-text-secondary">{note}</p>}
        </footer>
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
 * envelope. Only at three or more readings — the same threshold the full trend
 * chart holds to (rule 1).
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
  // result, so they cannot disagree.
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
        goodDirection={goodDirection}
        label={`${trend.value > 0 ? '+' : ''}${formatValue(trend.value, m.unit)}`}
      />
    </div>
  );
}

/** The denominator, or the benchmark — whichever this metric actually has. */
function MetricReference({ measurement: m }: { measurement: Measurement }) {
  if (m.denominator !== null && m.unit === 'percent' && m.value !== null) {
    return (
      <p className="mt-1 font-fw-sans text-caption tabular-nums text-text-tertiary">
        {Math.round((m.value / 100) * m.denominator)} of {m.denominator}
      </p>
    );
  }
  if (m.benchmark && !m.benchmark.omitted_for_cohort) {
    return (
      <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
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
 * Leads with the answer — the latest round and how the recent rounds compare
 * with the earlier ones — then the rounds themselves, one dot per round on
 * straight segments (a spline between rounds draws scores nobody shot). The
 * benchmark, or the player's own average, is the dashed reference so a reader
 * can see whether the last point is off-trend or ordinary spread.
 */
export function TrendChart({
  series,
  reference: referenceMode = 'auto',
}: {
  series: MeasurementSeries;
  /** What the dashed line is. `auto`: a real benchmark when the read has one, else the average. */
  reference?: 'auto' | 'average' | 'benchmark' | 'none';
}) {
  if (series.points.length < MIN_POINTS_FOR_CHART) {
    // Rule 1: two points are a change, not a trend.
    return <SeriesAsTable series={series} />;
  }

  const values = series.points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const fmt = (v: number) => formatValue(v, series.unit);
  const goodDirection = goodDirectionOf(series.direction);
  const trend = computeSeriesTrend(values, { goodDirection });
  const last = series.points[series.points.length - 1]!;

  // A real, versioned benchmark beats the series' own mean: "vs PGA Tour" is a
  // standard, "vs your own average" is a tautology. The mean is the fallback so
  // the chart always has a reference to read the last point against.
  const hasBenchmark = Boolean(series.benchmark && !series.benchmark.omitted_for_cohort);
  const reference =
    referenceMode === 'none'
      ? undefined
      : hasBenchmark && referenceMode !== 'average'
        ? { value: series.benchmark!.value, label: series.benchmark!.source }
        : { value: mean, label: 'Avg' };

  const caption = [
    `Latest round, ${formatDay(last.at)}`,
    trend ? 'change is recent rounds vs earlier' : null,
    directionNote(series.direction),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <EvidenceCard
      overline={series.entity.label}
      title={series.metric_label}
      headline={
        <Headline
          value={fmt(last.value)}
          chip={
            trend ? (
              <TrendChip
                direction={trend.direction}
                goodDirection={goodDirection}
                label={`${trend.value > 0 ? '+' : ''}${fmt(trend.value)}`}
              />
            ) : undefined
          }
          caption={caption}
        />
      }
      provenance={provenanceText(
        formatWindow(series.window_start, series.window_end),
        series.points.length,
        'rounds',
        series.as_of,
      )}
      ariaLabel={`${series.metric_label} for ${series.entity.label}: ${fmt(values[0]!)} to ${fmt(
        last.value,
      )} across ${series.points.length} rounds.`}
      tableData={{
        columns: [
          { key: 'date', label: 'Round' },
          { key: 'value', label: series.metric_label, numeric: true },
        ],
        rows: series.points.map((p) => ({ date: formatDay(p.at), value: fmt(p.value) })),
        caption: `${series.metric_label} by round for ${series.entity.label}.`,
      }}
    >
      <LineFigure
        points={series.points.map((p, i) => ({ key: `${p.at}-${i}`, label: formatDay(p.at), value: p.value }))}
        format={fmt}
        reference={reference}
      />
    </EvidenceCard>
  );
}

// ---------------------------------------------------------------------------
// Distance / bucket comparison
// ---------------------------------------------------------------------------

/**
 * Categorical comparison — putting by distance bucket being the case that
 * motivated it.
 *
 * A make rate across distance bands is a MAKE CURVE: a decay every golf coach
 * reads by shape, where the sample behind each band varies wildly (270
 * attempts inside 3ft, eleven from 25ft+). The dot's size carries the sample,
 * and a band under the reliability floor is drawn hollow, with the same rules
 * as the Fairway `MakeCurve`, so a thin band cannot pass for a solid one.
 *
 * Everything else is bars, which is what an unordered set of categories is.
 */
export function BucketChart({
  series,
  highlight = null,
}: {
  series: MeasurementSeries;
  /** A band label to emphasise — the one the coach asked about. */
  highlight?: string | null;
}) {
  const points = series.points.map((p) => ({
    label: p.bucket ?? p.at,
    value: p.value,
    sample: p.sample_size,
  }));

  if (points.length === 0) return null;
  if (points.length < 2) return <SeriesAsTable series={series} />;

  const fmt = (v: number) => formatValue(v, series.unit);
  const provenance = provenanceText(
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
    rows: points.map((d) => ({ band: d.label, value: fmt(d.value), sample: d.sample })),
    caption: `${series.metric_label} by band for ${series.entity.label}.`,
  };
  // `metric_label` already reads "Make rate by distance"; appending "by
  // distance" produced "Make rate by distance by distance for …".
  const ariaLabel = `${series.metric_label} for ${series.entity.label}: ${points
    .map((d) => `${d.label} ${fmt(d.value)}`)
    .join(', ')}.`;

  if (series.unit === 'percent') {
    const anyHollow = points.some((d) => isHollowDot(d.sample));
    return (
      <EvidenceCard
        overline={series.entity.label}
        title={series.metric_label}
        headline={
          <p className="font-fw-sans text-caption text-text-secondary">
            {anyHollow ? 'Dot size is attempts; hollow dots have too few to trust.' : 'Dot size is attempts.'}
          </p>
        }
        provenance={provenance}
        ariaLabel={ariaLabel}
        tableData={tableData}
      >
        <LineFigure
          points={points.map((d) => ({
            key: d.label,
            label: d.label,
            value: d.value,
            radius: dotRadiusForN(d.sample),
            hollow: isHollowDot(d.sample),
            emphasis: d.label === highlight,
          }))}
          format={fmt}
          domain={[0, 100]}
          valueLabels="all"
          xLabels="all"
          area
          height={196}
        />
      </EvidenceCard>
    );
  }

  return (
    <EvidenceCard
      overline={series.entity.label}
      title={series.metric_label}
      headline={
        directionNote(series.direction) ? (
          <p className="font-fw-sans text-caption text-text-secondary">Shorter is better.</p>
        ) : undefined
      }
      provenance={provenance}
      ariaLabel={ariaLabel}
      tableData={tableData}
    >
      <BarRows
        rows={points.map((d) => ({
          key: d.label,
          label: d.label,
          value: d.value,
          detail: d.sample > 0 ? `${d.sample} attempts` : undefined,
          emphasis: d.label === highlight,
        }))}
        format={fmt}
      />
    </EvidenceCard>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** A series too short to chart, shown as the facts it actually is. */
function SeriesAsTable({ series }: { series: MeasurementSeries }) {
  return (
    <EvidenceCard
      overline={series.entity.label}
      title={series.metric_label}
      provenance={provenanceText(
        formatWindow(series.window_start, series.window_end),
        series.points.reduce((a, p) => a + p.sample_size, 0),
        'observations',
        series.as_of,
      )}
      ariaLabel={`${series.metric_label} for ${series.entity.label}`}
    >
      <dl className="divide-y divide-border-subtle">
        {series.points.map((p, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="font-fw-sans text-body-sm text-text-secondary">
              {p.bucket ?? formatDay(p.at)}
            </dt>
            <dd className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
              {formatValue(p.value, series.unit)}
            </dd>
          </div>
        ))}
      </dl>
    </EvidenceCard>
  );
}

/**
 * Multi-player comparison table.
 *
 * Sample size stays visible, because an unequal basis is the thing most likely
 * to make the comparison wrong: once in the player's column header when it is
 * the same for every metric, per cell when it is not. The better value in each
 * row is marked, read from the metric's own `direction` — never assumed.
 *
 * No minimum width: two players fit a phone without a horizontal scroll that
 * hid the second player's column.
 */
export function ComparisonTable({ measurements }: { measurements: Measurement[] }) {
  const players = [...new Map(measurements.map((m) => [m.entity.id, m.entity.label])).entries()];
  const metrics = [...new Set(measurements.map((m) => m.metric_id))];
  const find = (playerId: string, metric: string) =>
    measurements.find((m) => m.entity.id === playerId && m.metric_id === metric);

  if (players.length < 2 || metrics.length === 0) return null;
  const labelOf = (id: string) => measurements.find((m) => m.metric_id === id)?.metric_label ?? id;

  // One sample per player when every metric shares it → say it once.
  const headerSample = new Map(
    players.map(([id]) => {
      const ms = measurements.filter((m) => m.entity.id === id);
      const uniform = ms.every(
        (m) => m.sample_size === ms[0]!.sample_size && m.sample_unit === ms[0]!.sample_unit,
      );
      return [id, uniform && ms[0]!.sample_size > 0 ? `${ms[0]!.sample_size} ${ms[0]!.sample_unit}` : null];
    }),
  );

  const bestOf = (metric: string): string | null => {
    const rows = players
      .map(([id]) => find(id, metric))
      .filter((m): m is Measurement => Boolean(m && m.value !== null));
    if (rows.length < 2 || rows[0]!.direction === null) return null;
    const lower = rows[0]!.direction === 'lower_better';
    const sorted = [...rows].sort((a, b) => (lower ? a.value! - b.value! : b.value! - a.value!));
    return sorted[0]!.value === sorted[1]!.value ? null : sorted[0]!.entity.id;
  };

  const first = measurements[0]!;

  return (
    <section
      data-slot="evidence-card"
      className="overflow-hidden rounded-card border border-border-subtle bg-surface"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Comparison of {players.map(([, l]) => l).join(' and ')} across {metrics.length} metrics, with
            sample sizes.
          </caption>
          <thead>
            <tr className="border-b border-border-subtle">
              <th scope="col" className="px-4 pb-3 pt-4 text-left align-bottom font-fw-sans text-caption text-text-tertiary sm:px-5">
                Metric
              </th>
              {players.map(([id, label]) => (
                <th key={id} scope="col" className="px-3 pb-3 pt-4 text-right align-bottom last:pr-4 sm:last:pr-5">
                  <span className="block font-fw-sans text-body-sm font-semibold text-text-primary">{label}</span>
                  {headerSample.get(id) && (
                    <span className="block font-fw-sans text-caption font-normal text-text-tertiary">
                      {headerSample.get(id)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const best = bestOf(metric);
              return (
                <tr key={metric} className="border-b border-border-subtle last:border-0">
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-fw-sans text-body-sm font-normal text-text-secondary sm:px-5"
                  >
                    {labelOf(metric)}
                  </th>
                  {players.map(([id]) => {
                    const m = find(id, metric);
                    const isBest = best === id;
                    return (
                      <td key={id} className="whitespace-nowrap px-3 py-3 text-right last:pr-4 sm:last:pr-5">
                        {/*
                          Strokes gained is a signed delta from a baseline (0 =
                          expectation). A bare "+0.46"/"-3.92" was misread by the
                          product owner himself, so it renders as a chip coloured
                          from the value's own sign against the metric's own
                          direction.
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
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 font-fw-sans text-body-sm tabular-nums',
                              isBest ? 'font-semibold text-accent-ink' : 'font-medium text-text-primary',
                            )}
                          >
                            {isBest && (
                              <span aria-hidden className="size-1.5 rounded-full bg-accent-fill" />
                            )}
                            {m ? formatValue(m.value, m.unit) : '—'}
                            {isBest && <span className="sr-only"> (better)</span>}
                          </span>
                        )}
                        {m && !headerSample.get(id) && m.sample_size > 0 && (
                          <span className="block font-fw-sans text-caption text-text-tertiary">
                            {m.sample_size} {m.sample_unit}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border-subtle px-4 py-2.5 sm:px-5">
        <p className="font-fw-sans text-caption text-text-tertiary">
          {provenanceText(formatWindow(first.window_start, first.window_end), 0, '', first.as_of)}
        </p>
      </footer>
    </section>
  );
}

/**
 * Ranked list on one metric. Names a measured value — never a verdict.
 *
 * Players are placed as dots on one axis fitted to their values, best first by
 * the metric's own direction, with the sample in plain words under each name.
 */
export function RankingList({
  measurements,
  order = 'best_first',
  highlight = null,
}: {
  measurements: Measurement[];
  /** `best_first` sorts by the metric's own direction; `as_read` keeps the read's order. */
  order?: 'best_first' | 'as_read';
  /** A player id to emphasise instead of the leader. */
  highlight?: string | null;
}) {
  const withValue = measurements.filter((m) => m.value !== null);
  if (withValue.length === 0) return null;
  const first = withValue[0]!;
  const lower = first.direction === 'lower_better';
  const sorted = Boolean(first.direction) && order === 'best_first';
  const ranked = sorted
    ? [...withValue].sort((a, b) => (lower ? a.value! - b.value! : b.value! - a.value!))
    : withValue;
  const fmt = (v: number) => formatValue(v, first.unit);
  const leader = ranked[0]!;

  return (
    <EvidenceCard
      title={first.metric_label}
      headline={
        sorted ? (
          <Headline
            value={fmt(leader.value!)}
            caption={[`${leader.entity.label} is first of ${plural(ranked.length, 'player')}`, directionNote(first.direction)]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : undefined
      }
      // Players with no data are named by the envelope's coverage notice under
      // the card; repeating the count here said it twice.
      provenance={provenanceText(formatWindow(first.window_start, first.window_end), 0, '', first.as_of)}
      ariaLabel={`${first.metric_label}: ${ranked
        .map((m) => `${m.entity.label} ${fmt(m.value!)}`)
        .join(', ')}.`}
      tableData={{
        columns: [
          { key: 'rank', label: '#', numeric: true },
          { key: 'player', label: 'Player' },
          { key: 'value', label: first.metric_label, numeric: true },
          { key: 'sample', label: 'Sample', numeric: true },
        ],
        rows: ranked.map((m, i) => ({
          rank: i + 1,
          player: m.entity.label,
          value: fmt(m.value!),
          sample: `${m.sample_size} ${m.sample_unit}`,
        })),
        caption: `${first.metric_label}, ranked.`,
      }}
    >
      <BarRows
        scale="fit"
        format={fmt}
        rows={ranked.map((m, i) => ({
          key: m.entity.id,
          lead: sorted ? String(i + 1) : undefined,
          label: m.entity.label,
          value: m.value!,
          detail: m.sample_size > 0 ? `${m.sample_size} ${m.sample_unit}` : undefined,
          emphasis: highlight ? m.entity.id === highlight : sorted && i === 0,
        }))}
      />
    </EvidenceCard>
  );
}

/** A strokes-gained breakdown: which side of zero, and by how much. */
export function StrokesGainedFigure({ sg }: { sg: NonNullable<ReturnType<typeof strokesGainedCategories>> }) {
  const fmt = (v: number) => formatValue(v, 'strokes');
  return (
    <EvidenceCard
      overline={sg.entityLabel}
      title="Strokes gained"
      headline={
        <Headline
          value={fmt(sg.worst.value)}
          caption={`Largest loss: ${sg.worst.label.toLowerCase()}`}
        />
      }
      provenance={sg.subtitle}
      ariaLabel={sg.takeaway}
      tableData={{
        columns: [
          { key: 'category', label: 'Category' },
          { key: 'value', label: 'Strokes gained', numeric: true },
        ],
        rows: sg.data.map((d) => ({ category: d.label, value: fmt(d.value) })),
        caption: `Strokes gained by category${sg.entityLabel ? ` for ${sg.entityLabel}` : ''}.`,
      }}
    >
      <DivergingRows
        rows={sg.data.map((d) => ({ key: d.key, label: d.label, value: d.value }))}
        format={fmt}
      />
    </EvidenceCard>
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
  // −1.2, +0.1 make that comparison arithmetic; diverging bars make it a shape.
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
      {envelope.series.length === 0 && !isComparison && !isRanking && sg && <StrokesGainedFigure sg={sg} />}
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
export function strokesGainedCategories(measurements: Measurement[]): {
  data: { key: string; label: string; value: number }[];
  worst: { label: string; value: number };
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
  // "Strokes gained: putting" → "Putting". The card's title already says
  // strokes gained; repeating it in every row label eats the width.
  const short = (m: Measurement) => {
    const s = m.metric_label.replace(/^strokes gained[:\s-]*/i, '').trim() || m.metric_label;
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const worst = [...sg].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]!;

  return {
    data: sg.map((m) => ({ key: m.metric_id, label: short(m), value: m.value ?? 0 })),
    worst: { label: short(worst), value: worst.value ?? 0 },
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
