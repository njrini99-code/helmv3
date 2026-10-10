import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/States';

/**
 * The page's framed head over a whole-page empty (states audit c4, c9): on desktop the first-run and no-team pages open
 * under the same head as every other page, not on a bare canvas. The phone's bar carries the title, so the head is not
 * drawn there (messages.css).
 */
export function MessagesHead({ brief }: { brief?: string }) {
  return (
    <header className="ch-ms-head" data-canopy-head="">
      <h1>Messages</h1>
      {brief && <p>{brief}</p>}
    </header>
  );
}

/** Signed in, but on no team yet: the whole page says so (CH-7308). */
export function MessagesNoTeam() {
  return (
    <main className="ch-ms ch-ms--first" data-canopy="">
      <MessagesHead />
      <EmptyState
        size="page"
        code="CH-7308"
        icon={Users}
        title="You aren’t on a team yet"
        body="Messages open once you’re on a team roster, with your coaches and teammates."
      />
    </main>
  );
}
