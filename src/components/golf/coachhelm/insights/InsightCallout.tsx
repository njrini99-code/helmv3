'use client';

/**
 * ============================================================================
 * InsightCallout — shared primary-tinted callout for CoachHelm insight surfaces
 * ----------------------------------------------------------------------------
 * Consolidates the previously separate, near-identical "recommendation" boxes
 * in DiagnosisSheet (ChainRow tone="accent"), DiagnosisPanel ("Practice
 * focus"), and RoundIntelligence ("Take to the range") into one treatment: a
 * caption label over body content, tinted with the brand-primary wash. The bg
 * wash + label already carry the "this is the recommendation" signal on their
 * own — no left-border stripe needed. Uses `primary-*` (the canonical brand
 * green), not the Fairway-opt-in `accent-*` family — this component renders
 * inside the main CoachHelm surface, not a Fairway-scoped shell.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InsightCalloutProps {
  /** Caption label, e.g. "Practice focus" / "Take to the range". */
  label: string;
  children: ReactNode;
  className?: string;
}

export function InsightCallout({ label, children, className }: InsightCalloutProps) {
  return (
    <div className={cn('rounded-fw-md bg-primary-50 px-3 py-2.5', className)}>
      <p className="text-caption font-medium uppercase tracking-wide text-primary-700">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
