import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/States';
import '../../styles/roster.css';

/**
 * Signed in with no active team: the whole page says so (CH-3306 for a coach, CH-3308 for a player).
 * Not `.ch-rs`: under 820px that class stays hidden until the phone view takes over, and this page has none.
 */
export function RosterNoTeam({ viewer = 'coach' }: { viewer?: 'coach' | 'player' }) {
  return (
    <main className="ch-rs-none">
      {viewer === 'player' ? (
        <EmptyState
          size="page"
          code="CH-3308"
          icon={Users}
          title="You aren't on a team yet"
          body="Your teammates appear here once your coach approves your request to join."
        />
      ) : (
        <EmptyState
          size="page"
          code="CH-3306"
          icon={Users}
          title="You aren't on a team yet"
          body="Your players appear here once your team is set up."
        />
      )}
    </main>
  );
}
