'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { IconCheck } from '@/components/icons';

// ─── Animation Variants ─────────────────────────────────────────────────────

export const slideVariants = {
  initial: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

// ─── Step Indicator ─────────────────────────────────────────────────────────

interface StepConfig {
  id: string;
  label: string;
}

interface StepIndicatorProps<T extends string> {
  currentStep: T;
  steps: readonly StepConfig[];
}

export function StepIndicator<T extends string>({ currentStep, steps }: StepIndicatorProps<T>) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-0 mb-8 sm:mb-10">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <Fragment key={step.id}>
            {index > 0 && (
              <div
                aria-hidden="true"
                className={cn(
                  'h-[2px] w-8 sm:w-12 transition-colors duration-500',
                  isCompleted ? 'bg-primary-500' : 'bg-warm-200'
                )}
              />
            )}
            <div
              className="flex flex-col items-center gap-1.5"
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 text-sm font-semibold',
                  isCompleted && 'bg-primary-600 text-white shadow-sm shadow-primary-600/30',
                  isCurrent && 'bg-white border-2 border-primary-600 text-primary-600 shadow-sm',
                  !isCompleted && !isCurrent && 'bg-warm-100 text-warm-400'
                )}
                aria-hidden="true"
              >
                {isCompleted ? <IconCheck size={14} /> : index + 1}
              </div>
              <span
                className={cn(
                  'text-label font-medium transition-colors duration-500',
                  isCurrent ? 'text-warm-900' : isCompleted ? 'text-primary-600' : 'text-warm-400'
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">
                {isCompleted ? '(completed)' : isCurrent ? '(current step)' : '(upcoming)'}
              </span>
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}
