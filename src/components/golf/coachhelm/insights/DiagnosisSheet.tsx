'use client';

/**
 * ============================================================================
 * DiagnosisSheet — the detail screen behind a DiagnosisPanel summary
 * ----------------------------------------------------------------------------
 * The "summary visual → detailed screen" drill-through (the three-tier ladder).
 * A DiagnosisPanel answers "what's the root cause?" at a glance; tapping
 * "See full breakdown" slides this Sheet in with the SAME diagnosis decomposed:
 *
 *   • an explicit causality banner (measured fact vs coaching hypothesis)
 *   • the chain: symptom (observed) → root cause → recommended action
 *   • optional strokes-gained context (the diverging tornado) when SG is passed
 *   • every quantified driver as a table row with its value, sample size, and
 *     data provenance — so the claim is auditable, not just assertive
 *   • the confidence reason + the strokes-per-round the fix is worth.
 *
 * Built on the Fairway `Sheet` — right side on desktop, bottom sheet below
 * `md` (Mobile Doctrine rule 4; the primitive does NOT auto-switch, the
 * side prop is media-query gated here like every other call site).
 * ADDITIVE — opened by a host that owns the open state.
 * ========================================================================== */

import { Sheet } from '@/components/fairway/overlays/Sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import type { Diagnosis } from '@/lib/coachhelm/v2/insights/types';
import { formatValue } from './EvidencePanel';
import { metricLabel } from './DiagnosisPanel';
import { InsightCallout } from './InsightCallout';
import {
  StrokesGainedTornado,
  type SGCategory,
} from '@/components/fairway/charts/StrokesGainedTornado';

export interface DiagnosisSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Insight title (Sheet header). */
  title: string;
  category?: string;
  diagnosis: Diagnosis;
  confidence?: number;
  strokesImpact?: number;
  /** Optional strokes-gained context rendered as the diverging tornado. */
  sg?: SGCategory[];
}

function ChainRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'emphasis' | 'accent';
}) {
  if (tone === 'accent') {
    return (
      <InsightCallout label={label}>
        <p className="text-body-sm text-text-primary">{value}</p>
      </InsightCallout>
    );
  }

  return (
    <div className="rounded-fw-md bg-surface px-3 py-2.5">
      <p className="text-caption uppercase tracking-wide text-text-tertiary">{label}</p>
      <p
        className={cn(
          'text-body-sm text-text-primary',
          tone === 'emphasis' ? 'font-medium' : undefined,
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function DiagnosisSheet({
  open,
  onOpenChange,
  title,
  category,
  diagnosis,
  confidence,
  strokesImpact,
  sg,
}: DiagnosisSheetProps) {
  const measured = diagnosis.causality_level === 'observed_sequence';
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={isDesktop ? 'right' : 'bottom'}
      title={title}
      description={category ? `Root cause · ${category}` : 'Root cause'}
    >
      <Sheet.Body className="space-y-6">
        {/* causality honesty banner */}
        <div className={cn('rounded-fw-md p-4', measured ? 'bg-fw-success-bg' : 'bg-fw-warning-bg')}>
          <p
            className={cn(
              'text-caption font-semibold uppercase tracking-wide',
              measured ? 'text-fw-success' : 'text-fw-warning',
            )}
          >
            {measured ? '■ Measured fact' : '◇ Coaching hypothesis'}
          </p>
          <p className="mt-1 text-body-sm text-text-secondary">
            {measured
              ? 'This was observed directly in your shot sequence.'
              : 'This is inferred from your aggregate stats — a coaching hypothesis to test, not a measured shot sequence. Its confidence is capped accordingly.'}
          </p>
        </div>

        {/* the chain */}
        <div className="space-y-2">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            The chain
          </p>
          <ChainRow label="Symptom (observed)" value={diagnosis.symptom} />
          <ChainRow label="Root cause" value={diagnosis.root_cause} tone="emphasis" />
          <ChainRow label="Recommended action" value={diagnosis.recommended_action} tone="accent" />
        </div>

        {/* strokes-gained context */}
        {sg && sg.length > 0 ? (
          <StrokesGainedTornado
            data={sg}
            overline="Context"
            title="Where strokes are won & lost"
            height={220}
          />
        ) : null}

        {/* the evidence table */}
        {diagnosis.drivers.length > 0 ? (
          <div className="space-y-2">
            <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
              The evidence
            </p>
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-caption text-text-tertiary">
                  <th className="py-1 text-left font-medium">Metric</th>
                  <th className="py-1 text-right font-medium">Value</th>
                  <th className="py-1 text-right font-medium">Sample</th>
                </tr>
              </thead>
              <tbody>
                {diagnosis.drivers.map((d) => (
                  <tr key={d.metric} className="border-t border-border-subtle align-top">
                    <td className="py-2 pr-2 text-text-secondary">
                      {metricLabel(d.metric)}
                      <div className="text-caption text-text-tertiary">{d.source}</div>
                    </td>
                    <td className="py-2 text-right font-fw-mono tabular-nums text-text-primary">
                      {formatValue(d.value, d.unit)}
                    </td>
                    <td className="py-2 text-right font-fw-mono tabular-nums text-text-tertiary">
                      n&nbsp;{d.sample_n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* confidence + stakes */}
        <div className="rounded-fw-md bg-surface-sunken p-4">
          <div className="flex items-center justify-between">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-tertiary">
              Confidence
            </p>
            {typeof confidence === 'number' ? (
              <span className="font-fw-mono tabular-nums text-text-primary">
                {Math.round(confidence * 100)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-body-sm text-text-secondary">{diagnosis.confidence_reason}</p>
          {typeof strokesImpact === 'number' && strokesImpact > 0 ? (
            <p className="mt-2 text-body-sm text-text-primary">
              Closing this is worth ~{strokesImpact.toFixed(1)} strokes per round.
            </p>
          ) : null}
        </div>
      </Sheet.Body>
    </Sheet>
  );
}
