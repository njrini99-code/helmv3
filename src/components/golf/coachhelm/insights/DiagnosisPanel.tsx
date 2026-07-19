'use client';

/**
 * ============================================================================
 * DiagnosisPanel — the root-cause reasoning spine (the "better insight")
 * ----------------------------------------------------------------------------
 * Every V3 insight carries a structured `evidence.diagnosis` (P0-05):
 *   symptom → root_cause (+ causality_level) → drivers[] → recommended_action.
 * Production had 322 V3 rows with this structure and ZERO components rendering
 * it — the diagnosis lived only inside prose. This panel is the first surface
 * that renders the machine-readable root cause as a legible reasoning spine:
 *
 *   • eyebrow (Root cause · category) + an HONEST causality chip
 *     (Measured fact ■ vs Coaching hypothesis ◇ — never a hypothesis as fact)
 *   • the root cause as the headline; the observed symptom beneath it
 *   • the quantified drivers, each with its value + sample size (n) so the
 *     coach trusts the claim — positioned within the metric's known scale,
 *     never colored good/bad without a benchmark (honesty over decoration)
 *   • the recommended action (the Rx) in an accent rail
 *   • a footer: confidence (+ reason on hover), optional trust badge + the
 *     strokes-per-round at stake.
 *
 * ADDITIVE: renders inside a host card (EvidencePanel / InstrumentPanel). It
 * provides no outer card chrome of its own so it composes anywhere. Pass
 * `maxDrivers` to truncate for the summary altitude.
 *
 * (audit W4: the `DiagnosisSheet` detail-screen drill-through this panel
 * originally paired with was deleted as dead code — its only caller was the
 * dev-only /vizlab harness, which 404s in production; no real host ever wired
 * a trigger to it. If a "full breakdown" detail screen is needed again, design
 * it fresh against the current InsightPanel sheet this renders inside today,
 * rather than reintroducing a sheet-on-sheet stack.)
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { Diagnosis, DiagnosisDriver } from '@/lib/coachhelm/v2/insights/types';
import { formatValue } from './EvidencePanel';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { InsightCallout } from './InsightCallout';

/** Effectiveness-ledger trust status (P1-12). Optional decoration. */
export type DiagnosisTrust =
  | 'proven'
  | 'promising'
  | 'needs_validation'
  | 'new_hypothesis'
  | 'underperforming';

/** Human label for a canonical metric id, with a graceful prettified fallback. */
export function metricLabel(metricId: string): string {
  const cfg = getMetricRenderConfig(metricId);
  if (cfg) return cfg.display_label;
  return metricId
    .replace(/_pct$/, ' %')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Causality honesty (P0-06). A measured sequence is a FACT; an inferred
 * hypothesis is a coaching HYPOTHESIS (its confidence is capped upstream). The
 * two read distinctly so a coach never mistakes a hunch for an observation.
 */
function CausalityChip({ level }: { level: Diagnosis['causality_level'] }) {
  const measured = level === 'observed_sequence';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium',
        measured ? 'bg-fw-success-bg text-fw-success' : 'bg-fw-warning-bg text-fw-warning',
      )}
      title={
        measured
          ? 'Measured directly in your shot sequence — an observed fact.'
          : 'Inferred from your aggregate stats — a coaching hypothesis to test, not a measured shot sequence. Confidence is capped accordingly.'
      }
    >
      <span aria-hidden className="leading-none">{measured ? '■' : '◇'}</span>
      {measured ? 'Measured' : 'Hypothesis'}
    </span>
  );
}

/** Sample size below this gets an honest thin-sample flag. */
const THIN_SAMPLE = 20;

/**
 * One quantified driver: label · value · sample size. No magnitude bar — drivers
 * carry no benchmark, so a bar would either imply a comparison that doesn't
 * exist or (worse) read green for a leak. The number + its sample size is the
 * honest unit; the StandingBar (which DOES carry a benchmark) is used elsewhere.
 */
function DriverRow({ driver }: { driver: DiagnosisDriver }) {
  const label = metricLabel(driver.metric);
  const display = formatValue(driver.value, driver.unit);
  const thin = driver.sample_n < THIN_SAMPLE;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="truncate text-body-sm text-text-secondary">{label}</span>
      <span className="shrink-0 font-fw-mono text-body-sm tabular-nums text-text-primary">
        {display}
        <span className="ml-2 text-caption text-text-tertiary">
          {thin ? (
            <span className="mr-1 text-fw-warning" title={`Thin sample (n=${driver.sample_n})`}>
              •
            </span>
          ) : null}
          n&nbsp;{driver.sample_n}
        </span>
      </span>
    </div>
  );
}

const TRUST_BADGE: Record<DiagnosisTrust, { label: string; cls: string }> = {
  proven: { label: 'Proven', cls: 'bg-fw-success-bg text-fw-success' },
  promising: { label: 'Promising', cls: 'bg-accent-100 text-accent-700' },
  needs_validation: { label: 'Needs validation', cls: 'bg-surface-sunken text-text-tertiary' },
  new_hypothesis: { label: 'New hypothesis', cls: 'bg-surface-sunken text-text-tertiary' },
  underperforming: { label: 'Underperforming', cls: 'bg-fw-danger-bg text-fw-danger' },
};

export interface DiagnosisPanelProps {
  diagnosis: Diagnosis;
  /** Skill category, e.g. "putting". Shown in the eyebrow. */
  category?: string;
  /** 0..1 confidence. Reason renders on hover. */
  confidence?: number;
  /** Strokes/round at stake (counterfactual). Shown in the footer. */
  strokesImpact?: number;
  /** Effectiveness-ledger trust status (optional badge). */
  trust?: DiagnosisTrust;
  /** Truncate to N drivers for the summary altitude. */
  maxDrivers?: number;
  className?: string;
}

export function DiagnosisPanel({
  diagnosis,
  category,
  confidence,
  strokesImpact,
  trust,
  maxDrivers,
  className,
}: DiagnosisPanelProps) {
  const drivers =
    typeof maxDrivers === 'number' ? diagnosis.drivers.slice(0, maxDrivers) : diagnosis.drivers;
  const hidden = diagnosis.drivers.length - drivers.length;
  const confPct = typeof confidence === 'number' ? Math.round(confidence * 100) : null;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          Root cause{category ? <> · {category}</> : null}
        </p>
        <CausalityChip level={diagnosis.causality_level} />
      </div>

      {/* Lead with the MEASURED symptom (the fact), then the cause beneath it.
          A hypothesis cause is never headlined as if it were observed. */}
      <h4 className="font-fw-display text-h3 font-semibold leading-snug text-text-primary">
        {diagnosis.symptom}
      </h4>

      <p className="text-body text-text-secondary">
        <span className="font-medium text-text-tertiary">
          {diagnosis.causality_level === 'observed_sequence' ? 'Caused by' : 'Likely because'} —{' '}
        </span>
        {diagnosis.root_cause}
      </p>

      {drivers.length > 0 ? (
        <div className="space-y-2 rounded-fw-md bg-surface-sunken p-3">
          <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">
            The evidence
          </p>
          {drivers.map((d) => (
            <DriverRow key={d.metric} driver={d} />
          ))}
          {hidden > 0 ? (
            <p className="text-caption text-text-tertiary">+{hidden} more driver{hidden === 1 ? '' : 's'}</p>
          ) : null}
        </div>
      ) : null}

      <InsightCallout label="Practice focus">
        <p className="text-body-sm text-text-primary">{diagnosis.recommended_action}</p>
      </InsightCallout>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5">
        {confPct !== null ? (
          <span className="text-caption text-text-tertiary" title={diagnosis.confidence_reason}>
            {confPct}% confidence
          </span>
        ) : null}
        {trust ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium',
              TRUST_BADGE[trust].cls,
            )}
          >
            {TRUST_BADGE[trust].label}
          </span>
        ) : null}
        {typeof strokesImpact === 'number' && strokesImpact > 0 ? (
          <span className="text-caption text-text-secondary">
            ~{strokesImpact.toFixed(1)} str/rd at stake
          </span>
        ) : null}
      </div>
    </div>
  );
}
