'use client';

// =============================================================================
// src/components/baseball/performance/lift-onboarding/LiftOnboardingFlow.tsx
//
// Task C, item (2): the Lift Lab first-run tour. A 4-step elegant modal
// sequence (Radix Dialog for the a11y primitives — focus trap, Escape,
// aria-modal — with fully bespoke styling on top, not the generic
// <DialogContent>). Each step is editorial: an Eyebrow dateline, a
// Space-Grotesk (font-annual) headline, a reading-voice body, and an
// illustration built entirely from Living Annual kit atoms (RuledStatLine,
// InkBadge, LiveDot, PositionChip-adjacent region chips) — no stock imagery.
//
// Double-bezel panel: an outer paper-canvas frame + an inner bordered content
// well, mirroring PaperCard's letterpress language without importing
// PaperCard itself (a modal panel needs its own scroll/overflow handling
// PaperCard doesn't provide).
//
// Skippable from any step (top-right "Skip" + Escape + overlay click all
// dismiss the SAME way) and never shown again once dismissed — the caller
// (LiftOnboardingGate) is responsible for persisting that; this component
// only calls onSkip/onDone, it holds no persistence logic itself.
// =============================================================================

import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';

import {
  Eyebrow,
  HairlineRule,
  InkBadge,
  LiveDot,
  RuledStatLine,
  EASE_GLIDE,
} from '@/components/baseball/living-annual';
import { Button } from '@/components/ui/button';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDumbbell,
  IconShieldCheck,
  IconX,
} from '@/components/icons';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Step content — illustrations composed from kit atoms only.
// ---------------------------------------------------------------------------

function IllustrationFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[168px] flex-col items-center justify-center gap-4 rounded-fw-lg border border-[color:var(--hairline)] bg-[var(--paper)] px-6 py-7">
      {children}
    </div>
  );
}

function IconBadgeCircle({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-grade-plus/30 bg-grade-plus/10 text-grade-plus"
    >
      {children}
    </span>
  );
}

function WelcomeIllustration() {
  return (
    <IllustrationFrame>
      <IconBadgeCircle>
        <IconDumbbell size={28} />
      </IconBadgeCircle>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <InkBadge label="READINESS" tone="team" />
        <InkBadge label="TODAY'S LIFT" tone="neutral" />
        <InkBadge label="PROGRESS" tone="neutral" />
      </div>
    </IllustrationFrame>
  );
}

const CHECKIN_REGIONS = ['Shoulders', 'Lower back', 'Legs', 'Whole body'] as const;

function CheckinIllustration() {
  return (
    <IllustrationFrame>
      <div className="grid w-full grid-cols-2 gap-2.5">
        {CHECKIN_REGIONS.map((region, i) => (
          <span
            key={region}
            className={cn(
              'flex items-center justify-center rounded-fw-sm border px-3 py-2.5 text-center text-eyebrow font-medium uppercase tracking-[0.1em]',
              i === 0
                ? 'border-grade-plus bg-grade-plus/10 text-grade-plus'
                : 'border-[color:var(--hairline)] text-text-tertiary',
            )}
          >
            {region}
          </span>
        ))}
      </div>
      <p className="text-center text-caption text-text-tertiary">
        Tap the region that&rsquo;s talking to you today.
      </p>
    </IllustrationFrame>
  );
}

function LogLiftsIllustration() {
  return (
    <IllustrationFrame>
      <div className="w-full max-w-[220px]">
        <RuledStatLine label="BACK SQUAT" value={315} unit="LB" size="row" />
      </div>
      <div className="flex items-center gap-2">
        <InkBadge label="NEW PR" tone="sodium" variant="solid" />
        <span className="text-caption text-text-tertiary">flagged for your coach, instantly</span>
      </div>
    </IllustrationFrame>
  );
}

function RestIllustration() {
  return (
    <IllustrationFrame>
      <IconBadgeCircle>
        <IconShieldCheck size={28} />
      </IconBadgeCircle>
      <LiveDot ink="team" label="Rest day logged" />
    </IllustrationFrame>
  );
}

interface OnboardingStepDef {
  eyebrow: string;
  title: string;
  body: string;
  illustration: React.ReactNode;
}

const STEPS: OnboardingStepDef[] = [
  {
    eyebrow: 'THE LIFT LAB · STEP 1 OF 4',
    title: 'Your strength program, in one place.',
    body: 'Every lift your coach assigns, every set you log, and how your body’s holding up — it all lives here. No more group texts about the workout of the day.',
    illustration: <WelcomeIllustration />,
  },
  {
    eyebrow: 'STEP 2 OF 4',
    title: 'Thirty seconds before you train.',
    body: 'A quick daily check-in — sleep, energy, soreness — tells your coach how you’re feeling before you pick up a bar. Sore somewhere specific? Tap the region; it’s noted for your coach’s eyes only.',
    illustration: <CheckinIllustration />,
  },
  {
    eyebrow: 'STEP 3 OF 4',
    title: 'Every set counts. Every PR is a story.',
    body: 'Log your sets as you go — weight, reps, RPE. Hit a new personal best and it’s flagged immediately, so your coach sees it the moment it happens.',
    illustration: <LogLiftsIllustration />,
  },
  {
    eyebrow: 'STEP 4 OF 4',
    title: 'A rest day isn’t a blank day.',
    body: 'Mark yourself unavailable, log how recovery is going, or just tell your coach you need a day. Rest honesty keeps your program honest — and keeps you healthy for the season that matters.',
    illustration: <RestIllustration />,
  },
];

// A deliberate one-beat pause before the tour closes on completion — mirrors
// the kit's own STAMP PRESS ceremony timing (motion.ts: DUR.stampDown +
// DUR.stampSettle ≈ 380ms), NOT a network wait. The durable onboarded_at
// write (lift-onboarding.ts) is intentionally fire-and-forget so a slow or
// offline network never blocks dismissal; this pause is purely the "letting
// go" beat that gives the primary CTA's isLoading state something honest to
// show, consistent with the design bar's pending-state requirement.
const FINISH_CEREMONY_MS = 380;

// Matches DialogContent's data-[state=closed] fade/zoom-out duration
// (tailwindcss-animate default ~150ms) — long enough for that exit
// transition to actually play before the parent unmounts this component.
const CLOSE_TRANSITION_MS = 160;

// ---------------------------------------------------------------------------
// Step transition variants — one custom cubic-bezier (EASE_GLIDE), direction-
// aware so "next" and "back" read as opposite page-turns.
// ---------------------------------------------------------------------------

const stepVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction >= 0 ? 14 : -14 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction >= 0 ? -14 : 14 }),
};

export interface LiftOnboardingFlowProps {
  /** Called when the athlete completes the final step. */
  onDone: () => void;
  /** Called when the athlete skips (top-right Skip, Escape, or overlay click). */
  onSkip: () => void;
}

export function LiftOnboardingFlow({ onDone, onSkip }: LiftOnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isFinishing, setIsFinishing] = useState(false);
  // Decoupled from `isFinishing`/`onDone`/`onSkip` so Radix's own
  // data-[state=closed] exit transition gets a chance to play before the
  // parent (LiftOnboardingGate) unmounts this component — closing `visible`
  // first, then calling the callback after CLOSE_TRANSITION_MS, instead of
  // unmounting mid-animation.
  const [visible, setVisible] = useState(true);
  const reducedMotion = useReducedMotion() ?? false;

  // STEPS is a fixed-length const array and stepIndex is always clamped to
  // [0, STEPS.length - 1] by goTo/handlePrimary below — the ?? fallback only
  // satisfies noUncheckedIndexedAccess, it's never actually reached.
  const step = STEPS[stepIndex] ?? STEPS[0]!;
  const isLastStep = stepIndex === STEPS.length - 1;

  function goTo(nextIndex: number) {
    if (nextIndex === stepIndex || isFinishing || !visible) return;
    setDirection(nextIndex > stepIndex ? 1 : -1);
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, nextIndex)));
  }

  function dismiss(callback: () => void) {
    if (!visible) return;
    setVisible(false);
    window.setTimeout(callback, reducedMotion ? 0 : CLOSE_TRANSITION_MS);
  }

  function handlePrimary() {
    if (!visible) return;
    if (!isLastStep) {
      goTo(stepIndex + 1);
      return;
    }
    if (isFinishing) return;
    setIsFinishing(true);
    // The ceremony beat plays first (isLoading on the CTA), THEN the panel
    // closes and onDone fires — two distinct, sequential beats rather than
    // stacking both delays on top of each other.
    window.setTimeout(() => dismiss(onDone), reducedMotion ? 0 : FINISH_CEREMONY_MS);
  }

  function handleSkip() {
    dismiss(onSkip);
  }

  function handleOpenChange(open: boolean) {
    // Any dismissal path Radix recognizes (Escape, overlay click) behaves
    // exactly like Skip — one dismissal grammar, not two.
    if (!open) dismiss(onSkip);
  }

  return (
    <DialogPrimitive.Root open={visible} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-[color:var(--clay)]/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            // Radix's default first-focusable-element focus lands on the Skip
            // button, which reads oddly as the very first thing announced.
            // Focus the panel itself instead so the title is announced first.
            e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-modal w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* Double-bezel: outer paper-canvas frame + inner bordered content well. */}
          <div className="rounded-fw-lg bg-[var(--paper-canvas)] p-1.5 shadow-[0_24px_64px_-24px_rgba(23,19,15,0.45)]">
            <div className="max-h-[88dvh] overflow-y-auto rounded-[calc(var(--fw-radius-lg)-4px)] border border-[color:var(--hairline)] bg-[var(--paper)] px-6 py-7 sm:px-8 sm:py-8">
              <div className="flex items-start justify-between gap-4">
                <Eyebrow ink="team">{step.eyebrow}</Eyebrow>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="-mr-2 -mt-1 shrink-0"
                  aria-label="Skip the Lift Lab tour"
                >
                  Skip
                  <IconX size={14} aria-hidden />
                </Button>
              </div>

              <div className="relative mt-4 min-h-[280px] sm:min-h-[300px]">
                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <m.div
                    key={stepIndex}
                    custom={direction}
                    variants={stepVariants}
                    initial={reducedMotion ? 'center' : 'enter'}
                    animate="center"
                    exit={reducedMotion ? 'center' : 'exit'}
                    transition={{ duration: reducedMotion ? 0 : 0.26, ease: EASE_GLIDE }}
                  >
                    <DialogPrimitive.Title className="font-annual text-h2 font-semibold leading-tight text-text-primary">
                      {step.title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-2.5 font-annual text-body-lg leading-relaxed text-text-secondary">
                      {step.body}
                    </DialogPrimitive.Description>

                    <div className="mt-6">{step.illustration}</div>
                  </m.div>
                </AnimatePresence>
              </div>

              <HairlineRule ink="hairline" className="mt-6" />

              <div className="mt-5 flex items-center justify-between gap-4">
                {/* Progress dots — status only (Back/Continue below own the
                    navigation), matching the non-interactive step-indicator
                    pattern already established in the app's onboarding
                    surfaces (src/components/golf/onboarding/StepIndicator.tsx). */}
                <div role="list" aria-label="Onboarding progress" className="flex items-center gap-2">
                  {STEPS.map((s, i) => (
                    <span
                      key={s.eyebrow}
                      role="listitem"
                      aria-current={i === stepIndex ? 'step' : undefined}
                      className={cn(
                        'h-2 rounded-full transition-[width,background-color] duration-200',
                        i === stepIndex ? 'w-6 bg-grade-plus' : 'w-2 bg-[color:var(--hairline)]',
                      )}
                    >
                      <span className="sr-only">
                        Step {i + 1} of {STEPS.length}
                        {i === stepIndex ? ' (current)' : ''}
                      </span>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {stepIndex > 0 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => goTo(stepIndex - 1)} leftIcon={<IconChevronLeft size={15} />}>
                      Back
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handlePrimary}
                    isLoading={isLastStep && isFinishing}
                    rightIcon={isLastStep ? undefined : <IconChevronRight size={15} />}
                  >
                    {isLastStep ? 'Enter the Lab' : 'Continue'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
