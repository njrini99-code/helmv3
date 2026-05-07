'use client';

/**
 * WhyPopover — the always-visible `[ Why? ]` chip that sits on the collapsed
 * default + hero cards. Taps open a vaul-backed Drawer (mobile) or a Radix
 * Popover (desktop) with the reasoning chain when present, otherwise a
 * generated explanation built from the evidence shape.
 *
 * Rule 5 of the Insight Delivery design contract.
 *
 * Mobile (≤ md): `<Drawer>` for one-breath bottom-sheet presentation.
 * Desktop (md+): `<Popover>` anchored to the trigger chip.
 *
 * The viewport split happens on mount via `matchMedia` — the user can't
 * resize a browser while tapping a popover in practice, so we keep the
 * subscribe-to-changes wiring lean.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconHelp } from '@/components/icons';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
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

  // Media-query split for mobile vs desktop. We subscribe to changes so the
  // surface re-mounts cleanly when devtools toggles between viewports.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const explanation = useMemo(() => buildExplanation(insight), [insight]);

  const triggerClassName = cn(
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
    'text-[11px] font-medium text-warm-600',
    'bg-cream-100/75 border border-warm-200/55 hover:bg-cream-50/92',
    'transition-colors',
    className,
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="why-popover-trigger"
            onClick={(event) => event.stopPropagation()}
            className={triggerClassName}
          >
            <IconHelp size={12} aria-hidden />
            Why?
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          data-testid="why-popover-desktop"
          aria-label="Why this insight fired"
          onClick={(event) => event.stopPropagation()}
        >
          <ExplanationBody insight={insight} explanation={explanation} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="why-popover-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={triggerClassName}
      >
        <IconHelp size={12} aria-hidden />
        Why?
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Why this insight fired</DrawerTitle>
            <DrawerDescription>The evidence behind this recommendation</DrawerDescription>
          </DrawerHeader>
          <div
            className="px-6 pb-6 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          >
            <ExplanationBody insight={insight} explanation={explanation} />
          </div>
        </DrawerContent>
      </Drawer>
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
