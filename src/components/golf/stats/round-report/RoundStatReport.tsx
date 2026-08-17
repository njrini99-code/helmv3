'use client';

/**
 * ============================================================================
 * RoundStatReport — the formal single-round stat document
 * ----------------------------------------------------------------------------
 * One presentation, two mounts:
 *
 *   1. `/golf/dashboard/stats` when the round picker is scoped to a round —
 *      it REPLACES the career spine + bento + drills, which were built to
 *      describe a season and read as a blob against one scorecard ("Last 10
 *      rounds", "Fills in after 5+ rounds", a team-relative standing that
 *      does not move with the picker).
 *   2. `/golf/dashboard/rounds/[id]/review` via `RoundStatsPanel`, which the
 *      owner reports never got this treatment.
 *
 * The structure is the point. Numbered categories in the order a hole is
 * played, each with a rule above it, its own denominator on the right of the
 * header, and one plain-language line on what it measures — so a coach scans
 * headers first and figures second, rather than meeting sixty numbers at once.
 *
 * Every figure renders through `Readout`, so a metric with no sample shows its
 * dimmed awaiting state and a real count ("No bunker shots") instead of a
 * fabricated 0%. `n=20 putts` and `No putts` are different type, different
 * weight, different colour — the two must never be mistaken for each other.
 *
 * All copy and formatting lives in `buildRoundStatReport`; this file only
 * arranges it.
 * ========================================================================== */

import { Surface, Readout, Eyebrow, InlineNotice } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import {
  buildRoundStatReport,
  type RoundBreakMatrix,
  type RoundReportMetric,
  type RoundReportSection,
} from './buildRoundStatReport';

export interface RoundStatReportProps {
  stats: GolfStats | null;
  /** Report title. Defaults to the Round Review wording. */
  title?: string;
  /** One line under the title — typically the course and date of the round. */
  subtitle?: string;
  className?: string;
}

function MetricCell({ metric }: { metric: RoundReportMetric }) {
  const isAwaiting = metric.display === null;
  return (
    <div
      data-slot="round-report-metric"
      data-state={isAwaiting ? 'awaiting' : 'live'}
      className={cn(
        'flex min-w-0 flex-col rounded-fw-md border px-3 py-2.5',
        // The awaiting tile is deliberately flatter AND paler than a live one.
        // A tile with no sample must not be mistakable for a tile with a real
        // number at a glance, which is the whole reason the sample size is
        // being surfaced in the first place.
        isAwaiting
          ? 'border-dashed border-border-subtle bg-transparent'
          : 'border-border-subtle bg-surface-sunken/45',
      )}
    >
      <Readout
        label={metric.label}
        size="sm"
        state={isAwaiting ? 'awaiting' : 'live'}
        display={metric.display ?? undefined}
        awaitingLabel={metric.awaitingLabel}
      />
      {metric.note && !isAwaiting ? (
        <p className="mt-1.5 font-fw-mono text-microbadge normal-case tracking-normal text-text-tertiary">
          {metric.note}
        </p>
      ) : null}
    </div>
  );
}

function Section({ index, section }: { index: number; section: RoundReportSection }) {
  return (
    <section
      data-slot="round-report-section"
      data-section={section.id}
      aria-labelledby={`round-report-${section.id}`}
      className="border-t border-border-subtle pt-5 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`round-report-${section.id}`} className="flex items-baseline gap-2.5 min-w-0">
          <span
            aria-hidden="true"
            className="font-fw-mono text-caption tabular-nums text-text-tertiary"
          >
            {String(index).padStart(2, '0')}
          </span>
          {/* text-h3, not text-h4 — the Fairway type scale stops at h3
              (tailwind.config.ts:340-342). `text-h4` compiles to nothing, so a
              section header written that way silently renders at body size and
              the report loses the hierarchy it exists to provide. */}
          <span className="truncate font-fw-display text-h3 font-medium text-text-primary">
            {section.title}
          </span>
        </h3>
        {section.scope ? (
          <span
            data-slot="round-report-scope"
            className="font-fw-mono text-caption tabular-nums text-text-secondary"
          >
            {section.scope}
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-fw-sans text-caption text-text-tertiary">{section.blurb}</p>

      {section.hasSignal ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {section.metrics.map((m) => (
            <MetricCell key={m.label} metric={m} />
          ))}
        </div>
      ) : (
        <p className="mt-3 font-fw-sans text-body-sm text-text-secondary">{section.emptyLine}</p>
      )}
    </section>
  );
}

/**
 * Make % by distance × break. Every cell carries its own exact attempt count,
 * which is why it earns a table of its own rather than a row of readouts: a
 * "0%" from one putt and a "0%" from six are different findings and the n is
 * the only thing that separates them.
 */
function BreakMatrixTable({ matrix }: { matrix: RoundBreakMatrix }) {
  return (
    <section
      data-slot="round-report-break-matrix"
      aria-labelledby="round-report-break"
      className="border-t border-border-subtle pt-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="round-report-break"
          className="font-fw-display text-h3 font-medium text-text-primary"
        >
          Make rate by break
        </h3>
        <span className="font-fw-mono text-caption tabular-nums text-text-secondary">
          every cell shows its own n
        </span>
      </div>
      <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
        Each putt counts in the band it started from, in the direction it was read to break.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-y-1.5 text-left">
          <thead className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            <tr>
              <th scope="col" className="px-3">
                Distance
              </th>
              {matrix.cols.map((col) => (
                <th key={col} scope="col" className="px-3 text-center">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.label} className="bg-surface-sunken/45">
                <th
                  scope="row"
                  className="rounded-l-fw-sm px-3 py-2 font-fw-sans text-caption font-medium text-text-primary"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={matrix.cols[i] ?? i}
                    className={cn(
                      'px-3 py-2 text-center font-fw-mono text-caption tabular-nums',
                      i === row.cells.length - 1 && 'rounded-r-fw-sm',
                    )}
                  >
                    {cell ? (
                      <>
                        <span className="text-text-primary">{cell.display}</span>
                        <span className="mt-0.5 block font-fw-sans text-microbadge normal-case tracking-normal text-text-tertiary">
                          n={cell.n}
                        </span>
                      </>
                    ) : (
                      <span className="text-text-tertiary" aria-label="no putts from this distance and break">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-fw-sans text-microbadge normal-case tracking-normal text-text-tertiary">
        {matrix.overall.map((o) => (
          <div key={o.label} className="flex items-baseline gap-1.5">
            <dt>{o.label}</dt>
            <dd className="font-fw-mono tabular-nums text-text-secondary">
              {o.display ?? '—'} <span className="text-text-tertiary">(n={o.n})</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RoundStatReport({
  stats,
  title = 'Full round stats',
  subtitle,
  className,
}: RoundStatReportProps) {
  const report = buildRoundStatReport(stats);

  if (!report) return null;

  // Scorecard-only rounds are 46% of the live set — this is the common path,
  // not an edge case, and it must not read as a broken page.
  if (report.isEmpty) {
    return (
      <Surface padding="lg" className={className}>
        <InlineNotice tone="info" title="No shot detail for this round">
          These breakdowns are computed from logged shots. This round was saved as a scorecard
          only, so there is nothing to break down.
        </InlineNotice>
      </Surface>
    );
  }

  return (
    <Surface padding="lg" className={className}>
      <div className="flex flex-col gap-6">
        <header>
          <Eyebrow as="p" tone="accent">
            Single round
          </Eyebrow>
          {/* h2 over the sections' h3 — the document title has to outrank the
              five category headers for the structure to read at a glance. */}
          <h2 className="mt-1 font-fw-display text-h2 font-medium text-text-primary">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">{subtitle}</p>
          ) : null}
          <p className="mt-2 max-w-prose font-fw-sans text-caption text-text-tertiary">
            Every figure below is from this round alone. A dimmed tile means this round produced no
            sample for that metric — not a zero. Where the calculator reports an exact count, it is
            printed under the figure.
          </p>
        </header>

        {report.sections.map((section, i) => (
          <Section key={section.id} index={i + 1} section={section} />
        ))}

        {report.breakMatrix ? <BreakMatrixTable matrix={report.breakMatrix} /> : null}

        <p className="border-t border-border-subtle pt-4 font-fw-sans text-caption text-text-tertiary">
          {report.unsampledNote}
        </p>
      </div>
    </Surface>
  );
}
