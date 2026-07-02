'use client';

// =============================================================================
// src/components/baseball/performance/lift-onboarding/LiftLabWelcomeState.tsx
//
// Task C, item (3): the Lift home's "Today" card for a fully-new athlete
// becomes a branded welcome state instead of the bare EmptyState "No lift
// today" — day-one always reads like an unreleased first issue, never a
// broken CRM (the Living Annual kit's own empty-state doctrine — README.md
// "No yellow warning boxes. Anywhere."). Composed entirely from
// <EditorsLetter>, the kit's canonical empty/zero-state atom — no bespoke
// card, per the kit's own "build nothing bespoke that one of these already
// does" rule.
// =============================================================================

import Link from 'next/link';
import { EditorsLetter, pressableClass } from '@/components/baseball/living-annual';
import { Button } from '@/components/ui/button';
import { IconHeart, IconSparkles } from '@/components/icons';

interface LiftLabWelcomeStateProps {
  /** Re-opens the first-run tour on demand. Omitted → no "retake tour" action. */
  onOpenTour?: () => void;
  className?: string;
}

export function LiftLabWelcomeState({ onOpenTour, className }: LiftLabWelcomeStateProps) {
  return (
    <EditorsLetter
      ink="team"
      live
      liveLabel="Awaiting your first session"
      title="Welcome to the Lab."
      body="Your coach hasn't published a lift yet — that's normal on day one. While you wait, take thirty seconds for a readiness check-in so the staff knows how you're feeling before your first session lands."
      signoff="— From the desk of the Strength Staff"
      action={
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/baseball/dashboard/readiness"
            className={pressableClass({
              ink: 'team',
              lift: true,
              className:
                'inline-flex items-center gap-2 rounded-xl bg-grade-plus px-5 py-2.5 text-sm font-medium text-white shadow-sm',
            })}
          >
            <IconHeart size={16} aria-hidden />
            Take today&rsquo;s check-in
          </Link>
          {onOpenTour ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenTour}
              leftIcon={<IconSparkles size={14} aria-hidden />}
            >
              Retake the welcome tour
            </Button>
          ) : null}
        </div>
      }
      className={className}
    />
  );
}
