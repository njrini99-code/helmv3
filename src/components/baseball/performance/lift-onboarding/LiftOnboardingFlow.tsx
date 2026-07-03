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
// RESKIN (Entry World, lift-arc lane, 2026-07-02): the tour now runs on the
// abstract iron field (docs/baseball/ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT —
// `IronRoomField`, src/components/baseball/scenes/) instead of a plain
// paper-canvas double-bezel. A fixed-aspect banner holds the field (a
// warm-graphite → sage-ink wash, one clean brass-hairline bar, concentric
// brass-rimmed plates) with a brass hairline seam into a considered dark
// `fl-glass-3` panel below — this in-app surface may sit deeper than the
// auth pages but must read considered, never murky (the amendment's own
// words). THE mechanic: the bar starts empty at step 1; each completed
// step loads one more mirrored plate pair (`IronRoomField`'s existing
// `stage` prop — no extension needed, its 0–4 range already covers this
// 4-step tour exactly: 3 step-transitions load 3 plate pairs, and finishing
// step 4 clicks the kept-kelly collar on). The bar IS the progress
// indicator now, so the old non-interactive progress-dot row is gone.
// `.lift-onboarding-iron` (a scoped CSS custom-property remap, see that
// file) repoints the shared Living-Annual ink tokens the step illustrations
// already use (Eyebrow/HairlineRule/InkBadge/RuledStatLine/etc.) to
// cream-on-dark for everything inside this panel — zero edits to those
// shared atoms. Kelly stays kelly (in-app chrome, unlike the auth/landing
// front door) for `ink="team"` accents.
//
// Double-bezel panel: an outer rounded frame (banner + glass) mirrors
// PaperCard's letterpress language without importing PaperCard itself (a
// modal panel needs its own scroll/overflow handling PaperCard doesn't
// provide).
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
import { IronRoomField, type IronRoomStage } from '@/components/baseball/scenes/IronRoomField';
import { getRememberedFirstName } from '@/lib/entry/greeting';
import '@/components/marketing/first-light/first-light.css';
import './lift-onboarding-iron.css';

// A quiet ghost-button treatment legible on the dark `fl-glass-3` panel —
// the shared Button's default `ghost` variant (`text-warm-600`) is tuned
// for the light "paper" surface and would read almost invisible here.
const GHOST_ON_GLASS_CLASS =
  'text-[color:rgba(var(--fl-cream-high-rgb),0.75)] hover:bg-[color:rgba(var(--fl-cream-high-rgb),0.12)] hover:text-[color:var(--fl-cream-high)]';

// ---------------------------------------------------------------------------
// Step content — illustrations composed from kit atoms only.
// ---------------------------------------------------------------------------

function IllustrationFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[168px] flex-col items-center justify-center gap-4 rounded-fw-lg border border-[color:var(--hairline)] bg-[var(--paper)] px-6 py-7 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
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
// go" beat — now doubling as the "Racked and ready" ceremony frame below,
// giving the collar-click + finish line something honest to land on.
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

/** Maps the tour's step index + finishing flag onto `IronRoomField`'s
 *  `stage` prop — "the bar IS the progress bar": stage 0 is the bar empty
 *  at step 1, each subsequent step index loads one more plate pair (the
 *  step just left was "completed"), and the finishing ceremony clicks the
 *  collar on. `IronRoomField` already spans exactly this 0–4 range, so no
 *  extension to that component was needed. */
function toFieldStage(stepIndex: number, isFinishing: boolean): IronRoomStage {
  if (isFinishing) return 4;
  if (stepIndex >= 3) return 3;
  if (stepIndex === 2) return 2;
  if (stepIndex === 1) return 1;
  return 0;
}

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
  // Best-effort personalization for the finish line ("Racked and ready,
  // {firstName}.") — read once on mount. Written on the baseball login
  // page's success path (src/lib/entry/greeting.ts); if a device never
  // logged in through that path this session (or storage is disabled) the
  // finish line just drops the name gracefully, never a blank/undefined.
  const [firstName] = useState(() => getRememberedFirstName());
  const reducedMotion = useReducedMotion() ?? false;

  // STEPS is a fixed-length const array and stepIndex is always clamped to
  // [0, STEPS.length - 1] by goTo/handlePrimary below — the ?? fallback only
  // satisfies noUncheckedIndexedAccess, it's never actually reached.
  const step = STEPS[stepIndex] ?? STEPS[0]!;
  const isLastStep = stepIndex === STEPS.length - 1;
  const fieldStage = toFieldStage(stepIndex, isFinishing);

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
    // The ceremony beat plays first (the panel swaps to the "Racked and
    // ready" finish frame while the collar clicks on), THEN the panel
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
          {/* Outer bezel — clips the banner's top corners and the glass
              panel's bottom corners to one shared rounded frame. */}
          <div className="overflow-hidden rounded-fw-lg shadow-[0_24px_64px_-24px_rgba(23,19,15,0.45)]">
            {/* The abstract iron field — a fixed-aspect banner (wider than
                the field's own 16:9 viewBox) so the bar and both loaded
                plate pairs always read fully, at any modal width, under
                the field's default cover/slice fit. Decorative only. */}
            <div aria-hidden className="relative aspect-[2/1] w-full">
              <IronRoomField idSuffix="lift-onboarding" stage={fieldStage} />
            </div>

            {/* Brass hairline seam — the field meets the glass panel. */}
            <div
              aria-hidden
              className="h-px w-full"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(var(--fl-brass-rgb), 0.6), transparent)',
              }}
            />

            {/* Considered glass panel — `fl-glass-3` (the deep grade: blur
                24, brass-tinted border + top edge-light). `.lift-
                onboarding-iron` scopes the shared Living-Annual ink tokens
                to cream-on-dark for every atom rendered inside. */}
            <div className="lift-onboarding-iron fl-glass-3 relative max-h-[70dvh] overflow-y-auto px-6 py-7 sm:px-8 sm:py-8">
              <div className="relative z-10">
                {!isFinishing ? (
                  <div className="flex items-start justify-between gap-4">
                    <Eyebrow ink="team">{step.eyebrow}</Eyebrow>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSkip}
                      className={cn('-mr-2 -mt-1 shrink-0', GHOST_ON_GLASS_CLASS)}
                      aria-label="Skip the Lift Lab tour"
                    >
                      Skip
                      <IconX size={14} aria-hidden />
                    </Button>
                  </div>
                ) : null}

                <div className="relative mt-4 min-h-[280px] sm:min-h-[300px]">
                  <AnimatePresence mode="wait" custom={direction} initial={false}>
                    {isFinishing ? (
                      <m.div
                        key="finish"
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE_GLIDE }}
                        className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 py-10 text-center sm:min-h-[300px]"
                      >
                        <DialogPrimitive.Title className="font-serif text-h2 font-medium leading-tight text-text-primary">
                          {firstName ? `Racked and ready, ${firstName}.` : 'Racked and ready.'}
                        </DialogPrimitive.Title>
                        <DialogPrimitive.Description className="max-w-[320px] font-annual text-body-lg leading-relaxed text-text-secondary">
                          Your Lift Lab is set up — let&rsquo;s get to work.
                        </DialogPrimitive.Description>
                      </m.div>
                    ) : (
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
                    )}
                  </AnimatePresence>
                </div>

                {/* The bar on the field above IS the progress indicator —
                    no redundant dot row here anymore. */}
                {!isFinishing ? (
                  <>
                    <HairlineRule ink="hairline" className="mt-6" />

                    <div className="mt-5 flex items-center justify-end gap-2">
                      {stepIndex > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => goTo(stepIndex - 1)}
                          leftIcon={<IconChevronLeft size={15} />}
                          className={GHOST_ON_GLASS_CLASS}
                        >
                          Back
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handlePrimary}
                        rightIcon={isLastStep ? undefined : <IconChevronRight size={15} />}
                      >
                        {isLastStep ? 'Enter the Lab' : 'Continue'}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
