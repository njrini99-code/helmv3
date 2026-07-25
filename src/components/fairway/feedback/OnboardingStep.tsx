'use client';

/**
 * ============================================================================
 * Fairway · feedback · OnboardingStep (DESIGN-SYSTEM.md §6 "OnboardingStep")
 * ----------------------------------------------------------------------------
 * A numbered, progressive step card for fast-first-value onboarding flows
 * (coach 3-step / player 4-step). Each step is a matte Card-row with a status
 * marker (number → spinner-free pending dot → green check), a title + guidance,
 * an optional action slot, and an optional connector line linking it to the
 * next step in a vertical stepper.
 *
 * Status states (the interactive-state contract maps onto these):
 *   `upcoming`  — not yet reachable: recessive, number in a hollow ring.
 *   `active`    — the current step: accent ring + accent number, raised affordance.
 *   `complete`  — done: filled accent disc + check, title de-emphasized.
 *
 * Compose <OnboardingStep> inside <OnboardingSteps> for the connector line +
 * group semantics (`role="list"`), or render standalone.
 *
 * A11y: the marker conveys state by SHAPE + an SR-only status word, not color
 * alone (§7.4). Interactive steps (with `onClick`) get a real focus-visible ring
 * surviving cream; the whole row is a button only when actionable. Reveal honors
 * `prefers-reduced-motion`.
 * ========================================================================== */

import { forwardRef, Children, isValidElement, cloneElement } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { staggerVariants } from './motion';

export type OnboardingStepStatus = 'upcoming' | 'active' | 'complete';

export interface OnboardingStepProps {
  /** 1-based step number shown in the marker (hidden when complete). */
  index: number;
  /** Step status — drives marker shape, color and emphasis. */
  status?: OnboardingStepStatus;
  /** Step title (label/h3 voice). */
  title: React.ReactNode;
  /** One line of guidance under the title. */
  description?: React.ReactNode;
  /** Action slot (e.g. a "Start" button) for the active step. */
  action?: React.ReactNode;
  /** Optional custom marker icon (e.g. a feature glyph) for upcoming/active. */
  icon?: LucideIcon;
  /** Make the whole row activatable. Renders a focusable, hoverable control. */
  onActivate?: () => void;
  /**
   * Whether a connector line continues below this step. Injected automatically
   * by <OnboardingSteps>; set manually only for standalone use.
   */
  hasConnector?: boolean;
  className?: string;
}

const STATUS_WORD: Record<OnboardingStepStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Current step',
  complete: 'Completed',
};

export const OnboardingStep = forwardRef<HTMLDivElement, OnboardingStepProps>(
  function OnboardingStep(
    {
      index,
      status = 'upcoming',
      title,
      description,
      action,
      icon: Icon,
      onActivate,
      hasConnector = false,
      className,
    },
    ref,
  ) {
    const isComplete = status === 'complete';
    const isActive = status === 'active';
    const interactive = typeof onActivate === 'function';

    const marker = (
      <span className="relative flex flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-full font-fw-mono text-body-sm font-medium tabular-nums transition-colors [transition-duration:180ms]',
            isComplete && 'bg-accent-700 text-text-on-accent',
            isActive &&
              'bg-accent-50 text-fw-success ring-2 ring-accent-500 ring-offset-2 ring-offset-surface',
            status === 'upcoming' && 'bg-surface-sunken text-text-tertiary ring-1 ring-border-subtle',
          )}
        >
          {isComplete ? (
            <Check className="h-4 w-4" strokeWidth={2.5} />
          ) : Icon ? (
            <Icon className="h-4 w-4" strokeWidth={2} />
          ) : (
            index
          )}
        </span>
        {hasConnector && (
          <span
            aria-hidden="true"
            className={cn(
              'mt-1 w-px flex-1 grow',
              isComplete ? 'bg-accent-300' : 'bg-border-subtle',
            )}
          />
        )}
      </span>
    );

    const body = (
      <div className="min-w-0 flex-1 pb-1">
        <p
          className={cn(
            'text-body font-semibold leading-5',
            isComplete ? 'text-text-secondary' : 'text-text-primary',
          )}
        >
          {title}
        </p>
        {description && (
          <p className="mt-1 text-body-sm leading-5 text-text-secondary">{description}</p>
        )}
        {isActive && action && <div className="mt-3">{action}</div>}
      </div>
    );

    const sharedClasses = cn(
      'flex w-full gap-4 rounded-card p-4 text-left font-fw-sans transition-all [transition-duration:180ms]',
      isActive ? 'bg-surface shadow-soft' : 'bg-transparent',
      className,
    );

    const content = (
      <>
        {marker}
        {body}
      </>
    );

    // The list semantics (<li>) are owned by <OnboardingSteps>; standalone use
    // renders a plain row/button. So this primitive renders only its own node.
    if (interactive) {
      return (
        // Intentional raw <button>: a self-contained Fairway DS primitive must not
        // depend on the legacy @/components/ui/button. The full interactive-state
        // contract (hover/focus-visible/active, §7.1) is implemented inline.
        // eslint-disable-next-line helm/no-raw-button
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onActivate}
          aria-current={isActive ? 'step' : undefined}
          className={cn(
            sharedClasses,
            'hover:bg-surface hover:shadow-soft active:translate-y-[0.5px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          )}
        >
          <span className="sr-only">{STATUS_WORD[status]}: </span>
          {content}
        </button>
      );
    }

    return (
      <div ref={ref} className={sharedClasses} aria-current={isActive ? 'step' : undefined}>
        <span className="sr-only">{STATUS_WORD[status]}: </span>
        {content}
      </div>
    );
  },
);

export interface OnboardingStepsProps {
  /** <OnboardingStep> children. */
  children: React.ReactNode;
  /** Accessible label for the stepper list. */
  label?: string;
  className?: string;
}

/**
 * Vertical stepper container. Provides `role="list"` group semantics, a staggered
 * reveal honoring reduced motion, and auto-injects the connector line on every
 * step except the last.
 */
export function OnboardingSteps({
  children,
  label = 'Onboarding steps',
  className,
}: OnboardingStepsProps) {
  const reduced = useReducedMotion() ?? false;
  const { container, item } = staggerVariants(reduced);

  const steps = Children.toArray(children).filter(isValidElement);
  const lastIndex = steps.length - 1;

  return (
    <motion.ol
      role="list"
      aria-label={label}
      variants={container}
      initial="hidden"
      animate="visible"
      className={cn('flex flex-col', className)}
    >
      {steps.map((child, i) => (
        <motion.li key={child.key ?? i} variants={item} className="list-none">
          {isValidElement<OnboardingStepProps>(child)
            ? cloneElement(child, { hasConnector: i < lastIndex })
            : child}
        </motion.li>
      ))}
    </motion.ol>
  );
}
