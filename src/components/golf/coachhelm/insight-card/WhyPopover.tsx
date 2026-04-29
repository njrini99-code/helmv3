'use client';

/**
 * WhyPopover — the always-visible `[ Why? ]` chip that sits on the collapsed
 * default + hero cards. Taps open a bottom sheet (mobile) / popover (desktop)
 * with the reasoning chain when present, otherwise a generated explanation
 * built from the evidence shape.
 *
 * Rule 5 of the Insight Delivery design contract.
 *
 * We reuse the existing `BottomSheet` primitive for mobile presentation. On
 * desktop viewports we render a tap-anchored inline popover — simpler and
 * avoids portal overhead for a one-breath explanation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconHelp } from '@/components/icons';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

export interface WhyPopoverProps {
  insight: EvidenceInsight;
  className?: string;
}

interface ReasoningStep {
  stepNumber?: number;
  conclusion?: string;
  [key: string]: unknown;
}

const DESKTOP_QUERY = '(min-width: 768px)';

export function WhyPopover({ insight, className }: WhyPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Media-query-only decision for mobile vs desktop. We don't need the
  // reactive variant (`matchMedia.addListener`) because the user can't
  // resize a browser while tapping a popover in practice.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Desktop popover: dismiss on outside click / Escape. Bottom sheet
  // handles its own dismissal on mobile.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!popoverRef.current || !anchorRef.current) return;
      const target = event.target as Node;
      if (popoverRef.current.contains(target) || anchorRef.current.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isDesktop]);

  const explanation = useMemo(() => buildExplanation(insight), [insight]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid="why-popover-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
          'text-[11px] font-medium text-warm-600',
          'bg-cream-100/75 border border-warm-200/55 hover:bg-cream-50/92',
          'transition-colors',
          className,
        )}
      >
        <IconHelp size={12} aria-hidden />
        Why?
      </button>

      {isDesktop && open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Why this insight fired"
          data-testid="why-popover-desktop"
          className={cn(
            'absolute z-30 mt-2 w-72 p-3',
            'bg-cream-50/95 backdrop-blur-xl border border-warm-200/55',
            'rounded-xl shadow-lg',
          )}
        >
          <ExplanationBody insight={insight} explanation={explanation} />
        </div>
      )}

      {!isDesktop && (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title="Why this insight fired"
          description="The evidence behind this recommendation"
        >
          <ExplanationBody insight={insight} explanation={explanation} />
        </BottomSheet>
      )}
    </>
  );
}

interface ExplanationBodyProps {
  insight: EvidenceInsight;
  explanation: string;
}

function ExplanationBody({ insight, explanation }: ExplanationBodyProps) {
  const chain = (insight.metadata?.reasoning_chain as ReasoningStep[] | undefined) ?? null;

  if (chain && chain.length > 0) {
    return (
      <ol
        data-testid="why-reasoning-chain"
        className="space-y-2 text-sm text-warm-700"
      >
        {chain.slice(0, 5).map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[11px] font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
              {step.stepNumber ?? i + 1}
            </span>
            <span className="leading-relaxed">{step.conclusion ?? ''}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p
      data-testid="why-generated-explanation"
      className="text-sm text-warm-700 leading-relaxed"
    >
      {explanation}
    </p>
  );
}

/**
 * Builds the fallback explanation when the generator didn't emit a
 * `reasoning_chain`. We lean on fields we know are present (the evidence
 * shape is enforced) and phrase it in tight, scannable form.
 */
function buildExplanation(insight: EvidenceInsight): string {
  const evidence = insight.evidence;
  const noun = sampleNoun(evidence.metric, evidence.sample_n);
  const yourValue = evidence.your_value_display || String(evidence.your_value);
  const comparisonValue = formatComparisonValue(
    Number(evidence.comparison_value ?? 0),
    evidence.unit,
  );
  const gap = Math.abs(Number(evidence.your_value ?? 0) - Number(evidence.comparison_value ?? 0));
  const gapLabel = formatGapLabel(gap, evidence.unit);
  const confidencePct = Math.round(Math.max(0, Math.min(1, Number(evidence.confidence ?? 0))) * 100);
  const factors = evidence.confidence_factors
    ? formatFactors(evidence.confidence_factors)
    : '';

  return [
    `Fired because ${evidence.sample_n} ${noun} in ${evidence.window_days} days at ${yourValue}`,
    `vs ${comparisonValue} ${evidence.comparison_label} → ${gapLabel} gap.`,
    `Confidence ${confidencePct}%${factors ? ` (${factors})` : ''}.`,
  ].join(' ');
}

function sampleNoun(metric: string, sample: number): string {
  if (/putt/i.test(metric)) return sample === 1 ? 'putt' : 'putts';
  if (/approach/i.test(metric)) return sample === 1 ? 'approach' : 'approaches';
  if (/tee|drive/i.test(metric)) return sample === 1 ? 'tee shot' : 'tee shots';
  if (/round/i.test(metric)) return sample === 1 ? 'round' : 'rounds';
  return sample === 1 ? 'observation' : 'observations';
}

function formatComparisonValue(value: number, unit: string): string {
  if (unit === 'percent') {
    const pct = Math.abs(value) <= 1 ? value * 100 : value;
    return `${Math.round(pct)}%`;
  }
  if (unit === 'strokes') {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}`;
  }
  if (unit === 'yards') return `${Math.round(value)} yd`;
  if (unit === 'feet') return `${Math.round(value)} ft`;
  return String(Math.round(value));
}

function formatGapLabel(gap: number, unit: string): string {
  if (unit === 'percent') {
    const pct = Math.abs(gap) <= 1 ? gap * 100 : gap;
    return `${Math.round(pct)}pt`;
  }
  return `${gap.toFixed(1)}`;
}

function formatFactors(factors: {
  sample_adequacy: number;
  recency: number;
  variance: number;
}): string {
  const bits: string[] = [];
  bits.push(factors.sample_adequacy >= 0.9 ? 'large sample' : factors.sample_adequacy >= 0.6 ? 'decent sample' : 'small sample');
  bits.push(factors.recency >= 0.8 ? 'recent' : 'older');
  bits.push(factors.variance >= 0.6 ? 'low variance' : 'high variance');
  return bits.join(', ');
}
