'use client';

/**
 * StepProgress — the editorial replacement for the shared, unconstrained
 * `@/components/baseball/onboarding/StepIndicator` dot-and-connector `<nav>`
 * (mobile findings, onboarding-auth group): at 320px its widest label
 * ("Measurables", 11 chars) pushed the un-wrapped `gap-0` flex row past the
 * page's content budget with no scroll/wrap fallback, and — separately —
 * used a generic circles-and-lines look coach-onboarding's own StepProgress
 * was built specifically to move away from.
 *
 * A numbered eyebrow (`STEP 02 OF 04 · MEASURABLES`) above a single thin
 * hairline rule that fills to the current step's fraction. Width-safe by
 * construction (one centered text line + a full-width rule, no per-step
 * fixed-width columns to overflow) and visually consistent with the coach
 * wizard's progress affordance.
 *
 * Deliberately a LOCAL copy of `(onboarding)/coach-onboarding/_components/
 * StepProgress.tsx` rather than an import from that route's private
 * `_components` folder (or a promotion to the shared living-annual kit) —
 * that file's own header comment documents it as a bespoke,
 * coach-onboarding-only treatment; each wizard keeps its own copy so
 * neither route depends on the other's private module boundary.
 */
import { m, useReducedMotion } from 'framer-motion';
import { Eyebrow, DUR, EASE_SOFT } from '@/components/baseball/living-annual';

export interface StepProgressProps {
  /** 1-based current step number. */
  current: number;
  /** Total steps in this run. */
  total: number;
  /** Section name shown after the step count, e.g. `ABOUT YOU`, `MEASURABLES`. */
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
