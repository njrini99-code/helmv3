import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/States';

/** Signed in, but on no team yet: the whole page says so (CH-6307). */
export function CalendarNoTeam({ coach }: { coach: boolean }) {
  return (
    <main className="ch-cal">
      <EmptyState
        size="page"
        code="CH-6307"
        icon={Users}
        title="You aren't on a team yet"
        body={coach ? 'The calendar fills in once your team is set up.' : 'Team events show here once a coach adds you to a team roster.'}
      />
    </main>
  );
}
