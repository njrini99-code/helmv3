'use client';

import { ChevronLeft, Compass, House } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';

/**
 * The dashboard's 404 inside the Clubhouse shell (CH-1306): an id that no longer exists (a deleted round or player,
 * a qualifier from another team) or a dashboard URL that matches nothing. The page empty's anatomy, as NotRebuilt and
 * the route error draw it. A client component with plain props, so a server not-found file can render it while the
 * Button (a client component) still receives its icon as a component.
 *
 * One voice for missing content (GAP-S-24): a section's not-found names the thing ("This plan isn’t here") and goes
 * back to that section; the dashboard's own names nothing and goes Home. Only an answer of "no such row" reaches it:
 * a read that failed is the section's danger state with Try again, never this page.
 */
export function ClubhouseNotFound({ thing, back }: { /** "This plan", "This drill": the title reads "{thing} isn’t here". */ thing?: string; /** The section to go back to, in place of Home. */ back?: { href: string; label: string } } = {}) {
  return (
    <main className="ch-notyet">
      <EmptyState
        size="canvas"
        code="CH-1306"
        icon={Compass}
        title={thing ? `${thing} isn’t here` : 'We couldn’t find that'}
        body="It may have been deleted, or the link is wrong. Everything else is where you left it."
        action={
          back ? (
            <Button data-ctl="CTL-P001-025" variant="primary" leftIcon={ChevronLeft} href={back.href}>
              {back.label}
            </Button>
          ) : (
            <Button data-ctl="CTL-P001-026" variant="primary" leftIcon={House} href="/golf/dashboard">
              Back to Home
            </Button>
          )
        }
      />
    </main>
  );
}
