'use client';

import { Compass, House } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';

/**
 * The dashboard's 404 inside the Clubhouse shell (CH-1306): an id that no longer exists (a deleted round or player,
 * a qualifier from another team) or a dashboard URL that matches nothing. The page empty's anatomy, as NotRebuilt and
 * the route error draw it, with the one way back: Home. A client component with no props, so the server not-found file can render it while the
 * Button (a client component) still receives its icon as a component.
 */
export function ClubhouseNotFound() {
  return (
    <main className="ch-notyet">
      <EmptyState
        size="page"
        code="CH-1306"
        icon={Compass}
        title="We couldn’t find that"
        body="It may have moved, or it’s no longer on your team. Everything else is where you left it."
        action={
          <Button variant="primary" leftIcon={House} href="/golf/dashboard">
            Back to Home
          </Button>
        }
      />
    </main>
  );
}
