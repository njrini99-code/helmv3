'use client';

/**
 * StepProgress — the editorial replacement for a generic circles-and-lines
 * wizard bar: a numbered eyebrow (`STEP 02 OF 04 · PROGRAM`) sitting above a
 * single thin hairline rule whose filled portion animates to the current
 * step's fraction (`inkColumn`/`rulesDraw` timing, EASE_SOFT — spec §4.4 #2).
 *
 * Not the shared, unconstrained `./StepIndicator` dot-and-connector `<nav>`
 * in this same directory (mobile findings, onboarding-auth group): at 320px
 * its widest label ("Measurables", 11 chars) pushed the un-wrapped `gap-0`
 * flex row past the page's content budget with no scroll/wrap fallback, and
 * — separately — used a generic circles-and-lines look this component was
 * built specifically to move away from. `StepProgress` is width-safe by
 * construction (one centered text line + a full-width rule, no per-step
 * fixed-width columns to overflow).
 *
 * Shared between coach-onboarding and player onboarding — this used to be
 * two byte-identical copies (differing only in docblocks) living in each
 * route's own private `_components` folder
 * (`(onboarding)/coach-onboarding/_components/StepProgress.tsx` and
 * `(onboarding)/player/_components/StepProgress.tsx`), kept separate
 * specifically so neither route's private module boundary depended on the
 * other's. Promoting the identical implementation to this shared, PUBLIC
 * onboarding component directory (rather than one importing from the
 * other's private `_components` folder) resolves the duplication without
 * reintroducing that cross-route private-folder coupling; both original
 * files now re-export from here.
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
