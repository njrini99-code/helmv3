import { Compass } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';

/**
 * The dashboard's 404 inside the Clubhouse shell (`notFound()` from a dynamic page such as a round being continued,
 * or an unmatched `/golf/dashboard/*` address). The shared `not-found.tsx` switches to it with ClubhouseSwitch, so
 * the Fairway empty state never draws in the Clubhouse frame. One way out: Home, which is rebuilt for both roles.
 */
export function ClubhouseNotFound() {
  return (
    <main aria-label="Page not found">
      <EmptyState
        size="page"
        icon={Compass}
        title="This page isn’t here"
        body="It may have moved, or what it showed was removed from your team."
        action={
          <Button variant="primary" href="/golf/dashboard">
            Back to Home
          </Button>
        }
      />
    </main>
  );
}
