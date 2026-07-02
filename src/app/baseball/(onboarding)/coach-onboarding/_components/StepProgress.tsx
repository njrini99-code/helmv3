'use client';

/**
 * StepProgress — the editorial replacement for a generic circles-and-lines
 * wizard bar: a numbered eyebrow (`STEP 02 OF 04 · PROGRAM`) sitting above a
 * single thin hairline rule whose filled portion animates to the current
 * step's fraction (`inkColumn`/`rulesDraw` timing, EASE_SOFT — spec §4.4 #2).
 *
 * Local to coach-onboarding — NOT the shared `@/components/baseball/onboarding/
 * StepIndicator` (that file is shared with GolfHelm's onboarding wizards, so
 * it stays untouched here; this is a bespoke, baseball-coach-onboarding-only
 * progress treatment).
 */
import { m, useReducedMotion } from 'framer-motion';
import { Eyebrow, DUR, EASE_SOFT } from '@/components/baseball/living-annual';

export interface StepProgressProps {
  /** 1-based current step number. */
  current: number;
  /** Total steps in this run (varies for an already-authenticated coach). */
  total: number;
  /** Section name shown after the step count, e.g. `PROGRAM`, `ACCOUNT`. */
  label: string;
}

export function StepProgress({ current, total, label }: StepProgressProps) {
  const reduced = useReducedMotion() ?? false;
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const stepTag = String(current).padStart(2, '0');
  const totalTag = String(total).padStart(2, '0');

  return (
    <div className="mb-8 w-full sm:mb-10">
      <Eyebrow ink="muted" className="text-center">
        {`STEP ${stepTag} OF ${totalTag} · ${label}`}
      </Eyebrow>
      <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-[color:var(--hairline)]">
        <m.div
          className="h-full origin-left rounded-full bg-grade-plus"
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduced ? { duration: 0 } : { duration: DUR.ink, ease: EASE_SOFT }}
        />
      </div>
    </div>
  );
}
