'use client';

/**
 * ============================================================================
 * InsightCallout — shared accent-tinted callout for CoachHelm insight surfaces
 * ----------------------------------------------------------------------------
 * Consolidates the previously separate, near-identical "recommendation" boxes
 * in DiagnosisSheet (ChainRow tone="accent"), DiagnosisPanel ("Practice
 * focus"), and RoundIntelligence ("Take to the range") into one treatment: a
 * caption label over body content, tinted with the accent wash. The bg wash +
 * label already carry the "this is the recommendation" signal on their own —
 * no left-border stripe needed.
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
    <div className={cn('rounded-fw-md bg-accent-50 px-3 py-2.5', className)}>
      <p className="text-caption font-medium uppercase tracking-wide text-accent-700">{label}</p>
      {children}
    </div>
  );
}
