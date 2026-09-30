import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/States';

/** Signed in, but on no team yet: the whole page says so (CH-7308). */
export function MessagesNoTeam() {
  return (
    <main className="ch-ms">
      <EmptyState
        size="page"
        code="CH-7308"
        icon={Users}
        title="You aren't on a team yet"
        body="Messages open once you're on a team roster, with your coaches and teammates."
      />
    </main>
  );
}
