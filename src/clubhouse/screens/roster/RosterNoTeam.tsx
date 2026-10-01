import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/States';
import '../../styles/roster.css';

/**
 * A coach signed in with no active team: the whole page says so (CH-3306).
 * Not `.ch-rs`: under 820px that class stays hidden until the phone view takes over, and this page has none.
 */
export function RosterNoTeam() {
  return (
    <main className="ch-rs-none">
      <EmptyState
        size="page"
        code="CH-3306"
        icon={Users}
        title="You aren't on a team yet"
        body="Your players appear here once your team is set up."
      />
    </main>
  );
}
